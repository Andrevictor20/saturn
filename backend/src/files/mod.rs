pub mod types;
pub mod path_utils;
pub mod fs_ops;
pub mod storage;
pub mod content;
pub mod archives;
pub mod subtitles;
pub mod streaming;
pub mod trash;
pub mod shares;
pub mod samba;
pub mod chunked_upload;
pub mod thumbnails;
pub mod subtitle_parser;

pub use types::*;
pub use path_utils::*;
pub use fs_ops::*;
pub use storage::*;
pub use content::*;
pub use archives::*;
pub use subtitles::*;
pub use streaming::*;
pub use trash::*;
pub use shares::*;
pub use samba::*;
pub use chunked_upload::*;
pub use thumbnails::*;

use axum::{
    routing::{delete, get, post, put},
    Router,
};
use crate::state::AppState;

pub fn protected_router() -> Router<AppState> {
    Router::new()
        .route("/api/files/list", get(list_files))
        .route("/api/files/shortcuts", get(get_shortcuts))
        .route("/api/files/storages", get(list_storages))
        .route("/api/files/storages/unmount", post(unmount_storage))
        .route("/api/files/mkdir", post(mkdir))
        .route("/api/files/create", post(create_file))
        .route("/api/files/rename", put(rename_file))
        .route("/api/files/copy", post(copy_file))
        .route("/api/files/move", post(move_file))
        .route("/api/files/delete", post(delete_files))
        .route("/api/files/download", get(download_file))
        .route("/api/files/archive", get(archive_folder))
        .route("/api/files/upload", post(upload_files))
        .route("/api/files/stream", get(stream_media))
        .route("/api/files/stream/transcode", get(stream_transcode_media))
        .route("/api/files/thumbnail", get(get_file_thumbnail))
        .route("/api/files/subtitles", get(get_subtitles))
        .route("/api/files/subtitles/vtt", get(get_subtitle_vtt))
        .route("/api/files/subtitles/raw", get(get_raw_subtitle))
        .route("/api/files/content", get(get_file_content).put(update_file_content))
        .route("/api/files/raw", get(get_raw_file))
        .route("/api/files/extract", post(extract_archive))
        .route("/api/files/compress", post(compress_files))
        .route("/api/files/analyze", get(analyze_directory))
        .route("/api/files/trash", get(list_trash).post(move_to_trash).delete(empty_trash))
        .route("/api/files/trash/restore", post(restore_trash))
        .route("/api/files/share", post(create_share))
        .route("/api/files/shares", get(list_shares))
        .route("/api/files/share/{token}", delete(delete_share))
        .route("/api/samba/status", get(get_samba_status))
        .route("/api/samba/toggle", post(toggle_samba_service))
        .route("/api/samba/shares", get(list_samba_shares).post(create_samba_share))
        .route("/api/samba/shares/{name}", delete(delete_samba_share))
        .route("/api/files/upload/chunk", post(upload_chunk_handler))
        .route("/api/files/upload/status", get(get_upload_status_handler))
        .route("/api/files/upload/complete", post(complete_upload_handler))
}

pub fn public_router() -> Router {
    Router::new()
        .route("/api/public/share/{token}", get(public_get_share))
}
