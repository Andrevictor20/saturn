use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use tower::ServiceExt;
use http_body_util::BodyExt;
use serde_json::Value;

fn get_admin_token() -> String {
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
async fn test_customization_public_get_and_protected_post() {
    let app = backend::app();

    // 1. Unauthenticated GET /api/system/customization must be 200 OK (Public for login screen & device consistency)
    let get_res = app.clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/system/customization")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(
        get_res.status(),
        StatusCode::OK,
        "GET /api/system/customization must be public and return 200 OK"
    );

    let body_bytes = get_res.into_body().collect().await.unwrap().to_bytes();
    let body_json: Value = serde_json::from_slice(&body_bytes).expect("Response must be valid JSON");
    assert!(body_json.get("theme").is_some(), "Must contain theme");
    assert!(body_json.get("color").is_some(), "Must contain color");

    // 2. Unauthenticated POST /api/system/customization must be 401 UNAUTHORIZED
    let post_unauth = app.clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/system/customization")
                .header("Content-Type", "application/json")
                .body(Body::from(r#"{"theme":"light","color":"rose","wallpaper_url":"https://example.com/wp.jpg","wallpaper_opacity":0.9,"wallpaper_blur":5}"#))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(
        post_unauth.status(),
        StatusCode::UNAUTHORIZED,
        "POST /api/system/customization without authentication must be rejected with 401"
    );

    // 3. Authenticated Admin POST /api/system/customization must succeed
    let admin_token = get_admin_token();
    let post_admin = app.clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/system/customization")
                .header("Content-Type", "application/json")
                .header("Authorization", format!("Bearer {}", admin_token))
                .body(Body::from(r#"{"theme":"oled","color":"dracula","wallpaper_url":"https://example.com/wp2.jpg","wallpaper_opacity":0.75,"wallpaper_blur":8}"#))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(
        post_admin.status(),
        StatusCode::OK,
        "Admin POST /api/system/customization must return 200 OK"
    );

    // 4. Subsequent unauthenticated GET must return the newly updated customization
    let get_after = app.clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/system/customization")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(get_after.status(), StatusCode::OK);
    let after_bytes = get_after.into_body().collect().await.unwrap().to_bytes();
    let after_json: Value = serde_json::from_slice(&after_bytes).unwrap();

    assert_eq!(after_json.get("theme").and_then(|v| v.as_str()), Some("oled"));
    assert_eq!(after_json.get("color").and_then(|v| v.as_str()), Some("dracula"));
    assert_eq!(after_json.get("wallpaper_url").and_then(|v| v.as_str()), Some("https://example.com/wp2.jpg"));
    assert_eq!(after_json.get("wallpaper_blur").and_then(|v| v.as_u64()), Some(8));
}
