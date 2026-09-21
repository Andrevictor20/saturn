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
async fn test_health_check() {
    let server = TestServer::new(app());
    let response = server.get("/health").await;
    
    response.assert_status_ok();
}

#[tokio::test]
async fn test_protected_routes_require_auth() {
    let server = TestServer::new(app());
    
    // Trying to access protected route without cookie should yield 401
    let response = server.get("/api/docker/containers").await;
    response.assert_status_unauthorized();
}

#[tokio::test]
async fn test_delete_container_endpoint_mapping() {
    unsafe { std::env::set_var("JWT_SECRET", "super_secret"); }
    let server = TestServer::new(app());
    
    let auth_cookie = get_test_cookie();
    
    // With cookie, send DELETE to a dummy container ID
    // Note: since this is an integration test connecting to the real Docker socket,
    // if the container doesn't exist, it should return an error (probably 500 or 404 from Docker itself),
    // but the Axum router MUST route it to the right handler and NOT return 405 Method Not Allowed or 404 Not Found from Axum.
    let response = server.delete("/api/docker/containers/non_existent_container_id_for_test")
        .add_cookie(auth_cookie)
        .await;
    
    // Since we don't mock bollard, it will hit real docker and fail to find the container.
    // Docker returns 404 which bollard turns into an Err, and our handler returns 500 INTERNAL_SERVER_ERROR.
    // As long as it is NOT 401 Unauthorized and NOT 405 Method Not Allowed, the routing is correct.
    assert_eq!(response.status_code(), 500);
}

#[tokio::test]
async fn test_stats_history_endpoint() {
    unsafe { std::env::set_var("JWT_SECRET", "super_secret"); }
    let server = TestServer::new(app());
    let auth_cookie = get_test_cookie();

    let response = server.get("/api/docker/stats/history?limit=10")
        .add_cookie(auth_cookie)
        .await;

    response.assert_status_ok();
    let json: Vec<serde_json::Value> = response.json();
    // Should return JSON array (empty or with items)
    assert!(json.len() <= 10);
}

#[tokio::test]
async fn test_snapshot_stats_endpoint() {
    unsafe { std::env::set_var("JWT_SECRET", "super_secret"); }
    let server = TestServer::new(app());
    let auth_cookie = get_test_cookie();

    let response = server.get("/api/docker/containers/stats/snapshot")
        .add_cookie(auth_cookie)
        .await;

    response.assert_status_ok();
    let json: serde_json::Value = response.json();
    assert!(json.is_array());
}

