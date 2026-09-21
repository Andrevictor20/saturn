use axum::{
    extract::Request,
    http::StatusCode,
    middleware::Next,
    response::Response,
};
use serde::{Deserialize, Serialize};
use super::jwt::Claims;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum UserRole {
    Admin,
    Member,
}

impl UserRole {
    pub fn as_str(&self) -> &'static str {
        match self {
            UserRole::Admin => "admin",
            UserRole::Member => "member",
        }
    }

    pub fn is_admin(&self) -> bool {
        matches!(self, UserRole::Admin)
    }

    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().trim() {
            "admin" => UserRole::Admin,
            _ => UserRole::Member,
        }
    }
}

impl Default for UserRole {
    fn default() -> Self {
        UserRole::Member
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub username: String,
    pub display_name: Option<String>,
    pub hash: String,
    #[serde(default)]
    pub role: UserRole,
    #[serde(default)]
    pub allowed_modules: Option<Vec<String>>,
    #[serde(default = "default_active")]
    pub is_active: bool,
    #[serde(default)]
    pub totp_secret: Option<String>,
    #[serde(default)]
    pub totp_enabled: bool,
    #[serde(default)]
    pub recovery_codes: Vec<String>,
    #[serde(default)]
    pub created_at: u64,
}

fn default_active() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserPublicProfile {
    pub id: String,
    pub username: String,
    pub display_name: Option<String>,
    pub role: UserRole,
    pub is_active: bool,
    pub totp_enabled: bool,
    pub created_at: u64,
}

impl From<&User> for UserPublicProfile {
    fn from(u: &User) -> Self {
        Self {
            id: u.id.clone(),
            username: u.username.clone(),
            display_name: u.display_name.clone(),
            role: u.role,
            is_active: u.is_active,
            totp_enabled: u.totp_enabled,
            created_at: u.created_at,
        }
    }
}

/// Middleware enforcing that the requesting authenticated user has the `Admin` role.
pub async fn require_admin(
    req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let claims = req
        .extensions()
        .get::<Claims>()
        .ok_or(StatusCode::UNAUTHORIZED)?;

    if claims.role != "admin" {
        tracing::warn!("Forbidden access attempt by non-admin user '{}'", claims.sub);
        return Err(StatusCode::FORBIDDEN);
    }

    Ok(next.run(req).await)
}

/// Global authentication middleware that validates JWT token from Cookie or Authorization header or query param.
pub async fn require_auth(
    jar: axum_extra::extract::CookieJar,
    mut req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let token = jar
        .get("auth_token")
        .map(|cookie| cookie.value().to_string())
        .or_else(|| {
            req.headers()
                .get(axum::http::header::AUTHORIZATION)
                .and_then(|h| h.to_str().ok())
                .and_then(|h| {
                    if let Some(stripped) = h.strip_prefix("Bearer ") {
                        Some(stripped.trim().to_string())
                    } else if let Some(stripped) = h.strip_prefix("bearer ") {
                        Some(stripped.trim().to_string())
                    } else {
                        None
                    }
                })
        })
        .or_else(|| {
            req.uri().query().and_then(|q| {
                for pair in q.split('&') {
                    if let Some((k, v)) = pair.split_once('=') {
                        if k == "token" && !v.is_empty() {
                            let decoded = v.replace("%2B", "+").replace("%2F", "/").replace("%3D", "=");
                            return Some(decoded);
                        }
                    }
                }
                None
            })
        })
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let token_data = jsonwebtoken::decode::<Claims>(
        &token,
        &jsonwebtoken::DecodingKey::from_secret(super::jwt::get_jwt_secret()),
        &jsonwebtoken::Validation::default(),
    ).map_err(|_| StatusCode::UNAUTHORIZED)?;

    // Reject temporary 2FA token from accessing regular protected resources
    if token_data.claims.sub.starts_with("2fa_temp:") {
        return Err(StatusCode::UNAUTHORIZED);
    }

    // Validate active session if sid is present in token claims
    if let Some(ref sid) = token_data.claims.sid {
        if !super::sessions::is_session_valid(sid) {
            return Err(StatusCode::UNAUTHORIZED);
        }
        super::sessions::touch_session(sid);
    }

    req.extensions_mut().insert(token_data.claims);
    Ok(next.run(req).await)
}
