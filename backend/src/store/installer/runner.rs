use serde_yaml::Value;
use std::fs;
use tokio::io::AsyncBufReadExt;
use tokio::process::Command;

use super::compose_mutator::{ensure_safe_logging_config, set_permissions_recursive};
use super::{CANCELLED_TASKS, INSTALL_TASKS, TASK_PIDS};

pub fn spawn_compose_installation(id: String, raw_compose: String, task_id: String) {
    spawn_compose_installation_with_env(id, raw_compose, None, task_id);
}

pub fn spawn_compose_installation_with_env(
    id: String,
    raw_compose: String,
    custom_env: Option<String>,
    task_id: String,
) {
    let task_id_clone = task_id;
    tokio::spawn(async move {
        let safe_id = id.replace("..", "").replace('/', "-").replace('\\', "-");
        let app_dir = format!("data/apps/{}", safe_id);

        let is_cancelled = || -> bool {
            CANCELLED_TASKS
                .read()
                .map(|c| c.contains(&task_id_clone))
                .unwrap_or(false)
        };

        let cleanup_cancelled = |dir: &str| {
            let _ = std::process::Command::new("docker")
                .args(["compose", "down", "-v"])
                .current_dir(dir)
                .output();
            let _ = fs::remove_dir_all(dir);
            let mut tasks = INSTALL_TASKS.write().unwrap();
            if let Some(task) = tasks.get_mut(&task_id_clone) {
                task.status = "cancelled".to_string();
                task.logs
                    .push("[INFO] Instalação cancelada e recursos limpos.".to_string());
            }
            if let Ok(mut pids) = TASK_PIDS.write() {
                pids.remove(&task_id_clone);
            }
            if let Ok(mut cancelled) = CANCELLED_TASKS.write() {
                cancelled.remove(&task_id_clone);
            }
        };

        if is_cancelled() {
            cleanup_cancelled(&app_dir);
            return;
        }

        // Phase 1: Prepare files (0%)
        {
            let mut tasks = INSTALL_TASKS.write().unwrap();
            if let Some(task) = tasks.get_mut(&task_id_clone) {
                task.status = "preparing".to_string();
                task.progress = 5;
                task.logs
                    .push(format!("[INFO] Preparing app directory: {}", app_dir));
            }
        }

        if fs::create_dir_all(&app_dir).is_err() {
            let mut tasks = INSTALL_TASKS.write().unwrap();
            if let Some(task) = tasks.get_mut(&task_id_clone) {
                task.status = "error".to_string();
                task.error = Some("Failed to create app directory".to_string());
            }
            return;
        }

        let mut compose_content = raw_compose;
        compose_content = compose_content.replace("/DATA/AppData/$AppID", ".");
        compose_content = compose_content.replace("/DATA/AppData/${AppID}", ".");

        // Remove network_mode: host to enforce default bridge networking with explicit port mappings
        compose_content = compose_content.replace("network_mode: host", "");
        compose_content = compose_content.replace("network_mode: \"host\"", "");

        // Enforce safe container logging rotation limits (max 30MB per container)
        compose_content = ensure_safe_logging_config(&compose_content);

        let compose_path = format!("{}/docker-compose.yml", app_dir);
        if fs::write(&compose_path, &compose_content).is_err() {
            let mut tasks = INSTALL_TASKS.write().unwrap();
            if let Some(task) = tasks.get_mut(&task_id_clone) {
                task.status = "error".to_string();
                task.error = Some("Failed to write compose file".to_string());
            }
            return;
        }

        // Write .env file (custom or default)
        let env_content = match custom_env {
            Some(ref env) => env.clone(),
            None => format!("AppID={}\nTZ=UTC\nPUID=1000\nPGID=1000\n", id),
        };
        let env_path = format!("{}/.env", app_dir);
        let _ = fs::write(&env_path, env_content);

        // Create volume dirs with permissions
        if let Ok(parsed) = serde_yaml::from_str::<Value>(&compose_content) {
            if let Some(services) = parsed.get("services").and_then(|s| s.as_mapping()) {
                for (_, service) in services {
                    if let Some(volumes) = service.get("volumes").and_then(|v| v.as_sequence()) {
                        for vol in volumes {
                            if let Some(vol_str) = vol.as_str() {
                                let parts: Vec<&str> = vol_str.split(':').collect();
                                if parts.len() >= 2 {
                                    let host_path = parts[0];
                                    if host_path.starts_with("./")
                                        || (!host_path.starts_with('/') && !host_path.contains('/'))
                                    {
                                        let full_path = format!(
                                            "{}/{}",
                                            app_dir,
                                            host_path.trim_start_matches("./")
                                        );
                                        if fs::create_dir_all(&full_path).is_ok() {
                                            #[cfg(unix)]
                                            {
                                                use std::os::unix::fs::PermissionsExt;
                                                let _ = fs::set_permissions(
                                                    &full_path,
                                                    fs::Permissions::from_mode(0o777),
                                                );
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Fix permissions using native Rust fs calls
        set_permissions_recursive(std::path::Path::new(&app_dir));

        if is_cancelled() {
            cleanup_cancelled(&app_dir);
            return;
        }

        // Phase 2: Pull images with parallel layer downloads (10% -> 60%)
        {
            let mut tasks = INSTALL_TASKS.write().unwrap();
            if let Some(task) = tasks.get_mut(&task_id_clone) {
                task.status = "pulling".to_string();
                task.progress = 10;
                task.logs.push("[INFO] Pulling images...".to_string());
            }
        }

        let mut pull_cmd = Command::new("docker")
            .arg("compose")
            .arg("pull")
            .env("DOCKER_BUILDKIT", "1")
            .env("COMPOSE_PARALLEL_LIMIT", "8")
            .current_dir(&app_dir)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .ok();

        if let Some(ref mut child) = pull_cmd {
            if let Some(pid) = child.id() {
                if let Ok(mut pids) = TASK_PIDS.write() {
                    pids.insert(task_id_clone.clone(), pid);
                }
            }

            if let Some(stderr) = child.stderr.take() {
                let mut reader = tokio::io::BufReader::new(stderr).lines();
                let mut pull_progress: u8 = 10;
                while let Ok(Some(line)) = reader.next_line().await {
                    if is_cancelled() {
                        let _ = child.kill().await;
                        break;
                    }
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
            let pull_status = child.wait().await;
            if let Ok(mut pids) = TASK_PIDS.write() {
                pids.remove(&task_id_clone);
            }

            if is_cancelled() {
                cleanup_cancelled(&app_dir);
                return;
            }

            match pull_status {
                Ok(status) if !status.success() => {
                    if is_cancelled() {
                        cleanup_cancelled(&app_dir);
                        return;
                    }
                    let mut tasks = INSTALL_TASKS.write().unwrap();
                    if let Some(task) = tasks.get_mut(&task_id_clone) {
                        task.status = "error".to_string();
                        task.error = Some(format!(
                            "docker compose pull exited with error code: {}",
                            status
                        ));
                        task.logs.push(format!(
                            "[ERROR] Falha ao baixar imagens Docker (código: {})",
                            status
                        ));
                    }
                    return;
                }
                Err(e) => {
                    if is_cancelled() {
                        cleanup_cancelled(&app_dir);
                        return;
                    }
                    let mut tasks = INSTALL_TASKS.write().unwrap();
                    if let Some(task) = tasks.get_mut(&task_id_clone) {
                        task.status = "error".to_string();
                        task.error = Some(format!("Failed to wait for pull: {}", e));
                        task.logs
                            .push(format!("[ERROR] Erro no processo de download: {}", e));
                    }
                    return;
                }
                _ => {}
            }
        }

        if is_cancelled() {
            cleanup_cancelled(&app_dir);
            return;
        }

        // Phase 3: docker compose up -d (60% -> 95%)
        {
            let mut tasks = INSTALL_TASKS.write().unwrap();
            if let Some(task) = tasks.get_mut(&task_id_clone) {
                task.status = "installing".to_string();
                task.progress = 60;
                task.logs.push("[INFO] Starting containers...".to_string());
            }
        }

        let mut up_cmd = Command::new("docker")
            .arg("compose")
            .arg("up")
            .arg("-d")
            .current_dir(&app_dir)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .spawn();

        match up_cmd {
            Ok(ref mut child) => {
                if let Some(pid) = child.id() {
                    if let Ok(mut pids) = TASK_PIDS.write() {
                        pids.insert(task_id_clone.clone(), pid);
                    }
                }
                let mut all_output: Vec<String> = vec![];

                if let Some(stderr) = child.stderr.take() {
                    let mut reader = tokio::io::BufReader::new(stderr).lines();
                    let mut up_progress: u8 = 60;
                    while let Ok(Some(line)) = reader.next_line().await {
                        if is_cancelled() {
                            let _ = child.kill().await;
                            break;
                        }
                        if !line.trim().is_empty() {
                            if line.contains("Started")
                                || line.contains("Created")
                                || line.contains("Running")
                            {
                                up_progress = (up_progress + 5).min(95);
                            }
                            all_output.push(line.clone());
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

                let wait_res = child.wait().await;
                if let Ok(mut pids) = TASK_PIDS.write() {
                    pids.remove(&task_id_clone);
                }

                if is_cancelled() {
                    cleanup_cancelled(&app_dir);
                    return;
                }

                match wait_res {
                    Ok(status) if status.success() => {
                        let mut tasks = INSTALL_TASKS.write().unwrap();
                        if let Some(task) = tasks.get_mut(&task_id_clone) {
                            task.status = "done".to_string();
                            task.progress = 100;
                            task.logs
                                .push("[INFO] Installation complete!".to_string());
                        }
                    }
                    Ok(status) => {
                        if is_cancelled() {
                            cleanup_cancelled(&app_dir);
                            return;
                        }
                        let error_msg =
                            format!("docker compose up exited with status: {}", status);
                        let mut tasks = INSTALL_TASKS.write().unwrap();
                        if let Some(task) = tasks.get_mut(&task_id_clone) {
                            task.status = "error".to_string();
                            task.error = Some(error_msg.clone());
                            task.logs.push(format!("[ERROR] {}", error_msg));
                        }
                    }
                    Err(e) => {
                        if is_cancelled() {
                            cleanup_cancelled(&app_dir);
                            return;
                        }
                        let mut tasks = INSTALL_TASKS.write().unwrap();
                        if let Some(task) = tasks.get_mut(&task_id_clone) {
                            task.status = "error".to_string();
                            task.error = Some(format!("Process error: {}", e));
                            task.logs.push(format!("[ERROR] {}", e));
                        }
                    }
                }
            }
            Err(e) => {
                if let Ok(mut pids) = TASK_PIDS.write() {
                    pids.remove(&task_id_clone);
                }
                if is_cancelled() {
                    cleanup_cancelled(&app_dir);
                    return;
                }
                let mut tasks = INSTALL_TASKS.write().unwrap();
                if let Some(task) = tasks.get_mut(&task_id_clone) {
                    task.status = "error".to_string();
                    task.error = Some(format!("Failed to spawn docker compose: {}", e));
                    task.logs
                        .push(format!("[ERROR] Failed to spawn docker compose: {}", e));
                }
            }
        }
        if let Ok(mut pids) = TASK_PIDS.write() {
            pids.remove(&task_id_clone);
        }
        if let Ok(mut cancelled) = CANCELLED_TASKS.write() {
            cancelled.remove(&task_id_clone);
        }
    });
}
