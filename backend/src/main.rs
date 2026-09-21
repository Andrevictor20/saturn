use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;

/// Graceful shutdown signal handler.
///
/// Waits for SIGTERM (Docker stop / compose recreate) or Ctrl+C.
/// This is called AFTER axum::serve() binds the TCP port and starts serving,
/// so the signal is only handled once the server is fully ready.
///
/// NOTE: this is intentionally NOT called during server startup.
/// Passing shutdown_signal() to with_graceful_shutdown() before the server
/// is listening would cause the container to exit immediately (ExitCode=0)
/// when Docker sends SIGTERM during --force-recreate.
#[cfg(unix)]
async fn shutdown_signal() {
    use tokio::signal::unix::{signal, SignalKind};

    let mut sigterm = signal(SignalKind::terminate())
        .expect("failed to install SIGTERM handler");

    tokio::select! {
        _ = tokio::signal::ctrl_c() => {
            tracing::info!("Received Ctrl+C signal. Starting graceful shutdown...");
        },
        _ = sigterm.recv() => {
            tracing::info!("Received SIGTERM signal. Starting graceful shutdown...");
        },
    }
}

#[cfg(not(unix))]
async fn shutdown_signal() {
    tokio::signal::ctrl_c()
        .await
        .expect("failed to install Ctrl+C handler");
    tracing::info!("Received Ctrl+C signal. Starting graceful shutdown...");
}

#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

#[tokio::main(flavor = "multi_thread", worker_threads = 4)]
async fn main() {
    // Load .env if present
    let _ = dotenvy::dotenv();

    // Ensure data directory exists for logging
    let _ = std::fs::create_dir_all("data");

    // Setup daily rolling log file and prune old logs (keep max 5 days / max 50MB)
    let file_appender = tracing_appender::rolling::daily("data", "saturn.log");
    let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);
    backend::logs::prune_old_log_files("data", 5, 50 * 1024 * 1024);

    let file_layer = tracing_subscriber::fmt::layer()
        .with_writer(non_blocking)
        .with_ansi(false);

    let stdout_layer = tracing_subscriber::fmt::layer()
        .with_writer(std::io::stdout);

    let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info,bollard=warn,hyper=warn,tower_http=warn,h2=warn"));

    tracing_subscriber::registry()
        .with(env_filter)
        .with(file_layer)
        .with(stdout_layer)
        .init();

    tracing::info!("Saturn Dashboard Backend Starting...");

    // Auto-heal and restore persistent configuration files from legacy/previous volumes if needed
    backend::system::data_migrator::auto_heal_persistent_data();

    // Optimize Docker daemon for high-speed concurrent layer downloads if needed
    backend::docker::ensure_docker_daemon_optimized();

    // Load App Store cache from disk or sync in background
    tokio::spawn(async {
        if !backend::store::catalog::load_cached_apps_from_disk() {
            backend::store::sync_repositories().await;
        }
    });

    // Start background backup scheduler
    backend::docker::backups::start_backup_scheduler();

    let app = backend::app();
    let port = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or_else(backend::system::settings::get_configured_port);
    let bind_addr = format!("0.0.0.0:{}", port);
    let listener = match tokio::net::TcpListener::bind(&bind_addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("FATAL: Failed to bind TCP listener on {}: {}", bind_addr, e);
            tracing::error!("FATAL: Failed to bind TCP listener on {}: {}", bind_addr, e);
            std::process::exit(1);
        }
    };
    tracing::info!("Listening on {}", bind_addr);

    // Attach the graceful shutdown signal AFTER the port is bound and listening.
    // This ensures SIGTERM from Docker --force-recreate during recreation does not
    // kill the new container before it has a chance to accept its first connection.
    let server = axum::serve(listener, app.into_make_service_with_connect_info::<std::net::SocketAddr>())
        .with_graceful_shutdown(shutdown_signal());

    if let Err(e) = server.await {
        eprintln!("FATAL: Server error: {}", e);
        tracing::error!("FATAL: Server error: {}", e);
        std::process::exit(1);
    } else {
        tracing::info!("Saturn Dashboard Backend stopped gracefully.");
    }
}
