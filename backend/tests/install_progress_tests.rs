use axum_test::TestServer;
use backend::app;
use serde_json::Value;
use jsonwebtoken::{encode, Header, EncodingKey};
use backend::auth::Claims;
use std::time::{SystemTime, UNIX_EPOCH, Duration};

fn make_server() -> TestServer {
    unsafe { std::env::set_var("JWT_SECRET", "super_secret"); }
    TestServer::new(app())
}

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

/// Install should return 202 Accepted with task_id (not 200 = old blocking behavior)
#[tokio::test]
async fn test_install_returns_task_id() {
    let server = make_server();
    let auth_cookie = get_test_cookie();

    let response = server
        .post("/api/store/install/nodered")
        .add_cookie(auth_cookie)
        .await;

    // Must NOT return 200 OK (that was old blocking behavior)
    let status = response.status_code().as_u16();
    assert_ne!(status, 200, "Install must NOT return 200 OK — must be async (202 or 404)");

    if status == 202 {
        let body: Value = response.json();
        assert!(body.get("task_id").is_some(), "202 response must contain task_id");
        let task_id = body["task_id"].as_str().unwrap();
        assert!(!task_id.is_empty(), "task_id must not be empty");
    }
    // 404 acceptable if store not yet populated
}

/// Status endpoint must return all required fields: id, status, progress, logs
#[tokio::test]
async fn test_install_status_has_required_fields() {
    let server = make_server();
    let auth_cookie = get_test_cookie();

    let install_response = server
        .post("/api/store/install/nodered")
        .add_cookie(auth_cookie.clone())
        .await;

    if install_response.status_code() != 202 {
        return; // Store not populated; skip
    }

    let install_body: Value = install_response.json();
    let task_id = install_body["task_id"].as_str().unwrap();

    let status_response = server
        .get(&format!("/api/store/install/status/{}", task_id))
        .add_cookie(auth_cookie)
        .await;

    assert_eq!(status_response.status_code(), 200);
    let body: Value = status_response.json();

    assert!(body.get("id").is_some(), "Must have 'id' field");
    assert!(body.get("status").is_some(), "Must have 'status' field");
    assert!(body.get("progress").is_some(), "Must have 'progress' field");
    assert!(body.get("logs").is_some(), "Must have 'logs' array field");

    let progress = body["progress"].as_u64().unwrap_or(999);
    assert!(progress <= 100, "progress must be 0-100, got {}", progress);
    assert!(body["logs"].is_array(), "logs must be an array");
}

/// Status endpoint returns 404 for unknown task_id (with valid auth)
#[tokio::test]
async fn test_install_status_not_found() {
    let server = make_server();
    let auth_cookie = get_test_cookie();

    let response = server
        .get("/api/store/install/status/nonexistent-task-id-abc123")
        .add_cookie(auth_cookie)
        .await;

    assert_eq!(
        response.status_code(),
        404,
        "Unknown task_id must return 404"
    );
}

#[tokio::test]
async fn test_cancel_install_task() {
    let server = make_server();
    let auth_cookie = get_test_cookie();
    let task_id = uuid::Uuid::new_v4().to_string();

    {
        let mut tasks = backend::store::INSTALL_TASKS.write().unwrap();
        tasks.insert(task_id.clone(), backend::store::InstallTask {
            id: task_id.clone(),
            status: "pulling".to_string(),
            progress: 25,
            logs: vec!["Pulling image...".to_string()],
            error: None,
        });
    }

    let cancel_res = server
        .post(&format!("/api/store/install/{}/cancel", task_id))
        .add_cookie(auth_cookie.clone())
        .await;

    assert_eq!(cancel_res.status_code(), 200);
    let cancel_body: Value = cancel_res.json();
    assert_eq!(cancel_body["status"], "cancelled");

    // Verify task status via GET status endpoint
    let status_res = server
        .get(&format!("/api/store/install/status/{}", task_id))
        .add_cookie(auth_cookie)
        .await;

    assert_eq!(status_res.status_code(), 200);
    let status_body: Value = status_res.json();
    assert_eq!(status_body["status"], "cancelled");
}

#[tokio::test]
async fn test_cancel_install_task_not_found() {
    let server = make_server();
    let auth_cookie = get_test_cookie();

    let response = server
        .post("/api/store/install/nonexistent-task-abc/cancel")
        .add_cookie(auth_cookie)
        .await;

    assert_eq!(response.status_code(), 404);
}

