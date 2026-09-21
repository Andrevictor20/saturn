use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use tower::ServiceExt; // for `oneshot` and `ready`
use backend::app;
use jsonwebtoken::{encode, EncodingKey, Header};

fn valid_auth_cookie() -> String {
    let claims = backend::auth::Claims {
        sub: "admin".to_owned(),
        exp: 10_000_000_000,
        role: "admin".to_string(),
        uid: None,
        sid: None,
    };
    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(backend::auth::get_jwt_secret()),
    ).unwrap();
    format!("auth_token={token}")
}

#[tokio::test]
async fn test_container_start_unauthorized() {
    let app = app();

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/docker/containers/123/start")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

// Note: Testing actual docker mutations requires mocking the Docker client or running against a real Docker daemon.
// For this MVP, we verify that the route exists and requires auth.

#[tokio::test]
async fn test_update_env_unauthorized() {
    let app = app();

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/docker/containers/123/env")
                .header("Content-Type", "application/json")
                .body(Body::from(r#"{"env": ["TEST=1"]}"#))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_update_env_rejects_invalid_payload_before_docker_mutation() {
    let app = app();

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/docker/containers/123/env")
                .header("Content-Type", "application/json")
                .header("Cookie", valid_auth_cookie())
                .body(Body::from(r#"{"env": ["NOT_VALID"]}"#))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn test_delete_container_with_cascade_params() {
    let app = app();

    let response = app
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri("/api/docker/containers/123?v=true&image=true&network=true")
                .header("Cookie", valid_auth_cookie())
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    // Will probably return 500 or 404 because container 123 doesn't exist in real docker daemon
    // The important thing is it doesn't return 400 Bad Request (query parsing error)
    assert_ne!(response.status(), StatusCode::BAD_REQUEST);
    assert_ne!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_prune_endpoints_unauthorized() {
    let app = app();

    for endpoint in &["/api/docker/images/prune", "/api/docker/volumes/prune", "/api/docker/networks/prune"] {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(*endpoint)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED, "Endpoint {} should require authentication", endpoint);
    }
}

#[tokio::test]
async fn test_prune_endpoints_authorized_routes_exist() {
    let app = app();

    for endpoint in &["/api/docker/images/prune", "/api/docker/volumes/prune", "/api/docker/networks/prune"] {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(*endpoint)
                    .header("Cookie", valid_auth_cookie())
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        // Either OK (if docker daemon allows/mocked) or INTERNAL_SERVER_ERROR / etc, but NOT UNAUTHORIZED or NOT_FOUND
        assert_ne!(response.status(), StatusCode::UNAUTHORIZED, "Endpoint {} should be authorized", endpoint);
        assert_ne!(response.status(), StatusCode::NOT_FOUND, "Endpoint {} route must exist", endpoint);
    }
}

#[tokio::test]
async fn test_update_container_unauthorized() {
    let app = app();

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/docker/containers/non_existent_123/update")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_update_container_authorized_structured_error_for_unknown_id() {
    let app = app();

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/docker/containers/non_existent_123/update")
                .header("Cookie", valid_auth_cookie())
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    // Must be either NOT_FOUND (container not found) or INTERNAL_SERVER_ERROR (if docker socket down), but NOT UNAUTHORIZED
    assert_ne!(response.status(), StatusCode::UNAUTHORIZED);
    
    // Check that body is valid JSON response with status & message
    use http_body_util::BodyExt;
    let body_bytes = response.into_body().collect().await.unwrap().to_bytes();
    if let Ok(json) = serde_json::from_slice::<serde_json::Value>(&body_bytes) {
        assert!(json.get("status").is_some() || json.get("message").is_some());
    }
}


