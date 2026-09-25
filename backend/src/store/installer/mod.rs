pub mod compose_mutator;
pub mod runner;

pub use compose_mutator::*;
pub use runner::*;

use axum::{
    extract::Path,
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use once_cell::sync::Lazy;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::sync::RwLock;
use tokio::io::AsyncBufReadExt;
use tokio::process::Command;

use super::catalog::APPS_CACHE;
use super::types::{CustomInstallPayload, InstallTask};

pub static INSTALL_TASKS: Lazy<RwLock<HashMap<String, InstallTask>>> =
    Lazy::new(|| RwLock::new(HashMap::new()));
pub static CANCELLED_TASKS: Lazy<RwLock<HashSet<String>>> =
    Lazy::new(|| RwLock::new(HashSet::new()));
pub static TASK_PIDS: Lazy<RwLock<HashMap<String, u32>>> =
    Lazy::new(|| RwLock::new(HashMap::new()));

pub fn is_valid_app_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        && !id.starts_with('.')
}

pub async fn install_app(Path(id): Path<String>) -> impl IntoResponse {
    if !is_valid_app_id(&id) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "Invalid app ID (path traversal protection)"})),
        )
            .into_response();
    }

    let app = {
        let cache = APPS_CACHE.read().unwrap();
        match cache.iter().find(|a| a.id == id) {
            Some(a) => a.clone(),
            None => {
                return (
                    StatusCode::NOT_FOUND,
                    Json(serde_json::json!({"error": "App not found"})),
                )
                    .into_response()
            }
        }
    };

    // Create task immediately and return task_id (non-blocking)
    let task_id = uuid::Uuid::new_v4().to_string();
    {
        let mut tasks = INSTALL_TASKS.write().unwrap();
        tasks.insert(
            task_id.clone(),
            InstallTask {
                id: task_id.clone(),
                status: "starting".to_string(),
                progress: 0,
                logs: vec![],
                error: None,
            },
        );
    }

    let task_id_clone = task_id.clone();
    spawn_compose_installation(id, app.compose_file.clone(), task_id_clone);

    (StatusCode::ACCEPTED, Json(serde_json::json!({ "task_id": task_id }))).into_response()
}

pub async fn install_custom_app(
    Path(id): Path<String>,
    Json(payload): Json<CustomInstallPayload>,
) -> impl IntoResponse {
    if !is_valid_app_id(&id) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "Invalid app ID (path traversal protection)"})),
        )
            .into_response();
    }

    let app = {
        let cache = APPS_CACHE.read().unwrap();
        match cache.iter().find(|a| a.id == id) {
            Some(a) => a.clone(),
            None => {
                return (
                    StatusCode::NOT_FOUND,
                    Json(serde_json::json!({"error": "App not found"})),
                )
                    .into_response()
            }
        }
    };

    let task_id = uuid::Uuid::new_v4().to_string();
    {
        let mut tasks = INSTALL_TASKS.write().unwrap();
        tasks.insert(
            task_id.clone(),
            InstallTask {
                id: task_id.clone(),
                status: "starting".to_string(),
                progress: 0,
                logs: vec![format!("[INFO] Iniciando instalação personalizada de {}", app.name)],
                error: None,
            },
        );
    }

    let (custom_compose, custom_env) = apply_custom_config(&app.compose_file, &payload, &id);
    let task_id_clone = task_id.clone();
    spawn_compose_installation_with_env(id, custom_compose, Some(custom_env), task_id_clone);

    (StatusCode::ACCEPTED, Json(serde_json::json!({ "task_id": task_id }))).into_response()
}

pub async fn uninstall_app(Path(id): Path<String>) -> impl IntoResponse {
    if !is_valid_app_id(&id) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "Invalid app ID (path traversal protection)"})),
        )
            .into_response();
    }

    let app_dir = format!("data/apps/{}", id);

    if !std::path::Path::new(&app_dir).exists() {
        return (StatusCode::NOT_FOUND, "App directory not found").into_response();
    }

    let output = Command::new("docker")
        .arg("compose")
        .arg("down")
        .current_dir(&app_dir)
        .output()
        .await;

    match output {
        Ok(o) if o.status.success() => {
            let _ = fs::remove_dir_all(&app_dir);
            (StatusCode::OK, "App uninstalled successfully").into_response()
        }
        Ok(o) => {
            let stderr = String::from_utf8_lossy(&o.stderr);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to uninstall app: {}", stderr),
            )
                .into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to execute docker compose: {}", e),
        )
            .into_response(),
    }
}

pub async fn update_app(Path(id): Path<String>) -> impl IntoResponse {
    if !is_valid_app_id(&id) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "Invalid app ID (path traversal protection)"})),
        )
            .into_response();
    }

    let app_dir = format!("data/apps/{}", id);

    if !std::path::Path::new(&app_dir).exists() {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "App directory not found"})),
        )
            .into_response();
    }

    let task_id = uuid::Uuid::new_v4().to_string();
    {
        let mut tasks = INSTALL_TASKS.write().unwrap();
        tasks.insert(
            task_id.clone(),
            InstallTask {
                id: task_id.clone(),
                status: "pulling".to_string(),
                progress: 5,
                logs: vec![format!("[INFO] Starting update for app: {}", id)],
                error: None,
            },
        );
    }

    let task_id_clone = task_id.clone();
    tokio::spawn(async move {
        // Phase 1: docker compose pull --parallel
        {
            let mut tasks = INSTALL_TASKS.write().unwrap();
            if let Some(task) = tasks.get_mut(&task_id_clone) {
                task.progress = 10;
                task.logs
                    .push("[INFO] Pulling updated images (parallel)...".to_string());
            }
        }

        let pull_spawn = Command::new("docker")
            .arg("compose")
            .arg("pull")
            .env("DOCKER_BUILDKIT", "1")
            .env("COMPOSE_PARALLEL_LIMIT", "8")
            .current_dir(&app_dir)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .spawn();

        let pull_ok = match pull_spawn {
            Ok(mut child) => {
                if let Some(stderr) = child.stderr.take() {
                    let mut reader = tokio::io::BufReader::new(stderr).lines();
                    let mut pull_progress: u8 = 10;
                    while let Ok(Some(line)) = reader.next_line().await {
                        if !line.trim().is_empty() {
                            if line.contains("Pull complete") || line.contains("Already exists") {
                                pull_progress = (pull_progress + 3).min(58);
                            } else if line.contains("Extracting") {
                                pull_progress = (pull_progress + 1).min(55);
                            } else if line.contains("Pulling") || line.contains("Downloading") {
                                pull_progress = (pull_progress + 1).min(45);
                            }
                            let formatted = format!("[PULL] {}", line);
                            let mut tasks = INSTALL_TASKS.write().unwrap();
                            if let Some(task) = tasks.get_mut(&task_id_clone) {
                                task.progress = pull_progress;
                                let is_progress = line.contains("Extracting")
                                    || line.contains("Downloading")
                                    || line.contains('%')
                                    || line.contains("MB/");
                                let should_replace = is_progress
                                    && task
                                        .logs
                                        .last()
                                        .map(|l| {
                                            l.starts_with("[PULL]")
                                                && (l.contains("Extracting")
                                                    || l.contains("Downloading"))
                                        })
                                        .unwrap_or(false);
                                if should_replace {
                                    if let Some(last) = task.logs.last_mut() {
                                        *last = formatted;
                                    }
                                } else {
                                    task.logs.push(formatted);
                                    if task.logs.len() > 200 {
                                        task.logs.remove(0);
                                    }
                                }
                            }
                        }
                    }
                }
                child.wait().await.map(|s| s.success()).unwrap_or(false)
            }
            Err(e) => {
                let mut tasks = INSTALL_TASKS.write().unwrap();
                if let Some(task) = tasks.get_mut(&task_id_clone) {
                    task.status = "error".to_string();
                    task.error = Some(format!("Failed to start docker compose pull: {}", e));
                }
                return;
            }
        };

        if !pull_ok {
            let mut tasks = INSTALL_TASKS.write().unwrap();
            if let Some(task) = tasks.get_mut(&task_id_clone) {
                task.status = "error".to_string();
                task.error = Some("docker compose pull failed".to_string());
            }
            return;
        }

        // Phase 2: docker compose up -d
        {
            let mut tasks = INSTALL_TASKS.write().unwrap();
            if let Some(task) = tasks.get_mut(&task_id_clone) {
                task.status = "installing".to_string();
                task.progress = 60;
                task.logs
                    .push("[INFO] Restarting containers with updated images...".to_string());
            }
        }

        let up_spawn = Command::new("docker")
            .arg("compose")
            .arg("up")
            .arg("-d")
            .current_dir(&app_dir)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .spawn();

        match up_spawn {
            Ok(mut child) => {
                if let Some(stderr) = child.stderr.take() {
                    let mut reader = tokio::io::BufReader::new(stderr).lines();
                    let mut up_progress: u8 = 60;
                    while let Ok(Some(line)) = reader.next_line().await {
                        if !line.trim().is_empty() {
                            if line.contains("Started")
                                || line.contains("Created")
                                || line.contains("Running")
                            {
                                up_progress = (up_progress + 10).min(95);
                            }
                            let mut tasks = INSTALL_TASKS.write().unwrap();
                            if let Some(task) = tasks.get_mut(&task_id_clone) {
                                task.progress = up_progress;
                                task.logs.push(format!("[UP] {}", line));
                                if task.logs.len() > 200 {
                                    task.logs.remove(0);
                                }
                            }
                        }
                    }
                }
                match child.wait().await {
                    Ok(status) if status.success() => {
                        let mut tasks = INSTALL_TASKS.write().unwrap();
                        if let Some(task) = tasks.get_mut(&task_id_clone) {
                            task.status = "done".to_string();
                            task.progress = 100;
                            task.logs
                                .push("[INFO] App updated successfully!".to_string());
                        }
                    }
                    Ok(status) => {
                        let mut tasks = INSTALL_TASKS.write().unwrap();
                        if let Some(task) = tasks.get_mut(&task_id_clone) {
                            task.status = "error".to_string();
                            task.error =
                                Some(format!("docker compose up exited with: {}", status));
                        }
                    }
                    Err(e) => {
                        let mut tasks = INSTALL_TASKS.write().unwrap();
                        if let Some(task) = tasks.get_mut(&task_id_clone) {
                            task.status = "error".to_string();
                            task.error = Some(format!("Process error: {}", e));
                        }
                    }
                }
            }
            Err(e) => {
                let mut tasks = INSTALL_TASKS.write().unwrap();
                if let Some(task) = tasks.get_mut(&task_id_clone) {
                    task.status = "error".to_string();
                    task.error = Some(format!("Failed to start docker compose up: {}", e));
                }
            }
        }
    });

    (StatusCode::ACCEPTED, Json(serde_json::json!({ "task_id": task_id }))).into_response()
}

pub async fn inspect_app_config(Path(id): Path<String>) -> impl IntoResponse {
    if !is_valid_app_id(&id) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "Invalid app ID (path traversal protection)"})),
        )
            .into_response();
    }

    let app = {
        let cache = APPS_CACHE.read().unwrap();
        match cache.iter().find(|a| a.id == id) {
            Some(a) => a.clone(),
            None => {
                return (
                    StatusCode::NOT_FOUND,
                    Json(serde_json::json!({"error": "App not found"})),
                )
                    .into_response()
            }
        }
    };

    let (ports, volumes, env) = extract_compose_config(&app.compose_file, &id);
    let inspection = super::types::AppConfigInspection {
        id: app.id,
        name: app.name,
        ports,
        volumes,
        env,
        raw_compose: app.compose_file,
    };

    (StatusCode::OK, Json(inspection)).into_response()
}

pub async fn install_status(Path(task_id): Path<String>) -> impl IntoResponse {
    let tasks = INSTALL_TASKS.read().unwrap();
    match tasks.get(&task_id) {
        Some(task) => (StatusCode::OK, Json(task.clone())).into_response(),
        None => (StatusCode::NOT_FOUND, "Task not found").into_response(),
    }
}

pub async fn active_install_tasks() -> impl IntoResponse {
    let tasks = INSTALL_TASKS.read().unwrap();
    let list: Vec<InstallTask> = tasks.values().cloned().collect();
    (StatusCode::OK, Json(list)).into_response()
}

pub async fn cancel_install_task(Path(task_id): Path<String>) -> impl IntoResponse {
    let mut tasks = INSTALL_TASKS.write().unwrap();
    let task = match tasks.get_mut(&task_id) {
        Some(t) => t,
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({"error": "Task not found"})),
            )
                .into_response()
        }
    };

    if task.status == "done" || task.status == "cancelled" {
        return (
            StatusCode::OK,
            Json(serde_json::json!({"task_id": task_id, "status": task.status})),
        )
            .into_response();
    }

    task.status = "cancelled".to_string();
    task.logs
        .push("[INFO] Instalação cancelada pelo usuário.".to_string());

    if let Ok(mut cancelled) = CANCELLED_TASKS.write() {
        cancelled.insert(task_id.clone());
    }

    if let Some(&pid) = TASK_PIDS.read().unwrap().get(&task_id) {
        #[cfg(unix)]
        unsafe {
            libc::kill(pid as i32, libc::SIGTERM);
            libc::kill(pid as i32, libc::SIGKILL);
        }
        #[cfg(windows)]
        {
            let _ = std::process::Command::new("taskkill")
                .args(["/F", "/PID", &pid.to_string()])
                .output();
        }
    }

    (
        StatusCode::OK,
        Json(serde_json::json!({
            "task_id": task_id,
            "status": "cancelled",
            "message": "Task cancelled successfully"
        })),
    )
        .into_response()
}
