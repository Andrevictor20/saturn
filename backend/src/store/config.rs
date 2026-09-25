use super::types::{AddStoreRepositoryPayload, StoreRepository};
use std::fs;
use std::path::Path;
use tracing::info;
use uuid::Uuid;

pub const DEFAULT_OFFICIAL_URL: &str =
    "https://raw.githubusercontent.com/Andrevictor20/saturn-apps/main/catalog.json";
pub const DEFAULT_STORES_PATH: &str = "data/stores.json";

fn default_official_repo() -> StoreRepository {
    StoreRepository {
        id: "official".to_string(),
        name: "Saturn Apps Official".to_string(),
        url: DEFAULT_OFFICIAL_URL.to_string(),
        is_official: true,
        enabled: true,
    }
}

pub fn get_repositories_from_path(path: &str) -> Vec<StoreRepository> {
    if let Ok(contents) = fs::read_to_string(path) {
        if let Ok(mut repos) = serde_json::from_str::<Vec<StoreRepository>>(&contents) {
            // Ensure official repo exists
            if !repos.iter().any(|r| r.is_official || r.id == "official") {
                repos.insert(0, default_official_repo());
                let _ = save_repositories_to_path(path, &repos);
            }
            return repos;
        }
    }

    // Default initialization
    let repos = vec![default_official_repo()];
    let _ = save_repositories_to_path(path, &repos);
    repos
}

pub fn get_repositories() -> Vec<StoreRepository> {
    get_repositories_from_path(DEFAULT_STORES_PATH)
}

pub fn save_repositories_to_path(path: &str, repos: &[StoreRepository]) -> Result<(), std::io::Error> {
    if let Some(parent) = Path::new(path).parent() {
        let _ = fs::create_dir_all(parent);
    }
    let json = serde_json::to_string_pretty(repos)?;
    fs::write(path, json)
}

pub fn save_repositories(repos: &[StoreRepository]) -> Result<(), std::io::Error> {
    save_repositories_to_path(DEFAULT_STORES_PATH, repos)
}

pub fn add_repository_to_path(
    path: &str,
    payload: AddStoreRepositoryPayload,
) -> Result<StoreRepository, String> {
    let url = payload.url.trim().to_string();
    let name = payload.name.trim().to_string();

    if name.is_empty() {
        return Err("Repository name cannot be empty".to_string());
    }

    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("URL must start with http:// or https://".to_string());
    }

    let lower_url = url.to_lowercase();
    if lower_url.contains("169.254.169.254")
        || lower_url.contains("metadata.google.internal")
        || lower_url.contains("metadata.packet.net")
        || lower_url.contains("100.100.100.200")
    {
        return Err("Blocked cloud metadata address (SSRF protection)".to_string());
    }

    let mut repos = get_repositories_from_path(path);

    if repos.iter().any(|r| r.url.trim().eq_ignore_ascii_case(&url)) {
        return Err("Repository URL already exists".to_string());
    }

    let repo_id = format!("repo-{}", &Uuid::new_v4().to_string()[..8]);
    let new_repo = StoreRepository {
        id: repo_id,
        name,
        url,
        is_official: false,
        enabled: true,
    };

    repos.push(new_repo.clone());
    save_repositories_to_path(path, &repos).map_err(|e| e.to_string())?;
    info!("Added community app repository: {} ({})", new_repo.name, new_repo.url);

    Ok(new_repo)
}

pub fn add_repository(payload: AddStoreRepositoryPayload) -> Result<StoreRepository, String> {
    add_repository_to_path(DEFAULT_STORES_PATH, payload)
}

pub fn remove_repository_from_path(path: &str, id: &str) -> Result<(), String> {
    let mut repos = get_repositories_from_path(path);

    let index = repos
        .iter()
        .position(|r| r.id == id)
        .ok_or_else(|| "Repository not found".to_string())?;

    if repos[index].is_official || repos[index].id == "official" {
        return Err("Cannot remove the official repository".to_string());
    }

    repos.remove(index);
    save_repositories_to_path(path, &repos).map_err(|e| e.to_string())?;
    info!("Removed community app repository ID: {}", id);

    Ok(())
}

pub fn remove_repository(id: &str) -> Result<(), String> {
    remove_repository_from_path(DEFAULT_STORES_PATH, id)
}

pub fn toggle_repository_in_path(path: &str, id: &str) -> Result<bool, String> {
    let mut repos = get_repositories_from_path(path);

    let index = repos
        .iter()
        .position(|r| r.id == id)
        .ok_or_else(|| "Repository not found".to_string())?;

    repos[index].enabled = !repos[index].enabled;
    let new_state = repos[index].enabled;

    save_repositories_to_path(path, &repos).map_err(|e| e.to_string())?;
    info!("Toggled app repository {} enabled state to: {}", id, new_state);

    Ok(new_state)
}

pub fn toggle_repository(id: &str) -> Result<bool, String> {
    toggle_repository_in_path(DEFAULT_STORES_PATH, id)
}
