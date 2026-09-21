use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub exp: usize,
    #[serde(default = "default_role")]
    pub role: String,
    #[serde(default)]
    pub uid: Option<String>,
    #[serde(default)]
    pub sid: Option<String>,
}

fn default_role() -> String {
    "admin".to_string()
}

impl Claims {
    pub fn new(sub: impl Into<String>, exp: usize, role: impl Into<String>, uid: Option<String>) -> Self {
        Self {
            sub: sub.into(),
            exp,
            role: role.into(),
            uid,
            sid: None,
        }
    }

    pub fn with_sid(sub: impl Into<String>, exp: usize, role: impl Into<String>, uid: Option<String>, sid: Option<String>) -> Self {
        Self {
            sub: sub.into(),
            exp,
            role: role.into(),
            uid,
            sid,
        }
    }

    pub fn admin(sub: impl Into<String>, exp: usize) -> Self {
        Self {
            sub: sub.into(),
            exp,
            role: "admin".to_string(),
            uid: None,
            sid: None,
        }
    }
}

pub fn get_jwt_secret() -> &'static [u8] {
    static SECRET: OnceLock<Vec<u8>> = OnceLock::new();
    SECRET.get_or_init(|| {
        // Fallback for tests or explicit override
        if let Ok(key) = std::env::var("JWT_SECRET") {
            return key.into_bytes();
        }

        let data_dir = crate::system::data_migrator::get_active_data_dir();
        let secret_path = data_dir.join("jwt.secret");
        if secret_path.exists() {
            match std::fs::read_to_string(&secret_path) {
                Ok(key) if !key.trim().is_empty() => return key.trim().to_string().into_bytes(),
                _ => tracing::warn!("Failed to read existing jwt.secret, generating new one"),
            }
        }

        // Generate a cryptographically secure 64-byte random secret using CSPRNG
        let key_bytes: [u8; 64] = rand::random();
        let new_key = key_bytes.iter().map(|b| format!("{:02x}", b)).collect::<String>();
        
        let _ = std::fs::create_dir_all(&data_dir);
        if let Err(e) = std::fs::write(&secret_path, &new_key) {
            tracing::error!("Failed to save JWT secret to {:?}: {}", secret_path, e);
        } else {
            tracing::info!("Generated new JWT secret and saved to {:?}", secret_path);
        }
        
        new_key.into_bytes()
    }).as_slice()
}
