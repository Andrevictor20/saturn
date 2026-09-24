use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileItem {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: String,
    pub extension: String,
    pub mime_type: String,
    pub is_hidden: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ListFilesResponse {
    pub current_path: String,
    pub items: Vec<FileItem>,
    pub total_items: usize,
}

#[derive(Debug, Deserialize)]
pub struct ListFilesQuery {
    pub path: Option<String>,
    pub sort: Option<String>,
    pub order: Option<String>,
    pub page: Option<usize>,
    pub limit: Option<usize>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ShortcutPlace {
    pub id: String,
    pub label: String,
    pub path: String,
    pub icon: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ShortcutsResponse {
    pub home: String,
    pub documents: String,
    pub downloads: String,
    pub pictures: String,
    pub music: String,
    pub videos: String,
    pub root: String,
    #[serde(default)]
    pub places: Vec<ShortcutPlace>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gallery: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub media: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MountItem {
    pub name: String,
    pub mount_point: String,
    pub fs_type: String,
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub available_bytes: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StoragesResponse {
    pub mounts: Vec<MountItem>,
}

#[derive(Debug, Deserialize)]
pub struct UnmountRequest {
    pub mount_point: String,
}

#[derive(Debug, Deserialize)]
pub struct MkdirRequest {
    pub path: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateFileRequest {
    pub path: String,
}

#[derive(Debug, Deserialize)]
pub struct RenameRequest {
    pub old_path: String,
    pub new_path: String,
}

#[derive(Debug, Deserialize)]
pub struct CopyMoveRequest {
    pub source: String,
    pub destination: String,
}

#[derive(Debug, Deserialize)]
pub struct DeleteRequest {
    pub paths: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct FileContentQuery {
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileContentResponse {
    pub path: String,
    pub content: String,
    pub size: u64,
    #[serde(default)]
    pub etag: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateContentRequest {
    pub path: String,
    pub content: String,
    #[serde(default)]
    pub etag: Option<String>,
    #[serde(default)]
    pub force: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileConflictErrorResponse {
    pub error: String,
    pub message: String,
    pub current_etag: String,
    pub current_content: String,
    pub current_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubtitleItem {
    pub name: String,
    pub path: String,
    pub label: String,
    pub lang: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SubtitlesResponse {
    pub subtitles: Vec<SubtitleItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<f64>,
}

#[derive(Debug, Deserialize)]
pub struct ExtractRequest {
    pub path: String,
    pub destination: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CompressRequest {
    pub paths: Vec<String>,
    pub destination_name: String,
    pub destination_dir: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AnalyzeQuery {
    pub path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiskItemStat {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub percentage: f32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DiskAnalysisResponse {
    pub path: String,
    pub total_size: u64,
    pub item_count: usize,
    pub items: Vec<DiskItemStat>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TrashItem {
    pub id: String,
    pub name: String,
    pub original_path: String,
    pub trash_path: String,
    pub is_dir: bool,
    pub size: u64,
    pub deleted_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TrashListResponse {
    pub items: Vec<TrashItem>,
    pub total_size: u64,
}

#[derive(Debug, Deserialize)]
pub struct MoveToTrashRequest {
    pub paths: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct RestoreTrashRequest {
    pub ids: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ShareLink {
    pub token: String,
    pub file_path: String,
    pub file_name: String,
    pub is_dir: bool,
    pub size: u64,
    pub created_at: String,
    #[serde(default)]
    pub expires_at: Option<String>,
    #[serde(default)]
    pub expires_at_unix: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SharesResponse {
    pub shares: Vec<ShareLink>,
}

#[derive(Debug, Deserialize)]
pub struct CreateShareRequest {
    pub path: String,
    pub expires_in_seconds: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub struct DownloadQuery {
    pub path: String,
}

#[derive(Debug, Deserialize)]
pub struct TranscodeQuery {
    pub path: String,
    pub start: Option<f64>,
    pub mode: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UploadQuery {
    pub destination: Option<String>,
}
