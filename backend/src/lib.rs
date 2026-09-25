pub mod auth;
pub mod cloudflare;
pub mod docker;
pub mod errors;
pub mod files;
pub mod homeassistant;
pub mod links;
pub mod pihole;
pub mod logs;
pub mod ssh;
pub mod state;
pub mod store;
pub mod system;
pub mod ws;

pub use state::AppState;

use axum::{
    http::{header, HeaderName, HeaderValue, Method, StatusCode},
    routing::get,
    Json,
    Router,
};
use bollard::Docker;
use std::sync::Arc;
use tower_http::compression::CompressionLayer;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::services::{ServeDir, ServeFile};
use tower_http::set_header::SetResponseHeaderLayer;

pub fn app() -> Router {
    let socket_path = std::env::var("DOCKER_HOST")
        .ok()
        .and_then(|h| h.strip_prefix("unix://").map(|s| s.to_string()))
        .unwrap_or_else(|| "/var/run/docker.sock".to_string());

    let docker = match Docker::connect_with_socket(&socket_path, 900, bollard::API_DEFAULT_VERSION) {
        Ok(d) => d,
        Err(e) => {
            tracing::warn!("Failed to connect with socket (timeout 900s): {}, trying socket defaults", e);
            Docker::connect_with_socket_defaults().unwrap_or_else(|e2| {
                tracing::warn!("Failed to connect with socket defaults: {}, trying local defaults", e2);
                Docker::connect_with_local_defaults().unwrap()
            })
        }
    };

    let state = AppState {
        docker: Arc::new(docker),
    };

    // Start background stats collector immediately so metrics history is populated continuously
    ws::ensure_stats_collector(state.docker.clone());

    // Background automatic cleanup of old/dangling Saturn images post-update
    let docker_cleanup = state.docker.clone();
    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(3)).await;
        system::cleanup_old_saturn_images(docker_cleanup).await;
    });

    // Background Watchtower update checker loop
    docker::watchtower::start_watchtower_loop(state.docker.clone());

    // Background auto-sync of Cloudflare tunnel links to containers on startup and periodically
    let docker_cf = state.docker.clone();
    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        let _ = cloudflare::auto_sync_cloudflare_links(&docker_cf).await;

        let mut interval = tokio::time::interval(std::time::Duration::from_secs(300));
        loop {
            interval.tick().await;
            let _ = cloudflare::auto_sync_cloudflare_links(&docker_cf).await;
        }
    });

    let admin_protected_routes = Router::new()
        .route("/api/terminal/ws", get(ssh::terminal_handler))
        .route("/api/ssh", get(ssh::terminal_handler))
        .route("/api/logs/clear", axum::routing::post(logs::clear_logs))
        .route("/api/docker/links/{id}", axum::routing::post(links::set_link))
        .merge(homeassistant::router())
        .merge(pihole::router())
        .merge(cloudflare::router())
        .merge(auth::admin_router())
        .layer(axum::middleware::from_fn(auth::require_admin));

    let system_routes = Router::new()
        .route("/api/docker/links", get(links::get_links))
        .route("/api/docker/stats", get(ws::stats_handler))
        .route("/api/docker/stats/history", get(ws::get_stats_history_handler))
        .route("/api/logs", get(logs::get_logs))
        .merge(admin_protected_routes);

    let protected_routes = Router::new()
        .merge(docker::router())
        .merge(store::router())
        .merge(files::protected_router())
        .merge(system::router())
        .merge(auth::two_factor_protected_router())
        .merge(auth::users_api::router())
        .merge(auth::protected_router())
        .merge(system_routes)
        .layer(axum::middleware::from_fn(auth::require_auth))
        .with_state(state);

    Router::new()
        .route("/health", get(|| async { 
            (
                StatusCode::OK, 
                Json(serde_json::json!({
                    "status": "ok",
                    "version": system::get_app_version(),
                    "arch": std::env::consts::ARCH
                }))
            ) 
        }))
        .route("/api/health", get(|| async { 
            (
                StatusCode::OK, 
                Json(serde_json::json!({
                    "status": "ok",
                    "version": system::get_app_version(),
                    "arch": std::env::consts::ARCH
                }))
            ) 
        }))
        .merge(auth::public_router())
        .merge(files::public_router())
        .merge(system::public_router())
        .merge(protected_routes)
        .layer(
            CorsLayer::new()
                .allow_origin(AllowOrigin::predicate(|origin, parts| {
                    is_allowed_origin(origin.as_bytes(), parts)
                }))
                .allow_methods([
                    Method::GET,
                    Method::POST,
                    Method::OPTIONS,
                    Method::PUT,
                    Method::DELETE,
                ])
                .allow_headers([header::AUTHORIZATION, header::ACCEPT, header::CONTENT_TYPE])
                .allow_credentials(true),
        )
        // Adicionando Security Headers (X-Frame-Options SAMEORIGIN e CSP com frame/object-src)
        .layer(SetResponseHeaderLayer::overriding(
            header::X_FRAME_OPTIONS,
            header::HeaderValue::from_static("SAMEORIGIN"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            HeaderName::from_static("content-security-policy"),
            HeaderValue::from_static(
                "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' fonts.googleapis.com; font-src 'self' fonts.gstatic.com data:; img-src 'self' data: https: blob:; media-src 'self' blob: data:; frame-src 'self' blob: data:; object-src 'self' blob: data:; frame-ancestors 'self'; connect-src 'self' ws: wss:;",
            ),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            HeaderName::from_static("strict-transport-security"),
            HeaderValue::from_static("max-age=31536000; includeSubDomains"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            HeaderName::from_static("permissions-policy"),
            HeaderValue::from_static("camera=(), microphone=(), geolocation=()"),
        ))
        .fallback_service(
            ServeDir::new("public").not_found_service(ServeFile::new("public/index.html")),
        )
        // Compressao dinamica HTTP (Brotli, Gzip, Zstd)
        .layer(CompressionLayer::new())
        // Cache-Control estrito: index.html e rotas SPA nunca em cache; assets imutáveis
        .layer(axum::middleware::from_fn(spa_cache_control_middleware))
}

async fn spa_cache_control_middleware(
    req: axum::extract::Request,
    next: axum::middleware::Next,
) -> axum::response::Response {
    let path = req.uri().path().to_string();
    let mut response = next.run(req).await;

    if path.starts_with("/assets/") {
        response.headers_mut().insert(
            header::CACHE_CONTROL,
            HeaderValue::from_static("public, max-age=31536000, immutable"),
        );
    } else if path == "/" || path.ends_with(".html") || !path.contains('.') {
        // Rotas SPA e index.html nunca devem ser retidos em cache de disco pelo navegador
        response.headers_mut().insert(
            header::CACHE_CONTROL,
            HeaderValue::from_static("no-cache, no-store, must-revalidate, max-age=0"),
        );
        response.headers_mut().insert(
            header::PRAGMA,
            HeaderValue::from_static("no-cache"),
        );
        response.headers_mut().insert(
            header::EXPIRES,
            HeaderValue::from_static("0"),
        );
    }

    response
}

fn is_allowed_origin(origin_bytes: &[u8], parts: &axum::http::request::Parts) -> bool {
    let origin_str = match std::str::from_utf8(origin_bytes) {
        Ok(s) => s,
        Err(_) => return false,
    };

    // Extract host from origin string (e.g. https://saturn.meudominio.com:443 -> saturn.meudominio.com)
    let origin_host_part = origin_str
        .strip_prefix("http://")
        .or_else(|| origin_str.strip_prefix("https://"))
        .unwrap_or(origin_str);
    let origin_host = origin_host_part.split(':').next().unwrap_or(origin_host_part);

    // 1. Same-Origin Check (Automatic for Cloudflare Tunnels, Reverse Proxies, Custom Domains)
    // If the Origin host matches the incoming request's Host header, it is legitimate traffic.
    let check_header = |name: &str| -> Option<&str> {
        parts.headers.get(name).and_then(|v| v.to_str().ok()).map(|h| {
            h.split(':').next().unwrap_or(h)
        })
    };

    if let Some(req_host) = check_header("host") {
        if !origin_host.is_empty() && origin_host.eq_ignore_ascii_case(req_host) {
            return true;
        }
    }

    // 2. Allow localhost and 127.0.0.1 on any port (HTTP or HTTPS)
    if origin_str.starts_with("http://localhost")
        || origin_str.starts_with("https://localhost")
        || origin_str.starts_with("http://127.0.0.1")
        || origin_str.starts_with("https://127.0.0.1")
        || origin_str.starts_with("http://[::1]")
        || origin_str.starts_with("https://[::1]")
    {
        return true;
    }

    // 3. Allow Cloudflare Tunnel domains (*.trycloudflare.com) and Tailscale MagicDNS (*.ts.net)
    if origin_host.ends_with(".trycloudflare.com") || origin_host.ends_with(".ts.net") {
        return true;
    }

    // 4. Allow Tailscale CGNAT range (100.64.0.0/10: 100.64.0.0 - 100.127.255.255)
    if origin_host.starts_with("100.") {
        if let Some(second_octet) = origin_host.split('.').nth(1).and_then(|o| o.parse::<u8>().ok()) {
            if (64..=127).contains(&second_octet) {
                return true;
            }
        }
    }

    // 4. Allow RFC 1918 Private IP ranges and common local network hostnames
    if origin_host.starts_with("192.168.")
        || origin_host.starts_with("10.")
        || origin_host.ends_with(".local")
        || origin_host.ends_with(".lan")
        || origin_host.ends_with(".home")
        || origin_host == "localhost"
    {
        return true;
    }

    // Check 172.16.0.0 - 172.31.255.255
    if origin_host.starts_with("172.") {
        if let Some(second_octet) = origin_host.split('.').nth(1).and_then(|o| o.parse::<u8>().ok()) {
            if (16..=31).contains(&second_octet) {
                return true;
            }
        }
    }

    // 5. Allow explicit domains defined in ALLOWED_ORIGINS env var
    if let Ok(allowed) = std::env::var("ALLOWED_ORIGINS") {
        for item in allowed.split(',') {
            let trimmed = item.trim();
            if !trimmed.is_empty() && (origin_str == trimmed || origin_host == trimmed) {
                return true;
            }
        }
    }

    false
}
