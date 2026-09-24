use axum_test::TestServer;
use backend::app;
use jsonwebtoken::{encode, Header, EncodingKey};
use backend::auth::Claims;
use serde_json::json;
use std::time::{SystemTime, UNIX_EPOCH, Duration};
use std::fs;

fn get_test_token() -> String {
    let expiration = (SystemTime::now() + Duration::from_secs(3600))
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
    
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(b"super_secret".as_slice()),
    ).unwrap()
}

fn get_test_cookie() -> axum_extra::extract::cookie::Cookie<'static> {
    axum_extra::extract::cookie::Cookie::new("auth_token", get_test_token())
}

fn setup_test_sandbox() -> std::path::PathBuf {
    let sandbox = std::env::temp_dir().join(format!("saturn_occ_fs_{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&sandbox).unwrap();
    fs::write(sandbox.join("app.conf"), "INITIAL_VERSION=1.0\nFEATURE_X=false\n").unwrap();
    sandbox
}

#[tokio::test]
async fn test_etag_returned_on_get_file_content() {
    unsafe { std::env::set_var("JWT_SECRET", "super_secret"); }
    let sandbox = setup_test_sandbox();
    let file_path = sandbox.join("app.conf");
    let file_path_str = file_path.to_str().unwrap();

    let server = TestServer::new(app());
    let cookie = get_test_cookie();

    let res = server.get(&format!("/api/files/content?path={}", file_path_str))
        .add_cookie(cookie.clone())
        .await;

    res.assert_status_ok();

    // Check ETag header and JSON field
    let etag_header = res.header("etag");
    assert!(!etag_header.is_empty(), "ETag header must be present on GET /api/files/content");

    let json_body: serde_json::Value = res.json();
    let etag_field = json_body.get("etag").and_then(|v| v.as_str()).unwrap_or("");
    assert!(!etag_field.is_empty(), "etag field must be present in JSON response");
    assert_eq!(etag_header, etag_field, "Header ETag and JSON etag field must match");

    let _ = fs::remove_dir_all(&sandbox);
}

#[tokio::test]
async fn test_put_with_matching_etag_succeeds_and_updates_etag() {
    unsafe { std::env::set_var("JWT_SECRET", "super_secret"); }
    let sandbox = setup_test_sandbox();
    let file_path = sandbox.join("app.conf");
    let file_path_str = file_path.to_str().unwrap();

    let server = TestServer::new(app());
    let cookie = get_test_cookie();

    // 1. Initial read
    let get_res = server.get(&format!("/api/files/content?path={}", file_path_str))
        .add_cookie(cookie.clone())
        .await;
    get_res.assert_status_ok();
    let initial_json: serde_json::Value = get_res.json();
    let initial_etag = initial_json.get("etag").and_then(|v| v.as_str()).unwrap().to_string();

    // 2. Put with matching ETag in If-Match header and body
    let put_res = server.put("/api/files/content")
        .add_cookie(cookie.clone())
        .add_header("if-match", &initial_etag)
        .json(&json!({
            "path": file_path_str,
            "content": "INITIAL_VERSION=1.1\nFEATURE_X=true\n",
            "etag": initial_etag
        }))
        .await;

    put_res.assert_status_ok();
    let put_json: serde_json::Value = put_res.json();
    assert_eq!(put_json.get("success").and_then(|v| v.as_bool()), Some(true));
    
    let new_etag = put_json.get("new_etag").and_then(|v| v.as_str()).unwrap_or("");
    assert!(!new_etag.is_empty(), "new_etag should be returned in put response");
    assert_ne!(new_etag, initial_etag, "new_etag must differ from initial_etag after modification");

    // 3. Verify content on disk
    let disk_content = fs::read_to_string(&file_path).unwrap();
    assert_eq!(disk_content, "INITIAL_VERSION=1.1\nFEATURE_X=true\n");

    let _ = fs::remove_dir_all(&sandbox);
}

#[tokio::test]
async fn test_put_with_stale_etag_returns_412_precondition_failed() {
    unsafe { std::env::set_var("JWT_SECRET", "super_secret"); }
    let sandbox = setup_test_sandbox();
    let file_path = sandbox.join("app.conf");
    let file_path_str = file_path.to_str().unwrap();

    let server = TestServer::new(app());
    let cookie = get_test_cookie();

    // 1. Alice reads
    let alice_get = server.get(&format!("/api/files/content?path={}", file_path_str))
        .add_cookie(cookie.clone())
        .await;
    alice_get.assert_status_ok();
    let alice_etag = alice_get.json::<serde_json::Value>()["etag"].as_str().unwrap().to_string();

    // 2. Bob reads (same etag)
    let bob_etag = alice_etag.clone();

    // 3. Bob saves first
    let bob_put = server.put("/api/files/content")
        .add_cookie(cookie.clone())
        .add_header("if-match", &bob_etag)
        .json(&json!({
            "path": file_path_str,
            "content": "BOB_EDIT=true\n",
            "etag": bob_etag
        }))
        .await;
    bob_put.assert_status_ok();

    // 4. Alice tries to save with stale etag
    let alice_put = server.put("/api/files/content")
        .add_cookie(cookie.clone())
        .add_header("if-match", &alice_etag)
        .json(&json!({
            "path": file_path_str,
            "content": "ALICE_EDIT=true\n",
            "etag": alice_etag
        }))
        .await;

    // HTTP 412 Precondition Failed
    assert_eq!(alice_put.status_code(), 412);
    let conflict_json: serde_json::Value = alice_put.json();
    assert_eq!(conflict_json.get("error").and_then(|v| v.as_str()), Some("Conflict"));
    assert_eq!(conflict_json.get("current_content").and_then(|v| v.as_str()), Some("BOB_EDIT=true\n"));
    assert!(conflict_json.get("current_etag").is_some());

    // 5. Disk content is still Bob's
    let current_disk = fs::read_to_string(&file_path).unwrap();
    assert_eq!(current_disk, "BOB_EDIT=true\n");

    // 6. Alice chooses to force overwrite
    let force_put = server.put("/api/files/content")
        .add_cookie(cookie.clone())
        .json(&json!({
            "path": file_path_str,
            "content": "ALICE_EDIT=true\n",
            "force": true
        }))
        .await;
    force_put.assert_status_ok();

    let final_disk = fs::read_to_string(&file_path).unwrap();
    assert_eq!(final_disk, "ALICE_EDIT=true\n");

    let _ = fs::remove_dir_all(&sandbox);
}
