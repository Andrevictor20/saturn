import { useTranslation } from 'react-i18next';
import { Layers, Cpu, HardDrive, Box, Monitor } from 'lucide-react';
import { formatRAM } from '../../../utils/format';
import type { ProcessInfo, ProcessesResponse } from '../ProcessMonitor';

interface ProcessSummaryCardsProps {
  data: ProcessesResponse | null;
  onSelectProcess?: (process: ProcessInfo) => void;
}

export function ProcessSummaryCards({ data, onSelectProcess }: ProcessSummaryCardsProps) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total Tasks */}
      <div className="bg-card border border-border rounded-xl p-4 flex flex-col justify-between shadow-sm relative overflow-hidden group hover:border-saturn-500/40 transition-colors">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-secondary uppercase tracking-wider">{t('metrics.total_processes')}</span>
          <div className="p-2 rounded-lg bg-saturn-500/10 text-saturn-600 dark:text-saturn-400">
            <Layers className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-bold text-primary font-mono">
            {data?.user_processes_count ?? data?.total_processes ?? '—'}
          </span>
          <span className="text-xs text-secondary font-medium">
            {data?.kernel_threads_count ? `(${data.total_processes} ${t('common.total').toLowerCase()})` : t('metrics.user_tasks')}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-3 pt-2.5 border-t border-border/50 text-[11px] flex-wrap">
          <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold">
            {data?.running_processes ?? 0} {t('common.running').toLowerCase()}
          </span>
          <span className="px-1.5 py-0.5 rounded-md bg-background text-secondary border border-border/50 font-medium">
            {data?.sleeping_processes ?? 0} {t('common.paused').toLowerCase()}
          </span>
          {Boolean(data?.kernel_threads_count) && (
            <span className="px-1.5 py-0.5 rounded-md bg-blue-500/15 text-blue-700 dark:text-blue-300 font-semibold" title="Kernel Threads (kthr)">
              {data?.kernel_threads_count} kthr
            </span>
          )}
          {Boolean(data?.zombie_processes) && (
            <span className="px-1.5 py-0.5 rounded-md bg-rose-500/20 text-rose-700 dark:text-rose-300 font-bold">
              {data?.zombie_processes} zombie
            </span>
          )}
        </div>
      </div>

      {/* Top CPU Consumer */}
      <div 
        data-testid="top-cpu-process-card"
        onClick={() => {
          if (!data?.top_cpu_process || !onSelectProcess) return;
          const proc = data.processes?.find(p => p.pid === data.top_cpu_process?.pid);
          if (proc) onSelectProcess(proc);
        }}
        className={`bg-card border border-border rounded-xl p-4 flex flex-col justify-between shadow-sm relative overflow-hidden group transition-all ${
          data?.top_cpu_process && onSelectProcess 
            ? 'hover:border-saturn-500/60 cursor-pointer active:scale-[0.99]' 
            : 'hover:border-saturn-500/40'
        }`}
        role={data?.top_cpu_process && onSelectProcess ? 'button' : undefined}
        tabIndex={data?.top_cpu_process && onSelectProcess ? 0 : undefined}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const proc = data?.processes?.find(p => p.pid === data.top_cpu_process?.pid);
            if (proc && onSelectProcess) onSelectProcess(proc);
          }
        }}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-secondary uppercase tracking-wider">{t('metrics.cpu_usage_history')}</span>
          <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
            <Cpu className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2">
          <div className="text-lg font-bold text-primary truncate max-w-full font-mono" title={data?.top_cpu_process?.name}>
            {data?.top_cpu_process?.name || '—'}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs font-semibold text-purple-700 dark:text-purple-400 font-mono font-bold">
              {data?.top_cpu_process?.value ? `${data.top_cpu_process.value.toFixed(1)}% CPU` : '0.0%'}
            </span>
            <span className="text-[11px] text-secondary font-mono">PID {data?.top_cpu_process?.pid}</span>
          </div>
        </div>
        <div className="mt-3 pt-2.5 border-t border-border/50 text-[11px] text-secondary truncate">
          {t('logs.source')}: {data?.top_cpu_process?.container_name ? (
            <span className="text-saturn-600 dark:text-saturn-400 font-semibold">{data.top_cpu_process.container_name}</span>
          ) : (
            <span className="text-secondary font-medium">Host</span>
          )}
        </div>
      </div>

      {/* Top RAM Consumer */}
      <div 
        data-testid="top-ram-process-card"
        onClick={() => {
          if (!data?.top_memory_process || !onSelectProcess) return;
          const proc = data.processes?.find(p => p.pid === data.top_memory_process?.pid);
          if (proc) onSelectProcess(proc);
        }}
        className={`bg-card border border-border rounded-xl p-4 flex flex-col justify-between shadow-sm relative overflow-hidden group transition-all ${
          data?.top_memory_process && onSelectProcess 
            ? 'hover:border-saturn-500/60 cursor-pointer active:scale-[0.99]' 
            : 'hover:border-saturn-500/40'
        }`}
        role={data?.top_memory_process && onSelectProcess ? 'button' : undefined}
        tabIndex={data?.top_memory_process && onSelectProcess ? 0 : undefined}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const proc = data?.processes?.find(p => p.pid === data.top_memory_process?.pid);
            if (proc && onSelectProcess) onSelectProcess(proc);
          }
        }}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-secondary uppercase tracking-wider">{t('metrics.memory_usage_history')}</span>
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <HardDrive className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2">
          <div className="text-lg font-bold text-primary truncate max-w-full font-mono" title={data?.top_memory_process?.name}>
            {data?.top_memory_process?.name || '—'}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 font-mono font-bold">
              {data?.top_memory_process?.value ? formatRAM(data.top_memory_process.value) : '0 B'}
            </span>
            <span className="text-[11px] text-secondary font-mono">PID {data?.top_memory_process?.pid}</span>
          </div>
        </div>
        <div className="mt-3 pt-2.5 border-t border-border/50 text-[11px] text-secondary truncate">
          {t('logs.source')}: {data?.top_memory_process?.container_name ? (
            <span className="text-saturn-600 dark:text-saturn-400 font-semibold">{data.top_memory_process.container_name}</span>
          ) : (
            <span className="text-secondary font-medium">Host</span>
          )}
        </div>
      </div>

      {/* Host vs Containers Distribution */}
      <div className="bg-card border border-border rounded-xl p-4 flex flex-col justify-between shadow-sm relative overflow-hidden group hover:border-saturn-500/40 transition-colors">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-secondary uppercase tracking-wider">{t('metrics.system_overview')}</span>
          <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <Box className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs text-secondary flex items-center gap-1 font-medium">
              <Monitor className="w-3 h-3 text-secondary" /> Host
            </span>
            <span className="text-xl font-bold text-primary font-mono mt-0.5">
              {data?.host_processes_count ?? 0}
            </span>
          </div>
          <div className="h-8 w-px bg-border mx-2" />
          <div className="flex flex-col">
            <span className="text-xs text-secondary flex items-center gap-1 font-medium">
              <Box className="w-3 h-3 text-saturn-600 dark:text-saturn-400" /> Containers
            </span>
            <span className="text-xl font-bold text-saturn-600 dark:text-saturn-400 font-mono mt-0.5">
              {data?.container_processes_count ?? 0}
            </span>
          </div>
        </div>
        <div className="mt-3 pt-2.5 border-t border-border/50 text-[11px] text-secondary flex items-center justify-between">
          <span>CPU: <span className="text-primary font-mono">{data?.total_cpu_usage?.toFixed(1) || '0.0'}%</span></span>
          <span>RAM: <span className="text-primary font-mono">{formatRAM(data?.total_memory_used)}</span></span>
        </div>
      </div>
    </div>
  );
}
