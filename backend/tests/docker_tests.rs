use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use tower::ServiceExt;
use http_body_util::BodyExt; // For testing response bodies

// We need a helper to get a valid token to bypass auth.
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
async fn test_docker_containers_endpoint() {
    let app = backend::app();
    let token = get_valid_token();

    let response = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/docker/containers")
                .header("Cookie", format!("auth_token={}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    
    // Check if body is valid JSON array (or at least valid JSON)
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let value: serde_json::Value = serde_json::from_slice(&body).unwrap();
    
    // It should be an array of containers
    assert!(value.is_array(), "Response should be a JSON array of containers");
}

#[tokio::test]
async fn test_docker_check_updates_with_bearer_token() {
    let app = backend::app();
    let token = get_valid_token();

    let response = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/docker/containers/check-updates")
                .header("Authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let value: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert!(value.is_object(), "Response should be a JSON object mapping container IDs to update info");
}

#[test]
fn test_parse_image_ref_and_digests() {
    use backend::docker::updates::parse_image_ref;

    // Standard Docker Hub official
    let (reg, repo, tag) = parse_image_ref("nginx:latest");
    assert_eq!(reg, "registry-1.docker.io");
    assert_eq!(repo, "library/nginx");
    assert_eq!(tag, "latest");

    // Standard Docker Hub user repo
    let (reg, repo, tag) = parse_image_ref("linuxserver/nginx:1.2.3");
    assert_eq!(reg, "registry-1.docker.io");
    assert_eq!(repo, "linuxserver/nginx");
    assert_eq!(tag, "1.2.3");

    // GHCR
    let (reg, repo, tag) = parse_image_ref("ghcr.io/andrevictor20/saturn:latest");
    assert_eq!(reg, "ghcr.io");
    assert_eq!(repo, "andrevictor20/saturn");
    assert_eq!(tag, "latest");

    // LSCR (LinuxServer Registry)
    let (reg, repo, tag) = parse_image_ref("lscr.io/linuxserver/kavita:latest");
    assert_eq!(reg, "lscr.io");
    assert_eq!(repo, "linuxserver/kavita");
    assert_eq!(tag, "latest");

    // Pinned by sha256 digest with tag
    let (reg, repo, tag) = parse_image_ref("homeassistant/home-assistant:stable@sha256:0123456789abcdef");
    assert_eq!(reg, "registry-1.docker.io");
    assert_eq!(repo, "homeassistant/home-assistant");
    assert_eq!(tag, "stable");

    // Pinned by sha256 digest without tag
    let (reg, repo, tag) = parse_image_ref("redis@sha256:0123456789abcdef");
    assert_eq!(reg, "registry-1.docker.io");
    assert_eq!(repo, "library/redis");
    assert_eq!(tag, "latest");
}
