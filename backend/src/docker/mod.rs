pub mod types;
pub mod stats;
pub mod containers;
pub mod port_prioritization;
pub mod updates;
pub mod update_runner;
pub mod images;
pub mod networks;
pub mod volumes;
pub mod exec;
pub mod parser;
pub mod ports;
pub mod compose;
pub mod backups;
pub mod watchtower;

pub mod visibility;
pub mod daemon_optimizer;

pub use types::*;
pub use stats::*;
pub use containers::*;
pub use images::*;
pub use networks::*;
pub use volumes::*;
pub use exec::*;
pub use parser::*;
pub use ports::*;
pub use compose::*;
pub use backups::*;
pub use watchtower::*;
pub use visibility::*;
pub use daemon_optimizer::*;
pub use crate::state::AppState;

use axum::{
    routing::{delete, get, post},
    Router,
};

pub fn router() -> Router<AppState> {
    let admin_routes = Router::new()
        .route("/api/backups", get(backups::list_backups_handler))
        .route("/api/backups/stats", get(backups::get_backup_stats_handler))
        .route("/api/backups/create", post(backups::create_backup_handler))
        .route("/api/backups/restore", post(backups::restore_backup_post_handler))
        .route("/api/backups/restore/{id}", post(backups::restore_backup_handler))
        .route("/api/backups/{id}", delete(backups::delete_backup_handler))
        .route("/api/backups/download/{id}", get(backups::download_backup_handler))
        .route("/api/backups/upload", post(backups::upload_backup_handler).layer(axum::extract::DefaultBodyLimit::max(10 * 1024 * 1024 * 1024)))
        .route("/api/backups/schedule", get(backups::get_schedule_handler).post(backups::save_schedule_handler))
        .route("/api/docker/images/{id}", delete(delete_image))
        .route("/api/docker/images/prune", post(prune_images))
        .route("/api/docker/builder/prune", post(prune_builder))
        .route("/api/docker/networks/{id}", delete(delete_network))
        .route("/api/docker/networks/prune", post(prune_networks))
        .route("/api/docker/volumes/{name}", delete(delete_volume))
        .route("/api/docker/volumes/prune", post(prune_volumes))
        .route("/api/docker/containers/{id}/env", post(update_container_env))
        .route("/api/docker/containers/{id}/volumes", post(update_container_volumes))
        .route("/api/docker/containers/{id}/update", post(update_container))
        .route("/api/docker/containers/{id}/update/cancel", post(cancel_container_update))
        .route("/api/docker/containers/update/cancel-all", post(cancel_all_container_updates))
        .route("/api/docker/updates/check-now", post(trigger_watchtower_check_handler))
        .route("/api/docker/containers/{id}/exec", get(container_exec_ws))
        .route("/api/docker/compose/install", post(compose::install_custom_compose_handler))
        .route("/api/docker/compose/save", post(compose::save_custom_compose_handler))
        .layer(axum::middleware::from_fn(crate::auth::require_admin));

    Router::new()
        .route("/api/docker/containers", get(list_containers))
        .route("/api/docker/containers/{id}", get(inspect_container).delete(delete_container))
        .route("/api/docker/containers/{id}/logs", get(container_logs))
        .route("/api/docker/containers/update/active", get(get_active_container_updates))
        .route("/api/docker/containers/{id}/update-status", get(get_container_update_status))
        .route("/api/docker/containers/{id}/check-update", get(check_single_container_update))
        .route("/api/docker/containers/check-updates", get(check_container_updates))
        .route("/api/docker/updates/summary", get(get_watchtower_summary_handler))
        .route("/api/docker/containers/{id}/{action}", post(container_action))
        .route("/api/docker/containers/stats/snapshot", get(snapshot_stats))
        .route("/api/docker/compose/parse", post(compose::parse_compose_or_command_handler))
        .route("/api/docker/ports/check", post(compose::check_ports_handler))
        .route("/api/docker/compose/stacks", get(compose::list_stacks_handler))
        .route("/api/docker/compose/stacks/{name}", get(compose::get_stack_compose_handler))
        .route("/api/docker/images", get(list_images))
        .route("/api/docker/networks", get(list_networks))
        .route("/api/docker/volumes", get(list_volumes))
        .merge(visibility::router())
        .merge(admin_routes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_env_entry() {
        // Valid cases
        assert!(valid_env_entry("KEY=value"));
        assert!(valid_env_entry("KEY=")); // Empty value is allowed
        assert!(valid_env_entry("MY_VAR_123=something"));
        assert!(valid_env_entry("_HIDDEN=123")); // Underscore prefix is allowed
        assert!(valid_env_entry("A=b=c")); // Multiple equals is allowed, split is on first

        // Invalid cases
        assert!(!valid_env_entry("=value")); // Empty key
        assert!(!valid_env_entry("123KEY=value")); // Starts with digit
        assert!(!valid_env_entry("KEY-1=value")); // Invalid char in key
        assert!(!valid_env_entry("NO_EQUALS")); // Missing =
    }

    #[test]
    fn test_calculate_cpu_percent() {
        // Normal case
        let pct = calculate_cpu_percent(200.0, 100.0, 1000.0, 500.0, 2.0);
        assert_eq!(pct, 40.0);

        // Negative CPU delta
        assert_eq!(calculate_cpu_percent(100.0, 200.0, 1000.0, 500.0, 2.0), 0.0);

        // Zero CPU delta
        assert_eq!(calculate_cpu_percent(100.0, 100.0, 1000.0, 500.0, 2.0), 0.0);
    }

    #[test]
    fn test_calculate_memory_used() {
        use std::collections::HashMap;

        // None memory_stats
        let empty_stats = bollard::models::ContainerStatsResponse {
            memory_stats: None,
            ..Default::default()
        };
        assert_eq!(calculate_memory_used(&empty_stats), 0);

        // Usage without cache
        let raw_stats = bollard::models::ContainerStatsResponse {
            memory_stats: Some(bollard::models::ContainerMemoryStats {
                usage: Some(1024 * 1024 * 100),
                stats: None,
                ..Default::default()
            }),
            ..Default::default()
        };
        assert_eq!(calculate_memory_used(&raw_stats), 1024 * 1024 * 100);

        // cgroup v1 with total_inactive_file
        let mut map_v1 = HashMap::new();
        map_v1.insert("total_inactive_file".to_string(), 1024 * 1024 * 30);
        map_v1.insert("cache".to_string(), 1024 * 1024 * 30);
        let v1_stats = bollard::models::ContainerStatsResponse {
            memory_stats: Some(bollard::models::ContainerMemoryStats {
                usage: Some(1024 * 1024 * 100),
                stats: Some(map_v1),
                ..Default::default()
            }),
            ..Default::default()
        };
        assert_eq!(calculate_memory_used(&v1_stats), 1024 * 1024 * 70);

        // cgroup v2 with inactive_file
        let mut map_v2 = HashMap::new();
        map_v2.insert("inactive_file".to_string(), 1024 * 1024 * 40);
        let v2_stats = bollard::models::ContainerStatsResponse {
            memory_stats: Some(bollard::models::ContainerMemoryStats {
                usage: Some(1024 * 1024 * 100),
                stats: Some(map_v2),
                ..Default::default()
            }),
            ..Default::default()
        };
        assert_eq!(calculate_memory_used(&v2_stats), 1024 * 1024 * 60);
    }

    #[test]
    fn test_parse_image_ref() {
        let (reg, repo, tag) = parse_image_ref("nginx:alpine");
        assert_eq!(reg, "registry-1.docker.io");
        assert_eq!(repo, "library/nginx");
        assert_eq!(tag, "alpine");

        let (reg, repo, tag) = parse_image_ref("linuxserver/qbittorrent:latest");
        assert_eq!(reg, "registry-1.docker.io");
        assert_eq!(repo, "linuxserver/qbittorrent");
        assert_eq!(tag, "latest");

        let (reg, repo, tag) = parse_image_ref("ghcr.io/andrevmp/saturn:latest");
        assert_eq!(reg, "ghcr.io");
        assert_eq!(repo, "andrevmp/saturn");
        assert_eq!(tag, "latest");

        let (reg, repo, tag) = parse_image_ref("redis");
        assert_eq!(reg, "registry-1.docker.io");
        assert_eq!(repo, "library/redis");
        assert_eq!(tag, "latest");
    }

    #[test]
    fn test_get_host_platform() {
        let platform = get_host_platform();
        assert!(platform.starts_with("linux/"));
    }

    #[test]
    fn test_resolve_compose_file() {
        use std::io::Write;

        let unique_suffix = uuid::Uuid::new_v4().to_string();
        let temp_dir = std::env::temp_dir().join(format!("saturn_compose_test_{}", unique_suffix));
        std::fs::create_dir_all(&temp_dir).unwrap();
        let compose_path = temp_dir.join("docker-compose.yml");
        {
            let mut f = std::fs::File::create(&compose_path).unwrap();
            writeln!(f, "version: '3'").unwrap();
        }

        // Test with exact existing path
        let res = crate::docker::containers::resolve_compose_file(
            Some(temp_dir.to_str().unwrap()),
            compose_path.to_str().unwrap(),
        );
        assert!(res.is_some());
        let (file, proj) = res.unwrap();
        assert_eq!(file, compose_path);
        assert_eq!(proj, temp_dir);

        // Test with relative filename in working dir
        let res_relative = crate::docker::containers::resolve_compose_file(
            Some(temp_dir.to_str().unwrap()),
            "docker-compose.yml",
        );
        assert!(res_relative.is_some());
        assert_eq!(res_relative.unwrap().0, compose_path);

        // Test with comma-separated list of compose files
        let res_comma = crate::docker::containers::resolve_compose_file(
            Some(temp_dir.to_str().unwrap()),
            &format!("{},docker-compose.override.yml", compose_path.to_str().unwrap()),
        );
        assert!(res_comma.is_some());
        assert_eq!(res_comma.unwrap().0, compose_path);

        // Test non-existent file returns None
        let res_none = crate::docker::containers::resolve_compose_file(
            Some("/non/existent/path"),
            "nonexistent-compose.yml",
        );
        assert!(res_none.is_none());

        // Cleanup
        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_process_and_prioritize_ports_dedup_and_priority() {
        use bollard::models::{PortSummary, PortSummaryTypeEnum};
        use std::collections::HashMap;

        // Container with duplicate IPv4/IPv6 port 8096, plus a DHCP port 67
        let raw_ports = vec![
            PortSummary {
                ip: Some("0.0.0.0".to_string()),
                private_port: 67,
                public_port: Some(67),
                typ: Some(PortSummaryTypeEnum::UDP),
            },
            PortSummary {
                ip: Some("0.0.0.0".to_string()),
                private_port: 8096,
                public_port: Some(8096),
                typ: Some(PortSummaryTypeEnum::TCP),
            },
            PortSummary {
                ip: Some("::".to_string()),
                private_port: 8096,
                public_port: Some(8096),
                typ: Some(PortSummaryTypeEnum::TCP),
            },
        ];

        let labels = HashMap::new();
        let result = crate::docker::containers::process_and_prioritize_ports(
            Some(raw_ports),
            &labels,
            "jellyfin/jellyfin",
            "jellyfin",
            Some("bridge"),
        );

        // Deduplication: port 8096 should appear exactly once
        let p8096_count = result.iter().filter(|p| p.public_port == Some(8096)).count();
        assert_eq!(p8096_count, 1);

        // Prioritization: web port 8096 must come before UDP port 67
        assert_eq!(result.first().unwrap().public_port, Some(8096));
        assert_eq!(result.len(), 2);
    }

    #[test]
    fn test_process_and_prioritize_ports_host_mode_and_labels() {
        use std::collections::HashMap;

        // 1. Home Assistant in host network with no bridge ports
        let labels = HashMap::new();
        let ha_result = crate::docker::containers::process_and_prioritize_ports(
            None,
            &labels,
            "ghcr.io/home-assistant/home-assistant:stable",
            "homeassistant",
            Some("host"),
        );

        assert!(!ha_result.is_empty());
        assert_eq!(ha_result[0].public_port, Some(8123));
        assert_eq!(ha_result[0].private_port, 8123);

        // 2. Saturn container with io.saturn.port.web label
        let mut casa_labels = HashMap::new();
        casa_labels.insert("io.saturn.port.web".to_string(), "9095".to_string());
        let casa_result = crate::docker::containers::process_and_prioritize_ports(
            None,
            &casa_labels,
            "custom/app:latest",
            "custom-app",
            Some("host"),
        );

        assert!(!casa_result.is_empty());
        assert_eq!(casa_result[0].public_port, Some(9095));

        // 3. Cloudflared web in host network with wisdomsky/cloudflared-web
        let cloudflared_result = crate::docker::containers::process_and_prioritize_ports(
            None,
            &labels,
            "wisdomsky/cloudflared-web:latest",
            "cloudflared",
            Some("host"),
        );
        assert!(!cloudflared_result.is_empty());
        assert_eq!(cloudflared_result[0].public_port, Some(14333));
        assert_eq!(cloudflared_result[0].private_port, 14333);
    }

    #[test]
    fn test_filter_saturn_updater_container() {
        let test_names = vec![
            ("saturn", false),
            ("saturn-dashboard", false),
            ("saturn-updater", true),
            ("/saturn-updater", true),
            ("saturn-updater-helper", true),
            ("other-app", false),
        ];

        for (name, should_filter) in test_names {
            let clean_name = name.trim().trim_start_matches('/');
            let is_updater = clean_name.eq_ignore_ascii_case("saturn-updater")
                || clean_name.to_ascii_lowercase().starts_with("saturn-updater-");
            assert_eq!(is_updater, should_filter, "Failed for name: {}", name);
        }
    }
}
