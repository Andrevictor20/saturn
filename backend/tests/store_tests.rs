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
async fn test_store_endpoints_exist() {
    unsafe { std::env::set_var("JWT_SECRET", "super_secret"); }
    let server = TestServer::new(app());
    
    let auth_cookie = get_test_cookie();
    
    // 1. GET /api/store/apps
    let response = server.get("/api/store/apps")
        .add_cookie(auth_cookie.clone())
        .await;
    
    response.assert_status_ok();
    
    // Parse the JSON response to get the first app's ID
    let apps: serde_json::Value = response.json();
    let first_app = apps.as_array()
        .expect("Expected JSON array")
        .get(0)
        .expect("Expected at least one app in the store");
    assert!(first_app.get("architectures").is_some(), "Expected app to have architectures field");
    let first_app_id = first_app
        .get("id")
        .expect("Expected app to have an id")
        .as_str()
        .expect("Expected id to be a string");
    
    // 2. POST /api/store/install/:id
    let response = server.post(&format!("/api/store/install/{}", first_app_id))
        .add_cookie(auth_cookie.clone())
        .await;
        
    response.assert_status(axum::http::StatusCode::ACCEPTED);
    
    // 3. POST /api/store/uninstall/:id
    let response = server.post(&format!("/api/store/uninstall/{}", first_app_id))
        .add_cookie(auth_cookie.clone())
        .await;
    assert!(response.status_code() == axum::http::StatusCode::NOT_FOUND || response.status_code() == axum::http::StatusCode::OK);

    // 4. POST /api/store/sync
    let response = server.post("/api/store/sync")
        .add_cookie(auth_cookie.clone())
        .await;
        
    response.assert_status_ok();

    // 5. GET /api/store/repositories
    let response = server.get("/api/store/repositories")
        .add_cookie(auth_cookie.clone())
        .await;
    response.assert_status_ok();
    let repos: Vec<serde_json::Value> = response.json();
    assert!(!repos.is_empty(), "Should return at least the official repository");
    assert_eq!(repos[0]["id"], "official");

    // 6. POST /api/store/repositories (Add community repo)
    let payload = serde_json::json!({
        "name": "Integration Test Store",
        "url": "https://example.com/test-store/catalog.json"
    });
    let response = server.post("/api/store/repositories")
        .add_cookie(auth_cookie.clone())
        .json(&payload)
        .await;
    response.assert_status(axum::http::StatusCode::CREATED);
    let added_data: serde_json::Value = response.json();
    let repo_id = added_data["repository"]["id"].as_str().unwrap();

    // 7. POST /api/store/repositories/:id/toggle
    let response = server.post(&format!("/api/store/repositories/{}/toggle", repo_id))
        .add_cookie(auth_cookie.clone())
        .await;
    response.assert_status_ok();

    // 8. DELETE /api/store/repositories/:id
    let response = server.delete(&format!("/api/store/repositories/{}", repo_id))
        .add_cookie(auth_cookie.clone())
        .await;
    response.assert_status_ok();

    // 9. Cannot delete official repo
    let response = server.delete("/api/store/repositories/official")
        .add_cookie(auth_cookie.clone())
        .await;
    response.assert_status(axum::http::StatusCode::BAD_REQUEST);
}
