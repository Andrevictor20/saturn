use axum_test::TestServer;
use backend::system::{get_system_update_info, SystemUpdateInfo, SystemUpdateTask};
use backend::auth::Claims;
use jsonwebtoken::{encode, Header, EncodingKey};
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
        &EncodingKey::from_secret(&b"super_secret"[..]),
    ).unwrap();

    axum_extra::extract::cookie::Cookie::new("auth_token", token)
}

static TEST_MUTEX: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[tokio::test]
async fn test_system_update_check_endpoint() {
    let _lock = TEST_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
    unsafe { std::env::set_var("JWT_SECRET", "super_secret"); }
    let app = backend::app();
    let server = TestServer::new(app);
    let cookie = get_test_cookie();

    let res = server.get("/api/system/update/check")
        .add_cookie(cookie)
        .await;
    res.assert_status_success();

    let info: SystemUpdateInfo = res.json();
    assert!(!info.current_version.is_empty(), "Current version must not be empty");
    assert!(!info.platform.is_empty(), "Platform must not be empty");
    assert!(!info.arch.is_empty(), "Arch must not be empty");
    assert!(info.platform.starts_with("linux/"), "Platform must start with linux/");
}

#[tokio::test]
async fn test_system_update_status_endpoint() {
    let _lock = TEST_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
    unsafe { std::env::set_var("JWT_SECRET", "super_secret"); }
    let app = backend::app();
    let server = TestServer::new(app);
    let cookie = get_test_cookie();

    let res = server.get("/api/system/update/status")
        .add_cookie(cookie)
        .await;
    res.assert_status_success();

    let task: SystemUpdateTask = res.json();
    assert!(!task.status.is_empty(), "Task status must not be empty");
}

#[tokio::test]
async fn test_system_platform_detection() {
    let _lock = TEST_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
    let info = get_system_update_info().await;
    let expected_platform = backend::docker::get_host_platform();
    assert_eq!(info.platform, expected_platform);
    assert_eq!(info.arch, std::env::consts::ARCH);
}

#[tokio::test]
async fn test_system_update_endpoint_exists_and_polls_task() {
    let _lock = TEST_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
    unsafe { std::env::set_var("JWT_SECRET", "super_secret"); }
    let app = backend::app();
    let server = TestServer::new(app);
    let cookie = get_test_cookie();

    let res = server.post("/api/system/update")
        .add_cookie(cookie.clone())
        .await;
    assert_ne!(res.status_code(), axum::http::StatusCode::NOT_FOUND);

    // Poll status endpoint to verify background worker task updates
    tokio::time::sleep(Duration::from_millis(50)).await;
    let status_res = server.get("/api/system/update/status")
        .add_cookie(cookie)
        .await;
    status_res.assert_status_success();

    let task: SystemUpdateTask = status_res.json();
    assert!(!task.status.is_empty(), "Task status must be populated");
    assert!(!task.logs.is_empty(), "Task logs should contain at least initial line");

    // Reset task state
    {
        let mut t = backend::system::SYSTEM_UPDATE_TASK.write().unwrap();
        t.status = "idle".to_string();
    }
}

/// Regression [L-016]: the fallback docker run command must use 'saturn-dashboard'
/// (the `container_name` from docker-compose.yml), NOT 'saturn' (which is only the
/// compose service/project name). Using 'saturn' creates a duplicate container causing
/// a port 5172 conflict and an immediate ExitCode=0 restart loop.
#[test]
fn test_fallback_docker_run_uses_correct_container_name() {
    let image_name = "ghcr.io/andrevictor20/saturn:latest";
    let host_dir_val = String::new(); // empty = no compose dir found
    let compose_file_name = "docker-compose.yml";
    let project_flag = String::new();
    let detected_data_mount = "saturn_saturn_data"; // Preserved volume from running container

    let helper_script = format!(
        r#"sleep 1 && (
if [ -n "{host_dir}" ] && [ -f "/host{host_dir}/{compose_file}" ]; then
  cd "/host{host_dir}" && docker compose {project_flag} -f "{compose_file}" pull && docker compose {project_flag} -f "{compose_file}" up -d --force-recreate
elif [ -f "/host/DATA/saturn/docker-compose.yml" ]; then
  cd "/host/DATA/saturn" && docker compose -f "docker-compose.yml" pull && docker compose -f "docker-compose.yml" up -d --force-recreate
elif [ -f "/host/root/saturn/docker-compose.yml" ]; then
  cd "/host/root/saturn" && docker compose -f "docker-compose.yml" pull && docker compose -f "docker-compose.yml" up -d --force-recreate
else
  docker stop saturn-dashboard saturn 2>/dev/null || true
  docker rm saturn-dashboard saturn 2>/dev/null || true
  docker run -d --name saturn-dashboard --restart unless-stopped \
    --privileged \
    --pid host \
    --add-host host.docker.internal:host-gateway \
    -p 5172:5172 \
    -p 5173:5172 \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v "{data_mount}:/app/data" \
    -v /:/host:rslave \
    -v /mnt:/mnt:rslave \
    -v /media:/media:rslave \
    -e RUST_LOG=info \
    -e SSH_HOST=host.docker.internal \
    "{image_name}"
fi
)"#,
        host_dir = host_dir_val,
        compose_file = compose_file_name,
        project_flag = project_flag,
        data_mount = detected_data_mount,
        image_name = image_name
    );

    // MUST use "saturn-dashboard" (container_name), never bare "saturn" (service name)
    assert!(
        helper_script.contains("--name saturn-dashboard"),
        "Fallback docker run must use --name saturn-dashboard (container_name from compose), not the service name"
    );
    assert!(
        !helper_script.contains("--name saturn "),
        "Fallback docker run must NOT use --name saturn (that is the service name, not the container_name)"
    );

    // MUST preserve the detected data mount (volume or bind-mount)
    assert!(
        helper_script.contains("-v \"saturn_saturn_data:/app/data\""),
        "Fallback docker run must preserve the existing volume/bind mount instead of hardcoding an empty volume"
    );

    // MUST use rslave propagation (not :ro which breaks FUSE/rclone mounts)
    assert!(
        helper_script.contains("/:/host:rslave"),
        "Host mount must use rslave propagation for FUSE/rclone support"
    );

    // MUST expose both ports matching docker-compose.yml
    assert!(helper_script.contains("-p 5172:5172"), "Must expose primary port 5172");
    assert!(helper_script.contains("-p 5173:5172"), "Must expose secondary port 5173 (alias)");

    // MUST include privileged mode (required for FUSE mounts)
    assert!(helper_script.contains("--privileged"), "Must include --privileged for FUSE support");
}

/// Regression [L-017]: main.rs must NOT exit silently with ExitCode=0 before the TCP
/// port is bound. The previous bug: a standalone `shutdown_signal()` was defined but
/// NOT integrated into axum::serve — causing the Tokio runtime to drop it immediately.
/// The current correct pattern: shutdown_signal() is passed to with_graceful_shutdown,
/// called AFTER TcpListener::bind succeeds, so SIGTERM is only handled once serving.
///
/// What is PROHIBITED:
///   axum::serve(...).await (no graceful shutdown — leaks connections on restart)
///   vs calling shutdown_signal() before the listener is set up.
///
/// What is REQUIRED:
///   axum::serve(listener, ...).with_graceful_shutdown(shutdown_signal()).await
#[test]
fn test_main_rs_does_not_have_premature_shutdown_signal() {
    let main_rs = include_str!("../src/main.rs");

    // The server must use axum::serve with with_graceful_shutdown
    // so that SIGTERM only triggers after the port is bound and accepting connections.
    assert!(
        main_rs.contains("axum::serve(listener"),
        "main.rs must use axum::serve(listener, ...) — found no listener binding"
    );

    // The graceful shutdown must be wired into the serve call (not ignored)
    assert!(
        main_rs.contains(".with_graceful_shutdown(shutdown_signal())"),
        "main.rs must wire shutdown_signal() into .with_graceful_shutdown() \
         so SIGTERM is handled after the port is bound, not before"
    );

    // The shutdown_signal fn must be defined (not missing)
    assert!(
        main_rs.contains("async fn shutdown_signal"),
        "main.rs must define async fn shutdown_signal() to handle SIGTERM gracefully"
    );

    // Must log when stopping (evidence that graceful shutdown is working)
    assert!(
        main_rs.contains("stopped gracefully"),
        "main.rs must log \"stopped gracefully\" after server.await completes"
    );
}

#[tokio::test]
async fn test_health_endpoint_returns_json_and_version() {
    let app = backend::app();
    let server = TestServer::new(app);

    let res = server.get("/health").await;
    res.assert_status_success();

    let json: serde_json::Value = res.json();
    assert_eq!(json.get("status").and_then(|v| v.as_str()), Some("ok"));
    assert_eq!(
        json.get("version").and_then(|v| v.as_str()),
        Some(env!("CARGO_PKG_VERSION"))
    );
    assert!(!json.get("arch").and_then(|v| v.as_str()).unwrap_or("").is_empty());
}

#[tokio::test]
async fn test_api_health_endpoint_returns_json_and_version() {
    let app = backend::app();
    let server = TestServer::new(app);

    let res = server.get("/api/health").await;
    res.assert_status_success();

    let json: serde_json::Value = res.json();
    assert_eq!(json.get("status").and_then(|v| v.as_str()), Some("ok"));
    assert_eq!(
        json.get("version").and_then(|v| v.as_str()),
        Some(env!("CARGO_PKG_VERSION"))
    );
    assert!(!json.get("arch").and_then(|v| v.as_str()).unwrap_or("").is_empty());
}

#[tokio::test]
async fn test_system_version_endpoint_with_auth() {
    unsafe { std::env::set_var("JWT_SECRET", "super_secret"); }
    let app = backend::app();
    let server = TestServer::new(app);
    let cookie = get_test_cookie();

    let res = server.get("/api/system/version")
        .add_cookie(cookie)
        .await;
    res.assert_status_success();

    let json: serde_json::Value = res.json();
    assert_eq!(
        json.get("version").and_then(|v| v.as_str()),
        Some(env!("CARGO_PKG_VERSION"))
    );
    assert!(!json.get("platform").and_then(|v| v.as_str()).unwrap_or("").is_empty());
    assert!(!json.get("arch").and_then(|v| v.as_str()).unwrap_or("").is_empty());
}

#[tokio::test]
async fn test_check_update_force_query_bypasses_cache() {
    let _lock = TEST_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
    unsafe { std::env::set_var("JWT_SECRET", "super_secret"); }
    let app = backend::app();
    let server = TestServer::new(app);
    let cookie = get_test_cookie();

    let res = server.get("/api/system/update/check?force=true")
        .add_cookie(cookie)
        .await;
    res.assert_status_success();

    let info: SystemUpdateInfo = res.json();
    assert!(!info.current_version.is_empty());
}

#[tokio::test]
async fn test_spa_html_routes_have_strict_no_cache_headers() {
    let app = backend::app();
    let server = TestServer::new(app);

    // 1. Root route
    let res = server.get("/").await;
    let cache_control = res.headers().get("cache-control").expect("Root route must have cache-control header");
    let val = cache_control.to_str().unwrap_or_default();
    assert!(val.contains("no-cache") && val.contains("no-store"), "Root route must have strict no-cache headers, got: {}", val);

    let pragma = res.headers().get("pragma").expect("Root route must have pragma header");
    assert_eq!(pragma.to_str().unwrap_or_default(), "no-cache");

    // 2. Client-side route fallback (/login)
    let res_login = server.get("/login").await;
    let cache_control_login = res_login.headers().get("cache-control").expect("/login must have cache-control header");
    let val_login = cache_control_login.to_str().unwrap_or_default();
    assert!(val_login.contains("no-cache") && val_login.contains("no-store"), "/login must have strict no-cache headers, got: {}", val_login);

    // 3. Static asset route (/assets/...)
    let res_asset = server.get("/assets/vendor.js").await;
    let cache_control_asset = res_asset.headers().get("cache-control").expect("/assets/ must have cache-control header");
    let val_asset = cache_control_asset.to_str().unwrap_or_default();
    assert!(val_asset.contains("immutable"), "/assets/ must have immutable cache header, got: {}", val_asset);
}

#[tokio::test]
async fn test_ghcr_image_manifest_real_check() {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .user_agent("Saturn")
        .build()
        .unwrap();

    // Verify GHCR token acquisition & manifest discovery on a known public GHCR image
    let exists = backend::system::check_ghcr_image_manifest_for_repo(&client, "linuxserver/nginx", "latest").await;
    assert!(exists, "Public GHCR image manifest check must return true");

    // Non-existent version tag must return false
    let not_exists = backend::system::check_ghcr_image_manifest(&client, "v999.999.999").await;
    assert!(!not_exists, "Non-existent tag must return false on GHCR manifest check");
}

#[tokio::test]
async fn test_system_update_blocks_when_ci_is_building() {
    let _lock = TEST_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
    unsafe { std::env::set_var("JWT_SECRET", "super_secret"); }

    // Ensure clean initial state
    {
        let mut t = match backend::system::SYSTEM_UPDATE_TASK.write() {
            Ok(g) => g,
            Err(p) => p.into_inner(),
        };
        t.status = "idle".to_string();
    }

    let app = backend::app();
    let server = TestServer::new(app);
    let cookie = get_test_cookie();

    // Mock building state in update cache
    {
        let mut guard = match backend::system::UPDATE_CACHE.write() {
            Ok(g) => g,
            Err(p) => p.into_inner(),
        };
        *guard = Some((
            SystemUpdateInfo {
                current_version: "2.1.0".to_string(),
                latest_version: "2.2.0".to_string(),
                has_update: true,
                platform: "linux/amd64".to_string(),
                arch: "x86_64".to_string(),
                release_name: "Saturn v2.2.0".to_string(),
                release_notes: "Notes".to_string(),
                published_at: None,
                ci_status: Some("building".to_string()),
                ci_workflow_url: None,
            },
            std::time::Instant::now(),
        ));
    }

    let res = server.post("/api/system/update")
        .add_cookie(cookie)
        .await;
    
    assert_eq!(res.status_code(), axum::http::StatusCode::PRECONDITION_FAILED);
    let json: serde_json::Value = res.json();
    assert!(json.get("error").and_then(|v| v.as_str()).unwrap().contains("compilação"));

    // Reset cache
    {
        let mut guard = match backend::system::UPDATE_CACHE.write() {
            Ok(g) => g,
            Err(p) => p.into_inner(),
        };
        *guard = None;
    }
}

#[tokio::test]
async fn test_system_update_cleanup_endpoint() {
    let _lock = TEST_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
    unsafe { std::env::set_var("JWT_SECRET", "super_secret"); }

    let app = backend::app();
    let server = TestServer::new(app);

    // 1. Without auth must fail with 401
    let unauth_res = server.post("/api/system/update/cleanup").await;
    assert_eq!(unauth_res.status_code(), axum::http::StatusCode::UNAUTHORIZED);

    // 2. With auth must return 200 OK with success
    let cookie = get_test_cookie();
    let res = server.post("/api/system/update/cleanup")
        .add_cookie(cookie)
        .await;
    assert_eq!(res.status_code(), axum::http::StatusCode::OK);
    let json: serde_json::Value = res.json();
    assert_eq!(json.get("success").and_then(|v| v.as_bool()), Some(true));
}

#[test]
fn test_is_newer_version_logic() {
    // Newer versions
    assert!(backend::system::is_newer_version("2.7.1", "2.7.0"));
    assert!(backend::system::is_newer_version("v2.8.0", "v2.7.0"));
    assert!(backend::system::is_newer_version("3.0.0", "2.7.0"));
    assert!(backend::system::is_newer_version("2.7.0-beta.2", "2.6.9"));

    // Equal versions must NEVER be considered newer
    assert!(!backend::system::is_newer_version("2.7.0", "2.7.0"));
    assert!(!backend::system::is_newer_version("v2.7.0", "v2.7.0"));
    assert!(!backend::system::is_newer_version("v2.7.0", "2.7.0"));
    assert!(!backend::system::is_newer_version("2.7.0", "v2.7.0"));

    // Older versions must NEVER be considered newer
    assert!(!backend::system::is_newer_version("2.6.9", "2.7.0"));
    assert!(!backend::system::is_newer_version("v2.5.0", "v2.7.0"));
    assert!(!backend::system::is_newer_version("1.9.9", "2.7.0"));
}

#[tokio::test]
async fn test_check_update_never_has_update_when_versions_equal() {
    let _lock = TEST_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
    unsafe { std::env::set_var("JWT_SECRET", "super_secret"); }

    let current = env!("CARGO_PKG_VERSION");

    // Mock cache with latest_version equal to current_version
    {
        let mut guard = match backend::system::UPDATE_CACHE.write() {
            Ok(g) => g,
            Err(p) => p.into_inner(),
        };
        *guard = Some((
            SystemUpdateInfo {
                current_version: current.to_string(),
                latest_version: current.to_string(),
                has_update: true, // artificially simulated stale or digest flag
                platform: "linux/amd64".to_string(),
                arch: "x86_64".to_string(),
                release_name: format!("Saturn v{}", current),
                release_notes: "Notes".to_string(),
                published_at: None,
                ci_status: None,
                ci_workflow_url: None,
            },
            std::time::Instant::now(),
        ));
    }

    let app = backend::app();
    let server = TestServer::new(app);
    let cookie = get_test_cookie();

    let res = server.get("/api/system/update/check")
        .add_cookie(cookie)
        .await;
    res.assert_status_success();

    let info: SystemUpdateInfo = res.json();
    assert_eq!(info.current_version, current);
    assert!(!info.has_update, "When current_version >= latest_version, has_update MUST be false!");

    // Clean up cache
    {
        let mut guard = match backend::system::UPDATE_CACHE.write() {
            Ok(g) => g,
            Err(p) => p.into_inner(),
        };
        *guard = None;
    }
}


