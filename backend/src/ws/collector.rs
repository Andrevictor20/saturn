use std::sync::Arc;
use std::time::Duration;
use bollard::Docker;
use futures::StreamExt;
use sysinfo::{Components, Disks, Networks, System};

use super::alerts::evaluate_and_push_alerts;
use super::models::{DiskStat, SystemStats};
use super::{LATEST_STATS, STATS_HISTORY, STATS_HISTORY_LONG, STATS_TX};

/// Returns private memory (RSS equivalent) for a PID via statm or VmRSS (bytes).
pub fn read_private_memory(pid: u32) -> u64 {
    // 1. Try /proc/{pid}/statm: 2nd column is resident pages (fastest O(1) in Linux kernel, no PTE walk)
    if let Ok(statm) = std::fs::read_to_string(format!("/proc/{}/statm", pid)) {
        if let Some(pages_str) = statm.split_whitespace().nth(1) {
            if let Ok(pages) = pages_str.parse::<u64>() {
                if pages > 0 {
                    return pages * 4096;
                }
            }
        }
    }

    // 2. Fallback to /proc/{pid}/status VmRSS
    if let Ok(status) = std::fs::read_to_string(format!("/proc/{}/status", pid)) {
        for line in status.lines() {
            if line.starts_with("VmRSS:") {
                if let Some(kb) = line.split_whitespace().nth(1).and_then(|v| v.parse::<u64>().ok()) {
                    return kb * 1024;
                }
            }
        }
    }

    0
}

/// Scans /proc to discover all PIDs associated with Saturn (Rust Backend, child worker processes, and Frontend dev/node/vite processes).
pub fn find_saturn_pids(backend_pid: u32) -> Vec<u32> {
    let mut pids = vec![backend_pid];
    let Ok(proc_entries) = std::fs::read_dir("/proc") else {
        return pids;
    };
    for entry in proc_entries.flatten() {
        let fname = entry.file_name();
        let pid_str = fname.to_string_lossy();
        if !pid_str.chars().all(|c| c.is_ascii_digit()) {
            continue;
        }
        let pid_num: u32 = match pid_str.parse() {
            Ok(p) => p,
            Err(_) => continue,
        };
        if pid_num == backend_pid {
            continue;
        }

        // 1. Child of backend process (e.g. background runners, rclone, docker helpers)
        if let Ok(stat) = std::fs::read_to_string(format!("/proc/{}/stat", pid_num)) {
            if let Some(ppid_str) = stat.split_whitespace().nth(3) {
                if let Ok(ppid) = ppid_str.parse::<u32>() {
                    if ppid == backend_pid {
                        pids.push(pid_num);
                        continue;
                    }
                }
            }
        }

        // 2. Frontend runtime / dev server (vite, node, npm, bun, esbuild, pnpm, yarn)
        if let Ok(cmd_bytes) = std::fs::read(format!("/proc/{}/cmdline", pid_num)) {
            let cmd_lower = cmd_bytes.to_ascii_lowercase();
            let is_frontend = cmd_lower.windows(4).any(|w| w == b"vite")
                || cmd_lower.windows(6).any(|w| w == b"saturn")
                || cmd_lower.windows(14).any(|w| w == b"saturn-dashboard")
                || (cmd_lower.windows(8).any(|w| w == b"frontend")
                    && (cmd_lower.windows(4).any(|w| w == b"node")
                        || cmd_lower.windows(3).any(|w| w == b"dev")))
                || (cmd_lower.windows(7).any(|w| w == b"esbuild")
                    && (cmd_lower.windows(6).any(|w| w == b"saturn")
                        || cmd_lower.windows(5).any(|w| w == b"saturn")));

            if is_frontend {
                pids.push(pid_num);
            }
        }
    }
    pids.sort_unstable();
    pids.dedup();
    pids
}

pub async fn run_singleton_stats_collector(docker: Arc<Docker>) {
    let mut sys = System::new_with_specifics(
        sysinfo::RefreshKind::nothing()
            .with_cpu(sysinfo::CpuRefreshKind::everything())
            .with_memory(sysinfo::MemoryRefreshKind::everything()),
    );
    let mut disks = Disks::new_with_refreshed_list();
    let mut networks = Networks::new_with_refreshed_list();
    let mut components = Components::new_with_refreshed_list();

    let backend_pid = std::process::id();
    let mut saturn_pids = find_saturn_pids(backend_pid);
    let mut saturn_pids_ticks: u32 = 0;

    let mut prev_cpu_stats = std::collections::HashMap::new();
    let mut prev_host_rx = 0u64;
    let mut prev_host_tx = 0u64;
    let mut prev_iface_name: Option<String> = None;
    let mut prev_docker_rx = 0u64;
    let mut prev_docker_tx = 0u64;
    let mut cached_docker_cpu = 0.0f32;
    let mut cached_docker_mem = 0u64;
    let mut cached_docker_rate_rx = 0u64;
    let mut cached_docker_rate_tx = 0u64;
    let mut docker_poll_ticks = 0u32;
    let mut disk_poll_ticks = 0u32;
    let mut last_tick_instant = std::time::Instant::now();
    let mut first_tick = true;
    let mut last_long_sample_ts: u64 = 0;

    loop {
        // Adaptive sleep: 2s if active subscribers, 6s if idle (power/CPU conservation)
        let has_subscribers = STATS_TX.receiver_count() > 0;
        let sleep_duration = if has_subscribers {
            Duration::from_secs(2)
        } else {
            Duration::from_secs(6)
        };
        tokio::time::sleep(sleep_duration).await;

        let now = std::time::Instant::now();
        let elapsed_secs = now.duration_since(last_tick_instant).as_secs_f64().max(0.1);
        last_tick_instant = now;

        sys.refresh_cpu_usage();
        sys.refresh_memory();
        networks.refresh(true);
        components.refresh(true);

        disk_poll_ticks += 1;
        if disk_poll_ticks >= 8 || first_tick {
            disks.refresh(true);
            disk_poll_ticks = 0;
        }

        let sys_cpu = sys.global_cpu_usage();
        let sys_mem = sys.used_memory();
        let num_cores = sys.cpus().len() as f32;

        saturn_pids_ticks += 1;
        let pids_alive = !saturn_pids.is_empty()
            && saturn_pids
                .iter()
                .all(|&p| std::path::Path::new(&format!("/proc/{}", p)).exists());
        if saturn_pids_ticks >= 30 || !pids_alive || first_tick {
            saturn_pids = find_saturn_pids(backend_pid);
            saturn_pids_ticks = 0;
            // Periodically reclaim unused arena memory back to the Linux OS
            crate::store::catalog::trim_memory();
        }

        // Targeted process refresh only for Saturn PIDs instead of all 350+ host processes
        let saturn_pids_sysinfo: Vec<sysinfo::Pid> =
            saturn_pids.iter().map(|&p| sysinfo::Pid::from_u32(p)).collect();
        sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&saturn_pids_sysinfo), true);

        let saturn_cpu: f32 = saturn_pids
            .iter()
            .filter_map(|&p| sys.process(sysinfo::Pid::from_u32(p)))
            .map(|proc| proc.cpu_usage() / num_cores)
            .sum();

        let saturn_memory: u64 = saturn_pids.iter().map(|&p| read_private_memory(p)).sum();

        let (current_iface_info, mut host_raw_rx, mut host_raw_tx) =
            crate::system::network::read_host_network_bytes(None);
        if host_raw_rx == 0 && host_raw_tx == 0 {
            for (iface, data) in &networks {
                if iface != "lo"
                    && !iface.starts_with("docker")
                    && !iface.starts_with("veth")
                    && !iface.starts_with("br-")
                {
                    host_raw_rx += data.total_received();
                    host_raw_tx += data.total_transmitted();
                }
            }
        }

        let iface_changed =
            current_iface_info.as_ref().map(|i| &i.name) != prev_iface_name.as_ref();
        prev_iface_name = current_iface_info.as_ref().map(|i| i.name.clone());

        let host_rate_rx = if first_tick || iface_changed || host_raw_rx < prev_host_rx {
            0u64
        } else {
            ((host_raw_rx - prev_host_rx) as f64 / elapsed_secs) as u64
        };

        let host_rate_tx = if first_tick || iface_changed || host_raw_tx < prev_host_tx {
            0u64
        } else {
            ((host_raw_tx - prev_host_tx) as f64 / elapsed_secs) as u64
        };

        prev_host_rx = host_raw_rx;
        prev_host_tx = host_raw_tx;

        // Poll Docker container stats: every 6 seconds (3 ticks) when active subscribers, or 36 seconds when idle
        docker_poll_ticks += 1;
        let docker_poll_interval = if has_subscribers { 3 } else { 6 };
        if docker_poll_ticks >= docker_poll_interval || first_tick {
            docker_poll_ticks = 0;

            let mut options = bollard::query_parameters::ListContainersOptions::default();
            options.all = false;
            if let Ok(containers) = docker.list_containers(Some(options)).await {
                let mut total_cpu = 0.0f64;
                let mut total_mem = 0u64;
                let mut network_tx = 0u64;
                let mut network_rx = 0u64;

                use futures::stream::FuturesUnordered;
                let mut stat_futures: FuturesUnordered<_> = containers
                    .iter()
                    .filter_map(|c| c.id.as_ref())
                    .map(|id| {
                        let d = docker.clone();
                        let id_str = id.clone();
                        async move {
                            let stats_options = bollard::query_parameters::StatsOptions {
                                stream: false,
                                ..Default::default()
                            };
                            let mut stream = d.stats(&id_str, Some(stats_options));
                            if let Some(Ok(s)) = stream.next().await {
                                let (mem_used, _) =
                                    crate::docker::resolve_container_memory(&d, &id_str, &s).await;
                                Some((id_str, s, mem_used))
                            } else {
                                None
                            }
                        }
                    })
                    .collect();

                while let Some(Some((id, res, mem_used))) = stat_futures.next().await {
                    // CPU
                    let mut cpu_percent = 0.0f64;
                    let current_cpu = res.cpu_stats;
                    if let (Some(cpu), Some(precpu)) = (
                        &current_cpu,
                        prev_cpu_stats.get(&id).or(res.precpu_stats.as_ref()),
                    ) {
                        let cpu_delta = cpu
                            .cpu_usage
                            .as_ref()
                            .and_then(|u| u.total_usage)
                            .unwrap_or(0) as f64
                            - precpu
                                .cpu_usage
                                .as_ref()
                                .and_then(|u| u.total_usage)
                                .unwrap_or(0) as f64;
                        let sys_delta = cpu.system_cpu_usage.unwrap_or(0) as f64
                            - precpu.system_cpu_usage.unwrap_or(0) as f64;
                        if sys_delta > 0.0 && cpu_delta > 0.0 {
                            cpu_percent = (cpu_delta / sys_delta) * 100.0;
                        }
                    }
                    if let Some(cpu) = current_cpu {
                        prev_cpu_stats.insert(id, cpu);
                    }
                    total_cpu += cpu_percent;

                    // Memory
                    total_mem += mem_used;

                    // Network
                    if let Some(nets) = res.networks {
                        for (_, net) in nets {
                            network_tx += net.tx_bytes.unwrap_or(0);
                            network_rx += net.rx_bytes.unwrap_or(0);
                        }
                    }
                }

                // Prune prev_cpu_stats to prevent unbounded memory growth over long runtimes
                let active_ids: std::collections::HashSet<&String> =
                    containers.iter().filter_map(|c| c.id.as_ref()).collect();
                prev_cpu_stats.retain(|id, _| active_ids.contains(id));

                cached_docker_cpu = total_cpu as f32;
                cached_docker_mem = total_mem;

                let docker_window_secs = (elapsed_secs * docker_poll_interval as f64).max(0.1);
                cached_docker_rate_rx = if first_tick || network_rx < prev_docker_rx {
                    0u64
                } else {
                    ((network_rx - prev_docker_rx) as f64 / docker_window_secs) as u64
                };

                cached_docker_rate_tx = if first_tick || network_tx < prev_docker_tx {
                    0u64
                } else {
                    ((network_tx - prev_docker_tx) as f64 / docker_window_secs) as u64
                };

                prev_docker_rx = network_rx;
                prev_docker_tx = network_tx;
            }
        }
        first_tick = false;

        // Disks
        let mut disk_stats_map: std::collections::HashMap<String, DiskStat> =
            std::collections::HashMap::new();
        for disk in &disks {
            let name = disk.name().to_string_lossy().into_owned();
            let raw_mount = disk.mount_point().to_string_lossy().into_owned();
            let fs_type = disk.file_system().to_string_lossy().into_owned();
            let total_space = disk.total_space();

            if !crate::files::is_valid_storage_disk(&name, &raw_mount, &fs_type, total_space) {
                continue;
            }

            let mount_point = if raw_mount == "/host" {
                "/".to_string()
            } else if raw_mount.starts_with("/host/") {
                raw_mount.replacen("/host", "", 1)
            } else {
                raw_mount
            };

            let group_key = if name.contains("nvme") {
                let parts: Vec<&str> = name.split('p').collect();
                parts.first().copied().unwrap_or(&name).to_string()
            } else if name.starts_with("/dev/sd") && name.len() >= 8 {
                name[..8].to_string()
            } else if name.starts_with("sd") && name.len() >= 3 {
                name[..3].to_string()
            } else {
                name.clone()
            };

            let available = disk.available_space();
            let used = total_space.saturating_sub(available);

            let stat = DiskStat {
                name,
                mount_point,
                used,
                total: total_space,
            };

            if let Some(existing) = disk_stats_map.get_mut(&group_key) {
                if stat.total > existing.total {
                    *existing = stat;
                }
            } else {
                disk_stats_map.insert(group_key, stat);
            }
        }

        let mut disk_stats: Vec<DiskStat> = disk_stats_map.into_values().collect();
        disk_stats.sort_by(|a, b| b.total.cmp(&a.total));

        // Temperature
        let mut temperature = 0.0f32;
        let mut temp_count = 0u32;
        for component in &components {
            if let Some(t) = component.temperature() {
                temperature += t;
                temp_count += 1;
            }
        }
        if temp_count > 0 {
            temperature /= temp_count as f32;
        }

        let now_millis = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        let gpu = crate::system::gpu::collect_gpu_telemetry();

        let stats = SystemStats {
            timestamp: now_millis,
            cpu_usage: sys_cpu,
            memory_used: sys_mem,
            memory_total: sys.total_memory(),
            disks: disk_stats,
            network_tx: host_rate_tx,
            network_rx: host_rate_rx,
            network_interface: current_iface_info.as_ref().map(|i| i.name.clone()),
            network_interface_type: current_iface_info.as_ref().map(|i| i.kind.clone()),
            gpu_usage: if gpu.is_available { Some(gpu.usage_percent) } else { None },
            gpu_memory_used: if gpu.is_available { Some(gpu.memory_used_bytes) } else { None },
            gpu_memory_total: if gpu.is_available { Some(gpu.memory_total_bytes) } else { None },
            gpu_name: if gpu.is_available { Some(gpu.name) } else { None },
            gpu_temperature: gpu.temperature_c,
            temperature,
            docker_cpu: cached_docker_cpu,
            docker_memory: cached_docker_mem,
            docker_tx: cached_docker_rate_tx,
            docker_rx: cached_docker_rate_rx,
            saturn_cpu,
            saturn_memory,
        };

        evaluate_and_push_alerts(&stats);

        let mut hist_entry = stats.clone();
        hist_entry.disks = Vec::new(); // Strip heavy disk partition string allocations from the 1-hour ring buffer

        if let Ok(mut hist) = STATS_HISTORY.write() {
            if hist.len() >= 1800 {
                hist.pop_front();
            }
            hist.push_back(hist_entry.clone());
        }

        // Retain 72-hour aggregated ring buffer (sample every 3 minutes = max 1440 samples)
        let now_ms = stats.timestamp;
        if now_ms >= last_long_sample_ts + 180_000 {
            last_long_sample_ts = now_ms;
            if let Ok(mut long_hist) = STATS_HISTORY_LONG.write() {
                if long_hist.len() >= 1500 {
                    long_hist.pop_front();
                }
                long_hist.push_back(hist_entry);
            }
        }

        if let Ok(j) = serde_json::to_string(&stats) {
            let msg_arc = Arc::new(j);
            if let Ok(mut guard) = LATEST_STATS.write() {
                *guard = Some(msg_arc.clone());
            }
            let _ = STATS_TX.send(msg_arc);
        }
    }
}
