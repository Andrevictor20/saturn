use axum_test::TestServer;
use backend::app;
use backend::auth::{Claims, get_jwt_secret};
use jsonwebtoken::{encode, EncodingKey, Header};
use axum::http::StatusCode;

fn get_test_cookie() -> axum_extra::extract::cookie::Cookie<'static> {
    let claims = Claims {
        sub: "admin".to_string(),
        exp: 10_000_000_000,
        role: "admin".to_string(),
        uid: None,
        sid: None,
    };

    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(get_jwt_secret()),
    ).unwrap();

    axum_extra::extract::cookie::Cookie::new("auth_token", token)
}

#[tokio::test]
async fn test_system_processes_endpoint_requires_auth() {
    let server = TestServer::new(app());
    let response = server.get("/api/system/processes").await;
    assert_eq!(response.status_code(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_system_processes_endpoint_with_auth() {
    unsafe { std::env::set_var("JWT_SECRET", "super_secret"); }
    let server = TestServer::new(app());
    let cookie = get_test_cookie();

    let response = server
        .get("/api/system/processes")
        .add_cookie(cookie)
        .await;

    assert_eq!(response.status_code(), StatusCode::OK);

    let json: serde_json::Value = response.json();
    assert!(json.get("processes").is_some());
    assert!(json.get("total_processes").is_some());
    assert!(json.get("user_processes_count").is_some());
    assert!(json.get("kernel_threads_count").is_some());
    assert!(json.get("running_processes").is_some());
    assert!(json.get("total_memory_used").is_some());

    let processes = json.get("processes").and_then(|v| v.as_array()).unwrap();
    assert!(!processes.is_empty(), "Processes list should not be empty");

    let first = &processes[0];
    assert!(first.get("pid").is_some());
    assert!(first.get("name").is_some());
    assert!(first.get("cpu_usage").is_some());
    assert!(first.get("memory_rss").is_some());
    assert!(first.get("memory_percent").is_some());
    assert!(first.get("status").is_some());
    assert!(first.get("is_kernel_thread").is_some());
}

#[tokio::test]
async fn test_kill_process_safety_guards() {
    unsafe { std::env::set_var("JWT_SECRET", "super_secret"); }
    let server = TestServer::new(app());
    let cookie = get_test_cookie();

    // Trying to kill PID 1 or 0 should be rejected by safety check
    let response = server
        .post("/api/system/processes/1/kill")
        .add_cookie(cookie)
        .json(&serde_json::json!({ "signal": "SIGTERM" }))
        .await;

    assert_eq!(response.status_code(), StatusCode::BAD_REQUEST);
}
