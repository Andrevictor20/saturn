import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutGrid, Layers, Terminal, PieChart, Plus, Search, Clock } from 'lucide-react';
import { useStats } from '../contexts/StatsContext';
import { isPhysicalStorage, formatStorage, formatNetworkSpeed } from '../utils/format';
import { getFriendlyDiskName } from '../utils/format';
import { getIconForImage } from '../utils/icons';
import { groupContainers, type GroupContainerItem } from '../utils/containerGroups';
import { AppGroupModal } from '../components/docker/AppGroupModal';
import { SaturnLogo } from '../components/ui/SaturnLogo';
import { useSettings } from '../contexts/SettingsContext';
import { AppCardItem, type OverviewContainer } from '../components/dashboard/OverviewAppCard';
import { OverviewTelemetryCards } from '../components/dashboard/OverviewTelemetryCards';
import { OverviewWeatherWidget } from '../components/dashboard/OverviewWeatherWidget';

export function Overview() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { stats, history = [], isConnected } = useStats();
  const { settings } = useSettings();

  const [containers, setContainers] = useState<OverviewContainer[]>([]);
  const [customLinks, setCustomLinks] = useState<Record<string, string>>({});
  const [selectedGroup, setSelectedGroup] = useState<GroupContainerItem<OverviewContainer> | null>(null);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'running' | 'stacks' | 'stopped'>('all');

  const fetchContainers = () => {
    fetch('/api/docker/containers')
      .then(res => res.ok ? res.json() : [])
      .then(data => { if (Array.isArray(data)) setContainers(data); })
      .catch(() => {});
  };

  const fetchLinks = () => {
    fetch('/api/docker/links')
      .then(res => res.ok ? res.json() : {})
      .then(links => setCustomLinks(links))
      .catch(() => {});
  };

  useEffect(() => {
    fetchContainers();
    fetchLinks();

    const onDockerEvent = () => {
      fetchContainers();
    };
    window.addEventListener('saturn:docker-event', onDockerEvent);
    return () => window.removeEventListener('saturn:docker-event', onDockerEvent);
  }, []);

  const groupedItems = useMemo(() => groupContainers(containers, customLinks, getIconForImage), [containers, customLinks]);

  // Telemetry derived values
  const cpuPercent = stats ? stats.cpu_usage.toFixed(1) : '0.0';
  const memoryUsedGB = stats ? (stats.memory_used / 1024 / 1024 / 1024).toFixed(2) : '0.00';
  const memoryTotalGB = stats ? (stats.memory_total / 1024 / 1024 / 1024).toFixed(2) : '0.00';
  const memoryPercent = stats && stats.memory_total > 0
    ? ((stats.memory_used / stats.memory_total) * 100).toFixed(1)
    : '0.0';

  const uniqueDisksMap = new Map<string, any>();
  if (stats && Array.isArray(stats.disks)) {
    stats.disks.forEach((d: any) => {
      if (!isPhysicalStorage(d.name, d.mount_point, d.fs_type, d.total)) return;
      const key = d.name.startsWith('/dev/') ? d.name : getFriendlyDiskName(d.name, d.mount_point);
      if (uniqueDisksMap.has(key)) {
        const existing = uniqueDisksMap.get(key)!;
        if (d.mount_point === '/' || d.mount_point.startsWith('/home') || d.mount_point.startsWith('/mnt') || d.mount_point.startsWith('/media')) {
          existing.mount_point = d.mount_point;
          existing.used = Math.max(existing.used, d.used);
          existing.total = Math.max(existing.total, d.total);
        }
      } else {
        uniqueDisksMap.set(key, { ...d });
      }
    });
  }
  const uniqueDisks = Array.from(uniqueDisksMap.values()).sort((a, b) => {
    const aIsSystem = a.mount_point === '/' || a.mount_point === '/host' || a.mount_point === '/root';
    const bIsSystem = b.mount_point === '/' || b.mount_point === '/host' || b.mount_point === '/root';
    if (aIsSystem && !bIsSystem) return -1;
    if (!aIsSystem && bIsSystem) return 1;
    return b.total - a.total;
  });

  const globalDiskUsed = uniqueDisks.reduce((acc, d) => acc + d.used, 0);
  const globalDiskTotal = uniqueDisks.reduce((acc, d) => acc + d.total, 0);
  const diskPercent = globalDiskTotal > 0 ? ((globalDiskUsed / globalDiskTotal) * 100).toFixed(1) : '0.0';
  const tempC = stats ? stats.temperature.toFixed(1) : '0.0';
  const netTxSpeed = formatNetworkSpeed(stats?.network_tx);
  const netRxSpeed = formatNetworkSpeed(stats?.network_rx);

  const safeHistory = Array.isArray(history) ? history : [];
  const cpuHistory = useMemo(() => {
    if (safeHistory.length === 0) { const v = parseFloat(cpuPercent) || 0; return [v, v, v, v, v, v]; }
    return safeHistory.slice(-24).map((p) => p.cpu || 0);
  }, [safeHistory, cpuPercent]);

  const ramHistory = useMemo(() => {
    if (safeHistory.length === 0) { const v = parseFloat(memoryPercent) || 0; return [v, v, v, v, v, v]; }
    const total = stats?.memory_total || 1;
    return safeHistory.slice(-24).map((p) => (p.memory / total) * 100);
  }, [safeHistory, memoryPercent, stats?.memory_total]);

  const netRxHistory = useMemo(() => {
    if (safeHistory.length === 0) { const v = stats?.network_rx || 0; return [v, v, v, v, v, v]; }
    return safeHistory.slice(-24).map((p) => p.rx || 0);
  }, [safeHistory, stats?.network_rx]);

  const netTxHistory = useMemo(() => {
    if (safeHistory.length === 0) { const v = stats?.network_tx || 0; return [v, v, v, v, v, v]; }
    return safeHistory.slice(-24).map((p) => p.tx || 0);
  }, [safeHistory, stats?.network_tx]);

  const gpuHistory = useMemo(() => {
    if (safeHistory.length === 0) { const v = stats?.gpu_usage || 0; return [v, v, v, v, v, v]; }
    return safeHistory.slice(-24).map((p) => p.gpu || 0);
  }, [safeHistory, stats?.gpu_usage]);

  // Real-time clock with 12h / 24h toggle and timezone
  const [timeFormat, setTimeFormat] = useState<'24h' | '12h'>(() => {
    return (localStorage.getItem('saturn_time_format') as '24h' | '12h') || '24h';
  });
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const toggleTimeFormat = () => {
    const next = timeFormat === '24h' ? '12h' : '24h';
    setTimeFormat(next);
    localStorage.setItem('saturn_time_format', next);
  };

  const formattedTime = useMemo(() => {
    if (timeFormat === '12h') {
      return currentTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
    }
    return currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  }, [currentTime, timeFormat]);

  const timezoneOffsetStr = useMemo(() => {
    const offsetMin = -currentTime.getTimezoneOffset();
    const sign = offsetMin >= 0 ? '+' : '-';
    const hours = Math.floor(Math.abs(offsetMin) / 60);
    return `GMT${sign}${hours}`;
  }, [currentTime]);

  const runningContainersCount = useMemo(
    () => containers.filter(c => c.state.toLowerCase() === 'running').length,
    [containers]
  );

  const filteredApps = useMemo(() => {
    return groupedItems.filter((item) => {
      const nameMatch = item.name.toLowerCase().includes(searchFilter.toLowerCase());
      if (!nameMatch) return false;
      if (activeFilter === 'running') return item.type === 'group' ? item.anyRunning : item.isRunning;
      if (activeFilter === 'stopped') return item.type === 'group' ? !item.anyRunning : !item.isRunning;
      if (activeFilter === 'stacks') return item.type === 'group';
      return true;
    });
  }, [groupedItems, searchFilter, activeFilter]);

  const handleOpenApp = (webLink?: string, containerId?: string, isRunning?: boolean) => {
    if (webLink && isRunning) window.open(webLink, '_blank');
    else if (containerId) navigate(`/containers/${containerId}`);
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-150">
      {/* Hero Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4 bg-card/85 backdrop-blur-2xl border border-border/80 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-sm">
        {/* Left: Welcome Greeting & Live Clock */}
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
            <SaturnLogo size={26} className="rounded-xl shrink-0 sm:hidden" />
            <SaturnLogo size={30} className="rounded-xl shrink-0 hidden sm:block" />
            <h1 className="text-lg sm:text-2xl font-extrabold text-primary tracking-tight">
              {t('dashboard.welcome', 'Boas-vindas')}
            </h1>
            <div className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm font-mono font-semibold bg-accent/60 border border-border text-primary shadow-inner">
              <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-saturn-500" />
              <span className="tracking-tight">{formattedTime}</span>
              <span className="text-[10px] sm:text-xs text-secondary font-normal">({timezoneOffsetStr})</span>
              <button
                type="button"
                onClick={toggleTimeFormat}
                title={t('dashboard.time_format_toggle', 'Alternar formato 12h/24h')}
                className="ml-1 px-1.5 py-0.5 rounded bg-card hover:bg-accent border border-border/80 text-[10px] font-bold text-secondary hover:text-primary transition-all active:scale-95 cursor-pointer"
              >
                {timeFormat}
              </button>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-secondary truncate">
            {t('dashboard.welcome_sub', 'Monitore o desempenho do sistema e gerencie seus aplicativos')}
          </p>
        </div>

        {/* Middle: Integrated Weather & Air Quality */}
        {settings.show_weather_card !== false && (
          <div className="flex items-center px-3.5 py-2 rounded-2xl bg-accent/30 border border-border/60 backdrop-blur-md self-start lg:self-center">
            <OverviewWeatherWidget />
          </div>
        )}

        {/* Right: Quick Action Buttons */}
        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-none self-start lg:self-center shrink-0">
          <Link to="/store" className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-xl bg-saturn-500 hover:bg-saturn-600 active:scale-95 text-white text-xs font-semibold shadow-md shadow-saturn-500/25 transition-all shrink-0">
            <Plus className="w-3.5 h-3.5" />
            <span>{t('store.install_app', 'Instalar Aplicativo')}</span>
          </Link>
          <Link to="/containers" className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-card hover:bg-accent border border-border text-secondary hover:text-primary text-xs font-semibold transition-all shadow-sm">
            <Layers className="w-3.5 h-3.5" />
            <span>{t('sidebar.containers', 'Containers')}</span>
          </Link>
          <Link to="/terminal" className="p-2 rounded-xl bg-card hover:bg-accent border border-border text-secondary hover:text-emerald-500 transition-all shadow-sm" title="Terminal Web">
            <Terminal className="w-4 h-4" />
          </Link>
          <Link to="/disk-analyzer" className="p-2 rounded-xl bg-card hover:bg-accent border border-border text-secondary hover:text-violet-500 transition-all shadow-sm" title="Analisador de Disco">
            <PieChart className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Telemetry Row */}
      <OverviewTelemetryCards
        cpuPercent={cpuPercent}
        tempC={tempC}
        memoryUsedGB={memoryUsedGB}
        memoryTotalGB={memoryTotalGB}
        memoryPercent={memoryPercent}
        netTxSpeed={netTxSpeed}
        netRxSpeed={netRxSpeed}
        containers={containers}
        runningContainersCount={runningContainersCount}
        uniqueDisks={uniqueDisks}
        diskPercent={diskPercent}
        diskUsedFormatted={formatStorage(globalDiskUsed, 2)}
        diskTotalFormatted={formatStorage(globalDiskTotal, 2)}
        cpuHistory={cpuHistory}
        ramHistory={ramHistory}
        netRxHistory={netRxHistory}
        netTxHistory={netTxHistory}
        gpuHistory={gpuHistory}
        isConnected={isConnected}
        stats={stats}
      />

      {/* Apps Grid */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-border/60">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <LayoutGrid className="w-5 h-5 text-saturn-500" />
              <h2 className="text-base sm:text-lg font-bold text-primary tracking-tight">
                {t('dashboard.apps_grid', 'Aplicativos Instalados')}
              </h2>
            </div>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-accent border border-border text-primary/80 dark:text-secondary">
              {containers.length}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap w-full sm:w-auto">
            <div className="flex items-center bg-accent/60 border border-border rounded-xl p-0.5 text-xs">
              {(['all', 'running', 'stacks'] as const).map((filter) => {
                const labels = { all: 'Todos', running: 'Ativos', stacks: 'Stacks' };
                return (
                  <button
                    key={filter}
                    onClick={() => setActiveFilter(filter)}
                    className={`px-2.5 py-1 rounded-lg transition-colors font-medium text-xs ${
                      activeFilter === filter ? 'bg-saturn-500 text-white shadow-sm' : 'text-secondary hover:text-primary'
                    }`}
                  >
                    {labels[filter]}
                  </button>
                );
              })}
            </div>
            <div className="relative flex-1 sm:w-48">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-secondary pointer-events-none" />
              <input
                type="text"
                placeholder="Filtrar apps..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-card border border-border text-base sm:text-xs text-primary placeholder:text-secondary/60 focus:outline-none focus:border-saturn-500 shadow-sm"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-2.5 sm:gap-4">
          {filteredApps.map((item) => (
            <AppCardItem
              key={item.id}
              item={item}
              onSelectGroup={setSelectedGroup}
              onOpenApp={handleOpenApp}
              t={t}
            />
          ))}
          <div
            onClick={() => navigate('/store')}
            className="border-2 border-dashed border-border/80 hover:border-saturn-500/60 bg-card hover:bg-accent/60 rounded-2xl p-3.5 flex flex-col items-center justify-center text-center transition-all duration-150 cursor-pointer group min-h-[120px] shadow-sm"
          >
            <div className="w-10 h-10 rounded-xl bg-accent border border-border flex items-center justify-center text-secondary group-hover:text-saturn-500 group-hover:border-saturn-500/40 transition-colors mb-1.5 shadow-sm">
              <Plus className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-secondary group-hover:text-primary transition-colors">
              {t('store.install_app', 'Instalar App')}
            </span>
          </div>
        </div>
      </div>

      <AppGroupModal
        group={selectedGroup}
        isOpen={Boolean(selectedGroup)}
        onClose={() => setSelectedGroup(null)}
        onRefresh={fetchContainers}
        customLinks={customLinks}
      />
    </div>
  );
}

export default Overview;
