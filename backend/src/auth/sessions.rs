use axum::{
    extract::{Extension, Path},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::RwLock;
use std::time::{SystemTime, UNIX_EPOCH};
use super::jwt::Claims;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct UserSession {
    pub id: String,
    pub user_id: Option<String>,
    pub username: String,
    pub ip: String,
    pub user_agent: String,
    pub created_at: u64,
    pub last_active_at: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct SessionResponse {
    pub id: String,
    pub user_id: Option<String>,
    pub username: String,
    pub ip: String,
    pub user_agent: String,
    pub created_at: u64,
    pub last_active_at: u64,
    pub is_current: bool,
    pub device_type: String,
}

static SESSIONS_CACHE: Lazy<RwLock<HashMap<String, UserSession>>> = Lazy::new(|| {
    let path = get_sessions_file_path();
    let loaded = if let Ok(data) = fs::read_to_string(&path) {
        serde_json::from_str::<HashMap<String, UserSession>>(&data).unwrap_or_default()
    } else {
        HashMap::new()
    };
    RwLock::new(loaded)
});

pub fn get_sessions_file_path() -> PathBuf {
    crate::system::data_migrator::get_active_data_dir().join("sessions.json")
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn save_sessions_to_disk(sessions: &HashMap<String, UserSession>) {
    let path = get_sessions_file_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string_pretty(sessions) {
        let _ = fs::write(&path, json);
    }
}

pub fn detect_device_type(user_agent: &str) -> String {
    let ua = user_agent.to_lowercase();
    if ua.contains("ipad") || ua.contains("tablet") {
        "tablet".to_string()
    } else if ua.contains("mobi") || ua.contains("iphone") || ua.contains("android") {
        "mobile".to_string()
    } else {
        "desktop".to_string()
    }
}

pub fn create_session(username: &str, user_id: Option<&str>, ip: &str, user_agent: &str) -> UserSession {
    let now = now_secs();
    let session = UserSession {
        id: uuid::Uuid::new_v4().to_string(),
        user_id: user_id.map(|s| s.to_string()),
        username: username.to_string(),
        ip: ip.to_string(),
        user_agent: user_agent.to_string(),
        created_at: now,
        last_active_at: now,
    };

    if let Ok(mut guard) = SESSIONS_CACHE.write() {
        guard.insert(session.id.clone(), session.clone());
        save_sessions_to_disk(&guard);
    }

    session
}

pub fn touch_session(session_id: &str) {
    if let Ok(mut guard) = SESSIONS_CACHE.write() {
        if let Some(sess) = guard.get_mut(session_id) {
            sess.last_active_at = now_secs();
            // Salva periodicamente
        }
    }
}

pub fn is_session_valid(session_id: &str) -> bool {
    if let Ok(guard) = SESSIONS_CACHE.read() {
        if let Some(sess) = guard.get(session_id) {
            // Sessão válida por até 30 dias de inatividade
            let now = now_secs();
            return now <= sess.last_active_at + (30 * 24 * 3600);
        }
    }
    false
}

pub fn list_user_sessions(username: &str, current_sid: Option<&str>) -> Vec<SessionResponse> {
    if let Ok(guard) = SESSIONS_CACHE.read() {
        let mut list: Vec<SessionResponse> = guard
            .values()
            .filter(|s| s.username == username)
            .map(|s| {
                let is_current = current_sid.map(|curr| curr == s.id).unwrap_or(false);
                let device_type = detect_device_type(&s.user_agent);
                SessionResponse {
                    id: s.id.clone(),
                    user_id: s.user_id.clone(),
                    username: s.username.clone(),
                    ip: s.ip.clone(),
                    user_agent: s.user_agent.clone(),
                    created_at: s.created_at,
                    last_active_at: s.last_active_at,
                    is_current,
                    device_type,
                }
            })
            .collect();

        // Ordena por atividade mais recente primeiro
        list.sort_by(|a, b| b.last_active_at.cmp(&a.last_active_at));
        list
    } else {
        Vec::new()
    }
}

pub fn revoke_session(username: &str, session_id: &str) -> bool {
    if let Ok(mut guard) = SESSIONS_CACHE.write() {
        if let Some(sess) = guard.get(session_id) {
            if sess.username == username {
                guard.remove(session_id);
                save_sessions_to_disk(&guard);
                return true;
            }
        }
    }
    false
}

pub fn revoke_all_other_sessions(username: &str, current_sid: &str) -> usize {
    if let Ok(mut guard) = SESSIONS_CACHE.write() {
        let before = guard.len();
        guard.retain(|id, s| s.username != username || id == current_sid);
        let removed = before - guard.len();
        if removed > 0 {
            save_sessions_to_disk(&guard);
        }
        removed
    } else {
        0
    }
}

// Handlers REST
pub async fn get_user_sessions_handler(
    Extension(claims): Extension<Claims>,
) -> impl IntoResponse {
    let sessions = list_user_sessions(&claims.sub, claims.sid.as_deref());
    (StatusCode::OK, Json(sessions))
}

pub async fn revoke_session_handler(
    Extension(claims): Extension<Claims>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if revoke_session(&claims.sub, &id) {
        (StatusCode::OK, Json(serde_json::json!({ "status": "revoked", "id": id }))).into_response()
    } else {
        (StatusCode::NOT_FOUND, Json(serde_json::json!({ "error": "Session not found" }))).into_response()
    }
}

pub async fn revoke_other_sessions_handler(
    Extension(claims): Extension<Claims>,
) -> impl IntoResponse {
    if let Some(current_sid) = &claims.sid {
        let count = revoke_all_other_sessions(&claims.sub, current_sid);
        (StatusCode::OK, Json(serde_json::json!({ "status": "ok", "revoked_count": count }))).into_response()
    } else {
        (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "No active session ID in token" }))).into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_device_detection() {
        assert_eq!(detect_device_type("Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)"), "mobile");
        assert_eq!(detect_device_type("Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X)"), "tablet");
        assert_eq!(detect_device_type("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"), "desktop");
    }

    #[test]
    fn test_create_and_revoke_session() {
        let sess = create_session("testuser", None, "192.168.1.50", "Mozilla/5.0 Chrome");
        assert!(is_session_valid(&sess.id));

        let list = list_user_sessions("testuser", Some(&sess.id));
        assert!(list.iter().any(|s| s.id == sess.id && s.is_current));

        assert!(revoke_session("testuser", &sess.id));
        assert!(!is_session_valid(&sess.id));
    }
}
