use axum::{
    extract::Path as AxumPath,
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use uuid::Uuid;
use super::path_utils::{get_mime_type, sanitize_path};
use super::storage::get_dir_size_recursive;
use super::types::{CreateShareRequest, ShareLink, SharesResponse};

pub fn get_shares_file() -> PathBuf {
    let candidate = PathBuf::from("/app/data/shares.json");
    if let Some(parent) = candidate.parent() {
        if fs::create_dir_all(parent).is_ok() {
            if fs::OpenOptions::new().create(true).write(true).open(&candidate).is_ok() {
                return candidate;
            }
        }
    }
    std::env::temp_dir().join("saturn_shares.json")
}

pub fn load_shares() -> Vec<ShareLink> {
    let file = get_shares_file();
    if let Ok(content) = fs::read_to_string(&file) {
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        Vec::new()
    }
}

pub fn save_shares(shares: &[ShareLink]) {
    let file = get_shares_file();
    if let Ok(content) = serde_json::to_string_pretty(shares) {
        let _ = fs::write(&file, content);
    }
}

pub async fn create_share(Json(req): Json<CreateShareRequest>) -> Result<Json<ShareLink>, StatusCode> {
    let path = sanitize_path(&req.path)?;
    if !path.exists() {
        return Err(StatusCode::NOT_FOUND);
    }

    let meta = path.metadata().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let is_dir = meta.is_dir();
    let size = if is_dir { get_dir_size_recursive(&path, None) } else { meta.len() };
    let file_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();

    let now_utc = time::OffsetDateTime::now_utc();
    let created_at = now_utc.format(&time::format_description::well_known::Rfc3339).unwrap_or_default();

    let (expires_at, expires_at_unix) = if let Some(secs) = req.expires_in_seconds {
        let exp = now_utc + time::Duration::seconds(secs as i64);
        (
            Some(exp.format(&time::format_description::well_known::Rfc3339).unwrap_or_default()),
            Some(exp.unix_timestamp())
        )
    } else {
        (None, None)
    };

    let token = Uuid::new_v4().to_string().replace('-', "")[..16].to_string();

    let share = ShareLink {
        token,
        file_path: req.path.clone(),
        file_name,
        is_dir,
        size,
        created_at,
        expires_at,
        expires_at_unix,
    };

    let mut shares = load_shares();
    shares.push(share.clone());
    save_shares(&shares);

    Ok(Json(share))
}

pub async fn list_shares() -> Json<SharesResponse> {
    let shares = load_shares();
    let now_unix = time::OffsetDateTime::now_utc().unix_timestamp();

    // Filter out expired shares
    let active_shares: Vec<ShareLink> = shares
        .into_iter()
        .filter(|s| {
            if let Some(exp_unix) = s.expires_at_unix {
                return exp_unix > now_unix;
            }
            true
        })
        .collect();

    save_shares(&active_shares);
    Json(SharesResponse { shares: active_shares })
}

pub async fn delete_share(AxumPath(token): AxumPath<String>) -> Result<Json<serde_json::Value>, StatusCode> {
    let mut shares = load_shares();
    let initial_len = shares.len();
    shares.retain(|s| s.token != token);
    if shares.len() == initial_len {
        return Err(StatusCode::NOT_FOUND);
    }
    save_shares(&shares);
    Ok(Json(serde_json::json!({ "success": true })))
}

pub async fn public_get_share(AxumPath(token): AxumPath<String>) -> Result<Response, StatusCode> {
    let shares = load_shares();
    let share = shares.iter().find(|s| s.token == token).ok_or(StatusCode::NOT_FOUND)?;

    // Check expiration
    if let Some(exp_unix) = share.expires_at_unix {
        if exp_unix <= time::OffsetDateTime::now_utc().unix_timestamp() {
            return Err(StatusCode::GONE);
        }
    }

    let path = sanitize_path(&share.file_path)?;
    if !path.exists() {
        return Err(StatusCode::NOT_FOUND);
    }

    if share.is_dir {
        // Enforce maximum directory size to prevent memory exhaustion / DoS (max 300 MB for in-memory zip)
        const MAX_SHARED_DIR_ZIP_BYTES: u64 = 300 * 1024 * 1024;
        let total_size = get_dir_size_recursive(&path, None);
        if total_size > MAX_SHARED_DIR_ZIP_BYTES {
            return Err(StatusCode::PAYLOAD_TOO_LARGE);
        }

        // If directory, download as zip
        let mut zip_buf = std::io::Cursor::new(Vec::new());
        {
            let mut zip = zip::ZipWriter::new(&mut zip_buf);
            let options = zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated);

            fn add_dir_to_zip(
                zip: &mut zip::ZipWriter<&mut std::io::Cursor<Vec<u8>>>,
                dir_path: &Path,
                prefix: &Path,
                options: zip::write::SimpleFileOptions,
            ) -> std::io::Result<()> {
                for entry in fs::read_dir(dir_path)? {
                    let entry = entry?;
                    let path = entry.path();
                    let name = match path.strip_prefix(prefix) {
                        Ok(n) => n,
                        Err(_) => continue,
                    };
                    if path.is_dir() {
                        zip.add_directory(name.to_string_lossy(), options)?;
                        add_dir_to_zip(zip, &path, prefix, options)?;
                    } else if path.is_file() {
                        zip.start_file(name.to_string_lossy(), options)?;
                        let mut f = File::open(&path)?;
                        let mut chunk = [0u8; 64 * 1024];
                        loop {
                            let n = f.read(&mut chunk)?;
                            if n == 0 {
                                break;
                            }
                            zip.write_all(&chunk[..n])?;
                        }
                    }
                }
                Ok(())
            }

            let _ = add_dir_to_zip(&mut zip, &path, &path, options);
            let _ = zip.finish();
        }

        let result_bytes = zip_buf.into_inner();
        let mut headers = HeaderMap::new();
        headers.insert(header::CONTENT_TYPE, "application/zip".parse().unwrap());
        headers.insert(
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"{}.zip\"", share.file_name).parse().unwrap(),
        );
        headers.insert(header::CONTENT_LENGTH, result_bytes.len().to_string().parse().unwrap());

        Ok((headers, result_bytes).into_response())
    } else {
        let mut file = File::open(&path).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let mut contents = Vec::new();
        file.read_to_end(&mut contents).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        let mime = get_mime_type(ext);

        let mut headers = HeaderMap::new();
        headers.insert(header::CONTENT_TYPE, mime.parse().unwrap());
        headers.insert(
            header::CONTENT_DISPOSITION,
            format!("inline; filename=\"{}\"", share.file_name).parse().unwrap(),
        );
        headers.insert(header::CONTENT_LENGTH, contents.len().to_string().parse().unwrap());

        Ok((headers, contents).into_response())
    }
}
