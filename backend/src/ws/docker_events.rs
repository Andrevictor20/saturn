use std::sync::Arc;
use bollard::Docker;
use bollard::query_parameters::EventsOptions;
use futures::StreamExt;
use serde_json::json;
use super::STATS_TX;

/// Spawns a background task that streams Docker daemon events and broadcasts them via WebSocket.
pub fn start_docker_events_listener(docker: Arc<Docker>) {
    tokio::spawn(async move {
        loop {
            let options = Some(EventsOptions::default());

            let mut event_stream = docker.events(options);

            while let Some(result) = event_stream.next().await {
                match result {
                    Ok(event) => {
                        let action = event.action.unwrap_or_default();
                        let event_type = event.typ.map(|t| format!("{:?}", t).to_lowercase()).unwrap_or_default();
                        let actor_id = event.actor.and_then(|a| a.id).unwrap_or_default();

                        // Only broadcast container and volume state changes
                        if event_type == "container" || event_type.is_empty() {
                            let msg = json!({
                                "event_type": "docker_event",
                                "action": action,
                                "type": event_type,
                                "actor_id": actor_id,
                                "timestamp": event.time.unwrap_or(0)
                            });

                            if let Ok(json_str) = serde_json::to_string(&msg) {
                                let _ = STATS_TX.send(Arc::new(json_str));
                            }
                        }
                    }
                    Err(e) => {
                        tracing::debug!("Docker events stream interrupted: {}, reconnecting in 5s...", e);
                        break;
                    }
                }
            }

            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
        }
    });
}
