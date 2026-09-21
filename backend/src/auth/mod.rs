pub mod jwt;
pub mod permissions;
pub mod rate_limit;
pub mod sessions;
pub mod totp;
pub mod two_factor;
pub mod users_api;

pub use jwt::{get_jwt_secret, Claims};
pub use permissions::*;
pub use rate_limit::{check_rate_limit, clear_attempts, record_failed_attempt};
pub use sessions::*;
pub use totp::*;
pub use two_factor::*;
pub use users_api::*;

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use axum::{
    http::StatusCode,
    routing::{get, post, put},
    Json, Router,
};
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use subtle::ConstantTimeEq;

pub fn get_users_file_path() -> String {
    if let Ok(path) = std::env::var("SATURN_USERS_FILE") {
        return path;
    }
    if let Ok(auth_file) = std::env::var("SATURN_AUTH_FILE") {
        if auth_file.contains("auth") {
            return auth_file.replace("auth", "users");
        }
        return format!("{}.users.json", auth_file);
    }
    let data_dir = crate::system::data_migrator::get_active_data_dir();
    let saturn_path = data_dir.join("saturn_users.json");
    saturn_path.to_string_lossy().to_string()
}

pub fn get_auth_file_path() -> String {
    std::env::var("SATURN_AUTH_FILE")
        .unwrap_or_else(|_| {
            let data_dir = crate::system::data_migrator::get_active_data_dir();
            let saturn_path = data_dir.join("saturn_auth.json");
            saturn_path.to_string_lossy().to_string()
        })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthData {
    pub username: String,
    pub hash: String,
    #[serde(default)]
    pub totp_secret: Option<String>,
    #[serde(default)]
    pub totp_enabled: bool,
    #[serde(default)]
    pub recovery_codes: Vec<String>,
}

pub fn load_users() -> Vec<User> {
    let users_path = get_users_file_path();
    if let Ok(content) = fs::read_to_string(&users_path) {
        if let Ok(users) = serde_json::from_str::<Vec<User>>(&content) {
            return users;
        }
    }

    // Auto-migration from legacy saturn_auth.json
    let legacy_auth_path = get_auth_file_path();
    if let Ok(content) = fs::read_to_string(&legacy_auth_path) {
        if let Ok(auth_data) = serde_json::from_str::<AuthData>(&content) {
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let admin = User {
                id: uuid::Uuid::new_v4().to_string(),
                username: auth_data.username,
                display_name: Some("Administrator".to_string()),
                hash: auth_data.hash,
                role: UserRole::Admin,
                allowed_modules: None,
                is_active: true,
                totp_secret: auth_data.totp_secret,
                totp_enabled: auth_data.totp_enabled,
                recovery_codes: auth_data.recovery_codes,
                created_at: now,
            };
            let users = vec![admin];
            let _ = save_users(&users);
            tracing::info!("Auto-migrated legacy auth to saturn_users.json successfully");
            return users;
        }
    }

    Vec::new()
}

pub fn save_users(users: &[User]) -> Result<(), StatusCode> {
    let users_path = get_users_file_path();
    if let Some(parent) = Path::new(&users_path).parent() {
        let _ = fs::create_dir_all(parent);
    }
    let json = serde_json::to_string(users).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    fs::write(&users_path, json).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(())
}

pub fn get_user_by_username(username: &str) -> Option<User> {
    load_users().into_iter().find(|u| u.username.eq_ignore_ascii_case(username))
}

pub fn get_auth_data() -> Option<AuthData> {
    let users = load_users();
    users.into_iter().find(|u| u.role.is_admin()).map(|u| AuthData {
        username: u.username,
        hash: u.hash,
        totp_secret: u.totp_secret,
        totp_enabled: u.totp_enabled,
        recovery_codes: u.recovery_codes,
    })
}

pub fn save_auth_data(auth_data: &AuthData) -> Result<(), StatusCode> {
    let mut users = load_users();
    if let Some(admin) = users.iter_mut().find(|u| u.role.is_admin()) {
        admin.username = auth_data.username.clone();
        admin.hash = auth_data.hash.clone();
        admin.totp_secret = auth_data.totp_secret.clone();
        admin.totp_enabled = auth_data.totp_enabled;
        admin.recovery_codes = auth_data.recovery_codes.clone();
    } else {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        users.push(User {
            id: uuid::Uuid::new_v4().to_string(),
            username: auth_data.username.clone(),
            display_name: Some("Administrator".to_string()),
            hash: auth_data.hash.clone(),
            role: UserRole::Admin,
            allowed_modules: None,
            is_active: true,
            totp_secret: auth_data.totp_secret.clone(),
            totp_enabled: auth_data.totp_enabled,
            recovery_codes: auth_data.recovery_codes.clone(),
            created_at: now,
        });
    }
    save_users(&users)
}

#[derive(Debug, Deserialize)]
pub struct LoginPayload {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct ChangePasswordPayload {
    pub current_password: String,
    pub new_password: String,
}

pub async fn status() -> Result<Json<serde_json::Value>, StatusCode> {
    let needs_setup = load_users().is_empty();
    Ok(Json(serde_json::json!({ "needs_setup": needs_setup })))
}

pub async fn setup(
    jar: CookieJar,
    Json(payload): Json<LoginPayload>,
) -> Result<(CookieJar, Json<serde_json::Value>), StatusCode> {
    let users = load_users();
    if !users.is_empty() {
        return Err(StatusCode::FORBIDDEN);
    }

    if payload.username.is_empty() || payload.password.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(payload.password.as_bytes(), &salt)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .to_string();

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let admin_user = User {
        id: uuid::Uuid::new_v4().to_string(),
        username: payload.username.clone(),
        display_name: Some("Administrator".to_string()),
        hash,
        role: UserRole::Admin,
        allowed_modules: None,
        is_active: true,
        totp_secret: None,
        totp_enabled: false,
        recovery_codes: Vec::new(),
        created_at: now,
    };

    save_users(&[admin_user.clone()])?;

    let expiration = SystemTime::now()
        .checked_add(Duration::from_secs(2 * 3600))
        .unwrap()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as usize;

    let session = sessions::create_session(&admin_user.username, Some(&admin_user.id), "127.0.0.1", "Setup Wizard");

    let claims = Claims::with_sid(
        payload.username,
        expiration,
        "admin".to_string(),
        Some(admin_user.id),
        Some(session.id),
    );

    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(get_jwt_secret()),
    ).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let cookie = Cookie::build(("auth_token", token.clone()))
        .path("/")
        .http_only(true)
        .same_site(SameSite::Lax)
        .max_age(time::Duration::hours(2))
        .build();

    Ok((
        jar.add(cookie),
        Json(serde_json::json!({ "message": "setup complete", "token": token })),
    ))
}

pub async fn login(
    jar: CookieJar,
    parts: axum::http::request::Parts,
    Json(payload): Json<LoginPayload>,
) -> Result<(CookieJar, Json<serde_json::Value>), StatusCode> {
    let client_ip = parts.extensions.get::<axum::extract::ConnectInfo<std::net::SocketAddr>>()
        .map(|a| a.0.ip().to_string())
        .unwrap_or_else(|| "127.0.0.1".to_string());
    
    if !check_rate_limit(&client_ip) {
        return Err(StatusCode::TOO_MANY_REQUESTS);
    }

    let users = load_users();
    let found_user = users.into_iter().find(|u| {
        if u.username.len() == payload.username.len() {
            u.username.as_bytes().ct_eq(payload.username.as_bytes()).unwrap_u8() == 1
        } else {
            false
        }
    });

    let user = match found_user {
        Some(u) => u,
        None => {
            record_failed_attempt(&client_ip);
            return Err(StatusCode::UNAUTHORIZED);
        }
    };

    if !user.is_active {
        return Err(StatusCode::FORBIDDEN);
    }

    let parsed_hash = match PasswordHash::new(&user.hash) {
        Ok(h) => h,
        Err(_) => {
            record_failed_attempt(&client_ip);
            return Err(StatusCode::UNAUTHORIZED);
        }
    };

    if Argon2::default().verify_password(payload.password.as_bytes(), &parsed_hash).is_err() {
        record_failed_attempt(&client_ip);
        return Err(StatusCode::UNAUTHORIZED);
    }

    if user.totp_enabled {
        let expiration = SystemTime::now()
            .checked_add(Duration::from_secs(300))
            .unwrap()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as usize;

        let claims = Claims {
            sub: format!("2fa_temp:{}", user.username),
            exp: expiration,
            role: user.role.as_str().to_string(),
            uid: Some(user.id.clone()),
            sid: None,
        };

        let temp_token = encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(get_jwt_secret()),
        ).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        return Ok((
            jar,
            Json(serde_json::json!({
                "requires_2fa": true,
                "temp_token": temp_token
            })),
        ));
    }

    clear_attempts(&client_ip);

    let expiration = SystemTime::now()
        .checked_add(Duration::from_secs(2 * 3600))
        .unwrap()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as usize;

    let user_agent = parts.headers.get(axum::http::header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("Unknown Device");

    let session = sessions::create_session(&user.username, Some(&user.id), &client_ip, user_agent);

    let claims = Claims::with_sid(
        user.username.clone(),
        expiration,
        user.role.as_str().to_string(),
        Some(user.id.clone()),
        Some(session.id),
    );

    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(get_jwt_secret()),
    ).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let cookie = Cookie::build(("auth_token", token.clone()))
        .path("/")
        .http_only(true)
        .same_site(SameSite::Lax)
        .max_age(time::Duration::hours(2))
        .build();

    Ok((
        jar.add(cookie),
        Json(serde_json::json!({ "message": "success", "requires_2fa": false, "token": token })),
    ))
}

pub async fn change_password(
    jar: CookieJar,
    Json(payload): Json<ChangePasswordPayload>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    // Requires auth first
    let token = jar
        .get("auth_token")
        .map(|cookie| cookie.value())
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(get_jwt_secret()),
        &Validation::default(),
    ).map_err(|_| StatusCode::UNAUTHORIZED)?;

    if let Some(sid) = &token_data.claims.sid {
        if !sessions::is_session_valid(sid) {
            return Err(StatusCode::UNAUTHORIZED);
        }
    }

    let mut auth_data = get_auth_data().ok_or(StatusCode::UNAUTHORIZED)?;

    // Verify current password
    let parsed_hash = PasswordHash::new(&auth_data.hash).map_err(|_| StatusCode::UNAUTHORIZED)?;
    if Argon2::default().verify_password(payload.current_password.as_bytes(), &parsed_hash).is_err() {
        return Err(StatusCode::UNAUTHORIZED);
    }

    // Hash new password
    let salt = SaltString::generate(&mut OsRng);
    let new_hash = Argon2::default()
        .hash_password(payload.new_password.as_bytes(), &salt)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .to_string();

    auth_data.hash = new_hash;
    save_auth_data(&auth_data)?;

    Ok(Json(serde_json::json!({ "message": "password updated" })))
}

pub async fn me(jar: CookieJar) -> Result<Json<serde_json::Value>, StatusCode> {
    let token = jar
        .get("auth_token")
        .map(|cookie| cookie.value())
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(get_jwt_secret()),
        &Validation::default(),
    ).map_err(|_| StatusCode::UNAUTHORIZED)?;

    if token_data.claims.sub.starts_with("2fa_temp:") {
        return Err(StatusCode::UNAUTHORIZED);
    }
    if let Some(sid) = &token_data.claims.sid {
        if !sessions::is_session_valid(sid) {
            return Err(StatusCode::UNAUTHORIZED);
        }
    }
    let user = get_user_by_username(&token_data.claims.sub);
    let role = user.as_ref().map(|u| u.role.as_str()).unwrap_or(token_data.claims.role.as_str());
    let display_name = user.as_ref().and_then(|u| u.display_name.clone());
    let uid = user.as_ref().map(|u| u.id.clone()).or(token_data.claims.uid);
    let is_admin = role == "admin";

    Ok(Json(serde_json::json!({
        "authenticated": true,
        "username": token_data.claims.sub,
        "display_name": display_name,
        "role": role,
        "uid": uid,
        "is_admin": is_admin
    })))
}

pub fn public_router() -> Router {
    Router::new()
        .route("/api/auth/login", post(login))
        .route("/api/auth/2fa/login", post(two_factor_login))
        .route("/api/auth/status", get(status))
        .route("/api/auth/setup", post(setup))
        .route("/api/auth/password", put(change_password))
        .route("/api/auth/me", get(me))
}

pub fn protected_router() -> Router<crate::state::AppState> {
    Router::new()
        .route("/api/auth/sessions", get(sessions::get_user_sessions_handler))
        .route("/api/auth/sessions/{id}", axum::routing::delete(sessions::revoke_session_handler))
        .route("/api/auth/sessions/revoke-others", post(sessions::revoke_other_sessions_handler))
}

pub fn admin_router() -> Router<crate::state::AppState> {
    Router::new()
        .route("/api/auth/security/blocked-ips", get(rate_limit::list_blocked_ips_handler))
        .route("/api/auth/security/unblock-ip", post(rate_limit::unblock_ip_handler))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_jwt_secret() {
        unsafe { std::env::set_var("JWT_SECRET", "test_secret_value"); }
        let secret = get_jwt_secret();
        assert!(!secret.is_empty(), "Secret should not be empty");
        assert_eq!(secret, b"test_secret_value");
    }

    #[test]
    fn test_jwt_claims_struct() {
        let claims = Claims::admin("admin", 10000);
        assert_eq!(claims.sub, "admin");
        assert_eq!(claims.exp, 10000);
        assert_eq!(claims.role, "admin");
    }
}
