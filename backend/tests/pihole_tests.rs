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
async fn test_pihole_unauthenticated_rejected() {
    let app = backend::app();

    let endpoints = vec![
        ("GET", "/api/pihole/config"),
        ("GET", "/api/pihole/stats"),
        ("POST", "/api/pihole/blocking"),
        ("GET", "/api/pihole/domains"),
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
async fn test_pihole_config_endpoints() {
    let app = backend::app();
    let token = get_valid_token();

    // 1. Authenticated GET when not configured
    let response = app.clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/pihole/config")
                .header("Cookie", format!("auth_token={}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let val: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert!(val.get("configured").is_some());

    // 2. POST with invalid URL (e.g. ftp:// or bad format)
    let invalid_post = app.clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/pihole/config")
                .header("Cookie", format!("auth_token={}", token))
                .header("Content-Type", "application/json")
                .body(Body::from(serde_json::json!({
                    "url": "ftp://my-pihole.local",
                    "token": "some-token"
                }).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(invalid_post.status(), StatusCode::BAD_REQUEST);

    // 3. DELETE configuration endpoint
    let delete_response = app.clone()
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri("/api/pihole/config")
                .header("Cookie", format!("auth_token={}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(delete_response.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_pihole_stats_and_blocking_when_unconfigured() {
    let app = backend::app();
    let token = get_valid_token();

    // Ensure deleted
    let _ = app.clone()
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri("/api/pihole/config")
                .header("Cookie", format!("auth_token={}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    // GET /api/pihole/stats when unconfigured should return 400 Bad Request
    let stats_res = app.clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/pihole/stats")
                .header("Cookie", format!("auth_token={}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(stats_res.status(), StatusCode::BAD_REQUEST);

    // POST /api/pihole/blocking when unconfigured should return 400 Bad Request
    let block_res = app.clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/pihole/blocking")
                .header("Cookie", format!("auth_token={}", token))
                .header("Content-Type", "application/json")
                .body(Body::from(serde_json::json!({
                    "enable": true
                }).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(block_res.status(), StatusCode::BAD_REQUEST);

    // GET /api/pihole/domains when unconfigured should return 400 Bad Request
    let domains_res = app.clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/pihole/domains")
                .header("Cookie", format!("auth_token={}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(domains_res.status(), StatusCode::BAD_REQUEST);
}

#[test]
fn test_clean_pihole_url_sanitization() {
    use backend::pihole::clean_pihole_url;

    // Standard valid URLs
    assert_eq!(
        clean_pihole_url("http://pi.hole").unwrap(),
        "http://pi.hole"
    );
    assert_eq!(
        clean_pihole_url("http://192.168.1.100:8080/").unwrap(),
        "http://192.168.1.100:8080"
    );
    assert_eq!(
        clean_pihole_url("https://pihole.local/").unwrap(),
        "https://pihole.local"
    );

    // v5 admin path trimming
    assert_eq!(
        clean_pihole_url("http://pi.hole/admin").unwrap(),
        "http://pi.hole"
    );
    assert_eq!(
        clean_pihole_url("http://pi.hole/admin/").unwrap(),
        "http://pi.hole"
    );
    assert_eq!(
        clean_pihole_url("http://pi.hole/admin/api.php").unwrap(),
        "http://pi.hole"
    );

    // v6 api path trimming
    assert_eq!(
        clean_pihole_url("http://pi.hole/api").unwrap(),
        "http://pi.hole"
    );
    assert_eq!(
        clean_pihole_url("http://pi.hole/api/").unwrap(),
        "http://pi.hole"
    );

    // Invalid protocol
    assert!(clean_pihole_url("ftp://pi.hole").is_err());
    assert!(clean_pihole_url("pi.hole").is_err());
    assert!(clean_pihole_url("").is_err());
}

#[test]
fn test_pihole_parsers_domain_maps() {
    use backend::pihole::parsers::{parse_domain_map, extract_top_domains_from_v6};
    use serde_json::json;

    // 1. Object format
    let obj = json!({
        "google.com": 120,
        "github.com": 85
    });
    let parsed_obj = parse_domain_map(&obj);
    assert_eq!(parsed_obj.get("google.com"), Some(&120));
    assert_eq!(parsed_obj.get("github.com"), Some(&85));

    // 2. Array format with objects
    let arr = json!([
        { "domain": "apple.com", "count": 200 },
        { "name": "amazon.com", "hits": 150 }
    ]);
    let parsed_arr = parse_domain_map(&arr);
    assert_eq!(parsed_arr.get("apple.com"), Some(&200));
    assert_eq!(parsed_arr.get("amazon.com"), Some(&150));

    // 3. Combined v6 top_domains format
    let combined_v6 = json!({
        "top_queries": {
            "google.com": 500,
            "saturn.home": 300
        },
        "top_ads": {
            "telemetry.ms.com": 90,
            "adservice.google.com": 60
        }
    });
    let (queries, ads) = extract_top_domains_from_v6(&combined_v6);
    assert_eq!(queries.get("google.com"), Some(&500));
    assert_eq!(ads.get("telemetry.ms.com"), Some(&90));

    // 4. v6 array format under "domains" with blocked flag
    let array_v6 = json!({
        "domains": [
            { "domain": "clean.com", "count": 40, "blocked": false },
            { "domain": "malicious.ad", "count": 70, "blocked": true }
        ]
    });
    let (queries2, ads2) = extract_top_domains_from_v6(&array_v6);
    assert_eq!(queries2.get("clean.com"), Some(&40));
    assert_eq!(ads2.get("malicious.ad"), Some(&70));
}

#[test]
fn test_pihole_parsers_clients_and_upstreams() {
    use backend::pihole::parsers::{parse_clients_list, parse_upstreams, parse_query_types, parse_recent_queries};
    use serde_json::json;

    // 1. Top clients parsing
    let clients_raw = json!({
        "top_sources": {
            "192.168.1.50|MacBook-Pro": 1000,
            "192.168.1.100": 500
        }
    });
    let clients = parse_clients_list(&clients_raw, 2000);
    assert_eq!(clients.len(), 2);
    assert_eq!(clients[0].ip, "192.168.1.50");
    assert_eq!(clients[0].name, "MacBook-Pro");
    assert_eq!(clients[0].count, 1000);
    assert_eq!(clients[0].percentage, 50.0);

    // 2. Upstreams parsing (v5 forward_destinations object)
    let upstreams_v5 = json!({
        "forward_destinations": {
            "1.1.1.1#53|one.one.one.one": 80.0,
            "8.8.8.8#53": 20.0
        }
    });
    let upstreams = parse_upstreams(&upstreams_v5);
    assert_eq!(upstreams.len(), 2);
    assert_eq!(upstreams[0].destination, "1.1.1.1");
    assert_eq!(upstreams[0].percentage, 80.0);

    // 3. Upstreams parsing (v6 upstreams array)
    let upstreams_v6 = json!({
        "upstreams": [
            { "ip": "1.1.1.1", "name": "Cloudflare", "count": 800, "percentage": 75.0 },
            { "ip": "9.9.9.9", "name": "Quad9", "count": 200, "percentage": 25.0 }
        ]
    });
    let upstreams_list = parse_upstreams(&upstreams_v6);
    assert_eq!(upstreams_list.len(), 2);
    assert_eq!(upstreams_list[0].destination, "1.1.1.1");
    assert_eq!(upstreams_list[0].count, 800);

    // 4. Query types parsing
    let qtypes_data = json!({
        "querytypes": {
            "A (IPv4)": 1500,
            "AAAA (IPv6)": 500,
            "HTTPS": 250
        }
    });
    let qtypes = parse_query_types(&qtypes_data);
    assert_eq!(qtypes.get("A"), Some(&1500));
    assert_eq!(qtypes.get("AAAA"), Some(&500));
    assert_eq!(qtypes.get("HTTPS"), Some(&250));

    // 5. Recent queries parsing
    let queries_v6 = json!({
        "queries": [
            {
                "time": 1726000000,
                "type": "A",
                "domain": "google.com",
                "client": "192.168.1.50",
                "status": "FORWARDED",
                "reply": "142.250.190.46"
            },
            {
                "time": 1726000005,
                "type": "AAAA",
                "domain": "tracker.ad",
                "client": "192.168.1.100",
                "status": "BLOCKED"
            }
        ]
    });
    let recent = parse_recent_queries(&queries_v6);
    assert_eq!(recent.len(), 2);
    assert_eq!(recent[0].domain, "google.com");
    assert_eq!(recent[0].status, "forwarded");
    assert_eq!(recent[1].domain, "tracker.ad");
    assert_eq!(recent[1].status, "blocked");
}


