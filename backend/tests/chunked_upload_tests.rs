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
async fn test_chunked_upload_status_and_complete() {
    unsafe { std::env::set_var("JWT_SECRET", "super_secret"); }
    let server = TestServer::new(app());
    let cookie = get_test_cookie();

    let upload_id = "test-upload-session-123";

    // 1. Check upload status for new session
    let response = server
        .get(&format!("/api/files/upload/status?upload_id={}", upload_id))
        .add_cookie(cookie.clone())
        .await;

    response.assert_status_ok();
    let status = response.json::<serde_json::Value>();
    assert_eq!(status["upload_id"], upload_id);
}

#[tokio::test]
async fn test_complete_upload_assembles_large_file_from_many_chunks() {
    use axum::{Json, response::IntoResponse};
    use backend::files::chunked_upload::{
        complete_upload_handler, CompleteUploadPayload,
    };
    use std::fs;
    use std::path::PathBuf;

    unsafe { std::env::set_var("JWT_SECRET", "super_secret"); }

    let upload_id = "test-large-file-assembly";

    // Replica a lógica de get_chunks_base_dir (privada) para localizar o dir de chunks
    let chunk_base = if std::path::Path::new("/data").is_dir() {
        "/data".to_string()
    } else {
        "data".to_string()
    };
    let upload_dir = PathBuf::from(format!("{}/.saturn_chunks", chunk_base)).join(upload_id);

    let dest_dir = PathBuf::from("/tmp/saturn_chunk_test_dest");
    let _ = fs::remove_dir_all(&dest_dir);
    fs::create_dir_all(&dest_dir).unwrap();

    // Grava N chunks (simula upload_chunk_handler já tendo gravado cada fatia)
    let chunk_contents: Vec<Vec<u8>> = (0..6)
        .map(|i| format!("chunk-{i}-content-{}", "x".repeat(1000)).into_bytes())
        .collect();

    let _ = fs::remove_dir_all(&upload_dir);
    fs::create_dir_all(&upload_dir).unwrap();
    for (i, content) in chunk_contents.iter().enumerate() {
        fs::write(upload_dir.join(format!("{}.chunk", i)), content).unwrap();
    }

    let total_expected: usize = chunk_contents.iter().map(|c| c.len()).sum();

    let payload = CompleteUploadPayload {
        upload_id: upload_id.to_string(),
        filename: "video-teste.mp4".to_string(),
        destination: Some(dest_dir.to_string_lossy().to_string()),
    };

    let response = complete_upload_handler(Json(payload)).await;
    assert!(response.is_ok(), "complete_upload_handler falhou para arquivo grande");

    let _ = response.unwrap().into_response();

    // Verifica que o arquivo final foi montado com todos os chunks na ordem
    let final_path = dest_dir.join("video-teste.mp4");
    assert!(final_path.exists(), "arquivo final não foi montado");
    let final_content = fs::read(&final_path).unwrap();
    assert_eq!(final_content.len(), total_expected);
    let expected: Vec<u8> = chunk_contents.iter().flatten().cloned().collect();
    assert_eq!(final_content, expected, "conteúdo montado difere dos chunks enviados");

    // Limpeza
    let _ = fs::remove_dir_all(&dest_dir);
    let _ = fs::remove_dir_all(&upload_dir);
}
