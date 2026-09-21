use axum_test::TestServer;
use backend::app;
use jsonwebtoken::{encode, Header, EncodingKey};
use backend::auth::Claims;
use serde_json::json;
use std::time::{SystemTime, UNIX_EPOCH, Duration};
use std::fs;
use std::path::Path;

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
    ).unwrap()
}

fn get_test_cookie() -> axum_extra::extract::cookie::Cookie<'static> {
    axum_extra::extract::cookie::Cookie::new("auth_token", get_test_token())
}

fn setup_test_sandbox() -> std::path::PathBuf {
    let sandbox = std::env::temp_dir().join(format!("saturn_test_fs_{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&sandbox).unwrap();
    
    // Create some test structure
    fs::create_dir_all(sandbox.join("documents")).unwrap();
    fs::create_dir_all(sandbox.join("movies")).unwrap();
    fs::create_dir_all(sandbox.join("music")).unwrap();
    
    fs::write(sandbox.join("documents/hello.txt"), "Hello Saturn File Manager!").unwrap();
    fs::write(sandbox.join("documents/config.json"), r#"{"app":"saturn","version":"1.0"}"#).unwrap();
    fs::write(sandbox.join("documents/manual.pdf"), "%PDF-1.4 sample pdf content").unwrap();
    fs::write(sandbox.join("music/track.mp3"), "ID3fake audio binary data").unwrap();
    fs::write(sandbox.join("movies/clip.mp4"), "fake mp4 video data").unwrap();
    fs::write(sandbox.join("movies/film.mkv"), "fake mkv matroska container data").unwrap();
    fs::write(sandbox.join("movies/film.srt"), "1\n00:00:01,000 --> 00:00:04,000\nHello World Subtitle").unwrap();
    
    sandbox
}

// 1. Navigation & Listing
#[tokio::test]
async fn test_files_navigation_and_shortcuts() {
    unsafe { std::env::set_var("JWT_SECRET", "super_secret"); }
    let sandbox = setup_test_sandbox();
    let sandbox_str = sandbox.to_str().unwrap();
    
    let server = TestServer::new(app());
    let cookie = get_test_cookie();
    
    // Test listing root / directory
    let res = server.get(&format!("/api/files/list?path={}", sandbox_str))
        .add_cookie(cookie.clone())
        .await;
    res.assert_status_ok();
    
    let json: serde_json::Value = res.json();
    let items = json.get("items").and_then(|i| i.as_array()).expect("Expected items array");
    assert!(items.iter().any(|i| i.get("name").and_then(|n| n.as_str()) == Some("documents") && i.get("is_dir").and_then(|d| d.as_bool()) == Some(true)));
    assert!(items.iter().any(|i| i.get("name").and_then(|n| n.as_str()) == Some("movies") && i.get("is_dir").and_then(|d| d.as_bool()) == Some(true)));
    
    // Test listing non-existent path
    let non_existent = server.get(&format!("/api/files/list?path={}/non_existent_folder", sandbox_str))
        .add_cookie(cookie.clone())
        .await;
    non_existent.assert_status(axum::http::StatusCode::NOT_FOUND);
    
    // Test shortcuts endpoint
    let shortcuts_res = server.get("/api/files/shortcuts")
        .add_cookie(cookie.clone())
        .await;
    shortcuts_res.assert_status_ok();
    let shortcuts: serde_json::Value = shortcuts_res.json();
    assert!(shortcuts.get("home").is_some(), "Expected home shortcut");
    assert!(shortcuts.get("documents").is_some(), "Expected documents shortcut");
    assert!(shortcuts.get("downloads").is_some(), "Expected downloads shortcut");
    assert!(shortcuts.get("pictures").is_some(), "Expected pictures shortcut");
    assert!(shortcuts.get("music").is_some(), "Expected music shortcut");
    assert!(shortcuts.get("videos").is_some(), "Expected videos shortcut");
    assert!(shortcuts.get("places").and_then(|p| p.as_array()).is_some(), "Expected places array");

    let _ = fs::remove_dir_all(&sandbox);
}

// 2. Storage & Mounted HDs
#[tokio::test]
async fn test_files_storage_listing() {
    unsafe { std::env::set_var("JWT_SECRET", "super_secret"); }
    let server = TestServer::new(app());
    let cookie = get_test_cookie();
    
    let res = server.get("/api/files/storages")
        .add_cookie(cookie.clone())
        .await;
    res.assert_status_ok();
    
    let storages: serde_json::Value = res.json();
    let mounts = storages.get("mounts").and_then(|m| m.as_array()).expect("Expected mounts array");
    assert!(!mounts.is_empty(), "Should return at least root mount");
    let first = mounts.first().unwrap();
    assert!(first.get("mount_point").is_some());
    assert!(first.get("total_bytes").is_some());
    assert!(first.get("available_bytes").is_some());
}

// 4. File CRUD operations: Mkdir, Create, Rename, Copy, Move, Delete
#[tokio::test]
async fn test_files_crud_operations() {
    unsafe { std::env::set_var("JWT_SECRET", "super_secret"); }
    let sandbox = setup_test_sandbox();
    let sandbox_str = sandbox.to_str().unwrap();
    
    let server = TestServer::new(app());
    let cookie = get_test_cookie();
    
    // Mkdir
    let new_folder = format!("{}/test_new_folder", sandbox_str);
    let mkdir_res = server.post("/api/files/mkdir")
        .add_cookie(cookie.clone())
        .json(&json!({ "path": new_folder }))
        .await;
    mkdir_res.assert_status_ok();
    assert!(Path::new(&new_folder).is_dir());
    
    // Create new empty file
    let new_file = format!("{}/test_new_folder/note.txt", sandbox_str);
    let create_res = server.post("/api/files/create")
        .add_cookie(cookie.clone())
        .json(&json!({ "path": new_file }))
        .await;
    create_res.assert_status_ok();
    assert!(Path::new(&new_file).is_file());
    
    // Rename file
    let renamed_file = format!("{}/test_new_folder/note_renamed.txt", sandbox_str);
    let rename_res = server.put("/api/files/rename")
        .add_cookie(cookie.clone())
        .json(&json!({ "old_path": new_file, "new_path": renamed_file }))
        .await;
    rename_res.assert_status_ok();
    assert!(!Path::new(&new_file).exists());
    assert!(Path::new(&renamed_file).is_file());
    
    // Copy file
    let copied_file = format!("{}/note_copied.txt", sandbox_str);
    let copy_res = server.post("/api/files/copy")
        .add_cookie(cookie.clone())
        .json(&json!({ "source": renamed_file, "destination": copied_file }))
        .await;
    copy_res.assert_status_ok();
    assert!(Path::new(&renamed_file).is_file());
    assert!(Path::new(&copied_file).is_file());
    
    // Move file
    let moved_file = format!("{}/movies/note_moved.txt", sandbox_str);
    let move_res = server.post("/api/files/move")
        .add_cookie(cookie.clone())
        .json(&json!({ "source": copied_file, "destination": moved_file }))
        .await;
    move_res.assert_status_ok();
    assert!(!Path::new(&copied_file).exists());
    assert!(Path::new(&moved_file).is_file());
    
    // Delete files
    let delete_res = server.post("/api/files/delete")
        .add_cookie(cookie.clone())
        .json(&json!({ "paths": [new_folder, moved_file] }))
        .await;
    delete_res.assert_status_ok();
    assert!(!Path::new(&new_folder).exists());
    assert!(!Path::new(&moved_file).exists());

    let _ = fs::remove_dir_all(&sandbox);
}

// 5. Transfer: Download, Archive (Zip), and Upload
#[tokio::test]
async fn test_files_download_and_archive() {
    unsafe { std::env::set_var("JWT_SECRET", "super_secret"); }
    let sandbox = setup_test_sandbox();
    let sandbox_str = sandbox.to_str().unwrap();
    
    let server = TestServer::new(app());
    let cookie = get_test_cookie();
    
    // Download single file
    let download_res = server.get(&format!("/api/files/download?path={}/documents/hello.txt", sandbox_str))
        .add_cookie(cookie.clone())
        .await;
    download_res.assert_status_ok();
    assert_eq!(download_res.text(), "Hello Saturn File Manager!");
    
    // Archive folder as zip
    let archive_res = server.get(&format!("/api/files/archive?path={}/documents", sandbox_str))
        .add_cookie(cookie.clone())
        .await;
    archive_res.assert_status_ok();
    let bytes = archive_res.as_bytes();
    assert!(bytes.len() > 10, "Zip archive should contain data");
    
    let _ = fs::remove_dir_all(&sandbox);
}

// 6. Media Streaming (Audio, Video, MKV, Subtitles)
#[tokio::test]
async fn test_media_streaming_and_subtitles() {
    unsafe { std::env::set_var("JWT_SECRET", "super_secret"); }
    let sandbox = setup_test_sandbox();
    let sandbox_str = sandbox.to_str().unwrap();
    
    let server = TestServer::new(app());
    let cookie = get_test_cookie();
    
    // Stream audio with Range
    let audio_res = server.get(&format!("/api/files/stream?path={}/music/track.mp3", sandbox_str))
        .add_cookie(cookie.clone())
        .add_header(axum::http::header::RANGE, "bytes=0-3")
        .await;
    audio_res.assert_status(axum::http::StatusCode::PARTIAL_CONTENT);
    assert_eq!(audio_res.text(), "ID3f");
    
    // Stream MKV video with closed Range
    let mkv_res = server.get(&format!("/api/files/stream?path={}/movies/film.mkv", sandbox_str))
        .add_cookie(cookie.clone())
        .add_header(axum::http::header::RANGE, "bytes=0-3")
        .await;
    mkv_res.assert_status(axum::http::StatusCode::PARTIAL_CONTENT);
    assert_eq!(mkv_res.text(), "fake");

    // Stream MKV video with open Range (bytes=0-) - verifies unconstrained continuous streaming
    let mkv_open_range = server.get(&format!("/api/files/stream?path={}/movies/film.mkv", sandbox_str))
        .add_cookie(cookie.clone())
        .add_header(axum::http::header::RANGE, "bytes=0-")
        .await;
    mkv_open_range.assert_status(axum::http::StatusCode::PARTIAL_CONTENT);
    assert_eq!(mkv_open_range.text(), "fake mkv matroska container data");

    // Stream with RFC 7233 suffix Range (bytes=-4) -> last 4 bytes of "fake mkv matroska container data" is "data"
    let mkv_suffix_range = server.get(&format!("/api/files/stream?path={}/movies/film.mkv", sandbox_str))
        .add_cookie(cookie.clone())
        .add_header(axum::http::header::RANGE, "bytes=-4")
        .await;
    mkv_suffix_range.assert_status(axum::http::StatusCode::PARTIAL_CONTENT);
    assert_eq!(mkv_suffix_range.text(), "data");
    assert_eq!(mkv_suffix_range.header("content-range"), "bytes 28-31/32");
    assert_eq!(mkv_suffix_range.header("access-control-allow-origin"), "*");

    // Stream with ?token= query parameter (WITHOUT cookie or Authorization header)
    let token = get_test_token();
    let stream_token_res = server.get(&format!("/api/files/stream?path={}/movies/film.mkv&token={}", sandbox_str, token))
        .add_header(axum::http::header::RANGE, "bytes=0-3")
        .await;
    stream_token_res.assert_status(axum::http::StatusCode::PARTIAL_CONTENT);
    assert_eq!(stream_token_res.text(), "fake");

    // Add .ass and .sbv companion subtitles
    fs::write(sandbox.join("movies/film.ass"), "[Script Info]\nTitle: Test\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:01:23.45,0:01:28.90,Default,,0,0,0,,{\\b1}Sample ASS Text{\\b0}").unwrap();
    fs::write(sandbox.join("movies/film.sbv"), "0:00:01.000,0:00:04.000\nYouTube SBV subtitle line").unwrap();

    // Subtitles discovery for film.mkv with ?token=
    let subs_res = server.get(&format!("/api/files/subtitles?path={}/movies/film.mkv&token={}", sandbox_str, token))
        .await;
    subs_res.assert_status_ok();
    assert_eq!(subs_res.header("access-control-allow-origin"), "*");
    let subs_json: serde_json::Value = subs_res.json();
    let subs = subs_json.get("subtitles").and_then(|s| s.as_array()).expect("Expected subtitles array");
    assert!(subs.iter().any(|s| s.get("name").and_then(|n| n.as_str()) == Some("film.srt")));
    assert!(subs.iter().any(|s| s.get("name").and_then(|n| n.as_str()) == Some("film.ass")));
    assert!(subs.iter().any(|s| s.get("name").and_then(|n| n.as_str()) == Some("film.sbv")));

    // Subtitle conversion to WebVTT (.ass -> WebVTT) with ?token= and CORS
    let ass_vtt_res = server.get(&format!("/api/files/subtitles/vtt?path={}/movies/film.ass&token={}", sandbox_str, token))
        .await;
    ass_vtt_res.assert_status_ok();
    assert_eq!(ass_vtt_res.header("access-control-allow-origin"), "*");
    assert!(ass_vtt_res.text().contains("WEBVTT"));
    assert!(ass_vtt_res.text().contains("Sample ASS Text"));

    // Subtitle conversion to WebVTT (.sbv -> WebVTT)
    let sbv_vtt_res = server.get(&format!("/api/files/subtitles/vtt?path={}/movies/film.sbv&token={}", sandbox_str, token))
        .await;
    sbv_vtt_res.assert_status_ok();
    assert_eq!(sbv_vtt_res.header("access-control-allow-origin"), "*");
    assert!(sbv_vtt_res.text().contains("WEBVTT"));
    assert!(sbv_vtt_res.text().contains("-->"));

    let _ = fs::remove_dir_all(&sandbox);
}

// 7. Text Editor & PDF Raw View
#[tokio::test]
async fn test_text_editor_and_pdf() {
    unsafe { std::env::set_var("JWT_SECRET", "super_secret"); }
    let sandbox = setup_test_sandbox();
    let sandbox_str = sandbox.to_str().unwrap();
    
    let server = TestServer::new(app());
    let cookie = get_test_cookie();
    
    // Read text content
    let text_res = server.get(&format!("/api/files/content?path={}/documents/hello.txt", sandbox_str))
        .add_cookie(cookie.clone())
        .await;
    text_res.assert_status_ok();
    let text_json: serde_json::Value = text_res.json();
    assert_eq!(text_json.get("content").and_then(|c| c.as_str()), Some("Hello Saturn File Manager!"));
    
    // Write text content
    let update_res = server.put("/api/files/content")
        .add_cookie(cookie.clone())
        .json(&json!({
            "path": format!("{}/documents/hello.txt", sandbox_str),
            "content": "Updated content from Text Editor"
        }))
        .await;
    update_res.assert_status_ok();
    
    let updated_content = fs::read_to_string(sandbox.join("documents/hello.txt")).unwrap();
    assert_eq!(updated_content, "Updated content from Text Editor");
    
    // PDF raw view
    let pdf_res = server.get(&format!("/api/files/raw?path={}/documents/manual.pdf", sandbox_str))
        .add_cookie(cookie.clone())
        .await;
    pdf_res.assert_status_ok();
    assert_eq!(pdf_res.header("content-type"), "application/pdf");

    let _ = fs::remove_dir_all(&sandbox);
}

// 8. Security & Path Traversal Guard
#[tokio::test]
async fn test_files_security_and_auth() {
    unsafe { std::env::set_var("JWT_SECRET", "super_secret"); }
    let server = TestServer::new(app());
    
    // 1. Unauthenticated request must return 401
    let unauth_res = server.get("/api/files/list?path=/").await;
    unauth_res.assert_status_unauthorized();
    
    let cookie = get_test_cookie();
    
    // 2. Reject access to non-existent path safely
    let traversal_res = server.get("/api/files/list?path=/etc/saturn_non_existent_security_test")
        .add_cookie(cookie.clone())
        .await;
    traversal_res.assert_status(axum::http::StatusCode::NOT_FOUND);
}

// 9. Extraction & Compression
#[tokio::test]
async fn test_files_compression_and_extraction() {
    unsafe { std::env::set_var("JWT_SECRET", "super_secret"); }
    let sandbox = setup_test_sandbox();
    let sandbox_str = sandbox.to_str().unwrap();
    let server = TestServer::new(app());
    let cookie = get_test_cookie();
    let file_to_zip = format!("{}/documents/hello.txt", sandbox_str);

    // Compress
    let compress_res = server.post("/api/files/compress")
        .add_cookie(cookie.clone())
        .json(&json!({
            "paths": [file_to_zip],
            "destination_name": "bundle.zip",
            "destination_dir": sandbox_str
        }))
        .await;
    compress_res.assert_status_ok();
    let zip_path = sandbox.join("bundle.zip");
    assert!(zip_path.is_file());

    // Extract
    let extract_dir = sandbox.join("extracted");
    let extract_res = server.post("/api/files/extract")
        .add_cookie(cookie.clone())
        .json(&json!({
            "path": zip_path.to_str().unwrap(),
            "destination": extract_dir.to_str().unwrap()
        }))
        .await;
    extract_res.assert_status_ok();
    assert!(extract_dir.join("hello.txt").is_file());

    let _ = fs::remove_dir_all(&sandbox);
}

// 10. Disk Space Analysis
#[tokio::test]
async fn test_files_disk_analysis() {
    unsafe { std::env::set_var("JWT_SECRET", "super_secret"); }
    let sandbox = setup_test_sandbox();
    let sandbox_str = sandbox.to_str().unwrap();
    let server = TestServer::new(app());
    let cookie = get_test_cookie();

    let analyze_res = server.get(&format!("/api/files/analyze?path={}", sandbox_str))
        .add_cookie(cookie.clone())
        .await;
    analyze_res.assert_status_ok();
    let body = analyze_res.text();
    assert!(body.contains("event: complete"));
    assert!(body.contains("data: {"));
    
    // Parse the completed payload
    let data_line = body.lines().find(|l| l.starts_with("data: ")).expect("data line in SSE");
    let json: serde_json::Value = serde_json::from_str(&data_line[6..]).expect("valid json in SSE");
    assert!(json.get("total_size").and_then(|s| s.as_u64()).unwrap_or(0) > 0);
    assert!(json.get("items").and_then(|i| i.as_array()).map_or(0, |a| a.len()) >= 2);

    let _ = fs::remove_dir_all(&sandbox);
}

// 11. Trash Bin Operations (Move, List, Restore, Empty)
#[tokio::test]
async fn test_files_trash_operations() {
    unsafe { std::env::set_var("JWT_SECRET", "super_secret"); }
    let sandbox = setup_test_sandbox();
    let sandbox_str = sandbox.to_str().unwrap();
    let server = TestServer::new(app());
    let cookie = get_test_cookie();
    let file_to_trash = format!("{}/documents/hello.txt", sandbox_str);

    // 1. Move to trash
    let trash_res = server.post("/api/files/trash")
        .add_cookie(cookie.clone())
        .json(&json!({ "paths": [file_to_trash] }))
        .await;
    trash_res.assert_status_ok();
    assert!(!Path::new(&file_to_trash).exists());

    // 2. List trash
    let list_res = server.get("/api/files/trash")
        .add_cookie(cookie.clone())
        .await;
    list_res.assert_status_ok();
    let list_json: serde_json::Value = list_res.json();
    let items = list_json.get("items").and_then(|i| i.as_array()).expect("Expected items array");
    assert!(!items.is_empty());
    let item_id = items.last().unwrap().get("id").and_then(|id| id.as_str()).unwrap();

    // 3. Restore from trash
    let restore_res = server.post("/api/files/trash/restore")
        .add_cookie(cookie.clone())
        .json(&json!({ "ids": [item_id] }))
        .await;
    restore_res.assert_status_ok();
    assert!(Path::new(&file_to_trash).exists());

    // 4. Empty trash
    let empty_res = server.delete("/api/files/trash")
        .add_cookie(cookie.clone())
        .await;
    empty_res.assert_status_ok();

    let _ = fs::remove_dir_all(&sandbox);
}

// 12. Temporary Share Links & Public Download
#[tokio::test]
async fn test_files_sharing_and_public_download() {
    unsafe { std::env::set_var("JWT_SECRET", "super_secret"); }
    let sandbox = setup_test_sandbox();
    let sandbox_str = sandbox.to_str().unwrap();
    let server = TestServer::new(app());
    let cookie = get_test_cookie();

    let share_target = format!("{}/documents/hello.txt", sandbox_str);

    // 1. Create temporary share link
    let share_res = server.post("/api/files/share")
        .add_cookie(cookie.clone())
        .json(&json!({
            "path": share_target,
            "expires_in_seconds": 3600
        }))
        .await;
    share_res.assert_status_ok();
    let share_json: serde_json::Value = share_res.json();
    let token = share_json.get("token").and_then(|t| t.as_str()).unwrap();
    assert!(!token.is_empty());

    // 2. List active shares
    let list_res = server.get("/api/files/shares")
        .add_cookie(cookie.clone())
        .await;
    list_res.assert_status_ok();
    let shares: serde_json::Value = list_res.json();
    let share_list = shares.get("shares").and_then(|s| s.as_array()).unwrap();
    assert!(share_list.iter().any(|s| s.get("token").and_then(|t| t.as_str()) == Some(token)));

    // 3. Access public download WITHOUT auth
    let public_res = server.get(&format!("/api/public/share/{}", token)).await;
    public_res.assert_status_ok();
    assert_eq!(public_res.text(), "Hello Saturn File Manager!");

    // 4. Delete share
    let del_res = server.delete(&format!("/api/files/share/{}", token))
        .add_cookie(cookie.clone())
        .await;
    del_res.assert_status_ok();

    // 5. Accessing deleted share should now return 404
    let public_del_res = server.get(&format!("/api/public/share/{}", token)).await;
    public_del_res.assert_status_not_found();

    let _ = fs::remove_dir_all(&sandbox);
}

// 13. File Thumbnails (Images, Videos, PDFs)
#[tokio::test]
async fn test_files_thumbnails() {
    unsafe { std::env::set_var("JWT_SECRET", "super_secret"); }
    let sandbox = setup_test_sandbox();
    let sandbox_str = sandbox.to_str().unwrap();
    let server = TestServer::new(app());
    let token = get_test_token();

    // 1. SVG image thumbnail returns direct SVG
    let svg_path = sandbox.join("documents/test.svg");
    fs::write(&svg_path, "<svg xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"10\" height=\"10\"/></svg>").unwrap();

    let svg_res = server.get(&format!("/api/files/thumbnail?path={}&token={}", svg_path.to_str().unwrap(), token))
        .await;
    svg_res.assert_status_ok();
    assert_eq!(svg_res.header("content-type"), "image/svg+xml");
    assert_eq!(svg_res.header("access-control-allow-origin"), "*");

    // 2. Unsupported file type (e.g. .txt) returns 404
    let txt_path = sandbox.join("documents/hello.txt");
    let txt_res = server.get(&format!("/api/files/thumbnail?path={}&token={}", txt_path.to_str().unwrap(), token))
        .await;
    txt_res.assert_status_not_found();

    // 3. Non-existent file returns 404
    let not_found_res = server.get(&format!("/api/files/thumbnail?path={}/not_found.png&token={}", sandbox_str, token))
        .await;
    not_found_res.assert_status_not_found();

    // 4. Video thumbnail generation via ffmpeg/ffprobe
    let video_path = sandbox.join("documents/sample.mp4");
    let gen_status = std::process::Command::new("ffmpeg")
        .args(["-y", "-f", "lavfi", "-i", "testsrc=duration=5:size=320x240:rate=1", "-c:v", "libx264"])
        .arg(&video_path)
        .status();

    if let Ok(status) = gen_status {
        if status.success() {
            let video_res = server.get(&format!("/api/files/thumbnail?path={}&token={}", video_path.to_str().unwrap(), token))
                .await;
            video_res.assert_status_ok();
            assert_eq!(video_res.header("content-type"), "image/jpeg");
        }
    }

    let _ = fs::remove_dir_all(&sandbox);
}

// 14. Real-time Video Stream Transcoding
#[tokio::test]
async fn test_files_stream_transcode() {
    unsafe { std::env::set_var("JWT_SECRET", "super_secret"); }
    let sandbox = setup_test_sandbox();
    let sandbox_str = sandbox.to_str().unwrap();
    let server = TestServer::new(app());
    let token = get_test_token();

    // 1. Non-existent file returns 404
    let not_found = server.get(&format!("/api/files/stream/transcode?path={}/not_found.mkv&token={}", sandbox_str, token))
        .await;
    not_found.assert_status_not_found();

    // 2. Generate a valid sample video to test transcoding
    let video_path = sandbox.join("movies/sample_transcode.mkv");
    let gen_status = std::process::Command::new("ffmpeg")
        .args(["-y", "-f", "lavfi", "-i", "testsrc=duration=3:size=320x240:rate=1", "-c:v", "libx264"])
        .arg(&video_path)
        .status();

    if let Ok(status) = gen_status {
        if status.success() {
            let res = server.get(&format!("/api/files/stream/transcode?path={}&token={}", video_path.to_str().unwrap(), token))
                .await;
            res.assert_status_ok();
            assert_eq!(res.header("content-type"), "video/mp4");
            assert_eq!(res.header("access-control-allow-origin"), "*");
            assert!(res.as_bytes().len() > 0);
        }
    }

    let _ = fs::remove_dir_all(&sandbox);
}
