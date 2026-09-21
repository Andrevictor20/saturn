use argon2::{
    password_hash::{PasswordHash, PasswordVerifier},
    Argon2,
};
use axum::{
    extract::Extension,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::state::AppState;

use super::{
    check_rate_limit, clear_attempts, generate_recovery_codes, generate_totp_setup,
    get_auth_data, get_jwt_secret, hash_recovery_code, record_failed_attempt,
    save_auth_data, verify_and_consume_recovery_code, verify_totp_code, Claims,
};

#[derive(Debug, Deserialize)]
pub struct TwoFactorLoginPayload {
    pub temp_token: String,
    pub code: String,
}

#[derive(Debug, Deserialize)]
pub struct EnableTwoFactorPayload {
    pub secret: String,
    pub code: String,
    pub recovery_codes: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct PasswordConfirmPayload {
    pub current_password: String,
}

#[derive(Debug, Deserialize)]
pub struct DisableTwoFactorPayload {
    pub current_password: String,
    pub code: String,
}

#[derive(Debug, Serialize)]
pub struct TwoFactorStatusResponse {
    pub enabled: bool,
    pub recovery_codes_count: usize,
}

/// Public endpoint to complete 2FA login with a valid temp_token and TOTP / recovery code
pub async fn two_factor_login(
    jar: CookieJar,
    parts: axum::http::request::Parts,
    Json(payload): Json<TwoFactorLoginPayload>,
) -> Result<(CookieJar, Json<serde_json::Value>), (StatusCode, Json<serde_json::Value>)> {
    let client_ip = parts
        .extensions
        .get::<axum::extract::ConnectInfo<std::net::SocketAddr>>()
        .map(|a| a.0.ip().to_string())
        .unwrap_or_else(|| "127.0.0.1".to_string());

    if !check_rate_limit(&client_ip) {
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            Json(serde_json::json!({ "error": "Too many requests. Please wait." })),
        ));
    }

    // Decode and validate temporary 2FA token
    let token_data = match decode::<Claims>(
        &payload.temp_token,
        &DecodingKey::from_secret(get_jwt_secret()),
        &Validation::default(),
    ) {
        Ok(data) => data,
        Err(_) => {
            record_failed_attempt(&client_ip);
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({ "error": "Invalid or expired temporary session" })),
            ));
        }
    };

    let username = match token_data.claims.sub.strip_prefix("2fa_temp:") {
        Some(u) => u,
        None => {
            record_failed_attempt(&client_ip);
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({ "error": "Invalid token purpose" })),
            ));
        }
    };

    let mut auth_data = match get_auth_data() {
        Some(data) => data,
        None => {
            record_failed_attempt(&client_ip);
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({ "error": "Authentication not configured" })),
            ));
        }
    };

    if auth_data.username != username || !auth_data.totp_enabled {
        record_failed_attempt(&client_ip);
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": "Two-factor authentication is not active" })),
        ));
    }

    let secret = match auth_data.totp_secret.as_deref() {
        Some(s) => s,
        None => {
            record_failed_attempt(&client_ip);
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": "2FA secret configuration missing" })),
            ));
        }
    };

    let mut used_recovery = false;
    let valid_code = if verify_totp_code(secret, &auth_data.username, &payload.code) {
        true
    } else if verify_and_consume_recovery_code(&mut auth_data.recovery_codes, &payload.code) {
        used_recovery = true;
        true
    } else {
        false
    };

    if !valid_code {
        record_failed_attempt(&client_ip);
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": "Invalid authentication code" })),
        ));
    }

    // If a single-use recovery code was consumed, persist the updated auth data immediately
    if used_recovery {
        if let Err(_) = save_auth_data(&auth_data) {
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": "Failed to update recovery codes" })),
            ));
        }
    }

    clear_attempts(&client_ip);

    // Issue permanent session JWT
    let expiration = SystemTime::now()
        .checked_add(Duration::from_secs(2 * 3600))
        .unwrap()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as usize;

    let (role, uid) = if let Some(user) = super::get_user_by_username(&auth_data.username) {
        (user.role.as_str().to_string(), Some(user.id))
    } else {
        ("admin".to_string(), None)
    };

    let user_agent = parts
        .headers
        .get(axum::http::header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("Unknown Device");

    let session = super::sessions::create_session(&auth_data.username, uid.as_deref(), &client_ip, user_agent);
    let claims = Claims::with_sid(auth_data.username, expiration, role, uid, Some(session.id));

    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(get_jwt_secret()),
    )
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": "Failed to generate session token" })),
        )
    })?;

    let cookie = Cookie::build(("auth_token", token.clone()))
        .path("/")
        .http_only(true)
        .same_site(SameSite::Lax)
        .max_age(time::Duration::hours(2))
        .build();

    Ok((
        jar.add(cookie),
        Json(serde_json::json!({
            "message": "success",
            "token": token,
            "used_recovery_code": used_recovery
        })),
    ))
}

/// Protected endpoint: returns whether 2FA is enabled and count of remaining recovery codes
pub async fn two_factor_status(
    Extension(claims): Extension<Claims>,
) -> Result<Json<TwoFactorStatusResponse>, StatusCode> {
    let auth_data = get_auth_data().ok_or(StatusCode::UNAUTHORIZED)?;
    if !auth_data.username.trim().eq_ignore_ascii_case(claims.sub.trim()) {
        return Err(StatusCode::UNAUTHORIZED);
    }

    Ok(Json(TwoFactorStatusResponse {
        enabled: auth_data.totp_enabled,
        recovery_codes_count: auth_data.recovery_codes.len(),
    }))
}

/// Protected endpoint: initiates 2FA setup, generating new secret, QR code data URL, and backup recovery codes
pub async fn two_factor_setup(
    Extension(claims): Extension<Claims>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let setup = generate_totp_setup(&claims.sub).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e })),
        )
    })?;

    Ok(Json(serde_json::json!({
        "secret": setup.secret,
        "otpauth_url": setup.otpauth_url,
        "qr_data_url": setup.qr_data_url,
        "recovery_codes": setup.recovery_codes
    })))
}

/// Protected endpoint: enables 2FA after verifying the first 6-digit TOTP code
pub async fn two_factor_enable(
    Extension(claims): Extension<Claims>,
    Json(payload): Json<EnableTwoFactorPayload>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    if !verify_totp_code(&payload.secret, &claims.sub, &payload.code) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Invalid verification code. Check your authenticator app and try again." })),
        ));
    }

    let mut auth_data = match get_auth_data() {
        Some(d) => d,
        None => return Err((
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": "Authentication data not found" })),
        )),
    };

    if !auth_data.username.trim().eq_ignore_ascii_case(claims.sub.trim()) {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": "Unauthorized" })),
        ));
    }

    let hashed_codes = payload
        .recovery_codes
        .iter()
        .map(|c| hash_recovery_code(c))
        .collect();

    auth_data.totp_enabled = true;
    auth_data.totp_secret = Some(payload.secret);
    auth_data.recovery_codes = hashed_codes;

    if let Err(_) = save_auth_data(&auth_data) {
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": "Failed to save authentication settings" })),
        ));
    }

    Ok(Json(serde_json::json!({
        "message": "Two-factor authentication enabled successfully",
        "enabled": true
    })))
}

/// Protected endpoint: disables 2FA after confirming the user's current password
/// AND verifying either the current TOTP authenticator code or one of the backup recovery codes.
pub async fn two_factor_disable(
    Extension(claims): Extension<Claims>,
    Json(payload): Json<DisableTwoFactorPayload>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let mut auth_data = match get_auth_data() {
        Some(d) => d,
        None => return Err((
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": "Authentication data not found" })),
        )),
    };

    if !auth_data.username.trim().eq_ignore_ascii_case(claims.sub.trim()) {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": "Unauthorized" })),
        ));
    }

    let parsed_hash = match PasswordHash::new(&auth_data.hash) {
        Ok(h) => h,
        Err(_) => return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": "Password hash verification failed" })),
        )),
    };

    if Argon2::default().verify_password(payload.current_password.as_bytes(), &parsed_hash).is_err() {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": "Incorrect password" })),
        ));
    }

    // Verify TOTP code or recovery code
    if auth_data.totp_enabled {
        let secret = match auth_data.totp_secret.as_ref() {
            Some(s) if !s.is_empty() => s,
            _ => return Err((
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": "Two-factor authentication is not configured" })),
            )),
        };

        let is_valid_totp = verify_totp_code(secret, &auth_data.username, &payload.code);
        let is_valid_recovery = verify_and_consume_recovery_code(&mut auth_data.recovery_codes, &payload.code);

        if !is_valid_totp && !is_valid_recovery {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": "Invalid authentication code or recovery code" })),
            ));
        }
    }

    auth_data.totp_enabled = false;
    auth_data.totp_secret = None;
    auth_data.recovery_codes.clear();

    if let Err(_) = save_auth_data(&auth_data) {
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": "Failed to save authentication settings" })),
        ));
    }

    Ok(Json(serde_json::json!({
        "message": "Two-factor authentication disabled successfully",
        "enabled": false
    })))
}

/// Protected endpoint: regenerates recovery codes after verifying current password
pub async fn two_factor_regenerate_codes(
    Extension(claims): Extension<Claims>,
    Json(payload): Json<PasswordConfirmPayload>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let mut auth_data = match get_auth_data() {
        Some(d) => d,
        None => return Err((
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": "Authentication data not found" })),
        )),
    };

    if !auth_data.username.trim().eq_ignore_ascii_case(claims.sub.trim()) {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": "Unauthorized" })),
        ));
    }

    if !auth_data.totp_enabled {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Two-factor authentication is not active" })),
        ));
    }

    let parsed_hash = match PasswordHash::new(&auth_data.hash) {
        Ok(h) => h,
        Err(_) => return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": "Password hash verification failed" })),
        )),
    };

    if Argon2::default().verify_password(payload.current_password.as_bytes(), &parsed_hash).is_err() {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": "Incorrect password" })),
        ));
    }

    let new_codes = generate_recovery_codes(8);
    let hashed_codes = new_codes.iter().map(|c| hash_recovery_code(c)).collect();

    auth_data.recovery_codes = hashed_codes;

    if let Err(_) = save_auth_data(&auth_data) {
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": "Failed to save new recovery codes" })),
        ));
    }

    Ok(Json(serde_json::json!({
        "recovery_codes": new_codes
    })))
}

/// Router for protected 2FA endpoints
pub fn protected_router() -> Router<AppState> {
    Router::new()
        .route("/api/auth/2fa/status", get(two_factor_status))
        .route("/api/auth/2fa/setup", post(two_factor_setup))
        .route("/api/auth/2fa/enable", post(two_factor_enable))
        .route("/api/auth/2fa/disable", post(two_factor_disable))
        .route("/api/auth/2fa/recovery-codes/regenerate", post(two_factor_regenerate_codes))
}

pub fn two_factor_protected_router() -> Router<AppState> {
    protected_router()
}
