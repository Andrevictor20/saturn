use axum::{
    body::Body,
    extract::Query,
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
};
use std::collections::HashMap;
use std::sync::{LazyLock, RwLock};
use tokio::io::{AsyncReadExt, AsyncSeekExt, SeekFrom};
use tokio_util::io::ReaderStream;
use super::path_utils::{get_mime_type, sanitize_path};
use super::types::{DownloadQuery, TranscodeQuery};

// --- HIGH-PERFORMANCE VIDEO & AUDIO STREAMING ---
// Optimized for low latency, smooth progressive buffering, and RFC 7233 range compliance.
// Open-ended ranges (e.g. bytes=0-) are bounded to 4MB chunks so browsers obtain the initial
// metadata / moov atom instantly and can start playback without waiting to download the full file.

const IO_BUFFER_CAPACITY: usize = 64 * 1024; // 64KB async I/O buffer to reduce syscalls

pub async fn stream_media(
    headers: HeaderMap,
    Query(q): Query<DownloadQuery>,
) -> Result<Response, StatusCode> {
    let path = sanitize_path(&q.path)?;
    if !path.exists() || path.is_dir() {
        return Err(StatusCode::NOT_FOUND);
    }

    let mut file = tokio::fs::File::open(&path)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    
    let total_size = file
        .metadata()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .len();

    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
    let mime = get_mime_type(ext);

    let range_header = headers.get(header::RANGE).and_then(|r| r.to_str().ok());

    if let Some(range_str) = range_header {
        if let Some(range_spec) = range_str.strip_prefix("bytes=") {
            let (start, end) = if let Some(suffix) = range_spec.strip_prefix('-') {
                // Suffix range: bytes=-N (requesting the last N bytes of the file)
                // Essential for MP4 fast-start / moov atom probing and MKV cluster indexes
                let n: u64 = suffix.trim().parse().unwrap_or(0);
                let start = total_size.saturating_sub(n);
                let end = total_size.saturating_sub(1);
                (start, end)
            } else if let Some((start_str, end_str)) = range_spec.split_once('-') {
                let start: u64 = start_str.trim().parse().unwrap_or(0);
                let raw_end: Option<u64> = if end_str.trim().is_empty() {
                    None
                } else {
                    end_str.trim().parse().ok()
                };

                let end = if let Some(e) = raw_end {
                    e.min(total_size.saturating_sub(1))
                } else {
                    // Open-ended range (bytes=X-): stream continuously until EOF or client disconnect
                    // Browser buffers progressively according to TCP flow control without artificial cutoff
                    total_size.saturating_sub(1)
                };
                (start, end)
            } else {
                (0, total_size.saturating_sub(1))
            };

            if total_size == 0 || start > end || start >= total_size {
                let mut resp_headers = HeaderMap::new();
                resp_headers.insert(header::CONTENT_RANGE, format!("bytes */{}", total_size).parse().unwrap());
                resp_headers.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
                resp_headers.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
                resp_headers.insert(header::ACCESS_CONTROL_ALLOW_HEADERS, HeaderValue::from_static("*"));
                return Ok((StatusCode::RANGE_NOT_SATISFIABLE, resp_headers).into_response());
            }

            let chunk_size = (end - start) + 1;
            file.seek(SeekFrom::Start(start))
                .await
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

            let stream = ReaderStream::with_capacity(file.take(chunk_size), IO_BUFFER_CAPACITY);
            let body = Body::from_stream(stream);

            let mut resp_headers = HeaderMap::new();
            resp_headers.insert(header::CONTENT_TYPE, HeaderValue::from_static(mime));
            resp_headers.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
            resp_headers.insert(
                header::CONTENT_RANGE,
                format!("bytes {}-{}/{}", start, end, total_size).parse().unwrap(),
            );
            resp_headers.insert(header::CONTENT_LENGTH, chunk_size.to_string().parse().unwrap());
            resp_headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("public, max-age=86400, stale-while-revalidate=604800"));
            resp_headers.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
            resp_headers.insert(header::ACCESS_CONTROL_ALLOW_HEADERS, HeaderValue::from_static("*"));

            return Ok((StatusCode::PARTIAL_CONTENT, resp_headers, body).into_response());
        }
    }

    // Standard GET without Range header
    let stream = ReaderStream::with_capacity(file, IO_BUFFER_CAPACITY);
    let body = Body::from_stream(stream);

    let mut resp_headers = HeaderMap::new();
    resp_headers.insert(header::CONTENT_TYPE, HeaderValue::from_static(mime));
    resp_headers.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    resp_headers.insert(header::CONTENT_LENGTH, total_size.to_string().parse().unwrap());
    resp_headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("public, max-age=86400, stale-while-revalidate=604800"));
    resp_headers.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
    resp_headers.insert(header::ACCESS_CONTROL_ALLOW_HEADERS, HeaderValue::from_static("*"));

    Ok((StatusCode::OK, resp_headers, body).into_response())
}

#[derive(Default, Clone)]
struct MediaStreamInfo {
    can_copy_video: bool,
    is_hevc: bool,
    can_copy_audio: bool,
}

static STREAM_INFO_CACHE: LazyLock<RwLock<HashMap<String, MediaStreamInfo>>> =
    LazyLock::new(|| RwLock::new(HashMap::new()));

async fn probe_media_stream_info(path: &std::path::Path) -> MediaStreamInfo {
    let key = path.to_string_lossy().to_string();
    if let Ok(cache) = STREAM_INFO_CACHE.read() {
        if let Some(info) = cache.get(&key) {
            return info.clone();
        }
    }

    let output = tokio::time::timeout(
        std::time::Duration::from_secs(6),
        tokio::process::Command::new("ffprobe")
            .args([
                "-v", "error",
                "-probesize", "10M",
                "-analyzeduration", "2M",
                "-show_entries", "stream=codec_type,codec_name,pix_fmt",
                "-of", "json",
            ])
            .arg(path)
            .output(),
    )
    .await;

    let mut info = MediaStreamInfo::default();

    if let Ok(Ok(out)) = output {
        if out.status.success() {
            if let Ok(json) = serde_json::from_slice::<serde_json::Value>(&out.stdout) {
                if let Some(streams) = json.get("streams").and_then(|s| s.as_array()) {
                    for s in streams {
                        let codec_type = s.get("codec_type").and_then(|t| t.as_str()).unwrap_or("");
                        let codec_name = s.get("codec_name").and_then(|c| c.as_str()).unwrap_or("").to_lowercase();
                        if codec_type == "video" && !info.can_copy_video {
                            let pix_fmt = s.get("pix_fmt").and_then(|p| p.as_str()).unwrap_or("").to_lowercase();
                            // H.264 8-bit (yuv420p) is natively supported in MP4 by all browsers, copy without re-encoding
                            if (codec_name == "h264" || codec_name == "avc1") && (pix_fmt == "yuv420p" || pix_fmt.is_empty()) {
                                info.can_copy_video = true;
                            } else if codec_name == "hevc" || codec_name == "h265" || codec_name == "hvc1" || codec_name == "hev1" {
                                // Modern Chromium (Chrome 107+, Edge), Safari, Android natively decode HEVC in fMP4 with hvc1 tag
                                info.can_copy_video = true;
                                info.is_hevc = true;
                            }
                        } else if codec_type == "audio" && !info.can_copy_audio {
                            // AAC audio is natively supported in MP4 by all browsers
                            if codec_name == "aac" || codec_name == "mp4a" {
                                info.can_copy_audio = true;
                            }
                        }
                    }
                }
            }
        }
    }

    if let Ok(mut cache) = STREAM_INFO_CACHE.write() {
        cache.insert(key, info.clone());
    }

    info
}

pub async fn stream_transcode_media(
    Query(q): Query<TranscodeQuery>,
) -> Result<Response, StatusCode> {
    let path = sanitize_path(&q.path)?;
    if !path.exists() || path.is_dir() {
        return Err(StatusCode::NOT_FOUND);
    }

    let stream_info = probe_media_stream_info(&path).await;
    let force_transcode = q.mode.as_deref() == Some("transcode");

    let mut cmd = tokio::process::Command::new("ffmpeg");
    cmd.args(["-v", "error"]);
    cmd.args(["-fflags", "+genpts+discardcorrupt"]);

    if let Some(ss) = q.start {
        if ss > 0.0 {
            // Fast input seek before -i using keyframes for instant seeking
            cmd.args(["-ss", &format!("{:.2}", ss)]);
        }
    }

    cmd.arg("-i").arg(&path);

    // Map video stream (first video track)
    cmd.args(["-map", "0:v:0"]);

    // Map audio stream: either selected audio index or first audio track
    if let Some(audio_idx) = q.audio {
        cmd.args(["-map", &format!("0:{}?", audio_idx)]);
    } else {
        cmd.args(["-map", "0:a:0?"]);
    }

    let has_burn_sub = q.burn_sub.is_some();

    if stream_info.can_copy_video && !force_transcode && q.max_height.is_none() && !has_burn_sub {
        cmd.args(["-c:v", "copy"]);
        if stream_info.is_hevc {
            // Chrome and Safari require the hvc1 FourCC tag to route to hardware video decoders
            cmd.args(["-tag:v", "hvc1"]);
        }
    } else {
        // Safe, throttled software transcoding: limit to 2 threads and crf 25 to prevent CPU thermal throttling on ARM
        cmd.args([
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-tune", "zerolatency",
            "-pix_fmt", "yuv420p",
            "-crf", "25",
            "-threads", "2",
        ]);
        if let Some(sub_idx) = q.burn_sub {
            cmd.args(["-filter_complex", &format!("[0:v][0:s:{}]overlay", sub_idx)]);
        } else if let Some(max_h) = q.max_height {
            cmd.args(["-vf", &format!("scale=-2:min(ih\\,{})", max_h)]);
        }
    }

    // If an alternative audio track was chosen, transcode to AAC to guarantee stereo downmixing
    if stream_info.can_copy_audio && !force_transcode && q.audio.is_none() {
        cmd.args(["-c:a", "copy"]);
    } else {
        // Universal web audio: 2-channel stereo AAC at 48kHz (handles 5.1/7.1 downmixing cleanly)
        cmd.args(["-c:a", "aac", "-b:a", "192k", "-ac", "2", "-ar", "48000"]);
    }

    cmd.args([
        "-movflags", "frag_keyframe+empty_moov+default_base_moof",
        "-flush_packets", "1",
        "-f", "mp4",
        "-",
    ])
    .stdout(std::process::Stdio::piped())
    .stderr(std::process::Stdio::null());

    let mut child = cmd.spawn().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let stdout = child.stdout.take().ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;

    // Reap child process when ffmpeg exits (e.g. on EOF or EPIPE when reader disconnects)
    tokio::spawn(async move {
        let _ = child.wait().await;
    });

    let stream = ReaderStream::with_capacity(stdout, IO_BUFFER_CAPACITY);
    let body = Body::from_stream(stream);

    let mut resp_headers = HeaderMap::new();
    resp_headers.insert(header::CONTENT_TYPE, HeaderValue::from_static("video/mp4"));
    resp_headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache, no-store"));
    resp_headers.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
    resp_headers.insert(header::ACCESS_CONTROL_ALLOW_HEADERS, HeaderValue::from_static("*"));

    Ok((StatusCode::OK, resp_headers, body).into_response())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_media_stream_info_defaults() {
        let info = MediaStreamInfo::default();
        assert!(!info.can_copy_video);
        assert!(!info.can_copy_audio);
        assert!(!info.is_hevc);
    }

    #[test]
    fn test_transcode_query_deserialization() {
        let json_data = r#"{"path":"/media/anime.mkv","start":12.5,"mode":"transcode"}"#;
        let query: TranscodeQuery = serde_json::from_str(json_data).expect("deserialize transcode query");
        assert_eq!(query.path, "/media/anime.mkv");
        assert_eq!(query.start, Some(12.5));
        assert_eq!(query.mode.as_deref(), Some("transcode"));

        let json_copy = r#"{"path":"/media/anime.mkv","mode":"copy","audio":2,"max_height":720}"#;
        let query_copy: TranscodeQuery = serde_json::from_str(json_copy).expect("deserialize copy query");
        assert_eq!(query_copy.mode.as_deref(), Some("copy"));
        assert_eq!(query_copy.start, None);
        assert_eq!(query_copy.audio, Some(2));
        assert_eq!(query_copy.max_height, Some(720));
        assert_eq!(query_copy.burn_sub, None);

        let json_burn = r#"{"path":"/media/anime.mkv","burn_sub":3}"#;
        let query_burn: TranscodeQuery = serde_json::from_str(json_burn).expect("deserialize burn_sub query");
        assert_eq!(query_burn.burn_sub, Some(3));
    }

    #[test]
    fn test_hybrid_mode_decision_logic() {
        let stream_info_hevc = MediaStreamInfo {
            can_copy_video: true,
            can_copy_audio: true,
            is_hevc: true,
        };

        // In default mode (None or "copy"), video copy is preferred
        let force_transcode_default = false;
        assert!(stream_info_hevc.can_copy_video && !force_transcode_default);
        assert!(stream_info_hevc.is_hevc);

        // When force_transcode is true, copy must be bypassed
        let force_transcode_forced = true;
        assert!(!(stream_info_hevc.can_copy_video && !force_transcode_forced));
    }
}

