import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  ProcessSummaryCards,
  ProcessTable,
  ProcessDetailModal,
  ProcessKillModal,
} from './process-monitor';

export interface ProcessInfo {
  pid: number;
  ppid?: number;
  name: string;
  cmd: string[];
  exe?: string;
  user?: string;
  cpu_usage: number;
  memory_rss: number;
  memory_vms: number;
  memory_percent: number;
  status: string;
  is_kernel_thread?: boolean;
  container_id?: string;
  container_name?: string;
  start_time: number;
  disk_read_bytes: number;
  disk_written_bytes: number;
}

export interface TopProcessSummary {
  pid: number;
  name: string;
  value: number;
  container_name?: string;
}

export interface ProcessesResponse {
  processes: ProcessInfo[];
  total_processes: number;
  user_processes_count?: number;
  kernel_threads_count?: number;
  running_processes: number;
  sleeping_processes: number;
  zombie_processes: number;
  host_processes_count: number;
  container_processes_count: number;
  top_cpu_process?: TopProcessSummary;
  top_memory_process?: TopProcessSummary;
  total_cpu_usage: number;
  total_memory_used: number;
  total_memory_available: number;
}

export function ProcessMonitor() {
  const { t } = useTranslation();
  const [data, setData] = useState<ProcessesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState<number>(3000); // 3s default
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedScope, setSelectedScope] = useState<string>('all'); // 'all' | 'host' | container_name
  const [selectedStatus, setSelectedStatus] = useState<string>('all'); // 'all' | 'Running' | 'Sleeping' | 'Zombie'
  
  // Sorting
  const [sortBy, setSortBy] = useState<'cpu' | 'memory' | 'pid' | 'name' | 'disk'>('cpu');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Modals
  const [selectedProcess, setSelectedProcess] = useState<ProcessInfo | null>(null);
  const [killModalProcess, setKillModalProcess] = useState<ProcessInfo | null>(null);
  const [killSignal, setKillSignal] = useState<'SIGTERM' | 'SIGKILL'>('SIGTERM');
  const [killing, setKilling] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchProcesses = async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      const token = localStorage.getItem('saturn_token');
      const res = await fetch('/api/system/processes', {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Cache-Control': 'no-cache',
        },
      });

      if (res.ok) {
        const json: ProcessesResponse = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Failed to fetch system processes', err);
    } finally {
      setLoading(false);
      if (isManual) setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchProcesses();
    if (refreshInterval > 0) {
      const interval = setInterval(() => {
        fetchProcesses();
      }, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [refreshInterval]);

  const handleKillProcess = async () => {
    if (!killModalProcess) return;
    setKilling(true);
    try {
      const token = localStorage.getItem('saturn_token');
      const res = await fetch(`/api/system/processes/${killModalProcess.pid}/kill`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ signal: killSignal }),
      });

      const resData = await res.json().catch(() => ({}));
      if (res.ok && resData.success) {
        setActionMessage({
          text: t('metrics.signal_sent_success', {
            signal: killSignal,
            name: killModalProcess.name,
            pid: killModalProcess.pid,
            defaultValue: `Sinal ${killSignal} enviado com sucesso ao processo ${killModalProcess.name} (PID: ${killModalProcess.pid})`,
          }),
          type: 'success',
        });
        setKillModalProcess(null);
        fetchProcesses(true);
      } else {
        setActionMessage({
          text: resData.error || t('metrics.failed_to_kill_process', {
            pid: killModalProcess.pid,
            defaultValue: `Falha ao finalizar processo (PID: ${killModalProcess.pid}). Verifique permissões.`,
          }),
          type: 'error',
        });
      }
    } catch (err: any) {
      setActionMessage({
        text: err?.message || t('metrics.network_error_kill_process', 'Erro de rede ao tentar finalizar processo.'),
        type: 'error',
      });
    } finally {
      setKilling(false);
    }
  };

  // Distinct container names
  const containerNames = useMemo(() => {
    if (!data?.processes) return [];
    const set = new Set<string>();
    data.processes.forEach(p => {
      if (p.container_name) set.add(p.container_name);
    });
    return Array.from(set).sort();
  }, [data]);

  // Filter and sort processes
  const filteredProcesses = useMemo(() => {
    if (!data?.processes) return [];
    const query = searchQuery.trim().toLowerCase();

    return data.processes
      .filter(p => {
        // Scope Filter
        if (selectedScope === 'user_only' && p.is_kernel_thread) return false;
        if (selectedScope === 'kthread_only' && !p.is_kernel_thread) return false;
        if (selectedScope === 'host' && p.container_name) return false;
        if (selectedScope !== 'all' && selectedScope !== 'user_only' && selectedScope !== 'kthread_only' && selectedScope !== 'host' && p.container_name !== selectedScope) return false;

        // Status Filter
        if (selectedStatus !== 'all' && p.status.toLowerCase() !== selectedStatus.toLowerCase()) return false;

        // Query Filter
        if (query) {
          const matchPid = p.pid.toString().includes(query);
          const matchName = p.name.toLowerCase().includes(query);
          const matchUser = (p.user || '').toLowerCase().includes(query);
          const matchContainer = (p.container_name || '').toLowerCase().includes(query);
          const matchCmd = p.cmd.some(c => c.toLowerCase().includes(query));
          const matchExe = (p.exe || '').toLowerCase().includes(query);
          return matchPid || matchName || matchUser || matchContainer || matchCmd || matchExe;
        }

        return true;
      })
      .sort((a, b) => {
        let comp = 0;
        switch (sortBy) {
          case 'cpu':
            comp = (a.cpu_usage || 0) - (b.cpu_usage || 0);
            break;
          case 'memory':
            comp = (a.memory_rss || 0) - (b.memory_rss || 0);
            break;
          case 'pid':
            comp = a.pid - b.pid;
            break;
          case 'name':
            comp = a.name.localeCompare(b.name);
            break;
          case 'disk':
            const diskA = (a.disk_read_bytes || 0) + (a.disk_written_bytes || 0);
            const diskB = (b.disk_read_bytes || 0) + (b.disk_written_bytes || 0);
            comp = diskA - diskB;
            break;
        }
        return sortOrder === 'asc' ? comp : -comp;
      });
  }, [data, searchQuery, selectedScope, selectedStatus, sortBy, sortOrder]);

  const toggleSort = (field: 'cpu' | 'memory' | 'pid' | 'name' | 'disk') => {
    if (sortBy === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in zoom-in-95 duration-300">
      {/* Toast Alert */}
      {actionMessage && (
        <div className={`p-3.5 rounded-xl border flex items-center justify-between text-xs sm:text-sm font-medium animate-in fade-in slide-in-from-top duration-200 shadow-lg ${
          actionMessage.type === 'success' 
            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-semibold' 
            : 'bg-rose-500/15 border-rose-500/30 text-rose-700 dark:text-rose-300 font-semibold'
        }`}>
          <div className="flex items-center gap-2">
            {actionMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />}
            <span>{actionMessage.text}</span>
          </div>
          <button onClick={() => setActionMessage(null)} className="p-1 hover:bg-white/10 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* KPI Bento Cards */}
      <ProcessSummaryCards data={data} onSelectProcess={setSelectedProcess} />

      {/* Process Table and Toolbar */}
      <ProcessTable
        data={data}
        loading={loading}
        isRefreshing={isRefreshing}
        fetchProcesses={fetchProcesses}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        selectedScope={selectedScope}
        setSelectedScope={setSelectedScope}
        selectedStatus={selectedStatus}
        setSelectedStatus={setSelectedStatus}
        refreshInterval={refreshInterval}
        setRefreshInterval={setRefreshInterval}
        containerNames={containerNames}
        filteredProcesses={filteredProcesses}
        sortBy={sortBy}
        sortOrder={sortOrder}
        toggleSort={toggleSort}
        onSelectProcess={setSelectedProcess}
        onInitiateKill={setKillModalProcess}
      />

      {/* Process Details Modal */}
      <ProcessDetailModal
        selectedProcess={selectedProcess}
        onClose={() => setSelectedProcess(null)}
        onInitiateKill={setKillModalProcess}
      />

      {/* Kill Process Confirmation Modal */}
      <ProcessKillModal
        killModalProcess={killModalProcess}
        killSignal={killSignal}
        setKillSignal={setKillSignal}
        killing={killing}
        onClose={() => setKillModalProcess(null)}
        onConfirmKill={handleKillProcess}
      />
    </div>
  );
}

export default ProcessMonitor;
