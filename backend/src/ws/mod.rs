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
pub(crate) static STATS_HISTORY_LONG: Lazy<RwLock<VecDeque<SystemStats>>> =
    Lazy::new(|| RwLock::new(VecDeque::with_capacity(1500)));
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

pub fn get_stats_history_data(range: Option<&str>, limit: usize) -> Vec<SystemStats> {
    let now = crate::system::alerts::get_current_timestamp();
    match range {
        Some("12h") | Some("24h") | Some("72h") => {
            let duration_ms = match range {
                Some("12h") => 12 * 60 * 60 * 1000,
                Some("24h") => 24 * 60 * 60 * 1000,
                Some("72h") => 72 * 60 * 60 * 1000,
                _ => 12 * 60 * 60 * 1000,
            };
            let cutoff = now.saturating_sub(duration_ms);

            let mut points: Vec<SystemStats> = if let Ok(guard) = STATS_HISTORY_LONG.read() {
                if !guard.is_empty() {
                    guard.iter().filter(|s| s.timestamp >= cutoff).cloned().collect()
                } else {
                    Vec::new()
                }
            } else {
                Vec::new()
            };

            if points.is_empty() {
                if let Ok(guard) = STATS_HISTORY.read() {
                    points = guard.iter().filter(|s| s.timestamp >= cutoff).cloned().collect();
                }
            }

            if points.len() > limit {
                let step = (points.len() as f64 / limit as f64).ceil() as usize;
                points = points.into_iter().step_by(step.max(1)).collect();
            }
            points
        }
        _ => {
            if let Ok(guard) = STATS_HISTORY.read() {
                let count = guard.len();
                if count <= limit {
                    guard.iter().cloned().collect()
                } else {
                    guard.iter().skip(count - limit).cloned().collect()
                }
            } else {
                Vec::new()
            }
        }
    }
}

pub async fn get_stats_history_handler(
    State(state): State<AppState>,
    Query(params): Query<StatsHistoryQuery>,
) -> impl IntoResponse {
    ensure_stats_collector(state.docker.clone());
    let limit = params.limit.unwrap_or(300).clamp(1, 1800);
    let history = get_stats_history_data(params.range.as_deref(), limit);
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_stats_history_data_default_and_limit() {
        {
            let mut hist = STATS_HISTORY.write().unwrap();
            hist.clear();
            for i in 0..10 {
                let mut s = SystemStats::default();
                s.cpu_usage = i as f32;
                hist.push_back(s);
            }
        }

        let res = get_stats_history_data(None, 5);
        assert_eq!(res.len(), 5);
        assert_eq!(res.first().unwrap().cpu_usage, 5.0);
        assert_eq!(res.last().unwrap().cpu_usage, 9.0);
    }

    #[test]
    fn test_get_stats_history_data_long_range_72h() {
        let now = crate::system::alerts::get_current_timestamp();
        {
            let mut long_hist = STATS_HISTORY_LONG.write().unwrap();
            long_hist.clear();

            let mut p1 = SystemStats::default();
            p1.timestamp = now - (80 * 60 * 60 * 1000); // 80h ago (should be excluded)
            p1.cpu_usage = 10.0;

            let mut p2 = SystemStats::default();
            p2.timestamp = now - (24 * 60 * 60 * 1000); // 24h ago (should be included)
            p2.cpu_usage = 20.0;

            let mut p3 = SystemStats::default();
            p3.timestamp = now - (1 * 60 * 60 * 1000); // 1h ago (should be included)
            p3.cpu_usage = 30.0;

            long_hist.push_back(p1);
            long_hist.push_back(p2);
            long_hist.push_back(p3);
        }

        let res_72h = get_stats_history_data(Some("72h"), 100);
        assert_eq!(res_72h.len(), 2);
        assert_eq!(res_72h[0].cpu_usage, 20.0);
        assert_eq!(res_72h[1].cpu_usage, 30.0);

        let res_12h = get_stats_history_data(Some("12h"), 100);
        assert_eq!(res_12h.len(), 1);
        assert_eq!(res_12h[0].cpu_usage, 30.0);
    }
}

