static TEST_MUTEX: std::sync::Mutex<()> = std::sync::Mutex::new(());

use axum_test::TestServer;
use backend::app;
use jsonwebtoken::{encode, Header, EncodingKey};
use backend::auth::Claims;
use serde_json::json;
use std::fs;
use std::path::PathBuf;
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
        &EncodingKey::from_secret(b"super_secret".as_slice()),
    ).unwrap();

    axum_extra::extract::cookie::Cookie::new("auth_token", token)
}

#[tokio::test]
async fn test_backup_crud_and_schedule() {
    let _lock = TEST_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
    unsafe { std::env::set_var("JWT_SECRET", "super_secret"); }
    let server = TestServer::new(app());
    let auth_cookie = get_test_cookie();

    // 1. Setup dummy app directory
    let dummy_app_dir = PathBuf::from("data/apps/test-backup-app");
    let _ = fs::create_dir_all(&dummy_app_dir);
    let _ = fs::write(dummy_app_dir.join("docker-compose.yml"), "version: '3'\nservices:\n  app:\n    image: alpine\n");
    let _ = fs::write(dummy_app_dir.join("test_data.txt"), "hello backup world");

    // 2. Create backup
    let create_res = server
        .post("/api/backups/create")
        .add_cookie(auth_cookie.clone())
        .json(&json!({
            "app_id": "test-backup-app",
            "stop_container": false
        }))
        .await;

    create_res.assert_status_ok();
    let backup_item: serde_json::Value = create_res.json();
    let backup_id = backup_item.get("id").expect("id exists").as_str().unwrap().to_string();
    assert_eq!(backup_item.get("app_id").unwrap().as_str().unwrap(), "test-backup-app");

    // 3. List backups
    let list_res = server
        .get("/api/backups")
        .add_cookie(auth_cookie.clone())
        .await;
    list_res.assert_status_ok();
    let list: Vec<serde_json::Value> = list_res.json();
    assert!(list.iter().any(|b| b.get("id").unwrap().as_str().unwrap() == backup_id));

    // 4. Get backup stats
    let stats_res = server
        .get("/api/backups/stats")
        .add_cookie(auth_cookie.clone())
        .await;
    stats_res.assert_status_ok();
    let stats: serde_json::Value = stats_res.json();
    assert!(stats.get("total_backups").unwrap().as_u64().unwrap() >= 1);

    // 5. Download backup
    let dl_res = server
        .get(&format!("/api/backups/download/{}", backup_id))
        .add_cookie(auth_cookie.clone())
        .await;
    dl_res.assert_status_ok();

    // 6. Schedule config GET & POST
    let sched_res = server
        .post("/api/backups/schedule")
        .add_cookie(auth_cookie.clone())
        .json(&json!({
            "enabled": true,
            "frequency": "daily",
            "hour": 4,
            "minute": 30,
            "retention_count": 3,
            "target_apps": ["test-backup-app"]
        }))
        .await;
    sched_res.assert_status_ok();

    let get_sched = server
        .get("/api/backups/schedule")
        .add_cookie(auth_cookie.clone())
        .await;
    get_sched.assert_status_ok();
    let sched_data: serde_json::Value = get_sched.json();
    assert_eq!(sched_data.get("hour").unwrap().as_u64().unwrap(), 4);
    assert_eq!(sched_data.get("retention_count").unwrap().as_u64().unwrap(), 3);

    // 7. Delete backup
    let del_res = server
        .delete(&format!("/api/backups/{}", backup_id))
        .add_cookie(auth_cookie.clone())
        .await;
    del_res.assert_status_ok();

    // Clean up dummy dir
    let _ = fs::remove_dir_all(&dummy_app_dir);
}

#[tokio::test]
async fn test_full_system_and_configs_backup() {
    let _lock = TEST_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
    unsafe { std::env::set_var("JWT_SECRET", "super_secret"); }
    let server = TestServer::new(app());
    let auth_cookie = get_test_cookie();

    // 1. Setup dummy app directory, dummy config, and customization
    let dummy_app_dir = PathBuf::from("data/apps/test-full-sys-app");
    let _ = fs::create_dir_all(&dummy_app_dir);
    let _ = fs::write(dummy_app_dir.join("docker-compose.yml"), "version: '3'\nservices:\n  web:\n    image: nginx:alpine\n");
    let _ = fs::write(dummy_app_dir.join("app_state.json"), r#"{"status":"running"}"#);

    // Save customization via API
    let custom_res = server
        .post("/api/system/customization")
        .add_cookie(auth_cookie.clone())
        .json(&json!({
            "theme": "oled",
            "color": "dracula",
            "wallpaper_url": "https://example.com/wp.jpg",
            "wallpaper_opacity": 0.85,
            "wallpaper_blur": 10
        }))
        .await;
    custom_res.assert_status_ok();

    // Verify GET customization
    let get_custom = server
        .get("/api/system/customization")
        .add_cookie(auth_cookie.clone())
        .await;
    get_custom.assert_status_ok();
    let custom_val: serde_json::Value = get_custom.json();
    assert_eq!(custom_val.get("color").and_then(|c| c.as_str()), Some("dracula"));

    // Write dummy homeassistant config
    let _ = fs::create_dir_all("data");
    let _ = fs::write("data/homeassistant.json", r#"{"url":"http://ha.local:8123","token":"ha_token_secret"}"#);

    // 2. Create Full System Backup
    let full_res = server
        .post("/api/backups/create")
        .add_cookie(auth_cookie.clone())
        .json(&json!({
            "target_type": "system_full",
            "stop_container": false
        }))
        .await;

    full_res.assert_status_ok();
    let full_item: serde_json::Value = full_res.json();
    let full_id = full_item.get("id").expect("id exists").as_str().unwrap().to_string();
    assert_eq!(full_item.get("target_type").and_then(|v| v.as_str()), Some("system_full"));
    assert_eq!(full_item.get("app_id").and_then(|v| v.as_str()), Some("system_full"));

    // 3. Create Saturn Configs Backup
    let config_res = server
        .post("/api/backups/create")
        .add_cookie(auth_cookie.clone())
        .json(&json!({
            "target_type": "saturn_configs",
            "stop_container": false
        }))
        .await;

    config_res.assert_status_ok();
    let config_item: serde_json::Value = config_res.json();
    let config_id = config_item.get("id").expect("id exists").as_str().unwrap().to_string();
    assert_eq!(config_item.get("target_type").and_then(|v| v.as_str()), Some("saturn_configs"));

    // 4. Corrupt state before restore
    let _ = fs::write(dummy_app_dir.join("app_state.json"), r#"{"status":"corrupted"}"#);
    let _ = fs::write("data/homeassistant.json", r#"{"url":"http://ha.local:8123","token":"corrupted"}"#);
    let _ = server
        .post("/api/system/customization")
        .add_cookie(auth_cookie.clone())
        .json(&json!({ "theme": "light", "color": "zinc" }))
        .await;

    // Test Restore of full system backup via POST /api/backups/restore/{id}
    let restore_res = server
        .post(&format!("/api/backups/restore/{}", full_id))
        .add_cookie(auth_cookie.clone())
        .await;
    restore_res.assert_status_ok();

    // Verify restored app files
    let restored_content = fs::read_to_string(dummy_app_dir.join("app_state.json")).unwrap();
    assert_eq!(restored_content, r#"{"status":"running"}"#);

    // Verify restored homeassistant config
    let restored_ha = fs::read_to_string("data/homeassistant.json").unwrap();
    assert!(restored_ha.contains("ha_token_secret"));

    // Verify restored customization
    let restored_custom_res = server
        .get("/api/system/customization")
        .add_cookie(auth_cookie.clone())
        .await;
    restored_custom_res.assert_status_ok();
    let restored_custom: serde_json::Value = restored_custom_res.json();
    assert_eq!(restored_custom.get("color").and_then(|c| c.as_str()), Some("dracula"));

    // 5. Cleanup
    let _ = server.delete(&format!("/api/backups/{}", full_id)).add_cookie(auth_cookie.clone()).await;
    let _ = server.delete(&format!("/api/backups/{}", config_id)).add_cookie(auth_cookie.clone()).await;
    let _ = fs::remove_dir_all(&dummy_app_dir);
    let _ = fs::remove_file("data/homeassistant.json");
    let _ = fs::remove_file("data/customization.json");
}


#[tokio::test]
async fn test_restore_from_uploaded_backup_with_generic_name() {
    let _lock = TEST_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
    unsafe { std::env::set_var("JWT_SECRET", "super_secret"); }
    let server = TestServer::new(app());
    let auth_cookie = get_test_cookie();

    // 1. Prepare a staging directory to package a backup with generic name
    let tmp_dir = std::env::temp_dir().join(format!("test_generic_backup_{}", uuid::Uuid::new_v4()));
    let _ = fs::create_dir_all(&tmp_dir);
    let app_dir = tmp_dir.join("apps").join("my-generic-app");
    let _ = fs::create_dir_all(&app_dir);
    let _ = fs::write(app_dir.join("docker-compose.yml"), "version: '3'
services:
  app:
    image: alpine
");
    let _ = fs::write(app_dir.join("data.txt"), "restored_payload_content");

    let configs_dir = tmp_dir.join("configs");
    let _ = fs::create_dir_all(&configs_dir);
    let _ = fs::write(configs_dir.join("customization.json"), r#"{"theme":"dark","color":"emerald"}"#);

    // Package into a generic named tarball: "my_export_data.tar.gz"
    let backups_dir = PathBuf::from("data/backups");
    let _ = fs::create_dir_all(&backups_dir);
    let tar_path = backups_dir.join("my_export_data.tar.gz");

    let output = std::process::Command::new("tar")
        .args(["-czf", tar_path.to_str().unwrap(), "-C", tmp_dir.to_str().unwrap(), "."])
        .output()
        .expect("tar should succeed");
    assert!(output.status.success());
    let _ = fs::remove_dir_all(&tmp_dir);

    // 2. Call POST /api/backups/restore with generic filename
    let restore_res = server
        .post("/api/backups/restore")
        .add_cookie(auth_cookie.clone())
        .json(&json!({
            "filename": "my_export_data.tar.gz"
        }))
        .await;
    restore_res.assert_status_ok();

    // 3. Verify app was restored to data/apps/my-generic-app
    let restored_app_file = PathBuf::from("data/apps/my-generic-app/data.txt");
    assert!(restored_app_file.exists(), "data/apps/my-generic-app/data.txt must exist after restore");
    let content = fs::read_to_string(&restored_app_file).unwrap();
    assert_eq!(content, "restored_payload_content");

    // 4. Verify customization was restored
    let restored_custom_file = PathBuf::from("data/customization.json");
    assert!(restored_custom_file.exists(), "data/customization.json must exist after restore");
    let custom_content = fs::read_to_string(&restored_custom_file).unwrap();
    assert!(custom_content.contains("emerald"), "customization.json must contain restored emerald color");

    // Cleanup
    let _ = fs::remove_file(&tar_path);
    let _ = fs::remove_dir_all("data/apps/my-generic-app");
    let _ = fs::remove_file("data/customization.json");
}
