use axum_test::TestServer;
use backend::app;
use backend::auth::Claims;
use backend::files::types::{SubtitleFormat, SubtitleItem, SubtitlesResponse};
use jsonwebtoken::{encode, EncodingKey, Header};
use std::fs;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

fn get_test_token() -> String {
    let expiration = (SystemTime::now() + Duration::from_secs(3600))
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

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(b"super_secret".as_slice()),
    )
    .unwrap()
}

fn setup_test_sandbox() -> std::path::PathBuf {
    let sandbox = std::env::temp_dir().join(format!("saturn_sub_raw_test_{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&sandbox).unwrap();
    fs::create_dir_all(sandbox.join("movies")).unwrap();

    // Create dummy video and companion subtitles
    fs::write(sandbox.join("movies/film.mkv"), "fake mkv matroska container data").unwrap();
    fs::write(
        sandbox.join("movies/film.srt"),
        "1\n00:00:01,000 --> 00:00:04,000\nHello World Subtitle",
    )
    .unwrap();
    fs::write(
        sandbox.join("movies/film.ass"),
        "[Script Info]\nTitle: Test Subtitle\n\n[Events]\nDialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,{\\b1}Styled ASS Subtitle{\\b0}",
    )
    .unwrap();
    fs::write(
        sandbox.join("movies/film.sup"),
        b"PG\x00\x00\x00\x01fake_pgs_bitmap_data",
    )
    .unwrap();

    sandbox
}

#[test]
fn test_subtitle_format_serialization_and_defaults() {
    let raw_legacy_json = r#"{
        "name": "film.srt",
        "path": "/data/movies/film.srt",
        "label": "English",
        "lang": "en"
    }"#;

    let parsed: SubtitleItem = serde_json::from_str(raw_legacy_json).expect("Must deserialize legacy format");
    assert_eq!(parsed.format, SubtitleFormat::Vtt);
    assert!(!parsed.is_bitmap);

    let modern_ass = SubtitleItem {
        name: "film.ass".to_string(),
        path: "/data/movies/film.ass".to_string(),
        label: "Japanese [Styled]".to_string(),
        lang: "ja".to_string(),
        format: SubtitleFormat::Ass,
        is_bitmap: false,
    };

    let serialized = serde_json::to_string(&modern_ass).expect("Must serialize");
    assert!(serialized.contains(r#""format":"ass""#));
    assert!(serialized.contains(r#""is_bitmap":false"#));

    let modern_pgs = SubtitleItem {
        name: "film.sup".to_string(),
        path: "/data/movies/film.sup".to_string(),
        label: "Portuguese (PGS)".to_string(),
        lang: "pt-BR".to_string(),
        format: SubtitleFormat::Pgs,
        is_bitmap: true,
    };

    let serialized_pgs = serde_json::to_string(&modern_pgs).expect("Must serialize");
    assert!(serialized_pgs.contains(r#""format":"pgs""#));
    assert!(serialized_pgs.contains(r#""is_bitmap":true"#));
}

#[tokio::test]
async fn test_subtitles_format_detection_in_list() {
    unsafe {
        std::env::set_var("JWT_SECRET", "super_secret");
    }
    let sandbox = setup_test_sandbox();
    let sandbox_str = sandbox.to_str().unwrap();
    let token = get_test_token();

    let app = app();
    let server = TestServer::new(app);

    let res = server
        .get(&format!(
            "/api/files/subtitles?path={}/movies/film.mkv&token={}",
            sandbox_str, token
        ))
        .await;

    res.assert_status_ok();
    let body: SubtitlesResponse = res.json();
    assert!(body.subtitles.len() >= 3);

    let ass_sub = body.subtitles.iter().find(|s| s.path.ends_with(".ass"));
    assert!(ass_sub.is_some(), "Must detect companion .ass subtitle");
    assert_eq!(ass_sub.unwrap().format, SubtitleFormat::Ass);
    assert!(!ass_sub.unwrap().is_bitmap);

    let srt_sub = body.subtitles.iter().find(|s| s.path.ends_with(".srt"));
    assert!(srt_sub.is_some(), "Must detect companion .srt subtitle");
    assert_eq!(srt_sub.unwrap().format, SubtitleFormat::Vtt);

    let sup_sub = body.subtitles.iter().find(|s| s.path.ends_with(".sup"));
    assert!(sup_sub.is_some(), "Must detect companion .sup PGS subtitle");
    assert_eq!(sup_sub.unwrap().format, SubtitleFormat::Pgs);
    assert!(sup_sub.unwrap().is_bitmap);

    let _ = fs::remove_dir_all(sandbox);
}

#[tokio::test]
async fn test_get_raw_subtitle_endpoint() {
    unsafe {
        std::env::set_var("JWT_SECRET", "super_secret");
    }
    let sandbox = setup_test_sandbox();
    let sandbox_str = sandbox.to_str().unwrap();
    let token = get_test_token();

    let app = app();
    let server = TestServer::new(app);

    // 1. Fetch external ASS raw subtitle
    let ass_path = format!("{}/movies/film.ass", sandbox_str);
    let res = server
        .get(&format!(
            "/api/files/subtitles/raw?path={}&format=ass&token={}",
            ass_path, token
        ))
        .await;

    res.assert_status_ok();
    let content_type = res.header("content-type");
    assert!(
        content_type.to_str().unwrap().contains("text/x-ssa")
            || content_type.to_str().unwrap().contains("text/plain")
            || content_type.to_str().unwrap().contains("utf-8")
    );
    let text = res.text();
    assert!(text.contains("Styled ASS Subtitle"));

    // 2. Fetch external PGS (.sup) raw subtitle
    let sup_path = format!("{}/movies/film.sup", sandbox_str);
    let res_pgs = server
        .get(&format!(
            "/api/files/subtitles/raw?path={}&format=pgs&token={}",
            sup_path, token
        ))
        .await;

    res_pgs.assert_status_ok();
    assert_eq!(
        res_pgs.header("content-type").to_str().unwrap(),
        "application/octet-stream"
    );
    let bytes = res_pgs.as_bytes();
    assert!(bytes.starts_with(b"PG"));

    // 3. Security: Path Traversal check
    let res_traversal = server
        .get(&format!(
            "/api/files/subtitles/raw?path=../../etc/passwd&format=ass&token={}",
            token
        ))
        .await;
    assert!(
        res_traversal.status_code() == axum::http::StatusCode::BAD_REQUEST
            || res_traversal.status_code() == axum::http::StatusCode::NOT_FOUND
    );

    let _ = fs::remove_dir_all(sandbox);
}
