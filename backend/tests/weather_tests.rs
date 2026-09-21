use axum_test::TestServer;
use backend::app;
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
async fn test_weather_endpoint_returns_json() {
    unsafe { std::env::set_var("JWT_SECRET", "super_secret"); }
    let server = TestServer::new(app());
    let cookie = get_test_cookie();

    let response = server
        .get("/api/system/weather?lat=-23.5505&lon=-46.6333&city=Sao%20Paulo")
        .add_cookie(cookie)
        .await;

    response.assert_status_ok();
    let json = response.json::<serde_json::Value>();

    assert!(json.get("temperature_c").is_some());
    assert!(json.get("humidity").is_some());
    assert!(json.get("condition_text").is_some());
    assert!(json.get("aqi").is_some());
    assert!(json.get("aqi_label").is_some());
    assert_eq!(json["location_name"].as_str().unwrap(), "Sao Paulo");
}
