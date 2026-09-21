use axum_test::TestServer;
use backend::logs::{prune_old_log_files, read_last_n_lines_from_file};
use jsonwebtoken::{encode, Header, EncodingKey};
use backend::auth::Claims;
use std::time::{SystemTime, UNIX_EPOCH, Duration};
use std::fs::{self, File};
use std::io::Write;
use std::path::Path;

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

#[test]
fn test_read_last_n_lines_bounded() {
    let test_dir = "data/test_tail_logs";
    let _ = fs::create_dir_all(test_dir);
    let file_path = format!("{}/tail_test.log", test_dir);

    // Create a file with 10,000 lines
    {
        let mut f = File::create(&file_path).unwrap();
        for i in 1..=10000 {
            writeln!(f, "2026-08-28T12:00:00Z [INFO] Log message number {}", i).unwrap();
        }
    }

    // Read only the last 5 lines
    let lines = read_last_n_lines_from_file(Path::new(&file_path), 5).unwrap();
    assert_eq!(lines.len(), 5);
    assert!(lines[0].contains("Log message number 9996"));
    assert!(lines[4].contains("Log message number 10000"));

    // Cleanup
    let _ = fs::remove_dir_all(test_dir);
}

#[test]
fn test_shrink_large_active_log_file() {
    let test_dir = "data/test_shrink_logs";
    let _ = fs::create_dir_all(test_dir);
    let file_path = format!("{}/saturn.log", test_dir);

    // Create a 2MB log file with 5,000 lines
    {
        let mut f = File::create(&file_path).unwrap();
        for i in 1..=5000 {
            writeln!(f, "2026-08-28T12:00:00Z [INFO] Log message line with detailed context {}", i).unwrap();
        }
    }

    let initial_size = fs::metadata(&file_path).unwrap().len();
    assert!(initial_size > 100_000, "Initial file should be large");

    // Shrink if exceeds 50KB, keeping last 20 lines
    let shrunk = backend::logs::shrink_active_log_file(Path::new(&file_path), 50_000, 20);
    assert!(shrunk, "File should have been shrunk");

    let new_size = fs::metadata(&file_path).unwrap().len();
    assert!(new_size < initial_size, "New size must be smaller than initial size");

    let remaining_lines: Vec<_> = std::io::BufRead::lines(std::io::BufReader::new(File::open(&file_path).unwrap())).filter_map(Result::ok).collect();
    assert_eq!(remaining_lines.len(), 20, "Must have exactly 20 lines");
    assert!(remaining_lines.last().unwrap().contains("5000"));

    // Cleanup
    let _ = fs::remove_dir_all(test_dir);
}

#[test]
fn test_prune_old_logs() {
    let test_dir = "data/test_prune_logs";
    let _ = fs::create_dir_all(test_dir);

    // Create 7 dummy log files
    for i in 1..=7 {
        let p = format!("{}/saturn.log.2026-08-0{}", test_dir, i);
        let mut f = File::create(&p).unwrap();
        writeln!(f, "Old log content for day {}", i).unwrap();
    }

    // Prune keeping only 3 files / max 1MB
    let removed = prune_old_log_files(test_dir, 3, 1024 * 1024);
    assert_eq!(removed, 4, "Should have removed 4 oldest log files");

    let remaining: Vec<_> = fs::read_dir(test_dir).unwrap().flatten().collect();
    assert_eq!(remaining.len(), 3);

    // Cleanup
    let _ = fs::remove_dir_all(test_dir);
}

#[tokio::test]
async fn test_clear_logs_endpoint_with_source() {
    unsafe { std::env::set_var("JWT_SECRET", "super_secret"); }
    let app = backend::app();
    let server = TestServer::new(app);

    // 1. Unauthenticated request must be rejected (SEC-003 verification)
    let unauth_res = server.post("/api/logs/clear")
        .add_query_param("source", "saturn")
        .await;
    unauth_res.assert_status_unauthorized();

    // 2. Create a dummy log file
    let _ = fs::create_dir_all("data");
    let dummy_log = "data/saturn.log";
    fs::write(dummy_log, "some old log line 1\nsome old log line 2\n").unwrap();

    // 3. Authenticated request succeeds
    let res = server.post("/api/logs/clear")
        .add_cookie(get_test_cookie())
        .add_query_param("source", "saturn")
        .await;
    res.assert_status_success();

    let content = fs::read_to_string(dummy_log).unwrap();
    assert!(content.is_empty(), "Log file should be emptied");
}

#[test]
fn test_ensure_safe_logging_config_injection() {
    let compose_sample = r#"
services:
  qbittorrent:
    image: linuxserver/qbittorrent:latest
    restart: unless-stopped
    ports:
      - 8080:8080
"#;

    let result = backend::store::installer::ensure_safe_logging_config(compose_sample);
    assert!(result.contains("logging:"), "Must contain logging key");
    assert!(result.contains("max-size: 10m") || result.contains("max-size: \"10m\"") || result.contains("max-size: '10m'"), "Must contain max-size 10m");
    assert!(result.contains("max-file: 3") || result.contains("max-file: \"3\"") || result.contains("max-file: '3'"), "Must contain max-file 3");
}

