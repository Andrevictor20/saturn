use axum::http::StatusCode;
use axum::Json;
use serde_json::Value;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio_util::sync::CancellationToken;

use crate::docker::containers::resolve_compose_file;
use crate::docker::updates::invalidate_update_cache;
use super::{clean_cli_output, update_task_status};

pub async fn try_compose_update(
    id: &str,
    clean_name: &str,
    image_name: &str,
    compose_dir: Option<&str>,
    compose_file_label: &str,
    compose_service: Option<&str>,
    cancel_token: &CancellationToken,
) -> Option<(StatusCode, Json<Value>)> {
    let (compose_file_path, project_dir) = resolve_compose_file(compose_dir, compose_file_label)?;

    tracing::info!(
        "Found compose file: {:?} in project dir: {:?} (service: {:?})",
        compose_file_path,
        project_dir,
        compose_service
    );
    let host_project_dir = project_dir.to_string_lossy();
    let host_project_dir_arg = host_project_dir.strip_prefix("/host").unwrap_or(&host_project_dir);

    update_task_status(
        id,
        clean_name,
        image_name,
        "pulling",
        &format!(
            "Baixando imagem atualizada via Docker Compose (serviço: {})...",
            compose_service.unwrap_or("todos")
        ),
        None,
        None,
    );

    let mut pull_cmd = tokio::process::Command::new("docker");
    pull_cmd
        .arg("compose")
        .arg("-f")
        .arg(&compose_file_path)
        .arg("--project-directory")
        .arg(&project_dir)
        .arg("pull")
        .env("DOCKER_BUILDKIT", "1")
        .env("COMPOSE_PARALLEL_LIMIT", "8");
    if let Some(svc) = compose_service {
        pull_cmd.arg(svc);
    }
    pull_cmd
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    let mut compose_succeeded = false;
    let pull_spawn = pull_cmd.spawn();

    if let Ok(mut child) = pull_spawn {
        let stderr = child.stderr.take();
        let stdout = child.stdout.take();
        let id_clone = id.to_string();
        let name_clone = clean_name.to_string();
        let img_clone = image_name.to_string();
        let token_clone = cancel_token.clone();

        let reader_task = tokio::spawn(async move {
            if let Some(stderr) = stderr {
                let mut lines = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    if token_clone.is_cancelled() {
                        break;
                    }
                    let clean = clean_cli_output(&line);
                    if !clean.is_empty() {
                        update_task_status(
                            &id_clone,
                            &name_clone,
                            &img_clone,
                            "pulling",
                            &clean,
                            None,
                            None,
                        );
                    }
                }
            } else if let Some(stdout) = stdout {
                let mut lines = BufReader::new(stdout).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    if token_clone.is_cancelled() {
                        break;
                    }
                    let clean = clean_cli_output(&line);
                    if !clean.is_empty() {
                        update_task_status(
                            &id_clone,
                            &name_clone,
                            &img_clone,
                            "pulling",
                            &clean,
                            None,
                            None,
                        );
                    }
                }
            }
        });

        let pull_wait = child.wait();
        let pull_ok = tokio::select! {
            res = pull_wait => {
                let _ = reader_task.await;
                res.map(|st| st.success()).unwrap_or(false)
            }
            _ = cancel_token.cancelled() => {
                let _ = child.kill().await;
                reader_task.abort();
                update_task_status(
                    id,
                    clean_name,
                    image_name,
                    "cancelled",
                    "Atualização cancelada pelo usuário",
                    None,
                    None,
                );
                return Some((StatusCode::OK, Json(serde_json::json!({
                    "id": id,
                    "name": clean_name,
                    "status": "cancelled",
                    "message": "Atualização cancelada pelo usuário"
                }))));
            }
            _ = tokio::time::sleep(std::time::Duration::from_secs(1800)) => {
                let _ = child.kill().await;
                reader_task.abort();
                tracing::warn!("Docker compose pull timed out after 1800s for container '{}'. Falling back to standalone.", clean_name);
                false
            }
        };

        if pull_ok {
            update_task_status(
                id,
                clean_name,
                image_name,
                "recreating",
                &format!(
                    "Recriando container via Docker Compose (serviço: {})...",
                    compose_service.unwrap_or("todos")
                ),
                None,
                None,
            );

            let mut up_cmd = tokio::process::Command::new("docker");
            up_cmd
                .arg("compose")
                .arg("-f")
                .arg(&compose_file_path)
                .arg("--project-directory")
                .arg(host_project_dir_arg)
                .arg("up")
                .arg("-d")
                .arg("--no-deps");
            if let Some(svc) = compose_service {
                up_cmd.arg(svc);
            }
            up_cmd
                .stdin(std::process::Stdio::null())
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped());

            if let Ok(mut up_child) = up_cmd.spawn() {
                let up_wait = up_child.wait();
                tokio::select! {
                    res = up_wait => {
                        if let Ok(uo) = res {
                            if uo.success() {
                                compose_succeeded = true;
                            } else {
                                tracing::warn!("docker compose up exited with error code {:?}. Falling back to standalone.", uo.code());
                            }
                        }
                    }
                    _ = cancel_token.cancelled() => {
                        let _ = up_child.kill().await;
                        update_task_status(
                            id,
                            clean_name,
                            image_name,
                            "cancelled",
                            "Atualização cancelada pelo usuário",
                            None,
                            None,
                        );
                        return Some((StatusCode::OK, Json(serde_json::json!({
                            "id": id,
                            "name": clean_name,
                            "status": "cancelled",
                            "message": "Atualização cancelada pelo usuário"
                        }))));
                    }
                    _ = tokio::time::sleep(std::time::Duration::from_secs(300)) => {
                        let _ = up_child.kill().await;
                        tracing::warn!("docker compose up timed out after 300s. Falling back to standalone.");
                    }
                }
            }
        } else {
            tracing::warn!(
                "docker compose pull failed or timed out for '{}'. Falling back to standalone update.",
                clean_name
            );
        }
    } else {
        tracing::warn!(
            "Failed to spawn docker compose pull for '{}'. Falling back to standalone update.",
            clean_name
        );
    }

    if compose_succeeded {
        update_task_status(
            id,
            clean_name,
            image_name,
            "success",
            "Container atualizado e reiniciado com sucesso via Docker Compose!",
            None,
            None,
        );
        invalidate_update_cache(image_name);
        Some((
            StatusCode::OK,
            Json(serde_json::json!({
                "id": id,
                "name": clean_name,
                "image": image_name,
                "status": "success",
                "message": "Container atualizado e reiniciado com sucesso via Docker Compose!"
            })),
        ))
    } else {
        None
    }
}
