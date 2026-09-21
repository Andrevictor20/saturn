use axum::{
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
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct BlockedIpEntry {
    pub ip: String,
    pub attempts: usize,
    pub blocked_at: u64,
    pub expires_at: u64,
    pub reason: String,
}

#[derive(Deserialize)]
pub struct UnblockIpRequest {
    pub ip: String,
}

// Memory tracking: IP -> (Failed Attempts, Lock Expiration Instant)
static RATE_LIMITS: Lazy<RwLock<HashMap<String, (usize, Instant)>>> =
    Lazy::new(|| RwLock::new(HashMap::new()));

// Persistent blocked IPs list
static PERSISTENT_BLOCKED: Lazy<RwLock<HashMap<String, BlockedIpEntry>>> = Lazy::new(|| {
    let path = get_blocked_ips_path();
    let loaded = if let Ok(data) = fs::read_to_string(&path) {
        serde_json::from_str::<HashMap<String, BlockedIpEntry>>(&data).unwrap_or_default()
    } else {
        HashMap::new()
    };
    RwLock::new(loaded)
});

pub fn get_blocked_ips_path() -> PathBuf {
    crate::system::data_migrator::get_active_data_dir().join("blocked_ips.json")
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn save_blocked_ips_to_disk(blocked: &HashMap<String, BlockedIpEntry>) {
    let path = get_blocked_ips_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string_pretty(blocked) {
        let _ = fs::write(&path, json);
    }
}

pub fn is_whitelisted_ip(ip: &str) -> bool {
    let clean_ip = ip.trim().split(':').next().unwrap_or(ip).trim();
    clean_ip == "127.0.0.1"
        || clean_ip == "localhost"
        || clean_ip == "::1"
        || clean_ip.starts_with("192.168.")
        || clean_ip.starts_with("10.")
        || is_rfc1918_172(clean_ip)
}

fn is_rfc1918_172(ip: &str) -> bool {
    if ip.starts_with("172.") {
        if let Some(second_octet) = ip.split('.').nth(1).and_then(|o| o.parse::<u8>().ok()) {
            return (16..=31).contains(&second_octet);
        }
    }
    false
}

pub fn check_rate_limit(ip: &str) -> bool {
    let clean_ip = ip.trim().split(':').next().unwrap_or(ip).trim();

    // 1. Checa bloqueio persistente
    let now = now_secs();
    if let Ok(mut guard) = PERSISTENT_BLOCKED.write() {
        if let Some(entry) = guard.get(clean_ip) {
            if now < entry.expires_at {
                return false; // Bloqueado
            } else {
                guard.remove(clean_ip);
                save_blocked_ips_to_disk(&guard);
            }
        }
    }

    // 2. Checa limite em memória
    if let Ok(mut map) = RATE_LIMITS.write() {
        if let Some(&(attempts, lock_until)) = map.get(clean_ip) {
            if Instant::now() < lock_until {
                return false; // Bloqueado
            } else if attempts >= 5 {
                map.remove(clean_ip);
            }
        }
    }

    true
}

pub fn record_failed_attempt(ip: &str) {
    let clean_ip = ip.trim().split(':').next().unwrap_or(ip).trim();
    if is_whitelisted_ip(clean_ip) {
        return; // Não bloqueia rede local/loopback
    }

    let mut is_locked = false;
    let mut total_attempts = 0;

    if let Ok(mut map) = RATE_LIMITS.write() {
        let entry = map.entry(clean_ip.to_string()).or_insert((0, Instant::now()));
        entry.0 += 1;
        total_attempts = entry.0;
        if entry.0 >= 5 {
            entry.1 = Instant::now() + Duration::from_secs(900); // 15 minutos
            is_locked = true;
        }
    }

    if is_locked {
        let now = now_secs();
        let expires_at = now + 900;
        let entry = BlockedIpEntry {
            ip: clean_ip.to_string(),
            attempts: total_attempts,
            blocked_at: now,
            expires_at,
            reason: "Múltiplas tentativas de autenticação incorretas".to_string(),
        };

        if let Ok(mut guard) = PERSISTENT_BLOCKED.write() {
            guard.insert(clean_ip.to_string(), entry);
            save_blocked_ips_to_disk(&guard);
        }

        // Emite alerta crítico do sistema
        crate::system::alerts::push_alert_if_needed(crate::system::alerts::SystemAlert {
            id: uuid::Uuid::new_v4().to_string(),
            timestamp: crate::system::alerts::get_current_timestamp(),
            level: "critical".to_string(),
            title: "Tentativa de Força Bruta Detectada".to_string(),
            message: format!("O IP {} foi temporariamente bloqueado após {} falhas de autenticação.", clean_ip, total_attempts),
            source: "auth".to_string(),
        });
    }
}

pub fn unblock_ip(ip: &str) -> bool {
    let clean_ip = ip.trim().split(':').next().unwrap_or(ip).trim();
    if let Ok(mut map) = RATE_LIMITS.write() {
        map.remove(clean_ip);
    }

    if let Ok(mut guard) = PERSISTENT_BLOCKED.write() {
        let removed = guard.remove(clean_ip).is_some();
        if removed {
            save_blocked_ips_to_disk(&guard);
        }
        removed
    } else {
        false
    }
}

pub fn clear_attempts(ip: &str) {
    let _ = unblock_ip(ip);
}

pub fn list_blocked_ips() -> Vec<BlockedIpEntry> {
    let now = now_secs();
    if let Ok(mut guard) = PERSISTENT_BLOCKED.write() {
        // Purga expirados
        guard.retain(|_, entry| entry.expires_at > now);
        let mut list: Vec<BlockedIpEntry> = guard.values().cloned().collect();
        list.sort_by(|a, b| b.blocked_at.cmp(&a.blocked_at));
        list
    } else {
        Vec::new()
    }
}

// Handlers REST (Apenas Admin)
pub async fn list_blocked_ips_handler() -> impl IntoResponse {
    let list = list_blocked_ips();
    (StatusCode::OK, Json(list))
}

pub async fn unblock_ip_handler(
    Json(payload): Json<UnblockIpRequest>,
) -> impl IntoResponse {
    if unblock_ip(&payload.ip) {
        (StatusCode::OK, Json(serde_json::json!({ "status": "unblocked", "ip": payload.ip }))).into_response()
    } else {
        (StatusCode::NOT_FOUND, Json(serde_json::json!({ "error": "IP not found in blocked list" }))).into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_whitelist() {
        assert!(is_whitelisted_ip("127.0.0.1"));
        assert!(is_whitelisted_ip("127.0.0.1:5172"));
        assert!(is_whitelisted_ip("192.168.1.100"));
        assert!(is_whitelisted_ip("10.0.0.1"));
        assert!(is_whitelisted_ip("172.20.0.1")); // Docker bridge
        assert!(!is_whitelisted_ip("203.0.113.195")); // Public IP
    }

    #[test]
    fn test_block_and_unblock() {
        let test_ip = "198.51.100.44";
        clear_attempts(test_ip);
        for _ in 0..5 {
            record_failed_attempt(test_ip);
        }
        assert!(!check_rate_limit(test_ip));

        let blocked = list_blocked_ips();
        assert!(blocked.iter().any(|b| b.ip == test_ip));

        assert!(unblock_ip(test_ip));
        assert!(check_rate_limit(test_ip));
    }

    #[test]
    fn test_rate_limiter() {
        let public_ip = "203.0.113.195";
        clear_attempts(public_ip);

        // Attempt 1 to 4 should pass
        for _ in 0..4 {
            assert!(check_rate_limit(public_ip));
            record_failed_attempt(public_ip);
        }
        // Attempt 5 should still pass
        assert!(check_rate_limit(public_ip));
        record_failed_attempt(public_ip);

        // Attempt 6 MUST fail (this kills the `<` vs `<=` mutant)
        assert_eq!(check_rate_limit(public_ip), false);

        // Clear attempts should restore access
        clear_attempts(public_ip);
        assert!(check_rate_limit(public_ip));

        // Whitelisted LAN IP should never be rate limited
        let lan_ip = "192.168.1.100";
        clear_attempts(lan_ip);
        for _ in 0..10 {
            record_failed_attempt(lan_ip);
            assert!(check_rate_limit(lan_ip));
        }
    }
}
