use axum_test::TestServer;
use backend::app;
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
async fn test_samba_status_and_shares_endpoints() {
    unsafe { std::env::set_var("JWT_SECRET", "super_secret"); }
    let server = TestServer::new(app());
    let cookie = get_test_cookie();

    // 1. Check Samba status
    let response = server
        .get("/api/samba/status")
        .add_cookie(cookie.clone())
        .await;

    response.assert_status_ok();
    let status_json = response.json::<serde_json::Value>();
    assert!(status_json.get("running").is_some());
    assert!(status_json.get("lan_ip").is_some());

    // 2. Check Samba shares list
    let response = server
        .get("/api/samba/shares")
        .add_cookie(cookie.clone())
        .await;

    response.assert_status_ok();

    // 3. Create a Samba share
    let payload = serde_json::json!({
        "name": "public_media",
        "path": "/DATA/media",
        "read_only": false,
        "guest_ok": true
    });

    let response = server
        .post("/api/samba/shares")
        .add_cookie(cookie.clone())
        .json(&payload)
        .await;

    response.assert_status_ok();

    // 4. Delete the share
    let response = server
        .delete("/api/samba/shares/public_media")
        .add_cookie(cookie.clone())
        .await;

    response.assert_status_success();
}
