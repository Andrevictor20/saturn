use axum::{
    extract::{Multipart, Query},
    http::StatusCode,
    response::{IntoResponse, Json},
};
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tracing::{debug, error, info, warn};
use crate::files::path_utils::sanitize_path;

// Teto total de bytes por envio fragmentado. Evita que um upload grande encha
// o disco ou falhe silenciosamente (sem OOM, pois a montagem é feita por
// streaming com buffer fixo de 64 KB). 10 GB é um teto generoso para vídeos
// domésticos e é consistente com o limite já usado para backups.
const MAX_UPLOAD_TOTAL_BYTES: u64 = 10 * 1024 * 1024 * 1024;

fn get_chunks_base_dir() -> PathBuf {
    let base = if std::path::Path::new("/data").is_dir() {
        "/data"
    } else {
        "data"
    };
    PathBuf::from(format!("{}/.saturn_chunks", base))
}

#[derive(Debug, Deserialize)]
pub struct UploadStatusQuery {
    pub upload_id: String,
}

#[derive(Debug, Serialize)]
pub struct UploadStatusResponse {
    pub upload_id: String,
    pub uploaded_chunks: Vec<u32>,
    pub exists: bool,
}

#[derive(Debug, Deserialize)]
pub struct CompleteUploadPayload {
    pub upload_id: String,
    pub filename: String,
    pub destination: Option<String>,
}

/// Remove o diretório temporário de fragmentos (best-effort).
fn cleanup_upload_dir(upload_dir: &Path) {
    if let Err(e) = fs::remove_dir_all(upload_dir) {
        warn!("chunked_upload: falha ao limpar diretório temporário {:?}: {}", upload_dir, e);
    }
}

/// Rollback em caso de erro: remove o arquivo final parcial e os fragmentos.
fn abort_upload(upload_dir: &Path, final_file_path: &Path) {
    let _ = fs::remove_file(final_file_path);
    cleanup_upload_dir(upload_dir);
}

/// Soma o tamanho de todos os fragmentos já gravados na sessão.
fn chunk_total_size(upload_dir: &Path) -> u64 {
    let mut total = 0u64;
    if let Ok(entries) = fs::read_dir(upload_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("chunk") {
                total += fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
            }
        }
    }
    total
}

pub async fn upload_chunk_handler(
    mut multipart: Multipart,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let mut upload_id = String::new();
    let mut chunk_index: u32 = 0;
    let mut chunk_data: Option<Vec<u8>> = None;

    while let Ok(Some(field)) = multipart.next_field().await {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "upload_id" => {
                upload_id = field.text().await.unwrap_or_default();
            }
            "chunk_index" => {
                let text = field.text().await.unwrap_or_default();
                chunk_index = text.parse::<u32>().unwrap_or(0);
            }
            "chunk" | "data" => {
                let bytes = field.bytes().await.map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
                chunk_data = Some(bytes.to_vec());
            }
            _ => {}
        }
    }

    if upload_id.is_empty() {
        warn!("upload_chunk_handler: upload_id vazio");
        return Err((StatusCode::BAD_REQUEST, "upload_id é obrigatório".to_string()));
    }

    let data = match chunk_data {
        Some(d) => d,
        None => {
            warn!("upload_chunk_handler: chunk data ausente (upload_id={}, chunk_index={})", upload_id, chunk_index);
            return Err((StatusCode::BAD_REQUEST, "chunk data ausente".to_string()));
        }
    };

    // Safe path inside chunks base dir
    let clean_id: String = upload_id.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-').collect();
    let upload_dir = get_chunks_base_dir().join(&clean_id);

    if let Err(e) = fs::create_dir_all(&upload_dir) {
        error!("upload_chunk_handler: falha ao criar diretório de upload {:?}: {}", upload_dir, e);
        return Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string()));
    }

    let chunk_path = upload_dir.join(format!("{}.chunk", chunk_index));
    let data_len = data.len();
    if let Err(e) = fs::write(&chunk_path, data) {
        error!("upload_chunk_handler: falha ao gravar chunk {:?} (upload_id={}, chunk_index={}, bytes={}): {}", chunk_path, clean_id, chunk_index, data_len, e);
        return Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string()));
    }

    info!("upload_chunk_handler: chunk gravado {:?} (upload_id={}, chunk_index={}, bytes={})", chunk_path, clean_id, chunk_index, data_len);

    Ok(Json(serde_json::json!({
        "success": true,
        "upload_id": clean_id,
        "chunk_index": chunk_index,
    })))
}

pub async fn get_upload_status_handler(
    Query(q): Query<UploadStatusQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let clean_id: String = q.upload_id.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-').collect();
    let upload_dir = get_chunks_base_dir().join(&clean_id);

    if !upload_dir.exists() {
        return Ok(Json(UploadStatusResponse {
            upload_id: clean_id,
            uploaded_chunks: Vec::new(),
            exists: false,
        }));
    }

    let mut uploaded_chunks = Vec::new();
    if let Ok(entries) = fs::read_dir(&upload_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(ext) = path.extension() {
                if ext == "chunk" {
                    if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                        if let Ok(idx) = stem.parse::<u32>() {
                            uploaded_chunks.push(idx);
                        }
                    }
                }
            }
        }
    }

    uploaded_chunks.sort();

    debug!("get_upload_status_handler: upload_id={} exists={} chunks={:?}", clean_id, upload_dir.exists(), uploaded_chunks);

    Ok(Json(UploadStatusResponse {
        upload_id: clean_id,
        uploaded_chunks,
        exists: true,
    }))
}

pub async fn complete_upload_handler(
    Json(payload): Json<CompleteUploadPayload>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let clean_id: String = payload.upload_id.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-').collect();
    let upload_dir = get_chunks_base_dir().join(&clean_id);

    info!("complete_upload_handler: início (upload_id={}, filename={}, destination={:?})", 
        clean_id, payload.filename, payload.destination);

    if !upload_dir.exists() {
        warn!("complete_upload_handler: sessão de upload não encontrada {:?}", upload_dir);
        return Err((StatusCode::NOT_FOUND, "Sessão de upload não encontrada".to_string()));
    }

    let dest_str = payload.destination.unwrap_or_else(|| "/DATA".to_string());
    let dest_dir = match sanitize_path(&dest_str) {
        Ok(d) => d,
        Err(_) => {
            warn!("complete_upload_handler: destino inválido {}", dest_str);
            return Err((StatusCode::BAD_REQUEST, "Destino inválido".to_string()));
        }
    };

    if let Err(e) = fs::create_dir_all(&dest_dir) {
        error!("complete_upload_handler: falha ao criar diretório destino {:?}: {}", dest_dir, e);
        return Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string()));
    }

    let final_file_path = dest_dir.join(&payload.filename);

    // Read and sort all chunks
    let mut chunk_indices = Vec::new();
    if let Ok(entries) = fs::read_dir(&upload_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("chunk") {
                if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                    if let Ok(idx) = stem.parse::<u32>() {
                        chunk_indices.push(idx);
                    }
                }
            }
        }
    }

    if chunk_indices.is_empty() {
        warn!("complete_upload_handler: nenhuma fatia encontrada (upload_id={})", clean_id);
        cleanup_upload_dir(&upload_dir);
        return Err((StatusCode::BAD_REQUEST, "Nenhuma fatia encontrada para montar o arquivo".to_string()));
    }

    chunk_indices.sort();
    debug!("complete_upload_handler: montando {} chunks (upload_id={}) para {:?}", chunk_indices.len(), clean_id, final_file_path);

    // Limite total de upload: rejeita com 413 antes de montar (evita encher disco).
    let total_size = chunk_total_size(&upload_dir);
    if total_size > MAX_UPLOAD_TOTAL_BYTES {
        warn!("complete_upload_handler: limite total excedido (upload_id={}, total_bytes={}, limite_bytes={})", clean_id, total_size, MAX_UPLOAD_TOTAL_BYTES);
        cleanup_upload_dir(&upload_dir);
        return Err((
            StatusCode::PAYLOAD_TOO_LARGE,
            format!(
                "Limite total de upload excedido: {} bytes (máximo permitido: {} bytes)",
                total_size, MAX_UPLOAD_TOTAL_BYTES
            ),
        ));
    }

    let mut output_file = match File::create(&final_file_path) {
        Ok(f) => f,
        Err(e) => {
            error!("complete_upload_handler: falha ao criar arquivo final {:?}: {}", final_file_path, e);
            cleanup_upload_dir(&upload_dir);
            return Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string()));
        }
    };

    let mut buf = [0u8; 64 * 1024];

    for idx in chunk_indices {
        let chunk_file_path = upload_dir.join(format!("{}.chunk", idx));
        let mut chunk_file = match File::open(&chunk_file_path) {
            Ok(f) => f,
            Err(e) => {
                error!("complete_upload_handler: falha ao abrir chunk {:?}: {}", chunk_file_path, e);
                abort_upload(&upload_dir, &final_file_path);
                return Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string()));
            }
        };

        loop {
            let n = match chunk_file.read(&mut buf) {
                Ok(n) => n,
                Err(e) => {
                    error!("complete_upload_handler: falha ao ler chunk {:?}: {}", chunk_file_path, e);
                    abort_upload(&upload_dir, &final_file_path);
                    return Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string()));
                }
            };
            if n == 0 {
                break;
            }
            if let Err(e) = output_file.write_all(&buf[..n]) {
                error!("complete_upload_handler: falha ao escrever em {:?}: {}", final_file_path, e);
                abort_upload(&upload_dir, &final_file_path);
                return Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string()));
            }
        }
    }

    if let Err(e) = output_file.flush() {
        error!("complete_upload_handler: falha ao flush {:?}: {}", final_file_path, e);
        abort_upload(&upload_dir, &final_file_path);
        return Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string()));
    }

    let total_size = fs::metadata(&final_file_path).map(|m| m.len()).unwrap_or(0);

    // Clean up temp chunks directory (always, even on success)
    cleanup_upload_dir(&upload_dir);

    info!("complete_upload_handler: concluído com sucesso (upload_id={}, arquivo={:?}, size_bytes={})", clean_id, final_file_path, total_size);

    Ok(Json(serde_json::json!({
        "success": true,
        "filename": payload.filename,
        "destination": dest_dir.to_string_lossy(),
        "size_bytes": total_size,
    })))
}
