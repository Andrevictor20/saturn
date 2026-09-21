use std::fs;
use std::path::{Path, PathBuf};
use serde_json::Value;

/// Resolves the candidate path for docker daemon configuration file.
/// Prioritizes `/host/etc/docker/daemon.json` (container environment with rootfs mount)
/// and falls back to `/etc/docker/daemon.json` (bare-metal or development).
pub fn resolve_daemon_json_path() -> Option<PathBuf> {
    let candidate_host = Path::new("/host/etc/docker/daemon.json");
    if candidate_host.exists() || Path::new("/host/etc/docker").is_dir() {
        return Some(candidate_host.to_path_buf());
    }

    let candidate_local = Path::new("/etc/docker/daemon.json");
    if candidate_local.exists() || Path::new("/etc/docker").is_dir() {
        return Some(candidate_local.to_path_buf());
    }

    None
}

/// Pure helper to inspect and merge high-performance download parameters into Docker daemon JSON.
/// Returns (formatted_json_string, was_changed).
pub fn optimize_daemon_json_content(raw_json: &str) -> Result<(String, bool), String> {
    let mut root: Value = if raw_json.trim().is_empty() {
        serde_json::json!({})
    } else {
        serde_json::from_str(raw_json).map_err(|e| format!("Invalid JSON in daemon.json: {}", e))?
    };

    let obj = root
        .as_object_mut()
        .ok_or_else(|| "daemon.json root must be a JSON object".to_string())?;

    let mut changed = false;

    // 1. max-concurrent-downloads: default is 3 in vanilla Docker; 10 saturates broadband
    let current_downloads = obj
        .get("max-concurrent-downloads")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    if current_downloads < 10 {
        obj.insert("max-concurrent-downloads".to_string(), Value::from(10));
        changed = true;
    }

    // 2. max-concurrent-uploads: default 5
    let current_uploads = obj
        .get("max-concurrent-uploads")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    if current_uploads < 5 {
        obj.insert("max-concurrent-uploads".to_string(), Value::from(5));
        changed = true;
    }

    // 3. max-download-attempts: default 3; bump to 5 for transient network resilience
    let current_attempts = obj
        .get("max-download-attempts")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    if current_attempts < 5 {
        obj.insert("max-download-attempts".to_string(), Value::from(5));
        changed = true;
    }

    let formatted = serde_json::to_string_pretty(&root)
        .map_err(|e| format!("Failed to serialize daemon.json: {}", e))?;

    Ok((formatted, changed))
}

/// Inspects the host Docker daemon configuration and non-destructively tunes
/// concurrency limits to accelerate image downloads and container updates.
pub fn ensure_docker_daemon_optimized() -> bool {
    let path = match resolve_daemon_json_path() {
        Some(p) => p,
        None => {
            tracing::debug!("Docker daemon.json path could not be resolved on host");
            return false;
        }
    };

    let raw_content = if path.exists() {
        match fs::read_to_string(&path) {
            Ok(c) => c,
            Err(e) => {
                tracing::warn!("Failed to read {}: {}", path.display(), e);
                return false;
            }
        }
    } else {
        String::new()
    };

    match optimize_daemon_json_content(&raw_content) {
        Ok((new_json, changed)) => {
            if !changed {
                tracing::debug!("Docker daemon.json is already optimized for high-speed downloads");
                return true;
            }

            if let Some(parent) = path.parent() {
                let _ = fs::create_dir_all(parent);
            }

            if let Err(e) = fs::write(&path, &new_json) {
                tracing::warn!("Failed to write optimized daemon.json at {}: {}", path.display(), e);
                return false;
            }

            tracing::info!(
                "Successfully tuned Docker daemon at {} (max-concurrent-downloads: 10, max-concurrent-uploads: 5, max-download-attempts: 5)",
                path.display()
            );

            // Attempt safe live reload via SIGHUP (does not restart running containers)
            reload_docker_daemon_safely();
            true
        }
        Err(e) => {
            tracing::warn!("Skipping daemon optimization: {}", e);
            false
        }
    }
}

/// Sends SIGHUP to the dockerd process or triggers systemctl reload if accessible.
/// SIGHUP re-reads daemon.json without terminating any running containers.
fn reload_docker_daemon_safely() {
    #[cfg(unix)]
    {
        // Try kill -SIGHUP on dockerd
        let _ = std::process::Command::new("sh")
            .arg("-c")
            .arg("pkill -SIGHUP dockerd || kill -SIGHUP $(pidof dockerd 2>/dev/null) 2>/dev/null || true")
            .output();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_optimize_empty_json() {
        let (res, changed) = optimize_daemon_json_content("").expect("Should parse empty");
        assert!(changed);
        let parsed: Value = serde_json::from_str(&res).unwrap();
        assert_eq!(parsed["max-concurrent-downloads"], 10);
        assert_eq!(parsed["max-concurrent-uploads"], 5);
        assert_eq!(parsed["max-download-attempts"], 5);
    }

    #[test]
    fn test_preserves_existing_config() {
        let existing = r#"{
            "log-driver": "json-file",
            "log-opts": {
                "max-size": "10m",
                "max-file": "3"
            }
        }"#;

        let (res, changed) = optimize_daemon_json_content(existing).expect("Should parse");
        assert!(changed);
        let parsed: Value = serde_json::from_str(&res).unwrap();
        assert_eq!(parsed["log-driver"], "json-file");
        assert_eq!(parsed["log-opts"]["max-size"], "10m");
        assert_eq!(parsed["max-concurrent-downloads"], 10);
        assert_eq!(parsed["max-concurrent-uploads"], 5);
        assert_eq!(parsed["max-download-attempts"], 5);
    }

    #[test]
    fn test_already_optimized_is_idempotent() {
        let optimized = r#"{
            "max-concurrent-downloads": 10,
            "max-concurrent-uploads": 5,
            "max-download-attempts": 5
        }"#;

        let (_, changed) = optimize_daemon_json_content(optimized).expect("Should parse");
        assert!(!changed, "Should not report changed when already optimized");
    }

    #[test]
    fn test_preserves_higher_limits_if_configured() {
        let higher = r#"{
            "max-concurrent-downloads": 20,
            "max-concurrent-uploads": 10,
            "max-download-attempts": 10
        }"#;

        let (res, changed) = optimize_daemon_json_content(higher).expect("Should parse");
        assert!(!changed);
        let parsed: Value = serde_json::from_str(&res).unwrap();
        assert_eq!(parsed["max-concurrent-downloads"], 20);
    }
}
