use std::sync::Arc;
use futures::StreamExt;
use tokio_util::sync::CancellationToken;

use crate::docker::updates::get_host_platform;
use super::update_task_status;

pub enum PullResult {
    Success,
    Cancelled,
    Failed(String),
}

pub async fn pull_updated_image(
    docker: &Arc<bollard::Docker>,
    id: &str,
    clean_name: &str,
    image_name: &str,
    cancel_token: &CancellationToken,
) -> PullResult {
    let platform = get_host_platform();
    tracing::info!(
        "Pulling updated image {} (host platform: {})",
        image_name,
        platform
    );

    update_task_status(
        id,
        clean_name,
        image_name,
        "pulling",
        &format!("Baixando imagem atualizada '{}'...", image_name),
        None,
        None,
    );

    // 1. Safe High-Speed Image Pull with explicit host platform constraint
    let create_image_options = bollard::query_parameters::CreateImageOptions {
        from_image: Some(image_name.to_string()),
        platform: platform.to_string(),
        ..Default::default()
    };
    let mut pull_stream = docker.create_image(Some(create_image_options), None, None);
    let mut pull_failed = false;
    let mut pull_error_msg = String::new();
    let mut last_progress_time = std::time::Instant::now();

    while let Some(res) = pull_stream.next().await {
        if cancel_token.is_cancelled() {
            update_task_status(
                id,
                clean_name,
                image_name,
                "cancelled",
                "Atualização cancelada pelo usuário",
                None,
                None,
            );
            return PullResult::Cancelled;
        }

        match res {
            Ok(info) => {
                if let Some(err) = info.error_detail.and_then(|ed| ed.message) {
                    pull_failed = true;
                    pull_error_msg = err;
                    break;
                }

                if let Some(status) = info.status {
                    let progress = if let Some(pd) = &info.progress_detail {
                        if let (Some(cur), Some(tot)) = (pd.current, pd.total) {
                            if tot > 0 {
                                format!(
                                    " ({:.1}MB / {:.1}MB)",
                                    cur as f64 / 1_048_576.0,
                                    tot as f64 / 1_048_576.0
                                )
                            } else {
                                String::new()
                            }
                        } else {
                            String::new()
                        }
                    } else {
                        String::new()
                    };
                    let layer = info.id.map(|lid| format!("{}: ", lid)).unwrap_or_default();
                    let step_text = if !progress.is_empty() {
                        format!("{}{}{}", layer, status, progress)
                    } else if !layer.is_empty() {
                        format!("{}{}", layer, status)
                    } else {
                        status.clone()
                    };

                    if last_progress_time.elapsed().as_millis() >= 600
                        || status.contains("complete")
                        || status.contains("Downloaded")
                    {
                        last_progress_time = std::time::Instant::now();
                        update_task_status(
                            id,
                            clean_name,
                            image_name,
                            "pulling",
                            &step_text,
                            None,
                            None,
                        );
                    }
                }
            }
            Err(e) => {
                pull_failed = true;
                pull_error_msg = e.to_string();
                break;
            }
        }
    }

    // 2. If platform-constrained pull failed, retry with unconstrained pull
    if pull_failed {
        tracing::warn!(
            "Platform-constrained pull for {} failed ({}), retrying with unconstrained pull...",
            image_name,
            pull_error_msg
        );
        let fallback_options = bollard::query_parameters::CreateImageOptions {
            from_image: Some(image_name.to_string()),
            ..Default::default()
        };
        let mut fallback_stream = docker.create_image(Some(fallback_options), None, None);
        let mut fallback_failed = false;
        let mut fallback_error_msg = String::new();

        while let Some(res) = fallback_stream.next().await {
            if cancel_token.is_cancelled() {
                update_task_status(
                    id,
                    clean_name,
                    image_name,
                    "cancelled",
                    "Atualização cancelada pelo usuário",
                    None,
                    None,
                );
                return PullResult::Cancelled;
            }

            match res {
                Ok(info) => {
                    if let Some(err) = info.error_detail.and_then(|ed| ed.message) {
                        fallback_failed = true;
                        fallback_error_msg = err;
                        break;
                    }

                    if let Some(status) = info.status {
                        let progress = if let Some(pd) = &info.progress_detail {
                            if let (Some(cur), Some(tot)) = (pd.current, pd.total) {
                                if tot > 0 {
                                    format!(
                                        " ({:.1}MB / {:.1}MB)",
                                        cur as f64 / 1_048_576.0,
                                        tot as f64 / 1_048_576.0
                                    )
                                } else {
                                    String::new()
                                }
                            } else {
                                String::new()
                            }
                        } else {
                            String::new()
                        };
                        let layer = info.id.map(|lid| format!("{}: ", lid)).unwrap_or_default();
                        let step_text = if !progress.is_empty() {
                            format!("{}{}{}", layer, status, progress)
                        } else if !layer.is_empty() {
                            format!("{}{}", layer, status)
                        } else {
                            status.clone()
                        };

                        if last_progress_time.elapsed().as_millis() >= 600
                            || status.contains("complete")
                            || status.contains("Downloaded")
                        {
                            last_progress_time = std::time::Instant::now();
                            update_task_status(
                                id,
                                clean_name,
                                image_name,
                                "pulling",
                                &step_text,
                                None,
                                None,
                            );
                        }
                    }
                }
                Err(e) => {
                    fallback_failed = true;
                    fallback_error_msg = e.to_string();
                    break;
                }
            }
        }

        if fallback_failed {
            let final_err = if !fallback_error_msg.is_empty() {
                fallback_error_msg
            } else {
                pull_error_msg
            };
            return PullResult::Failed(final_err);
        }
    }

    PullResult::Success
}
