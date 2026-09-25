use serde_yaml::Value;
use std::collections::HashMap;
use std::fs;

use super::super::types::{CustomInstallPayload, PortMapping, VolumeMapping};

/// Sets permissions recursively on a directory using native Rust fs calls.
#[cfg(unix)]
pub fn set_permissions_recursive(dir: &std::path::Path) {
    use std::os::unix::fs::PermissionsExt;
    if dir.is_symlink() {
        return;
    }
    let _ = fs::set_permissions(dir, fs::Permissions::from_mode(0o755));
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_symlink() {
                continue;
            }
            if path.is_dir() {
                let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o755));
                set_permissions_recursive(&path);
            } else if path.is_file() {
                let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o644));
            }
        }
    }
}

#[cfg(not(unix))]
pub fn set_permissions_recursive(_dir: &std::path::Path) {}

pub fn extract_compose_config(
    raw_compose: &str,
    _app_id: &str,
) -> (Vec<PortMapping>, Vec<VolumeMapping>, HashMap<String, String>) {
    let mut ports = Vec::new();
    let mut volumes = Vec::new();
    let mut env = HashMap::new();

    env.insert("TZ".to_string(), "UTC".to_string());
    env.insert("PUID".to_string(), "1000".to_string());
    env.insert("PGID".to_string(), "1000".to_string());

    if let Ok(parsed) = serde_yaml::from_str::<Value>(raw_compose) {
        if let Some(services) = parsed.get("services").and_then(|s| s.as_mapping()) {
            for (_, service) in services {
                // Ports
                if let Some(p_seq) = service.get("ports").and_then(|p| p.as_sequence()) {
                    for p in p_seq {
                        if let Some(p_str) = p.as_str() {
                            let mut proto = "tcp".to_string();
                            let clean_str = if let Some((head, pr)) = p_str.split_once('/') {
                                proto = pr.to_lowercase();
                                head
                            } else {
                                p_str
                            };
                            let parts: Vec<&str> = clean_str.split(':').collect();
                            if parts.len() == 2 {
                                if let (Ok(h), Ok(c)) =
                                    (parts[0].parse::<u16>(), parts[1].parse::<u16>())
                                {
                                    if !ports.iter().any(|existing: &PortMapping| {
                                        existing.host == h && existing.container == c
                                    }) {
                                        ports.push(PortMapping {
                                            host: h,
                                            container: c,
                                            protocol: proto,
                                        });
                                    }
                                }
                            } else if parts.len() == 1 {
                                if let Ok(c) = parts[0].parse::<u16>() {
                                    ports.push(PortMapping {
                                        host: c,
                                        container: c,
                                        protocol: proto,
                                    });
                                }
                            }
                        } else if let Some(p_num) = p.as_u64() {
                            let c = p_num as u16;
                            ports.push(PortMapping {
                                host: c,
                                container: c,
                                protocol: "tcp".to_string(),
                            });
                        }
                    }
                }

                // Volumes
                if let Some(v_seq) = service.get("volumes").and_then(|v| v.as_sequence()) {
                    for v in v_seq {
                        if let Some(v_str) = v.as_str() {
                            let parts: Vec<&str> = v_str.split(':').collect();
                            if parts.len() >= 2 {
                                let h = parts[0].to_string();
                                let c = parts[1].to_string();
                                if !volumes
                                    .iter()
                                    .any(|existing: &VolumeMapping| existing.container == c)
                                {
                                    volumes.push(VolumeMapping {
                                        host: h,
                                        container: c,
                                    });
                                }
                            }
                        }
                    }
                }

                // Environment
                if let Some(e_val) = service.get("environment") {
                    if let Some(e_seq) = e_val.as_sequence() {
                        for item in e_seq {
                            if let Some(item_str) = item.as_str() {
                                if let Some((k, v)) = item_str.split_once('=') {
                                    let clean_k = k.trim().to_string();
                                    let clean_v = v.trim().to_string();
                                    if !clean_k.is_empty() {
                                        env.insert(clean_k, clean_v);
                                    }
                                }
                            }
                        }
                    } else if let Some(e_map) = e_val.as_mapping() {
                        for (k, v) in e_map {
                            if let Some(k_str) = k.as_str() {
                                let v_str = match v {
                                    Value::String(s) => s.clone(),
                                    Value::Number(n) => n.to_string(),
                                    Value::Bool(b) => b.to_string(),
                                    _ => "".to_string(),
                                };
                                env.insert(k_str.to_string(), v_str);
                            }
                        }
                    }
                }
            }
        }
    }

    (ports, volumes, env)
}

pub fn apply_custom_config(
    raw_compose: &str,
    payload: &CustomInstallPayload,
    app_id: &str,
) -> (String, String) {
    let mut compose = raw_compose.to_string();

    // 1. Port overrides
    if let Some(ref ports) = payload.ports {
        for p in ports {
            let pattern = format!(
                r#"(?m)(^\s*-\s*["']?)\d+:({})(?:/([a-z]+))?(["']?\s*$)"#,
                p.container
            );
            if let Ok(re) = regex::Regex::new(&pattern) {
                compose = re
                    .replace_all(&compose, |caps: &regex::Captures| {
                        let prefix = caps.get(1).map_or("", |m| m.as_str());
                        let proto = caps.get(3).map_or("", |m| m.as_str());
                        let suffix = caps.get(4).map_or("", |m| m.as_str());
                        if proto.is_empty() {
                            format!("{}{}:{}{}", prefix, p.host, p.container, suffix)
                        } else {
                            format!("{}{}:{}/{}{}", prefix, p.host, p.container, proto, suffix)
                        }
                    })
                    .to_string();
            }
        }
    }

    // 2. Volume overrides
    if let Some(ref vols) = payload.volumes {
        for v in vols {
            let pattern = format!(
                r#"(?m)(^\s*-\s*["']?)(?:[^:\s"']+):({})(?::([a-zA-Z0-9_-]+))?(["']?\s*$)"#,
                regex::escape(&v.container)
            );
            if let Ok(re) = regex::Regex::new(&pattern) {
                compose = re
                    .replace_all(&compose, |caps: &regex::Captures| {
                        let prefix = caps.get(1).map_or("", |m| m.as_str());
                        let mode = caps.get(3).map_or("", |m| m.as_str());
                        let suffix = caps.get(4).map_or("", |m| m.as_str());
                        if mode.is_empty() {
                            format!("{}{}:{}{}", prefix, v.host, v.container, suffix)
                        } else {
                            format!("{}{}:{}:{}{}", prefix, v.host, v.container, mode, suffix)
                        }
                    })
                    .to_string();
            }
        }
    }

    // 3. Environment to .env
    let mut env_map = HashMap::new();
    env_map.insert("AppID".to_string(), app_id.to_string());
    env_map.insert("TZ".to_string(), "UTC".to_string());
    env_map.insert("PUID".to_string(), "1000".to_string());
    env_map.insert("PGID".to_string(), "1000".to_string());

    if let Some(ref user_env) = payload.env {
        for (k, v) in user_env {
            env_map.insert(k.clone(), v.clone());
        }
    }

    let mut env_lines = Vec::new();
    for (k, v) in env_map {
        env_lines.push(format!("{}={}", k, v));
    }
    env_lines.sort();
    let env_content = env_lines.join("\n") + "\n";

    (compose, env_content)
}

pub fn ensure_safe_logging_config(compose_str: &str) -> String {
    if let Ok(mut parsed) = serde_yaml::from_str::<Value>(compose_str) {
        if let Some(services) = parsed.get_mut("services").and_then(|s| s.as_mapping_mut()) {
            let logging_key = Value::String("logging".to_string());
            for (_, service) in services.iter_mut() {
                if let Some(svc_map) = service.as_mapping_mut() {
                    if !svc_map.contains_key(&logging_key) {
                        let mut log_opts = serde_yaml::Mapping::new();
                        log_opts.insert(
                            Value::String("max-size".to_string()),
                            Value::String("10m".to_string()),
                        );
                        log_opts.insert(
                            Value::String("max-file".to_string()),
                            Value::String("3".to_string()),
                        );

                        let mut log_map = serde_yaml::Mapping::new();
                        log_map.insert(
                            Value::String("driver".to_string()),
                            Value::String("json-file".to_string()),
                        );
                        log_map.insert(Value::String("options".to_string()), Value::Mapping(log_opts));

                        svc_map.insert(logging_key.clone(), Value::Mapping(log_map));
                    }
                }
            }
        }
        if let Ok(updated) = serde_yaml::to_string(&parsed) {
            return updated;
        }
    }
    compose_str.to_string()
}
