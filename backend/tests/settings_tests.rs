use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use tower::ServiceExt;
use http_body_util::BodyExt;

fn get_valid_token() -> String {
    use jsonwebtoken::{encode, Header, EncodingKey};
    let claims = backend::auth::Claims {
        sub: "admin".to_owned(),
        exp: 10000000000,
        role: "admin".to_string(),
        uid: None,
        sid: None,
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(backend::auth::get_jwt_secret()),
    ).unwrap()
}

#[tokio::test]
async fn test_settings_unauthenticated_rejected() {
    let app = backend::app();

    let endpoints = vec![
        ("GET", "/api/system/settings"),
        ("POST", "/api/system/settings"),
        ("POST", "/api/system/settings/check-port"),
    ];

    for (method, uri) in endpoints {
        let response = app.clone()
            .oneshot(
                Request::builder()
                    .method(method)
                    .uri(uri)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(
            response.status(),
            StatusCode::UNAUTHORIZED,
            "Expected 401 for unauthenticated request to {} {}",
            method,
            uri
        );
    }
}

#[tokio::test]
async fn test_get_and_update_settings() {
    let app = backend::app();
    let token = get_valid_token();

    // 1. Authenticated GET /api/system/settings
    let response = app.clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/system/settings")
                .header("Cookie", format!("auth_token={}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let settings: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert!(settings.get("port").is_some());
    assert!(settings.get("server_name").is_some());
    assert!(settings.get("integrations").is_some());

    // 2. Authenticated POST /api/system/settings
    let update_res = app.clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/system/settings")
                .header("Cookie", format!("auth_token={}", token))
                .header("Content-Type", "application/json")
                .body(Body::from(serde_json::json!({
                    "server_name": "Test HomeLab",
                    "port": 5172,
                    "default_page": "/containers",
                    "metrics_refresh_rate": 2,
                    "show_weather_card": true,
                    "weather_city": "São Paulo, SP",
                    "confirm_dangerous_actions": true,
                    "integrations": {
                        "homeassistant": true,
                        "pihole": false
                    }
                }).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(update_res.status(), StatusCode::OK);
    let update_body = update_res.into_body().collect().await.unwrap().to_bytes();
    let updated: serde_json::Value = serde_json::from_slice(&update_body).unwrap();
    assert_eq!(updated.get("server_name").and_then(|v| v.as_str()), Some("Test HomeLab"));
    assert_eq!(updated.get("weather_city").and_then(|v| v.as_str()), Some("São Paulo, SP"));
    assert_eq!(
        updated.get("integrations").and_then(|i| i.get("pihole")).and_then(|v| v.as_bool()),
        Some(false)
    );

    // 3. Port check endpoint
    let check_port_res = app.clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/system/settings/check-port")
                .header("Cookie", format!("auth_token={}", token))
                .header("Content-Type", "application/json")
                .body(Body::from(serde_json::json!({
                    "port": 5172
                }).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(check_port_res.status(), StatusCode::OK);
    let check_body = check_port_res.into_body().collect().await.unwrap().to_bytes();
    let port_info: serde_json::Value = serde_json::from_slice(&check_body).unwrap();
    assert!(port_info.get("in_use").is_some());
}
