use axum_test::TestServer;
use backend::app;
use backend::system::gpu::collect_gpu_telemetry;
use jsonwebtoken::{encode, Header, EncodingKey};
use backend::auth::Claims;
use std::time::{SystemTime, UNIX_EPOCH, Duration};

fn get_test_cookie() -> axum_extra::extract::cookie::Cookie<'static> {
    let expiration = SystemTime::now()
        .checked_add(Duration::from_secs(3600))
        .unwrap()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as usize;

    let claims = Claims {
        sub: "admin".to_string(),
        exp: expiration,
        role: "admin".to_string(),
        uid: None,
        sid: None,
    };

    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(b"super_secret"),
    ).unwrap();

    axum_extra::extract::cookie::Cookie::new("auth_token", token)
}

#[tokio::test]
async fn test_gpu_endpoint_returns_json() {
    unsafe { std::env::set_var("JWT_SECRET", "super_secret"); }
    let server = TestServer::new(app());
    let cookie = get_test_cookie();

    let response = server
        .get("/api/system/gpu")
        .add_cookie(cookie)
        .await;

    response.assert_status_ok();
    let json = response.json::<serde_json::Value>();

    assert!(json.get("name").is_some());
    assert!(json.get("vendor").is_some());
    assert!(json.get("usage_percent").is_some());
    assert!(json.get("memory_used_bytes").is_some());
    assert!(json.get("memory_total_bytes").is_some());
    assert!(json.get("is_available").is_some());
}

#[test]
fn test_collect_gpu_telemetry_unit() {
    let telemetry = collect_gpu_telemetry();
    assert!(!telemetry.name.is_empty());
    assert!(telemetry.usage_percent >= 0.0 && telemetry.usage_percent <= 100.0);
}
