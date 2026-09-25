import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  HardDrive,
  Cpu,
  Network,
  Zap,
  CreditCard,
  Usb,
  Wifi,
  Cable,
  Sparkles,
} from 'lucide-react';
import { MiniSparkline } from '../metrics/MiniSparkline';
import { TopProcessesCardView } from './TopProcessesCardView';
import { getFriendlyDiskName, getDiskCategoryInfo, formatStorage } from '../../utils/format';
import type { ProcessInfo } from '../metrics/ProcessMonitor';

interface TelemetryCardsProps {
  cpuPercent: string;
  tempC: string;
  memoryUsedGB: string;
  memoryTotalGB: string;
  memoryPercent: string;
  netTxSpeed: string;
  netRxSpeed: string;
  containers: any[];
  runningContainersCount: number;
  uniqueDisks: any[];
  diskPercent: string;
  diskUsedFormatted: string;
  diskTotalFormatted: string;
  cpuHistory: number[];
  ramHistory: number[];
  netRxHistory: number[];
  netTxHistory: number[];
  gpuHistory?: number[];
  isConnected: boolean;
  stats: any;
}

export function OverviewTelemetryCards({
  cpuPercent,
  tempC,
  memoryUsedGB,
  memoryTotalGB,
  memoryPercent,
  netTxSpeed,
  netRxSpeed,
  containers,
  runningContainersCount,
  uniqueDisks,
  diskPercent,
  diskUsedFormatted,
  diskTotalFormatted,
  cpuHistory,
  ramHistory,
  netRxHistory,
  netTxHistory,
  gpuHistory = [],
  isConnected,
  stats,
}: TelemetryCardsProps) {
  const { t } = useTranslation();
  const [cpuView, setCpuView] = useState<'gauge' | 'top5'>('gauge');
  const [ramView, setRamView] = useState<'gauge' | 'top5'>('gauge');

  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [loadingProcesses, setLoadingProcesses] = useState(false);

  const isAnyTop5Active = cpuView === 'top5' || ramView === 'top5';

  useEffect(() => {
    if (!isAnyTop5Active) return;

    let isMounted = true;
    setLoadingProcesses(true);

    const fetchTop = async () => {
      try {
        const res = await fetch('/api/system/processes');
        if (!res.ok) return;
        const data = await res.json();
        if (!isMounted) return;
        setProcesses(data.processes || []);
      } catch {
        // graceful
      } finally {
        if (isMounted) setLoadingProcesses(false);
      }
    };

    fetchTop();
    const interval = setInterval(fetchTop, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isAnyTop5Active]);

  const topCpuProcesses = useMemo(() => {
    if (cpuView !== 'top5') return [];
    return [...processes].sort((a, b) => b.cpu_usage - a.cpu_usage).slice(0, 5);
  }, [processes, cpuView]);

  const topRamProcesses = useMemo(() => {
    if (ramView !== 'top5') return [];
    return [...processes].sort((a, b) => b.memory_rss - a.memory_rss).slice(0, 5);
  }, [processes, ramView]);

  const gpuUsageNum = stats?.gpu_usage !== undefined && stats?.gpu_usage !== null ? stats.gpu_usage : 0;
  const gpuUsageStr = gpuUsageNum.toFixed(1);

  return (
    <div className="flex overflow-x-auto snap-x snap-mandatory gap-3 pb-2 -mx-1 px-1 scrollbar-none sm:mx-0 sm:px-0 sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 sm:gap-4 sm:pb-0 items-stretch">
      {/* 1. CPU & Temp Card */}
      <div className="relative group bg-card/60 backdrop-blur-3xl saturate-[190%] hover:bg-accent/70 border border-border/80 hover:border-saturn-500/40 rounded-2xl p-3.5 sm:p-5 transition-all duration-200 shadow-sm hover:shadow-md h-full min-h-[160px] sm:min-h-[180px] flex flex-col justify-between overflow-hidden shrink-0 w-[78vw] max-w-[285px] snap-center sm:w-auto sm:max-w-none sm:shrink">
        {cpuView === 'top5' ? (
          <TopProcessesCardView
            type="cpu"
            processes={topCpuProcesses}
            containers={containers}
            loading={loadingProcesses}
            onBack={() => setCpuView('gauge')}
            isConnected={isConnected}
          />
        ) : (
          <>
            <Link to="/metrics" className="block space-y-1">
              <div className="flex items-center justify-between text-secondary">
                <span className="text-xs font-medium">{t('dashboard.cpu_usage', 'Uso de CPU')}</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setCpuView('top5');
                    }}
                    className="px-2 py-0.5 rounded-lg bg-violet-500/15 hover:bg-violet-500/25 text-violet-600 dark:text-violet-400 border border-violet-500/30 text-[10px] font-mono font-bold transition-all active:scale-95 flex items-center gap-1 shadow-sm cursor-pointer"
                    title={t('dashboard.top_processes_cpu', 'Top 5 Processos (CPU)')}
                  >
                    <span>Top 5</span>
                    <Cpu className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xl sm:text-2xl font-bold font-mono text-primary tracking-tight">{cpuPercent}%</span>
                <span className="text-xs font-mono text-amber-700 dark:text-amber-400 font-semibold bg-amber-500/15 px-2 py-0.5 rounded-full border border-amber-500/30">
                  {tempC}°C
                </span>
              </div>
            </Link>

            <Link to="/metrics" className="block my-2 py-1">
              <MiniSparkline data={cpuHistory} color="#8b5cf6" gradientId="overviewSparkCpu" height={42} min={0} max={100} />
            </Link>

            <Link to="/metrics" className="block">
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    parseFloat(cpuPercent) > 80 ? 'bg-rose-500' : parseFloat(cpuPercent) > 50 ? 'bg-amber-500' : 'bg-violet-500'
                  }`}
                  style={{ width: `${Math.min(parseFloat(cpuPercent), 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-secondary font-mono mt-1.5">
                <span>{runningContainersCount} {t('common.active_plural', 'ativos')}</span>
                <span>{isConnected ? t('dashboard.realtime', 'Tempo real') : t('dashboard.offline', 'Offline')}</span>
              </div>
            </Link>
          </>
        )}
      </div>

      {/* 2. Memory RAM Card */}
      <div className="relative group bg-card/60 backdrop-blur-3xl saturate-[190%] hover:bg-accent/70 border border-border/80 hover:border-saturn-500/40 rounded-2xl p-3.5 sm:p-5 transition-all duration-200 shadow-sm hover:shadow-md h-full min-h-[160px] sm:min-h-[180px] flex flex-col justify-between overflow-hidden shrink-0 w-[78vw] max-w-[285px] snap-center sm:w-auto sm:max-w-none sm:shrink">
        {ramView === 'top5' ? (
          <TopProcessesCardView
            type="ram"
            processes={topRamProcesses}
            containers={containers}
            loading={loadingProcesses}
            onBack={() => setRamView('gauge')}
            isConnected={isConnected}
          />
        ) : (
          <>
            <Link to="/metrics" className="block space-y-1">
              <div className="flex items-center justify-between text-secondary">
                <span className="text-xs font-medium">{t('dashboard.ram_memory', 'Memória RAM')}</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setRamView('top5');
                    }}
                    className="px-2 py-0.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[10px] font-mono font-bold transition-all active:scale-95 flex items-center gap-1 shadow-sm cursor-pointer"
                    title={t('dashboard.top_processes_ram', 'Top 5 Processos (RAM)')}
                  >
                    <span>Top 5</span>
                    <Activity className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xl sm:text-2xl font-bold font-mono text-primary tracking-tight">{memoryUsedGB} GB</span>
                <span className="text-xs font-mono text-secondary font-medium">/ {memoryTotalGB} GB ({memoryPercent}%)</span>
              </div>
            </Link>

            <Link to="/metrics" className="block my-2 py-1">
              <MiniSparkline data={ramHistory} color="#10b981" gradientId="overviewSparkRam" height={42} min={0} max={100} />
            </Link>

            <Link to="/metrics" className="block">
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    parseFloat(memoryPercent) > 85 ? 'bg-rose-500' : parseFloat(memoryPercent) > 70 ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(parseFloat(memoryPercent), 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-secondary font-mono mt-1.5">
                <span>{Math.max(0, parseFloat(memoryTotalGB) - parseFloat(memoryUsedGB)).toFixed(2)} GB {t('dashboard.free_storage', 'livre')}</span>
                <span>{memoryPercent}% {t('common.in_use', 'em uso')}</span>
              </div>
            </Link>
          </>
        )}
      </div>

      {/* 3. GPU Usage Card */}
      <Link
        to="/metrics"
        className="group bg-card/60 backdrop-blur-3xl saturate-[190%] hover:bg-accent/70 border border-border/80 hover:border-saturn-500/40 rounded-2xl p-3.5 sm:p-5 transition-all duration-200 shadow-sm hover:shadow-md h-full min-h-[160px] sm:min-h-[180px] flex flex-col justify-between block relative overflow-hidden shrink-0 w-[78vw] max-w-[285px] snap-center sm:w-auto sm:max-w-none sm:shrink"
      >
        <div className="space-y-1">
          <div className="flex items-center justify-between text-secondary">
            <span className="text-xs font-medium">{t('dashboard.gpu_usage', 'Uso de GPU')}</span>
            <div className="flex items-center gap-1.5">
              {stats?.gpu_temperature !== undefined && stats?.gpu_temperature !== null && (
                <span className="text-xs font-mono text-amber-700 dark:text-amber-400 font-semibold bg-amber-500/15 px-2 py-0.5 rounded-full border border-amber-500/30">
                  {stats.gpu_temperature.toFixed(1)}°C
                </span>
              )}
              <div className="p-1.5 rounded-lg bg-pink-500/10 text-pink-600 dark:text-pink-400 group-hover:scale-110 transition-transform">
                <Sparkles className="w-4 h-4" />
              </div>
            </div>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xl sm:text-2xl font-bold font-mono text-primary tracking-tight">{gpuUsageStr}%</span>
            <span className="text-xs font-mono text-secondary font-medium truncate max-w-[130px]">
              {stats?.gpu_memory_total ? (
                `${(stats.gpu_memory_used / 1024 / 1024 / 1024).toFixed(2)} / ${(stats.gpu_memory_total / 1024 / 1024 / 1024).toFixed(2)} GB`
              ) : (
                stats?.gpu_name || t('dashboard.gpu_integrated', 'GPU Integrada')
              )}
            </span>
          </div>
        </div>
        <div className="my-2 py-1">
          <MiniSparkline
            data={gpuHistory.length > 0 ? gpuHistory : [gpuUsageNum, gpuUsageNum, gpuUsageNum, gpuUsageNum]}
            color="#ec4899"
            gradientId="overviewSparkGpu"
            height={42}
            min={0}
            max={100}
          />
        </div>
        <div>
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                gpuUsageNum > 80 ? 'bg-rose-500' : gpuUsageNum > 50 ? 'bg-amber-500' : 'bg-pink-500'
              }`}
              style={{ width: `${Math.min(gpuUsageNum, 100)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-secondary font-mono mt-1.5">
            <span className="truncate max-w-[140px]">{stats?.gpu_name || 'AMD / Intel / NVIDIA'}</span>
            <span className="text-emerald-500 dark:text-emerald-400 font-semibold">{t('common.active', 'Ativo')}</span>
          </div>
        </div>
      </Link>

      {/* 4. Storage Multi-Drive Card (Cleaned & De-duplicated) */}
      <Link
        to="/disk-analyzer"
        className="group bg-card/60 backdrop-blur-3xl saturate-[190%] hover:bg-accent/70 border border-border/80 hover:border-saturn-500/40 rounded-2xl p-3.5 sm:p-5 transition-all duration-200 shadow-sm hover:shadow-md h-full min-h-[160px] sm:min-h-[180px] flex flex-col justify-between relative overflow-hidden shrink-0 w-[78vw] max-w-[285px] snap-center sm:w-auto sm:max-w-none sm:shrink"
        title={t('dashboard.view_disk_analyzer', 'Ver Analisador de Disco')}
      >
        <div className="flex items-center justify-between text-secondary mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium">{t('dashboard.storage', 'Armazenamento')}</span>
            {uniqueDisks.length > 1 && (
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-saturn-500/15 text-saturn-700 dark:text-saturn-400 border border-saturn-500/30">
                {uniqueDisks.length} {t('dashboard.drives', 'unidades')}
              </span>
            )}
          </div>
          <div className="p-1.5 rounded-lg bg-saturn-500/10 text-saturn-600 dark:text-saturn-400 group-hover:scale-110 transition-transform">
            <HardDrive className="w-4 h-4" />
          </div>
        </div>

        {uniqueDisks.length <= 1 ? (
          <div className="flex-1 flex flex-col justify-between py-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xl sm:text-2xl font-bold font-mono text-primary tracking-tight">
                {uniqueDisks[0] ? formatStorage(uniqueDisks[0].used, 2) : diskUsedFormatted}
              </span>
              <span className="text-xs font-mono text-secondary font-medium">
                / {uniqueDisks[0] ? formatStorage(uniqueDisks[0].total, 2) : diskTotalFormatted} ({diskPercent}%)
              </span>
            </div>
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden my-3">
              <div
                className={`h-full rounded-full transition-all duration-300 ${parseFloat(diskPercent) > 85 ? 'bg-rose-500' : 'bg-saturn-500'}`}
                style={{ width: `${Math.min(parseFloat(diskPercent), 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-secondary font-mono pt-1.5 border-t border-border/40">
              <span className="truncate max-w-[150px]">
                {uniqueDisks[0] ? getFriendlyDiskName(uniqueDisks[0].name, uniqueDisks[0].mount_point) : t('dashboard.primary_disk', 'Disco Principal')}
              </span>
              <span className="text-emerald-500 dark:text-emerald-400 font-semibold">
                {uniqueDisks[0] ? `${formatStorage(Math.max(0, uniqueDisks[0].total - uniqueDisks[0].used), 2)} ${t('dashboard.free_storage', 'livre')}` : ''}
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-3 flex-1 flex flex-col justify-center py-1">
            {uniqueDisks.map((d, idx) => {
              const info = getDiskCategoryInfo(d.name, d.mount_point);
              const usedFmt = formatStorage(d.used, 2);
              const totalFmt = formatStorage(d.total, 2);
              const freeFmt = formatStorage(Math.max(0, d.total - d.used), 2);
              const percent = d.total > 0 ? ((d.used / d.total) * 100).toFixed(1) : '0.0';
              const percentNum = parseFloat(percent);
              const isCritical = percentNum > 85;
              const isWarning = percentNum > 70;

              return (
                <div key={d.name || idx} className="pt-2 first:pt-0 border-t border-border/40 first:border-t-0">
                  <div className="flex items-center justify-between gap-1.5 mb-1.5">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      {info.category === 'sdcard' ? (
                        <CreditCard className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                      ) : info.category === 'nvme' ? (
                        <Zap className="w-3.5 h-3.5 text-saturn-600 dark:text-saturn-400 shrink-0" />
                      ) : info.category === 'usb' ? (
                        <Usb className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      ) : (
                        <HardDrive className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                      )}
                      <span className="text-xs font-semibold text-primary truncate" title={info.friendlyName}>
                        {info.friendlyName}
                      </span>
                      <span className="hidden xl:inline-block text-[9px] font-mono px-1.5 py-0.5 rounded bg-accent text-slate-700 dark:text-zinc-300 font-semibold border border-border/50 shrink-0">
                        {info.typeLabel}
                      </span>
                    </div>
                    <div className="text-right shrink-0 ml-1">
                      <span className="text-xs font-mono font-bold text-primary">{usedFmt}</span>
                      <span className="text-[10px] font-mono text-slate-600 dark:text-secondary ml-1 font-medium">/ {totalFmt}</span>
                      <span className="block text-[10px] font-mono text-secondary">({percent}%)</span>
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        isCritical ? 'bg-rose-500' : isWarning ? 'bg-amber-500' : info.category === 'nvme' ? 'bg-saturn-500' : info.category === 'sdcard' ? 'bg-amber-500' : 'bg-sky-500'
                      }`}
                      style={{ width: `${Math.min(percentNum, 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-secondary font-mono mt-1">
                    <span className="truncate text-secondary/70">{d.mount_point}</span>
                    <span className="text-emerald-500 dark:text-emerald-400 font-semibold">
                      {freeFmt} {t('dashboard.free_storage', 'livre')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Link>

      {/* 5. Network & Containers Card */}
      <Link
        to="/metrics"
        className="group bg-card/60 backdrop-blur-3xl saturate-[190%] hover:bg-accent/70 border border-border/80 hover:border-saturn-500/40 rounded-2xl p-3.5 sm:p-5 transition-all duration-200 shadow-sm hover:shadow-md h-full min-h-[160px] sm:min-h-[180px] flex flex-col justify-between block relative overflow-hidden shrink-0 w-[78vw] max-w-[285px] snap-center sm:w-auto sm:max-w-none sm:shrink"
      >
        <div className="space-y-1">
          <div className="flex items-center justify-between text-secondary">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs font-medium">{t('dashboard.network_traffic', 'Tráfego de Rede')}</span>
              {stats?.network_interface && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-sky-500/15 text-sky-700 dark:text-sky-400 border border-sky-500/30 font-mono font-medium flex items-center gap-1">
                  {stats.network_interface_type === 'wifi' ? <Wifi className="w-2.5 h-2.5" /> : <Cable className="w-2.5 h-2.5" />}
                  {stats.network_interface}
                </span>
              )}
            </div>
            <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 group-hover:scale-110 transition-transform">
              {stats?.network_interface_type === 'wifi' ? <Wifi className="w-4 h-4" /> : <Network className="w-4 h-4" />}
            </div>
          </div>
          <div className="flex items-center justify-between font-mono text-xs text-secondary">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 dark:bg-indigo-400" />
              TX: <strong className="text-primary">{netTxSpeed}</strong>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-500 dark:bg-sky-400" />
              RX: <strong className="text-primary">{netRxSpeed}</strong>
            </span>
          </div>
        </div>
        <div className="my-2 py-1">
          <MiniSparkline
            data={netRxHistory}
            secondaryData={netTxHistory}
            color="#38bdf8"
            secondaryColor="#818cf8"
            gradientId="overviewSparkRx"
            secondaryGradientId="overviewSparkTx"
            height={42}
          />
        </div>
        <div className="flex items-center justify-between text-xs pt-1.5 border-t border-border/50">
          <span className="text-secondary text-[11px] font-medium">{containers.length} Containers</span>
          <span className="text-emerald-700 dark:text-emerald-400 font-semibold font-mono text-[11px] flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {runningContainersCount} ativos
          </span>
        </div>
      </Link>
    </div>
  );
}
