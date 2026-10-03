//! Asynchronous and synchronous Docker container update lifecycle runner.
//! Handles image pulling, compose integration, network rewiring, container replacement,
//! and background task status tracking.

pub mod compose;
pub mod puller;
pub mod recreation;
pub mod runner;

pub use compose::*;
pub use puller::*;
pub use recreation::*;
pub use runner::*;

use std::collections::HashMap;
use std::sync::{LazyLock, RwLock};
use std::time::{SystemTime, UNIX_EPOCH};

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use tokio_util::sync::CancellationToken;

use crate::state::AppState;

#[derive(Debug, Deserialize, Default)]
pub struct UpdateContainerQuery {
    pub wait: Option<bool>,
    pub force: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContainerUpdateTask {
    pub id: String,
    pub name: String,
    pub image: String,
    pub status: String, // "pulling" | "recreating" | "success" | "error" | "cancelled"
    pub step: String,
    pub error: Option<String>,
    pub details: Option<String>,
    pub updated_at: u64,
}

pub static CONTAINER_UPDATE_TASKS: LazyLock<RwLock<HashMap<String, ContainerUpdateTask>>> =
    LazyLock::new(|| RwLock::new(HashMap::new()));

pub static UPDATE_TASK_TOKENS: LazyLock<RwLock<HashMap<String, CancellationToken>>> =
    LazyLock::new(|| RwLock::new(HashMap::new()));

pub fn update_task_status(
    id: &str,
    name: &str,
    image: &str,
    status: &str,
    step: &str,
    error: Option<String>,
    details: Option<String>,
) {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    if let Ok(mut tasks) = CONTAINER_UPDATE_TASKS.write() {
        tasks.insert(
            id.to_string(),
            ContainerUpdateTask {
                id: id.to_string(),
                name: name.to_string(),
                image: image.to_string(),
                status: status.to_string(),
                step: step.to_string(),
                error,
                details,
                updated_at: now,
            },
        );
    }
}

pub fn clean_cli_output(line: &str) -> String {
    let re_ansi = regex::Regex::new(r"\x1B\[[0-?]*[ -/]*[@-~]").unwrap();
    let cleaned = re_ansi.replace_all(line, "");
    cleaned
        .trim_matches(|c: char| c == '\r' || c == '\n' || c.is_whitespace())
        .to_string()
}

pub async fn update_container(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(query): Query<UpdateContainerQuery>,
) -> impl IntoResponse {
    let docker = state.docker.clone();

    // 1. Inspect existing container
    let inspect = match docker
        .inspect_container(&id, None::<bollard::query_parameters::InspectContainerOptions>)
        .await
    {
        Ok(i) => i,
        Err(e) => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({
                    "id": id,
                    "status": "error",
                    "message": format!("Container não encontrado: {}", e),
                    "details": e.to_string()
                })),
            )
                .into_response()
        }
    };

    let name = inspect.name.clone().unwrap_or_else(|| id.clone());
    let clean_name = name.trim_start_matches('/').to_string();

    if clean_name == "saturn" || clean_name == "saturn-dashboard" {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "id": id,
                "name": clean_name,
                "status": "error",
                "message": "O Saturn possui um ciclo de vida próprio e não pode ser recriado diretamente nesta fila para não derrubar a sessão ativa. Utilize o Atualizador do Sistema no topo da página.",
                "details": "Saturn container cannot self-terminate in batch updates"
            })),
        )
            .into_response();
    }

    let image_name = inspect
        .config
        .as_ref()
        .and_then(|c| c.image.as_ref())
        .cloned()
        .unwrap_or_default();

    // Manage cancellation token for this container task
    let cancel_token = {
        let mut tokens = UPDATE_TASK_TOKENS.write().unwrap();
        if query.force.unwrap_or(false) {
            if let Some(old) = tokens.get(&id) {
                old.cancel();
            }
        }
        let token = CancellationToken::new();
        tokens.insert(id.clone(), token.clone());
        token
    };

    // If caller explicitly wants synchronous execution (e.g. tests or CLI with ?wait=true)
    if query.wait.unwrap_or(false) {
        return execute_container_update(docker, id, clean_name, inspect, cancel_token)
            .await
            .into_response();
    }

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    // Prevent duplicate concurrent updates on the same container unless force=true or stale (> 60s)
    if !query.force.unwrap_or(false) {
        if let Ok(tasks) = CONTAINER_UPDATE_TASKS.read() {
            if let Some(task) = tasks.get(&id) {
                if (task.status == "pulling" || task.status == "recreating")
                    && (now - task.updated_at < 60)
                {
                    return (
                        StatusCode::OK,
                        Json(serde_json::json!({
                            "id": id,
                            "name": clean_name,
                            "image": image_name,
                            "status": "started",
                            "message": "Atualização já está em andamento para este container"
                        })),
                    )
                        .into_response();
                }
            }
        }
    }

    update_task_status(
        &id,
        &clean_name,
        &image_name,
        "pulling",
        &format!("Iniciando download da imagem '{}'", image_name),
        None,
        None,
    );

    let task_id = id.clone();
    let task_name = clean_name.clone();
    let token_clone = cancel_token.clone();
    tokio::spawn(async move {
        let _ = execute_container_update(docker, task_id, task_name, inspect, token_clone).await;
    });

    (
        StatusCode::OK,
        Json(serde_json::json!({
            "id": id,
            "name": clean_name,
            "image": image_name,
            "status": "started",
            "message": "Atualização iniciada em segundo plano"
        })),
    )
        .into_response()
}

pub async fn cancel_container_update(Path(id): Path<String>) -> impl IntoResponse {
    if let Ok(tokens) = UPDATE_TASK_TOKENS.read() {
        if let Some(token) = tokens.get(&id) {
            token.cancel();
        }
    }
    if let Ok(mut tasks) = CONTAINER_UPDATE_TASKS.write() {
        if let Some(task) = tasks.get_mut(&id) {
            task.status = "cancelled".to_string();
            task.step = "Atualização cancelada pelo usuário".to_string();
        }
    }
    (
        StatusCode::OK,
        Json(serde_json::json!({
            "id": id,
            "status": "cancelled",
            "message": "Cancelamento solicitado"
        })),
    )
        .into_response()
}

pub async fn cancel_all_container_updates() -> impl IntoResponse {
    if let Ok(tokens) = UPDATE_TASK_TOKENS.read() {
        for token in tokens.values() {
            token.cancel();
        }
    }
    if let Ok(mut tasks) = CONTAINER_UPDATE_TASKS.write() {
        for task in tasks.values_mut() {
            if task.status == "pulling" || task.status == "recreating" {
                task.status = "cancelled".to_string();
                task.step = "Cancelamento solicitado pelo usuário".to_string();
            }
        }
    }
    (
        StatusCode::OK,
        Json(serde_json::json!({
            "status": "cancelled",
            "message": "Todas as atualizações ativas foram canceladas"
        })),
    )
        .into_response()
}

pub async fn get_container_update_status(Path(id): Path<String>) -> impl IntoResponse {
    if let Ok(tasks) = CONTAINER_UPDATE_TASKS.read() {
        if let Some(task) = tasks.get(&id).or_else(|| {
            tasks.values().find(|t| {
                t.name == id
                    || t.name == format!("/{}", id)
                    || (!t.name.is_empty() && id == t.name.trim_start_matches('/'))
                    || (id.len() >= 12 && t.id.starts_with(&id[..12]))
                    || (t.id.len() >= 12 && id.starts_with(&t.id[..12]))
            })
        }) {
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            // A finished task older than 120s is considered idle so old states do not mask new update sessions
            if (task.status == "success" || task.status == "error" || task.status == "cancelled")
                && now.saturating_sub(task.updated_at) > 120
            {
                // Expired finished task -> fall through to idle
            } else {
                return (
                    StatusCode::OK,
                    Json(serde_json::to_value(task).unwrap_or_default()),
                )
                    .into_response();
            }
        }
    }

    (
        StatusCode::OK,
        Json(serde_json::json!({
            "id": id,
            "status": "idle",
            "step": "Nenhuma atualização ativa",
            "error": null,
            "details": null
        })),
    )
        .into_response()
}

pub async fn get_active_container_updates() -> impl IntoResponse {
    if let Ok(tasks) = CONTAINER_UPDATE_TASKS.read() {
        let active_tasks: Vec<ContainerUpdateTask> = tasks.values().cloned().collect();
        return (StatusCode::OK, Json(active_tasks)).into_response();
    }

    (StatusCode::OK, Json(Vec::<ContainerUpdateTask>::new())).into_response()
}
