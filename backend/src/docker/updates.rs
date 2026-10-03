//! Remote container registry manifest inspection (Docker Hub, GHCR) and update availability checking.

use std::collections::HashMap;
use std::sync::RwLock;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use bollard::query_parameters::ListContainersOptions;
use bollard::Docker;
use once_cell::sync::Lazy;
use crate::state::AppState;

use futures::stream::{self, StreamExt};

pub fn get_host_platform() -> &'static str {
    match std::env::consts::ARCH {
        "aarch64" => "linux/arm64",
        "arm" => "linux/arm/v7",
        "x86_64" => "linux/amd64",
        "x86" => "linux/386",
        "riscv64" => "linux/riscv64",
        _ => "linux/amd64",
    }
}

pub fn parse_image_ref(image: &str) -> (String, String, String) {
    // 1. Strip @sha256:... digest pin if present
    let clean_img = if let Some((base, _)) = image.split_once('@') {
        base
    } else {
        image
    };

    let (img, tag) = if let Some((name, t)) = clean_img.rsplit_once(':') {
        if !name.contains('/') || name.rfind('/').unwrap() < clean_img.rfind(':').unwrap_or(0) {
            (name.to_string(), t.to_string())
        } else {
            (clean_img.to_string(), "latest".to_string())
        }
    } else {
        (clean_img.to_string(), "latest".to_string())
    };

    if img.starts_with("ghcr.io/") {
        ("ghcr.io".to_string(), img.trim_start_matches("ghcr.io/").to_string(), tag)
    } else if img.starts_with("lscr.io/") {
        ("lscr.io".to_string(), img.trim_start_matches("lscr.io/").to_string(), tag)
    } else if img.contains('/') {
        if img.split('/').next().unwrap_or("").contains('.') {
            let parts: Vec<&str> = img.splitn(2, '/').collect();
            (parts[0].to_string(), parts[1].to_string(), tag)
        } else {
            ("registry-1.docker.io".to_string(), img, tag)
        }
    } else {
        ("registry-1.docker.io".to_string(), format!("library/{}", img), tag)
    }
}

async fn fetch_token_from_challenge(
    client: &reqwest::Client,
    www_auth: &str,
    repo: &str,
) -> Option<String> {
    if !www_auth.starts_with("Bearer ") && !www_auth.starts_with("bearer ") {
        return None;
    }
    let mut realm = None;
    let mut service = None;
    for part in www_auth.split(',') {
        let trimmed = part.trim();
        if let Some(val) = trimmed.strip_prefix("realm=").or_else(|| trimmed.strip_prefix("Bearer realm=")) {
            realm = Some(val.trim_matches('"').to_string());
        } else if let Some(val) = trimmed.strip_prefix("service=") {
            service = Some(val.trim_matches('"').to_string());
        }
    }
    let realm = realm?;
    let mut token_url = format!("{}?scope=repository:{}:pull", realm, repo);
    if let Some(srv) = service {
        token_url.push_str(&format!("&service={}", srv));
    }
    let res = client.get(&token_url).send().await.ok()?;
    let json = res.json::<serde_json::Value>().await.ok()?;
    json.get("token")
        .or_else(|| json.get("access_token"))
        .and_then(|t| t.as_str())
        .map(|s| s.to_string())
}

pub async fn check_remote_registry_for_update(docker: &Docker, image: &str) -> bool {
    // 1. Inspect local image
    let inspect = match docker.inspect_image(image).await {
        Ok(i) => i,
        Err(_) => return false,
    };
    let local_digests = inspect.repo_digests.unwrap_or_default();
    if local_digests.is_empty() {
        return false;
    }

    // Determine actual image ref (if image was sha256:... try to resolve tag from repo_tags)
    let actual_image = if image.starts_with("sha256:") {
        if let Some(tags) = &inspect.repo_tags {
            tags.first().map(|s| s.as_str()).unwrap_or(image)
        } else {
            image
        }
    } else {
        image
    };

    // 2. Parse image: e.g. "nginx:latest", "linuxserver/qbittorrent", "ghcr.io/owner/repo:tag"
    let (registry, repo, tag) = parse_image_ref(actual_image);
    
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(4))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    // Get Auth Token if needed
    let token = if registry == "registry-1.docker.io" {
        let auth_url = format!("https://auth.docker.io/token?service=registry.docker.io&scope=repository:{}:pull", repo);
        if let Ok(res) = client.get(&auth_url).send().await {
            if let Ok(json) = res.json::<serde_json::Value>().await {
                json.get("token").and_then(|t| t.as_str()).map(|s| s.to_string())
            } else { None }
        } else { None }
    } else if registry == "ghcr.io" || registry == "lscr.io" {
        let auth_url = format!("https://ghcr.io/token?service=ghcr.io&scope=repository:{}:pull", repo);
        if let Ok(res) = client.get(&auth_url).send().await {
            if let Ok(json) = res.json::<serde_json::Value>().await {
                json.get("token").and_then(|t| t.as_str()).map(|s| s.to_string())
            } else { None }
        } else { None }
    } else {
        None
    };

    // Query manifest HEAD
    let manifest_url = format!("https://{}/v2/{}/manifests/{}", registry, repo, tag);
    let mut req = client.head(&manifest_url)
        .header("Accept", "application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.index.v1+json");

    if let Some(tok) = &token {
        req = req.header("Authorization", format!("Bearer {}", tok));
    }

    let host_arch = match std::env::consts::ARCH {
        "aarch64" => "arm64",
        "arm" => "arm",
        "x86_64" => "amd64",
        "x86" => "386",
        "riscv64" => "riscv64",
        other => other,
    };

    if let Ok(res) = req.send().await {
        if res.status().is_success() {
            if let Some(remote_digest) = res.headers().get("docker-content-digest").and_then(|d| d.to_str().ok()) {
                if is_local_digest_matching(&local_digests, remote_digest, None, host_arch) {
                    return false;
                }

                let is_manifest_list = res.headers()
                    .get(reqwest::header::CONTENT_TYPE)
                    .and_then(|ct| ct.to_str().ok())
                    .map(|ct| ct.contains("manifest.list") || ct.contains("image.index"))
                    .unwrap_or(false);

                if is_manifest_list {
                    let mut get_req = client.get(&manifest_url)
                        .header("Accept", "application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.index.v1+json");
                    if let Some(tok) = &token {
                        get_req = get_req.header("Authorization", format!("Bearer {}", tok));
                    }
                    if let Ok(get_res) = get_req.send().await {
                        if get_res.status().is_success() {
                            if let Ok(index_val) = get_res.json::<serde_json::Value>().await {
                                if is_local_digest_matching(&local_digests, remote_digest, Some(&index_val), host_arch) {
                                    return false;
                                }
                            }
                        }
                    }
                }

                return true;
            }
        } else if res.status() == StatusCode::UNAUTHORIZED && token.is_none() {
            // Handle Www-Authenticate challenge for generic registries
            if let Some(auth_hdr) = res.headers().get("www-authenticate").and_then(|h| h.to_str().ok()) {
                if let Some(challenge_tok) = fetch_token_from_challenge(&client, auth_hdr, &repo).await {
                    let retry_req = client.head(&manifest_url)
                        .header("Accept", "application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.index.v1+json")
                        .header("Authorization", format!("Bearer {}", challenge_tok));
                    if let Ok(retry_res) = retry_req.send().await {
                        if retry_res.status().is_success() {
                            if let Some(remote_digest) = retry_res.headers().get("docker-content-digest").and_then(|d| d.to_str().ok()) {
                                if is_local_digest_matching(&local_digests, remote_digest, None, host_arch) {
                                    return false;
                                }

                                let is_manifest_list = retry_res.headers()
                                    .get(reqwest::header::CONTENT_TYPE)
                                    .and_then(|ct| ct.to_str().ok())
                                    .map(|ct| ct.contains("manifest.list") || ct.contains("image.index"))
                                    .unwrap_or(false);

                                if is_manifest_list {
                                    let get_req = client.get(&manifest_url)
                                        .header("Accept", "application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.index.v1+json")
                                        .header("Authorization", format!("Bearer {}", challenge_tok));
                                    if let Ok(get_res) = get_req.send().await {
                                        if get_res.status().is_success() {
                                            if let Ok(index_val) = get_res.json::<serde_json::Value>().await {
                                                if is_local_digest_matching(&local_digests, remote_digest, Some(&index_val), host_arch) {
                                                    return false;
                                                }
                                            }
                                        }
                                    }
                                }

                                return true;
                            }
                        }
                    }
                }
            }
        }
    }

    false
}

pub fn is_local_digest_matching(
    local_digests: &[String],
    remote_digest: &str,
    index_json: Option<&serde_json::Value>,
    host_arch: &str,
) -> bool {
    // 1. Direct match with remote digest (manifest list / index or single manifest)
    if local_digests
        .iter()
        .any(|ld| ld.ends_with(remote_digest) || ld.contains(remote_digest))
    {
        return true;
    }

    // 2. Check child platform manifests in index JSON
    if let Some(index) = index_json {
        if let Some(manifests) = index.get("manifests").and_then(|m| m.as_array()) {
            for manifest in manifests {
                let arch_matches = manifest
                    .get("platform")
                    .and_then(|p| p.get("architecture"))
                    .and_then(|a| a.as_str())
                    .map(|a| a == host_arch)
                    .unwrap_or(false);
                let os_matches = manifest
                    .get("platform")
                    .and_then(|p| p.get("os"))
                    .and_then(|o| o.as_str())
                    .map(|o| o == "linux")
                    .unwrap_or(true);

                if arch_matches && os_matches {
                    if let Some(child_digest) = manifest.get("digest").and_then(|d| d.as_str()) {
                        if local_digests
                            .iter()
                            .any(|ld| ld.ends_with(child_digest) || ld.contains(child_digest))
                        {
                            return true;
                        }
                    }
                }
            }
        }
    }

    false
}

pub static UPDATE_CACHE: Lazy<RwLock<HashMap<String, (bool, u64)>>> = 
    Lazy::new(|| RwLock::new(HashMap::new()));

pub fn invalidate_update_cache(image: &str) {
    if let Ok(mut cache) = UPDATE_CACHE.write() {
        cache.remove(image);
    }
}

pub async fn check_single_image_update(docker: &Docker, image: &str) -> bool {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
    
    // Check cache (15 min TTL = 900s)
    if let Ok(cache) = UPDATE_CACHE.read() {
        if let Some((has_update, timestamp)) = cache.get(image) {
            if now.saturating_sub(*timestamp) < 900 {
                return *has_update;
            }
        }
    }

    let has_update = check_remote_registry_for_update(docker, image).await;
    
    if let Ok(mut cache) = UPDATE_CACHE.write() {
        cache.insert(image.to_string(), (has_update, now));
    }
    
    has_update
}

pub async fn check_container_updates(
    State(state): State<AppState>,
) -> impl IntoResponse {
    let options = ListContainersOptions {
        all: true,
        ..Default::default()
    };
    let containers = state.docker.list_containers(Some(options)).await.unwrap_or_default();
    
    // Extract unique images to check
    let mut unique_images: Vec<String> = containers
        .iter()
        .filter_map(|c| c.image.clone())
        .collect();
    unique_images.sort();
    unique_images.dedup();

    // Check updates concurrently with bounded concurrency (8)
    let image_results: HashMap<String, bool> = stream::iter(unique_images)
        .map(|image| {
            let docker = state.docker.clone();
            async move {
                let has_update = check_single_image_update(&docker, &image).await;
                (image, has_update)
            }
        })
        .buffer_unordered(8)
        .collect()
        .await;

    let mut update_results = HashMap::new();

    for c in containers {
        if let (Some(id), Some(image)) = (c.id, c.image) {
            let short_id: String = id.chars().take(12).collect();
            let has_update = if image.contains("saturn") {
                let current = crate::system::get_app_version();
                let latest_info = crate::system::update::UPDATE_CACHE.read().ok().and_then(|g| g.as_ref().map(|(info, _)| info.clone()));
                if let Some(info) = latest_info {
                    crate::system::update::is_newer_version(&info.latest_version, &current)
                } else {
                    false
                }
            } else {
                image_results.get(&image).copied().unwrap_or(false)
            };
            let val = serde_json::json!({
                "image": image,
                "has_update": has_update
            });
            // Index by both short_id (12 chars) AND full id (64 chars)
            update_results.insert(short_id, val.clone());
            update_results.insert(id, val);
        }
    }

    (StatusCode::OK, Json(update_results)).into_response()
}

pub async fn check_single_container_update(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let inspect = match state.docker.inspect_container(&id, None::<bollard::query_parameters::InspectContainerOptions>).await {
        Ok(i) => i,
        Err(e) => return (StatusCode::NOT_FOUND, format!("Container not found: {}", e)).into_response(),
    };

    let image = inspect.config.and_then(|c| c.image).unwrap_or_default();
    let has_update = if image.contains("saturn") {
        let current = crate::system::get_app_version();
        let latest_info = crate::system::update::UPDATE_CACHE.read().ok().and_then(|g| g.as_ref().map(|(info, _)| info.clone()));
        if let Some(info) = latest_info {
            crate::system::update::is_newer_version(&info.latest_version, &current)
        } else {
            false
        }
    } else {
        check_single_image_update(&state.docker, &image).await
    };

    (StatusCode::OK, Json(serde_json::json!({
        "id": id,
        "image": image,
        "has_update": has_update
    }))).into_response()
}
