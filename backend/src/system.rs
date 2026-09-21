pub mod alerts;
pub mod customization;
pub mod data_migrator;
pub mod gpu;
pub mod network;
pub mod processes;
pub mod settings;
pub mod smart;
pub mod update;
pub mod weather;

pub use update::*;

use axum::Router;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    let admin_routes = Router::new()
        .route("/api/system/update", axum::routing::post(perform_system_update))
        .route("/api/system/update/cleanup", axum::routing::post(cleanup_old_saturn_images_handler))
        .route("/api/system/processes/{pid}/kill", axum::routing::post(processes::kill_process_handler))
        .route("/api/system/settings", axum::routing::post(settings::update_settings_handler))
        .route("/api/system/settings/check-port", axum::routing::post(settings::check_port_handler))
        .route("/api/system/customization", axum::routing::post(customization::update_customization_handler))
        .layer(axum::middleware::from_fn(crate::auth::require_admin));

    Router::new()
        .route("/api/system/version", axum::routing::get(get_system_version_handler))
        .route("/api/system/update/check", axum::routing::get(check_update_handler))
        .route("/api/system/processes", axum::routing::get(processes::get_processes_handler))
        .route("/api/system/alerts", axum::routing::get(alerts::get_alerts_handler))
        .route("/api/system/gpu", axum::routing::get(gpu::get_gpu_handler))
        .route("/api/system/weather", axum::routing::get(weather::get_weather_handler))
        .route("/api/system/disks/smart", axum::routing::get(smart::get_disks_smart_handler))
        .route("/api/system/settings", axum::routing::get(settings::get_settings_handler))
        .route("/api/system/customization", axum::routing::get(customization::get_customization_handler))
        .merge(admin_routes)
}

pub fn public_router() -> Router {
    Router::new()
        .route("/api/system/update/status", axum::routing::get(get_update_status_handler))
}
