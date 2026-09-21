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
async fn test_docker_links_endpoints() {
    let app = backend::app();
    let token = get_valid_token();

    // GET should return 200 and an empty JSON object initially (or valid object)
    let response = app.clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/docker/links")
                .header("Cookie", format!("auth_token={}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    // POST a new link for a dummy container ID
    let body = serde_json::json!({
        "url": "https://example.com"
    }).to_string();

    let post_req = Request::builder()
        .method("POST")
        .uri("/api/docker/links/test-container-123")
        .header("Cookie", format!("auth_token={}", token))
        .header("Content-Type", "application/json")
        .body(Body::from(body))
        .unwrap();

    let post_res = app.clone().oneshot(post_req).await.unwrap();
    assert_eq!(post_res.status(), StatusCode::OK);

    // GET again to verify it was saved
    let get_again = app.oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/docker/links")
                .header("Cookie", format!("auth_token={}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(get_again.status(), StatusCode::OK);
    
    let res_body = get_again.into_body().collect().await.unwrap().to_bytes();
    let value: serde_json::Value = serde_json::from_slice(&res_body).unwrap();
    assert_eq!(value.get("test-container-123").unwrap().as_str().unwrap(), "https://example.com");
}
