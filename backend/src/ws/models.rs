use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct DiskStat {
    pub name: String,
    pub mount_point: String,
    pub used: u64,
    pub total: u64,
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct SystemStats {
    #[serde(default)]
    pub timestamp: u64,
    pub cpu_usage: f32,
    pub memory_used: u64,
    pub memory_total: u64,
    pub disks: Vec<DiskStat>,
    pub network_tx: u64,
    pub network_rx: u64,
    pub temperature: f32,
    pub docker_cpu: f32,
    pub docker_memory: u64,
    pub docker_tx: u64,
    pub docker_rx: u64,
    pub saturn_cpu: f32,
    pub saturn_memory: u64,
    #[serde(default)]
    pub network_interface: Option<String>,
    #[serde(default)]
    pub network_interface_type: Option<String>,
    #[serde(default)]
    pub gpu_usage: Option<f32>,
    #[serde(default)]
    pub gpu_memory_used: Option<u64>,
    #[serde(default)]
    pub gpu_memory_total: Option<u64>,
    #[serde(default)]
    pub gpu_name: Option<String>,
    #[serde(default)]
    pub gpu_temperature: Option<f32>,
}

#[derive(Deserialize, Default)]
pub struct StatsHistoryQuery {
    pub limit: Option<usize>,
    pub range: Option<String>,
}

