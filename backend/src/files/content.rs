use axum::{
    extract::Query,
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use std::fs::{self, File};
use std::io::Read;
use super::path_utils::{get_mime_type, sanitize_path};
use super::types::{
    DownloadQuery, FileConflictErrorResponse, FileContentQuery, FileContentResponse,
    UpdateContentRequest,
};

pub fn generate_file_etag(meta: &fs::Metadata) -> String {
    let mtime = meta.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH);
    let duration = mtime
        .duration_since(std::time::SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    format!("\"{:x}-{:x}\"", duration.as_nanos(), meta.len())
}

pub async fn get_file_content(Query(q): Query<FileContentQuery>) -> Result<Response, StatusCode> {
    let path = sanitize_path(&q.path)?;
    if !path.exists() || path.is_dir() {
        return Err(StatusCode::NOT_FOUND);
    }

    let meta = path.metadata().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if meta.len() > 10 * 1024 * 1024 {
        // > 10MB limit for text editor
        return Err(StatusCode::PAYLOAD_TOO_LARGE);
    }

    let content = fs::read_to_string(&path).map_err(|_| StatusCode::BAD_REQUEST)?;
    let etag = generate_file_etag(&meta);

    let body = Json(FileContentResponse {
        path: path.to_string_lossy().to_string(),
        content,
        size: meta.len(),
        etag: etag.clone(),
    });

    let mut response = body.into_response();
    if let Ok(etag_val) = HeaderValue::from_str(&etag) {
        response.headers_mut().insert(header::ETAG, etag_val);
    }

    Ok(response)
}

pub async fn update_file_content(
    headers: HeaderMap,
    Json(req): Json<UpdateContentRequest>,
) -> Result<Response, (StatusCode, Json<serde_json::Value>)> {
    let path = sanitize_path(&req.path).map_err(|status| (status, Json(serde_json::json!({ "error": "Invalid path" }))))?;
    if !path.exists() || path.is_dir() {
        return Err((StatusCode::NOT_FOUND, Json(serde_json::json!({ "error": "File not found" }))));
    }

    let meta = path.metadata().map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": "Failed to read file metadata" }))))?;
    let current_etag = generate_file_etag(&meta);

    let is_force = req.force.unwrap_or(false);
    let if_match_header = headers.get(header::IF_MATCH).and_then(|h| h.to_str().ok());
    let client_etag = if_match_header.or(req.etag.as_deref());

    // Se If-Match / etag foi fornecido e não é force nem wildcard "*", validar concorrência
    if !is_force {
        if let Some(expected_etag) = client_etag {
            let normalized_expected = expected_etag.trim().trim_matches('"');
            let normalized_current = current_etag.trim().trim_matches('"');
            if normalized_expected != "*" && normalized_expected != normalized_current {
                let current_content = fs::read_to_string(&path).unwrap_or_default();
                let conflict_body = FileConflictErrorResponse {
                    error: "Conflict".to_string(),
                    message: "The file was modified on disk by another user or process.".to_string(),
                    current_etag: current_etag.clone(),
                    current_content,
                    current_size: meta.len(),
                };
                return Err((
                    StatusCode::PRECONDITION_FAILED,
                    Json(serde_json::to_value(conflict_body).unwrap_or_default()),
                ));
            }
        }
    }

    // Escrita atômica: gravar em arquivo temporário no mesmo diretório e renomear
    let parent_dir = path.parent().unwrap_or(&path);
    let tmp_file_name = format!(
        ".{}.saturn_tmp_{}",
        path.file_name().and_then(|n| n.to_str()).unwrap_or("tmp"),
        uuid::Uuid::new_v4()
    );
    let tmp_path = parent_dir.join(tmp_file_name);

    if fs::write(&tmp_path, req.content.as_bytes()).is_err() {
        let _ = fs::remove_file(&tmp_path);
        fs::write(&path, req.content.as_bytes())
            .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": "Failed to write file" }))))?;
    } else if fs::rename(&tmp_path, &path).is_err() {
        let _ = fs::remove_file(&tmp_path);
        fs::write(&path, req.content.as_bytes())
            .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": "Failed to write file" }))))?;
    }

    let new_meta = path.metadata().map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": "Failed to read updated metadata" }))))?;
    let new_etag = generate_file_etag(&new_meta);

    let body = Json(serde_json::json!({
        "success": true,
        "new_etag": new_etag,
        "etag": new_etag,
    }));

    let mut response = body.into_response();
    if let Ok(etag_val) = HeaderValue::from_str(&new_etag) {
        response.headers_mut().insert(header::ETAG, etag_val);
    }

    Ok(response)
}

pub async fn get_raw_file(Query(q): Query<DownloadQuery>) -> Result<Response, StatusCode> {
    let path = sanitize_path(&q.path)?;
    if !path.exists() || path.is_dir() {
        return Err(StatusCode::NOT_FOUND);
    }

    let mut file = File::open(&path).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let mut contents = Vec::new();
    file.read_to_end(&mut contents).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
    let mime = get_mime_type(ext);

    let mut headers = HeaderMap::new();
    headers.insert(header::CONTENT_TYPE, mime.parse().unwrap());
    headers.insert(header::CONTENT_DISPOSITION, "inline".parse().unwrap());
    headers.insert(header::CONTENT_LENGTH, contents.len().to_string().parse().unwrap());

    Ok((headers, contents).into_response())
}
