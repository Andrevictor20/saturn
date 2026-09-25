use axum::{
    body::Bytes,
    http::{header, StatusCode},
    response::IntoResponse,
    Json,
};
use once_cell::sync::Lazy;
use std::fs;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::RwLock;
use tracing::{info, warn};
use super::types::AppStoreItem;

pub static APPS_CACHE: Lazy<RwLock<Vec<AppStoreItem>>> = Lazy::new(|| RwLock::new(Vec::new()));
static APPS_JSON_CACHE: Lazy<RwLock<Option<Bytes>>> = Lazy::new(|| RwLock::new(None));
static SYNCING: AtomicBool = AtomicBool::new(false);

/// Reclaim glibc arena memory back to the Linux kernel.
pub fn trim_memory() {
    #[cfg(target_os = "linux")]
    unsafe {
        libc::malloc_trim(0);
    }
}

fn update_cache(apps: Vec<AppStoreItem>, precomputed_json: Option<String>) {
    let json = precomputed_json.unwrap_or_else(|| serde_json::to_string(&apps).unwrap_or_default());
    let bytes = Bytes::from(json);
    if let Ok(mut cache) = APPS_CACHE.write() {
        *cache = apps;
    }
    if let Ok(mut json_cache) = APPS_JSON_CACHE.write() {
        *json_cache = Some(bytes);
    }
    trim_memory();
}

/// Load cache from disk if available to avoid cold-start memory spikes.
pub fn load_cached_apps_from_disk() -> bool {
    if let Ok(contents) = fs::read_to_string("data/cached_apps.json") {
        if let Ok(apps) = serde_json::from_str::<Vec<AppStoreItem>>(&contents) {
            if !apps.is_empty() {
                let count = apps.len();
                update_cache(apps, Some(contents));
                info!("App Store cache loaded from disk ({} apps)", count);
                return true;
            }
        }
    }
    false
}

/// Load apps from local catalog if available (Development / Local Store Mode).
fn load_local_catalog() -> Option<Vec<AppStoreItem>> {
    let candidate_paths = [
        "saturn-apps/catalog.json",
        "saturn-apps/catalog.min.json",
        "../saturn-apps/catalog.json",
        "../saturn-apps/catalog.min.json",
        "../../saturn-apps/catalog.json",
        "../../saturn-apps/catalog.min.json",
        "/app/saturn-apps/catalog.json",
    ];

    for path in candidate_paths {
        if let Ok(content) = fs::read_to_string(path) {
            if let Ok(apps) = serde_json::from_str::<Vec<AppStoreItem>>(&content) {
                if !apps.is_empty() {
                    info!("Loaded {} apps from local catalog: {}", apps.len(), path);
                    return Some(apps);
                }
            }
        }
    }
    None
}

pub async fn sync_repositories() {
    if SYNCING.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_err() {
        info!("App Store sync already in progress, skipping redundant sync.");
        return;
    }

    let client = reqwest::Client::builder()
        .user_agent("Saturn-Dashboard/1.0")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    let mut all_apps = Vec::new();
    let mut seen_ids = std::collections::HashSet::new();

    // 1. Check local catalog first (Development Mode / Local Store)
    let mut local_official_loaded = false;
    if let Some(local_apps) = load_local_catalog() {
        for mut app in local_apps {
            if seen_ids.insert(app.id.clone()) {
                if app.store.is_empty() {
                    app.store = "official".to_string();
                }
                all_apps.push(app);
            }
        }
        local_official_loaded = true;
    }

    // 2. Fetch enabled repositories (Production CDN and Community Stores)
    let repos = crate::store::config::get_repositories();
    for repo in repos {
        if !repo.enabled {
            continue;
        }

        // If official repo and we already loaded local catalog, skip remote official
        if (repo.is_official || repo.id == "official") && local_official_loaded {
            info!("Skipping remote official sync because local catalog is active.");
            continue;
        }

        let lower_url = repo.url.to_lowercase();
        if lower_url.contains("169.254.169.254")
            || lower_url.contains("metadata.google.internal")
            || lower_url.contains("metadata.packet.net")
            || lower_url.contains("100.100.100.200")
        {
            warn!("Skipping blocked cloud metadata repository: {}", repo.url);
            continue;
        }

        info!("Syncing repository: {} ({})", repo.name, repo.url);

        let mut res = match client.get(&repo.url).send().await {
            Ok(r) => r,
            Err(e) => {
                warn!("Failed to fetch repository {} from {}: {}", repo.name, repo.url, e);
                continue;
            }
        };

        if !res.status().is_success() {
            warn!("Repository {} returned status {}: {}", repo.name, res.status(), repo.url);
            continue;
        }

        const MAX_CATALOG_BYTES: usize = 25 * 1024 * 1024;
        if let Some(content_length) = res.content_length() {
            if content_length > MAX_CATALOG_BYTES as u64 {
                warn!("Repository {} response too large ({} bytes)", repo.name, content_length);
                continue;
            }
        }

        let mut bytes_vec = Vec::new();
        let mut too_large = false;
        loop {
            match res.chunk().await {
                Ok(Some(chunk)) => {
                    if bytes_vec.len() + chunk.len() > MAX_CATALOG_BYTES {
                        warn!("Repository {} exceeded maximum size limit of 25MB", repo.name);
                        too_large = true;
                        break;
                    }
                    bytes_vec.extend_from_slice(&chunk);
                }
                Ok(None) => break,
                Err(e) => {
                    warn!("Failed to read chunk from {}: {}", repo.url, e);
                    too_large = true;
                    break;
                }
            }
        }

        if too_large {
            continue;
        }

        match serde_json::from_slice::<Vec<AppStoreItem>>(&bytes_vec) {
            Ok(apps) => {
                info!("Fetched {} apps from repository {}", apps.len(), repo.name);
                for mut app in apps {
                    if seen_ids.insert(app.id.clone()) {
                        if app.store.is_empty() {
                            app.store = repo.name.clone();
                        }
                        all_apps.push(app);
                    }
                }
            }
            Err(e) => {
                warn!("Failed to parse catalog JSON from {}: {}", repo.url, e);
            }
        }
    }

    if !all_apps.is_empty() {
        let count = all_apps.len();
        if let Ok(json) = serde_json::to_string(&all_apps) {
            let _ = fs::write("data/cached_apps.json", &json);
            update_cache(all_apps, Some(json));
        } else {
            update_cache(all_apps, None);
        }
        info!("App Store cache updated with {} total apps", count);
    } else {
        warn!("No apps found during sync. Checking fallback disk cache...");
        if !load_cached_apps_from_disk() {
            update_cache(get_bootstrap_apps(), None);
        }
    }

    SYNCING.store(false, Ordering::SeqCst);
    trim_memory();
}

pub async fn list_store_repositories() -> impl IntoResponse {
    let repos = crate::store::config::get_repositories();
    (StatusCode::OK, Json(repos)).into_response()
}

pub async fn add_store_repository(
    Json(payload): Json<crate::store::types::AddStoreRepositoryPayload>,
) -> impl IntoResponse {
    match crate::store::config::add_repository(payload) {
        Ok(repo) => {
            tokio::spawn(async {
                sync_repositories().await;
            });
            (
                StatusCode::CREATED,
                Json(serde_json::json!({
                    "message": "Repository added successfully",
                    "repository": repo
                })),
            )
                .into_response()
        }
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": e
            })),
        )
            .into_response(),
    }
}

pub async fn remove_store_repository(
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl IntoResponse {
    match crate::store::config::remove_repository(&id) {
        Ok(()) => {
            tokio::spawn(async {
                sync_repositories().await;
            });
            (
                StatusCode::OK,
                Json(serde_json::json!({
                    "message": "Repository removed successfully"
                })),
            )
                .into_response()
        }
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": e
            })),
        )
            .into_response(),
    }
}

pub async fn toggle_store_repository(
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl IntoResponse {
    match crate::store::config::toggle_repository(&id) {
        Ok(enabled) => {
            tokio::spawn(async {
                sync_repositories().await;
            });
            (
                StatusCode::OK,
                Json(serde_json::json!({
                    "message": "Repository status updated",
                    "enabled": enabled
                })),
            )
                .into_response()
        }
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": e
            })),
        )
            .into_response(),
    }
}

pub async fn sync_apps() -> impl IntoResponse {
    sync_repositories().await;
    let count = {
        let cache = APPS_CACHE.read().unwrap();
        cache.len()
    };
    (StatusCode::OK, Json(serde_json::json!({
        "message": "App Store synced successfully",
        "total_apps": count
    }))).into_response()
}

fn get_bootstrap_apps() -> Vec<AppStoreItem> {
    let multiarch = Some(vec!["amd64".to_string(), "arm64".to_string()]);
    vec![
        AppStoreItem {
            id: "nginx".to_string(),
            architectures: multiarch.clone(),
            name: "Nginx".to_string(),
            description: "High-performance HTTP and reverse proxy server.".to_string(),
            icon: "https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/nginx.png".to_string(),
            category: "Network".to_string(),
            store: "Official".to_string(),
            compose_file: "version: '3.8'\nservices:\n  nginx:\n    image: nginx:alpine\n    ports:\n      - '80:80'\n    restart: unless-stopped".to_string(),
            ..Default::default()
        },
        AppStoreItem {
            id: "portainer".to_string(),
            architectures: multiarch.clone(),
            name: "Portainer CE".to_string(),
            description: "Powerful Docker container management interface.".to_string(),
            icon: "https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/portainer.png".to_string(),
            category: "Utilities".to_string(),
            store: "Official".to_string(),
            compose_file: "version: '3.8'\nservices:\n  portainer:\n    image: portainer/portainer-ce:latest\n    ports:\n      - '9000:9000'\n    volumes:\n      - /var/run/docker.sock:/var/run/docker.sock\n    restart: unless-stopped".to_string(),
            ..Default::default()
        },
        AppStoreItem {
            id: "wireguard".to_string(),
            architectures: multiarch,
            name: "WireGuard".to_string(),
            description: "Fast, modern and secure VPN tunnel.".to_string(),
            icon: "https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/wireguard.png".to_string(),
            category: "Network".to_string(),
            store: "Official".to_string(),
            compose_file: "version: '3.8'\nservices:\n  wireguard:\n    image: linuxserver/wireguard:latest\n    restart: unless-stopped".to_string(),
            ..Default::default()
        },
    ]
}

pub async fn list_apps() -> impl IntoResponse {
    let is_empty = {
        let cache = APPS_CACHE.read().unwrap();
        cache.is_empty()
    };

    if is_empty {
        let loaded = load_cached_apps_from_disk();
        if !loaded {
            // Seed with bootstrap apps immediately so client/tests never hang on cold start
            update_cache(get_bootstrap_apps(), None);
            tokio::spawn(async {
                sync_repositories().await;
            });
        }
    }

    // Serve zero-copy pre-serialized JSON from cache without cloning 2000+ structs or re-allocating
    if let Ok(guard) = APPS_JSON_CACHE.read() {
        if let Some(bytes) = guard.as_ref() {
            return (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "application/json")],
                bytes.clone(),
            ).into_response();
        }
    }

    let cache = APPS_CACHE.read().unwrap();
    (StatusCode::OK, Json(cache.clone())).into_response()
}
