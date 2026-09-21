//! Integrated Watchtower Container Update Checker.
//!
//! Periodically polls Docker registries for newer container image tags in the background,
//! emits system alerts when updates are detected, and provides summary endpoints for the UI.

use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use bollard::query_parameters::ListContainersOptions;
use bollard::Docker;
use once_cell::sync::Lazy;
use std::sync::RwLock;
use serde::{Deserialize, Serialize};

use crate::docker::updates::check_single_image_update;
use crate::state::AppState;
use crate::system::alerts::{get_current_timestamp, push_alert_if_needed, SystemAlert};

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct ContainerUpdateItem {
    pub id: String,
    pub name: String,
    pub image: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct WatchtowerSummary {
    pub total_containers: usize,
    pub updates_available: usize,
    pub update_list: Vec<ContainerUpdateItem>,
    pub last_checked: u64,
    pub checking: bool,
}

pub static WATCHTOWER_SUMMARY: Lazy<RwLock<WatchtowerSummary>> =
    Lazy::new(|| RwLock::new(WatchtowerSummary::default()));

/// Helper function to perform the full update check across all local containers.
pub async fn perform_watchtower_check(docker: &Docker) -> WatchtowerSummary {
    // Mark as checking
    if let Ok(mut summary) = WATCHTOWER_SUMMARY.write() {
        summary.checking = true;
    }

    let options = ListContainersOptions {
        all: true,
        ..Default::default()
    };

    let containers = docker.list_containers(Some(options)).await.unwrap_or_default();
    let mut update_list = Vec::new();
    let total_containers = containers.len();

    for c in &containers {
        if let (Some(id), Some(image)) = (&c.id, &c.image) {
            let has_update = if image.contains("saturn") {
                let current = crate::system::get_app_version();
                let latest_info = crate::system::update::UPDATE_CACHE
                    .read()
                    .ok()
                    .and_then(|g| g.as_ref().map(|(info, _)| info.clone()));
                if let Some(info) = latest_info {
                    crate::system::update::is_newer_version(&info.latest_version, &current)
                } else {
                    false
                }
            } else {
                check_single_image_update(docker, image).await
            };

            if has_update {
                let name = c
                    .names
                    .as_ref()
                    .and_then(|names| names.first())
                    .map(|n| n.trim_start_matches('/').to_string())
                    .unwrap_or_else(|| id.chars().take(12).collect());

                update_list.push(ContainerUpdateItem {
                    id: id.clone(),
                    name,
                    image: image.clone(),
                });
            }
        }
    }

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let updates_available = update_list.len();

    let new_summary = WatchtowerSummary {
        total_containers,
        updates_available,
        update_list,
        last_checked: now,
        checking: false,
    };

    // Store in global cache
    if let Ok(mut summary) = WATCHTOWER_SUMMARY.write() {
        *summary = new_summary.clone();
    }

    // Emit system alert if updates are available
    if updates_available > 0 {
        push_alert_if_needed(SystemAlert {
            id: format!("watchtower-updates-{}", now),
            timestamp: get_current_timestamp(),
            level: "info".to_string(),
            title: "Atualizações de Contêineres Disponíveis".to_string(),
            message: format!(
                "Existem {} contêiner(es) com novas versões prontas para atualização no Docker Registry.",
                updates_available
            ),
            source: "docker".to_string(),
        });
    }

    new_summary
}

/// Spawns the autonomous background Watchtower check loop.
pub fn start_watchtower_loop(docker: Arc<Docker>) {
    let check_interval_hours = std::env::var("WATCHTOWER_INTERVAL_HOURS")
        .ok()
        .and_then(|h| h.parse::<u64>().ok())
        .unwrap_or(6);

    tokio::spawn(async move {
        // Initial delay after boot to avoid high I/O during startup
        tokio::time::sleep(Duration::from_secs(20)).await;
        tracing::info!("[Watchtower] Running initial container updates check...");
        perform_watchtower_check(&docker).await;

        let interval_duration = Duration::from_secs(check_interval_hours * 3600);
        let mut ticker = tokio::time::interval(interval_duration);
        loop {
            ticker.tick().await;
            tracing::info!("[Watchtower] Checking container image updates in Docker Registry...");
            perform_watchtower_check(&docker).await;
        }
    });
}

/// GET /api/docker/updates/summary
pub async fn get_watchtower_summary_handler() -> impl IntoResponse {
    let summary = WATCHTOWER_SUMMARY.read().map(|g| g.clone()).unwrap_or_default();
    (StatusCode::OK, Json(summary))
}

/// POST /api/docker/updates/check-now
pub async fn trigger_watchtower_check_handler(
    State(state): State<AppState>,
) -> impl IntoResponse {
    let summary = perform_watchtower_check(&state.docker).await;
    (StatusCode::OK, Json(summary))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_watchtower_summary_default() {
        let summary = WatchtowerSummary::default();
        assert_eq!(summary.total_containers, 0);
        assert_eq!(summary.updates_available, 0);
        assert!(!summary.checking);
        assert!(summary.update_list.is_empty());
    }

    #[test]
    fn test_watchtower_summary_serialization() {
        let item = ContainerUpdateItem {
            id: "abc123456789".to_string(),
            name: "nginx-proxy".to_string(),
            image: "nginx:alpine".to_string(),
        };
        let summary = WatchtowerSummary {
            total_containers: 1,
            updates_available: 1,
            update_list: vec![item],
            last_checked: 1700000000,
            checking: false,
        };

        let json = serde_json::to_string(&summary).unwrap();
        assert!(json.contains("nginx-proxy"));
        assert!(json.contains("updates_available\":1"));

        let deserialized: WatchtowerSummary = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, summary);
    }

    #[test]
    fn test_watchtower_alert_emission() {
        use crate::system::alerts::{ALERTS_HISTORY, TEST_ALERT_LOCK};

        let _guard = TEST_ALERT_LOCK.lock().unwrap();
        if let Ok(mut hist) = ALERTS_HISTORY.write() {
            hist.clear();
        }

        let now = 1700000000;
        let count = 3;
        push_alert_if_needed(SystemAlert {
            id: format!("watchtower-updates-{}", now),
            timestamp: get_current_timestamp(),
            level: "info".to_string(),
            title: "Atualizações de Contêineres Disponíveis".to_string(),
            message: format!(
                "Existem {} contêiner(es) com novas versões prontas para atualização no Docker Registry.",
                count
            ),
            source: "docker".to_string(),
        });

        if let Ok(hist) = ALERTS_HISTORY.read() {
            let alert = hist.iter().find(|a| a.title == "Atualizações de Contêineres Disponíveis");
            assert!(alert.is_some());
            assert_eq!(alert.unwrap().source, "docker");
            assert!(alert.unwrap().message.contains("3 contêiner(es)"));
        }
    }
}
