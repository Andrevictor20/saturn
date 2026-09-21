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
async fn test_homeassistant_config_endpoints() {
    let app = backend::app();
    let token = get_valid_token();

    // 1. Unauthenticated request should be rejected (401)
    let unauth_response = app.clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/homeassistant/config")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(unauth_response.status(), StatusCode::UNAUTHORIZED);

    // 2. Authenticated GET when not configured yet
    let response = app.clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/homeassistant/config")
                .header("Cookie", format!("auth_token={}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let config_val: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(config_val.get("configured").and_then(|v| v.as_bool()), Some(false));

    // 3. POST with invalid URL schema should return BAD_REQUEST
    let invalid_post = app.clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/homeassistant/config")
                .header("Cookie", format!("auth_token={}", token))
                .header("Content-Type", "application/json")
                .body(Body::from(serde_json::json!({
                    "url": "ftp://invalid-url",
                    "token": "test-token"
                }).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(invalid_post.status(), StatusCode::BAD_REQUEST);

    // 4. DELETE configuration endpoint
    let delete_response = app.clone()
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri("/api/homeassistant/config")
                .header("Cookie", format!("auth_token={}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(delete_response.status(), StatusCode::OK);
}
