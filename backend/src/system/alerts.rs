use serde::{Serialize, Deserialize};
use std::collections::{HashMap, VecDeque};
use std::sync::RwLock;
use std::time::{SystemTime, UNIX_EPOCH};
use once_cell::sync::Lazy;
use axum::{http::StatusCode, response::IntoResponse, Json};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct SystemAlert {
    pub id: String,
    pub timestamp: u64,
    pub level: String, // "warning", "critical", "info"
    pub title: String,
    pub message: String,
    pub source: String, // "metrics", "logs", "docker"
}

// Global state for alerts
pub static ALERTS_HISTORY: Lazy<RwLock<VecDeque<SystemAlert>>> = Lazy::new(|| RwLock::new(VecDeque::with_capacity(1000)));
pub static ALERTS_COOLDOWN: Lazy<RwLock<HashMap<String, u64>>> = Lazy::new(|| RwLock::new(HashMap::new()));

const COOLDOWN_MS: u64 = 60 * 60 * 1000; // 1 hour
pub const ALERT_RETENTION_MS: u64 = 48 * 60 * 60 * 1000; // 48 hours

pub fn get_current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub fn get_active_alerts_within_retention() -> Vec<SystemAlert> {
    let now = get_current_timestamp();
    let cutoff = now.saturating_sub(ALERT_RETENTION_MS);
    if let Ok(guard) = ALERTS_HISTORY.read() {
        guard.iter().filter(|a| a.timestamp >= cutoff).cloned().collect()
    } else {
        Vec::new()
    }
}

pub fn push_alert_if_needed(alert: SystemAlert) {
    let now = get_current_timestamp();
    
    // Check cooldown
    if let Ok(mut cooldowns) = ALERTS_COOLDOWN.write() {
        if let Some(&last_time) = cooldowns.get(&alert.title) {
            if now < last_time + COOLDOWN_MS {
                return; // Cooldown not expired
            }
        }
        // Update cooldown
        cooldowns.insert(alert.title.clone(), now);
    } else {
        return;
    }

    // Push alert and purge entries older than 48 hours
    if let Ok(mut history) = ALERTS_HISTORY.write() {
        let cutoff = now.saturating_sub(ALERT_RETENTION_MS);
        while let Some(front) = history.front() {
            if front.timestamp < cutoff || history.len() >= 1000 {
                history.pop_front();
            } else {
                break;
            }
        }
        history.push_back(alert);
    }
}

pub async fn get_alerts_handler() -> impl IntoResponse {
    let history = get_active_alerts_within_retention();
    (StatusCode::OK, Json(history))
}

#[cfg(test)]
pub static TEST_ALERT_LOCK: Lazy<std::sync::Mutex<()>> = Lazy::new(|| std::sync::Mutex::new(()));

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_push_alert_respects_cooldown() {
        let _guard = TEST_ALERT_LOCK.lock().unwrap();

        // Clear state
        ALERTS_HISTORY.write().unwrap().clear();
        ALERTS_COOLDOWN.write().unwrap().clear();

        let alert1 = SystemAlert {
            id: uuid::Uuid::new_v4().to_string(),
            timestamp: get_current_timestamp(),
            level: "critical".to_string(),
            title: "Alta CPU".to_string(),
            message: "CPU passou de 90%".to_string(),
            source: "metrics".to_string(),
        };

        // First time should push
        push_alert_if_needed(alert1.clone());
        assert_eq!(ALERTS_HISTORY.read().unwrap().len(), 1);

        // Second time (immediately after) should be ignored due to cooldown
        let mut alert2 = alert1.clone();
        alert2.id = uuid::Uuid::new_v4().to_string();
        push_alert_if_needed(alert2);
        assert_eq!(ALERTS_HISTORY.read().unwrap().len(), 1);

        // Advance cooldown map back in time to simulate 1h1m passed
        {
            let mut cd = ALERTS_COOLDOWN.write().unwrap();
            let old_time = get_current_timestamp() - (COOLDOWN_MS + 60_000);
            cd.insert("Alta CPU".to_string(), old_time);
        }

        // Third time should push because cooldown expired
        let mut alert3 = alert1.clone();
        alert3.id = uuid::Uuid::new_v4().to_string();
        push_alert_if_needed(alert3);
        assert_eq!(ALERTS_HISTORY.read().unwrap().len(), 2);
    }

    #[test]
    fn test_alerts_filtered_to_last_48_hours() {
        let _guard = TEST_ALERT_LOCK.lock().unwrap();

        ALERTS_HISTORY.write().unwrap().clear();
        ALERTS_COOLDOWN.write().unwrap().clear();

        let now = get_current_timestamp();
        let fifty_hours_ago = now - (50 * 60 * 60 * 1000);
        let ten_hours_ago = now - (10 * 60 * 60 * 1000);

        let old_alert = SystemAlert {
            id: "old-1".to_string(),
            timestamp: fifty_hours_ago,
            level: "warning".to_string(),
            title: "Alerta Antigo".to_string(),
            message: "50h atrás".to_string(),
            source: "metrics".to_string(),
        };

        let recent_alert = SystemAlert {
            id: "recent-1".to_string(),
            timestamp: ten_hours_ago,
            level: "critical".to_string(),
            title: "Alerta Recente".to_string(),
            message: "10h atrás".to_string(),
            source: "metrics".to_string(),
        };

        ALERTS_HISTORY.write().unwrap().push_back(old_alert);
        ALERTS_HISTORY.write().unwrap().push_back(recent_alert);

        let filtered = get_active_alerts_within_retention();
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].id, "recent-1");
    }
}

