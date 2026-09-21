use axum_test::TestServer;
use backend::app;
use jsonwebtoken::{encode, Header, EncodingKey};
use backend::auth::Claims;
use serde_json::json;
use std::fs;
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
async fn test_compose_stacks_api() {
    unsafe { std::env::set_var("JWT_SECRET", "super_secret"); }
    let server = TestServer::new(app());
    let auth_cookie = get_test_cookie();

    // 1. Save new stack
    let valid_yaml = "version: '3'\nservices:\n  redis:\n    image: redis:alpine\n    ports:\n      - \"6379:6379\"\n";
    let save_res = server
        .post("/api/docker/compose/save")
        .add_cookie(auth_cookie.clone())
        .json(&json!({
            "name": "test-redis-stack",
            "compose_yaml": valid_yaml,
            "env_content": "REDIS_PORT=6379\n"
        }))
        .await;

    save_res.assert_status_ok();

    // 2. Reject invalid YAML
    let bad_save = server
        .post("/api/docker/compose/save")
        .add_cookie(auth_cookie.clone())
        .json(&json!({
            "name": "bad-stack",
            "compose_yaml": "services: [invalid yaml syntax::: ",
            "env_content": null
        }))
        .await;
    bad_save.assert_status_bad_request();

    // 3. List stacks
    let list_res = server
        .get("/api/docker/compose/stacks")
        .add_cookie(auth_cookie.clone())
        .await;
    list_res.assert_status_ok();
    let stacks: Vec<serde_json::Value> = list_res.json();
    assert!(stacks.iter().any(|s| s.get("name").unwrap().as_str().unwrap() == "test-redis-stack"));

    // 4. Get stack details
    let get_res = server
        .get("/api/docker/compose/stacks/test-redis-stack")
        .add_cookie(auth_cookie.clone())
        .await;
    get_res.assert_status_ok();
    let detail: serde_json::Value = get_res.json();
    assert!(detail.get("compose_yaml").unwrap().as_str().unwrap().contains("redis:alpine"));
    assert!(detail.get("env_content").unwrap().as_str().unwrap().contains("REDIS_PORT=6379"));

    // Clean up
    let _ = fs::remove_dir_all("data/apps/test-redis-stack");
}
