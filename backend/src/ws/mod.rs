pub mod alerts;
pub mod collector;
pub mod docker_events;
pub mod models;

pub use alerts::*;
pub use collector::*;
pub use docker_events::*;
pub use models::*;
pub use crate::system::network::*;

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    response::IntoResponse,
};
use once_cell::sync::Lazy;
use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};
use tokio::sync::broadcast;
use bollard::Docker;
use crate::docker::AppState;

// Global Broadcaster, Ring Buffer History and Cache for O(1) CPU/RAM scaling across all clients/tabs
pub(crate) static STATS_TX: Lazy<broadcast::Sender<Arc<String>>> = Lazy::new(|| {
    let (tx, _) = broadcast::channel(32);
    tx
});
pub(crate) static LATEST_STATS: Lazy<RwLock<Option<Arc<String>>>> = Lazy::new(|| RwLock::new(None));
pub(crate) static STATS_HISTORY: Lazy<RwLock<VecDeque<SystemStats>>> =
    Lazy::new(|| RwLock::new(VecDeque::with_capacity(1800)));
pub(crate) static COLLECTOR_INITIALIZED: Lazy<AtomicBool> = Lazy::new(|| AtomicBool::new(false));

pub fn ensure_stats_collector(docker: Arc<Docker>) {
    if COLLECTOR_INITIALIZED
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_ok()
    {
        let docker_events = docker.clone();
        tokio::spawn(async move {
            run_singleton_stats_collector(docker).await;
        });
        start_docker_events_listener(docker_events);
    }
}

pub async fn stats_handler(State(state): State<AppState>, ws: WebSocketUpgrade) -> impl IntoResponse {
    ensure_stats_collector(state.docker.clone());
    ws.on_upgrade(move |socket| handle_socket(socket))
}

pub async fn get_stats_history_handler(
    State(state): State<AppState>,
    Query(params): Query<StatsHistoryQuery>,
) -> impl IntoResponse {
    ensure_stats_collector(state.docker.clone());
    let limit = params.limit.unwrap_or(300).clamp(1, 1800);
    let history: Vec<SystemStats> = if let Ok(guard) = STATS_HISTORY.read() {
        let count = guard.len();
        if count <= limit {
            guard.iter().cloned().collect()
        } else {
            guard.iter().skip(count - limit).cloned().collect()
        }
    } else {
        Vec::new()
    };

    (axum::http::StatusCode::OK, axum::Json(history))
}

async fn handle_socket(mut socket: WebSocket) {
    let mut rx = STATS_TX.subscribe();

    // 1. Send immediate cached snapshot so UI renders instantly without waiting for next tick
    let initial_msg = LATEST_STATS.read().ok().and_then(|g| g.clone());
    if let Some(cached) = initial_msg {
        if socket.send(Message::Text(cached.as_str().into())).await.is_err() {
            return;
        }
    }

    // 2. Stream broadcasts with zero CPU overhead per connection
    while let Ok(msg) = rx.recv().await {
        if socket.send(Message::Text(msg.as_str().into())).await.is_err() {
            tracing::debug!("Client disconnected from stats WebSocket");
            break;
        }
    }
}
