pub mod types;
pub mod parser;
pub mod catalog;
pub mod installer;
pub mod config;

pub use types::*;
pub use parser::*;
pub use catalog::*;
pub use installer::*;
pub use config::*;

use axum::{
    routing::{delete, get, post},
    Router,
};
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    let admin_routes = Router::new()
        .route("/api/store/sync", post(sync_apps))
        .route("/api/store/repositories", post(add_store_repository))
        .route("/api/store/repositories/{id}", delete(remove_store_repository))
        .route("/api/store/repositories/{id}/toggle", post(toggle_store_repository))
        .route("/api/store/install/{id}", post(install_app))
        .route("/api/store/install/custom/{id}", post(install_custom_app))
        .route("/api/store/install/{task_id}/cancel", post(cancel_install_task))
        .route("/api/store/install/cancel/{task_id}", post(cancel_install_task))
        .route("/api/store/uninstall/{id}", post(uninstall_app))
        .route("/api/store/update/{id}", post(update_app))
        .layer(axum::middleware::from_fn(crate::auth::require_admin));

    Router::new()
        .route("/api/store/apps", get(list_apps))
        .route("/api/store/apps/{id}/config", get(inspect_app_config))
        .route("/api/store/repositories", get(list_store_repositories))
        .route("/api/store/install/status/{task_id}", get(install_status))
        .route("/api/store/install/active", get(active_install_tasks))
        .merge(admin_routes)
}
