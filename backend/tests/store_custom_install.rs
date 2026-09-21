use axum_test::TestServer;
use backend::app;
use serde_json::json;
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
async fn test_custom_install_and_progress() {
    unsafe { std::env::set_var("JWT_SECRET", "super_secret"); }
    let server = TestServer::new(app());

    let auth_cookie = get_test_cookie();
    
    // 1. GET /api/store/apps to find first app id
    let response = server.get("/api/store/apps")
        .add_cookie(auth_cookie.clone())
        .await;
    response.assert_status_ok();
    
    let apps: serde_json::Value = response.json();
    let first_app_id = apps.as_array()
        .expect("Expected JSON array")
        .get(0)
        .expect("Expected at least one app in the store")
        .get("id")
        .expect("Expected app to have an id")
        .as_str()
        .expect("Expected id to be a string");
        
    // 2. POST /api/store/install/custom/:id
    let custom_payload = json!({
        "env": {
            "TZ": "America/Sao_Paulo",
            "PUID": "1001"
        },
        "ports": [
            { "host": 8080, "container": 80, "protocol": "tcp" }
        ],
        "volumes": [
            { "host": "/DATA/AppData/test", "container": "/config" }
        ]
    });
    
    let install_response = server.post(&format!("/api/store/install/custom/{}", first_app_id))
        .add_cookie(auth_cookie.clone())
        .json(&custom_payload)
        .await;
        
    // Should be Accepted (202) for background processing
    install_response.assert_status(reqwest::StatusCode::ACCEPTED);
    
    let task_response: serde_json::Value = install_response.json();
    let task_id = task_response.get("task_id")
        .expect("Expected task_id in response")
        .as_str()
        .expect("Task id should be string");
        
    // 3. GET /api/store/install/status/:task_id
    let status_response = server.get(&format!("/api/store/install/status/{}", task_id))
        .add_cookie(auth_cookie.clone())
        .await;
        
    status_response.assert_status_ok();
    let status: serde_json::Value = status_response.json();
    
    assert!(status.get("status").is_some(), "Expected status field");
    assert!(status.get("progress").is_some(), "Expected progress field");

    // 4. GET /api/store/apps/:id/config
    let config_response = server.get(&format!("/api/store/apps/{}/config", first_app_id))
        .add_cookie(auth_cookie.clone())
        .await;
    config_response.assert_status_ok();
    let config: serde_json::Value = config_response.json();
    assert_eq!(config.get("id").unwrap().as_str().unwrap(), first_app_id);
    assert!(config.get("ports").is_some());
    assert!(config.get("volumes").is_some());
    assert!(config.get("env").is_some());
}

#[test]
fn test_apply_custom_config_logic() {
    use backend::store::installer::apply_custom_config;
    use backend::store::types::{CustomInstallPayload, PortMapping, VolumeMapping};
    use std::collections::HashMap;

    let raw_compose = r#"
version: '3'
services:
  web:
    image: nginx:alpine
    ports:
      - 8080:80
    volumes:
      - /DATA/AppData/$AppID/config:/config
"#;

    let mut env = HashMap::new();
    env.insert("TZ".to_string(), "America/Sao_Paulo".to_string());
    env.insert("PUID".to_string(), "1002".to_string());

    let payload = CustomInstallPayload {
        ports: Some(vec![PortMapping {
            host: 9090,
            container: 80,
            protocol: "tcp".to_string(),
        }]),
        volumes: Some(vec![VolumeMapping {
            host: "/custom/path".to_string(),
            container: "/config".to_string(),
        }]),
        env: Some(env),
    };

    let (compose, env_str) = apply_custom_config(raw_compose, &payload, "my-app");
    assert!(compose.contains("9090:80"));
    assert!(compose.contains("/custom/path:/config"));
    assert!(env_str.contains("AppID=my-app"));
    assert!(env_str.contains("PUID=1002"));
    assert!(env_str.contains("TZ=America/Sao_Paulo"));
}
