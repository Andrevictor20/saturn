import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  RefreshCw, CheckCircle2, AlertCircle, Clock, DownloadCloud,
  Terminal, ChevronDown, ChevronUp, Sparkles, Layers, Ban,
  ArrowUpCircle, Copy, Check, RotateCcw, StopCircle, XCircle, Zap,
} from 'lucide-react';
import type { ContainerLike } from '../../utils/containerGroups';
import type { ContainerTaskStatus } from '../../contexts/BatchUpdateContext';

interface ContainerSelectionPhaseProps {
  displayedContainers: ContainerLike[];
  updatableContainers: ContainerLike[];
  updatesMap: Record<string, { has_update?: boolean }>;
  selectedIds: string[];
  concurrency?: number;
  setConcurrency?: (val: number) => void;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onStart: () => void;
  onClose: () => void;
  isSaturnSelf: (c: ContainerLike) => boolean;
}

interface ExecutionPhaseProps {
  taskStatuses: Record<string, ContainerTaskStatus>;
  logs: string[];
  isUpdating: boolean;
  failedCount: number;
  successCount: number;
  cancelledCount: number;
  completedTasks: number;
  totalTasks: number;
  progressPercent: number;
  showLogs: boolean;
  copiedLogs: boolean;
  expandedErrors: Record<string, boolean>;
  onToggleShowLogs: () => void;
  onCopyLogs: () => void;
  onToggleError: (id: string) => void;
  onCancelContainer: (id: string) => void;
  onCancelAll: () => void;
  onMinimize: () => void;
  onRetryFailed: () => void;
  onClose: () => void;
}

export function ContainerSelectionPhase({
  displayedContainers, updatableContainers, updatesMap, selectedIds,
  concurrency = 2, setConcurrency,
  onToggle, onSelectAll, onStart, onClose, isSaturnSelf,
}: ContainerSelectionPhaseProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 rounded-xl border border-border bg-accent/30">
        <span className="text-xs text-slate-700 dark:text-secondary font-medium">
          {t('batch_update_modal.ready_for_update', { count: updatableContainers.length, defaultValue: `${updatableContainers.length} container(s) pronto(s) para atualização` })}
        </span>
        <div className="flex items-center space-x-2">
          <button onClick={onSelectAll} className="text-xs text-saturn-600 dark:text-saturn-400 hover:text-saturn-500 font-semibold px-2 py-1 rounded hover:bg-saturn-500/10 transition-colors">
            {selectedIds.length === updatableContainers.length ? t('batch_update_modal.deselect_all') : t('batch_update_modal.select_all')}
          </button>
          <span className="text-xs text-slate-700 dark:text-secondary font-mono font-medium">
            {t('batch_update_modal.selected_count', { selected: selectedIds.length, total: updatableContainers.length })}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 rounded-xl border border-border bg-card/60">
        <div className="flex items-center space-x-2">
          <Zap className="w-3.5 h-3.5 text-amber-500" />
          <span className="text-xs text-slate-700 dark:text-secondary font-medium">
            {t('batch_update_modal.parallelism_label', 'Downloads simultâneos:')}
          </span>
        </div>
        <div className="inline-flex items-center p-0.5 rounded-lg border border-border bg-accent/40" data-testid="batch-concurrency-selector">
          {[1, 2, 3, 5].map((level) => {
            const isActive = concurrency === level;
            return (
              <button
                key={level}
                type="button"
                onClick={() => setConcurrency?.(level)}
                aria-pressed={isActive}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                  isActive
                    ? 'bg-saturn-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-secondary hover:text-primary hover:bg-accent/60'
                }`}
              >
                {level}x
              </button>
            );
          })}
        </div>
      </div>

      {displayedContainers.length === 0 ? (
        <div className="py-12 text-center text-secondary">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2 opacity-80" />
          <p className="text-sm font-medium">{t('batch_update_modal.no_outdated_containers')}</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {displayedContainers.map(c => {
            const isSaturn = isSaturnSelf(c);
            const isSelected = selectedIds.includes(c.id);
            const hasUpdate = updatesMap[c.id]?.has_update || updatesMap[c.id?.substring(0, 12)]?.has_update;
            const cleanName = c.name.replace(/^\//, '');
            const stackName = (c as any).labels?.['com.docker.compose.project'];

            return (
              <div key={c.id} onClick={() => !isSaturn && onToggle(c.id)} className={`group relative flex items-center justify-between p-3.5 rounded-xl border transition-all ${isSaturn ? 'bg-card/60 border-border/70 opacity-80 cursor-default' : isSelected ? 'bg-saturn-500/10 border-saturn-500/40 cursor-pointer' : 'bg-card border-border hover:bg-accent hover:border-border cursor-pointer'}`}>
                <div className="flex items-center space-x-3.5 min-w-0">
                  <input type="checkbox" checked={isSelected} disabled={isSaturn} onChange={() => {}} className="w-4 h-4 rounded border-border bg-background text-saturn-600 focus:ring-saturn-500 disabled:opacity-40 cursor-pointer" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-primary truncate">{cleanName}</span>
                      {hasUpdate && !isSaturn && <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-400">{t('containers.update_available')}</span>}
                      {isSaturn && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/25"><Sparkles className="w-2.5 h-2.5" />{t('batch_update_modal.update_via_saturn_menu', 'Atualize pelo menu do Saturn')}</span>}
                      {stackName && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-accent text-slate-700 dark:text-zinc-300 border border-border font-medium"><Layers className="w-2.5 h-2.5" />{stackName}</span>}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-secondary font-mono truncate mt-0.5">{c.image}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3 shrink-0">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${c.state === 'running' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-accent text-slate-700 dark:text-zinc-300'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${c.state === 'running' ? 'bg-emerald-500 animate-pulse' : 'bg-secondary'}`} />
                    {c.state === 'running' ? t('batch_update_modal.running') : t('batch_update_modal.stopped')}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-border">
        <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-secondary hover:text-primary hover:bg-accent rounded-xl transition-colors">
          {t('batch_update_modal.cancel')}
        </button>
        <button onClick={onStart} disabled={selectedIds.length === 0} className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-saturn-600 hover:bg-saturn-500 rounded-xl transition-all shadow-lg shadow-saturn-600/20 disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]">
          <ArrowUpCircle className="w-4 h-4" />
          {t('batch_update_modal.start_update', { count: selectedIds.length })}
        </button>
      </div>
    </div>
  );
}

export function ExecutionPhase({
  taskStatuses, logs, isUpdating, failedCount, successCount, cancelledCount,
  completedTasks, totalTasks, progressPercent, showLogs, copiedLogs, expandedErrors,
  onToggleShowLogs, onCopyLogs, onToggleError, onCancelContainer,
  onCancelAll, onMinimize, onRetryFailed, onClose,
}: ExecutionPhaseProps) {
  const { t } = useTranslation();
  const logsEndRef = useRef<HTMLDivElement>(null);

  return (
    <div className="space-y-5">
      {/* Progress Bar */}
      <div className="p-4 rounded-xl bg-accent/60 border border-border space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            {isUpdating ? <RefreshCw className="w-5 h-5 text-saturn-500 animate-spin" /> : failedCount > 0 ? <AlertCircle className="w-5 h-5 text-amber-500" /> : <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
            <span className="text-sm font-semibold text-primary">{isUpdating ? t('batch_update_modal.updating_title') : t('batch_update_modal.summary_title')}</span>
          </div>
          <span className="text-xs font-mono text-slate-700 dark:text-secondary font-medium">{completedTasks} / {totalTasks} ({progressPercent}%)</span>
        </div>
        <div className="w-full h-2.5 bg-background rounded-full overflow-hidden border border-border/50">
          <div className="h-full bg-saturn-500 transition-all duration-500 rounded-full" style={{ width: `${progressPercent}%` }} />
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs font-medium pt-1">
          <span className="text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 font-semibold"><CheckCircle2 className="w-3.5 h-3.5" />{successCount} {t('batch_update_modal.status_success')}</span>
          {failedCount > 0 && <span className="text-rose-700 dark:text-rose-400 flex items-center gap-1.5 font-semibold"><AlertCircle className="w-3.5 h-3.5" />{failedCount} {t('batch_update_modal.status_error')}</span>}
          {cancelledCount > 0 && <span className="text-amber-700 dark:text-amber-400 flex items-center gap-1.5 font-semibold"><Ban className="w-3.5 h-3.5" />{cancelledCount} {t('batch_update_modal.status_cancelled')}</span>}
          {isUpdating && <span className="text-saturn-700 dark:text-saturn-400 flex items-center gap-1.5 font-semibold"><DownloadCloud className="w-3.5 h-3.5 animate-pulse" />{totalTasks - completedTasks} {t('batch_update_modal.status_pending')}</span>}
        </div>
      </div>

      {/* Task List */}
      <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
        {Object.values(taskStatuses).map(task => {
          const isExpanded = expandedErrors[task.id];
          const stateStyles: Record<string, string> = {
            error: 'bg-rose-500/10 dark:bg-rose-500/15 border-rose-500/30',
            success: 'bg-emerald-500/10 dark:bg-emerald-500/15 border-emerald-500/30',
            cancelled: 'bg-amber-500/10 dark:bg-amber-500/15 border-amber-500/30',
            pulling: 'bg-saturn-500/10 border-saturn-500/40 ring-1 ring-saturn-500/20',
            recreating: 'bg-saturn-500/10 border-saturn-500/40 ring-1 ring-saturn-500/20',
          };
          return (
            <div key={task.id} className={`p-3.5 rounded-xl border transition-colors ${stateStyles[task.state] || 'bg-card border-border'}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center space-x-3 min-w-0">
                  {task.state === 'pending' && <Clock className="w-4 h-4 text-secondary shrink-0" />}
                  {task.state === 'pulling' && <DownloadCloud className="w-4 h-4 text-saturn-500 animate-bounce shrink-0" />}
                  {task.state === 'recreating' && <RefreshCw className="w-4 h-4 text-saturn-500 animate-spin shrink-0" />}
                  {task.state === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                  {task.state === 'error' && <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />}
                  {task.state === 'cancelled' && <Ban className="w-4 h-4 text-amber-500 shrink-0" />}
                  <div className="min-w-0">
                    <span className="text-sm font-semibold text-primary truncate block">{task.name}</span>
                    <span className="text-xs text-slate-600 dark:text-secondary font-mono truncate block">{task.image}</span>
                  </div>
                </div>
                <div className="flex items-center space-x-2 shrink-0">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${task.state === 'success' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : task.state === 'error' ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400' : task.state === 'cancelled' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : 'bg-saturn-500/15 text-saturn-700 dark:text-saturn-400'}`}>
                    {t(`batch_update_modal.status_${task.state}`)}
                  </span>
                  {task.state === 'error' && <button onClick={() => onToggleError(task.id)} className="p-1 rounded text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 transition-colors">{isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</button>}
                  {isUpdating && (task.state === 'pending' || task.state === 'pulling' || task.state === 'recreating') && <button onClick={() => onCancelContainer(task.id)} className="p-1 rounded text-slate-700 dark:text-secondary hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/15 transition-colors"><XCircle className="w-4 h-4" /></button>}
                </div>
              </div>
              {task.state === 'error' && isExpanded && (
                <div className="mt-3 p-3 bg-rose-500/10 dark:bg-rose-500/20 border border-rose-500/30 rounded-lg text-xs font-mono space-y-1.5">
                  <div className="font-semibold text-rose-700 dark:text-rose-300">{task.error}</div>
                  {task.details && task.details !== task.error && <div className="text-rose-900/90 dark:text-rose-200/90 whitespace-pre-wrap break-all leading-relaxed">{task.details}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Console Log */}
      <div className="rounded-xl border border-zinc-800 dark:border-border bg-zinc-950 dark:bg-black/90 text-zinc-100 overflow-hidden shadow-inner">
        <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/95 border-b border-zinc-800 text-zinc-300">
          <div className="flex items-center space-x-2 text-xs font-medium"><Terminal className="w-3.5 h-3.5 text-saturn-400" /><span>{t('batch_update_modal.operation_logs')}</span></div>
          <div className="flex items-center space-x-2">
            <button onClick={onCopyLogs} className="p-1 text-zinc-400 hover:text-zinc-100 rounded hover:bg-zinc-800 transition-colors">{copiedLogs ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}</button>
            <button onClick={onToggleShowLogs} className="text-xs text-zinc-400 hover:text-zinc-100 flex items-center gap-1">
              {showLogs ? t('batch_update_modal.hide_logs') : t('batch_update_modal.show_logs')}
              {showLogs ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
        </div>
        {showLogs && (
          <div className="p-3.5 max-h-44 overflow-y-auto font-mono text-xs space-y-1 bg-zinc-950 text-zinc-200">
            {logs.map((log, i) => {
              const isError = log.includes('ERRO') || log.includes('ERROR');
              const isSuccess = log.includes('sucesso') || log.includes('success');
              const isStep = log.includes('Iniciando') || log.includes('download') || log.includes('recriando');
              return (
                <div key={i} className={`leading-relaxed whitespace-pre-wrap break-all ${isError ? 'text-rose-400 font-semibold' : isSuccess ? 'text-emerald-400 font-semibold' : isStep ? 'text-sky-300' : 'text-zinc-300'}`}>
                  {log}
                </div>
              );
            })}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <div className="flex items-center space-x-2">
          {failedCount > 0 && !isUpdating && <button onClick={onRetryFailed} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-amber-700 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-xl transition-colors"><RotateCcw className="w-4 h-4" />{t('batch_update_modal.retry_failed')} ({failedCount})</button>}
          {isUpdating && (
            <>
              <button onClick={onCancelAll} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-rose-700 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-xl transition-colors"><StopCircle className="w-4 h-4" />{t('batch_update_modal.cancel_all')}</button>
              <button onClick={onMinimize} className="px-4 py-2 text-sm font-semibold text-saturn-700 dark:text-saturn-300 hover:bg-saturn-500/10 rounded-xl transition-colors border border-saturn-500/20">{t('batch_update_modal.continue_in_background', 'Continuar em Segundo Plano')}</button>
            </>
          )}
        </div>
        <button onClick={onClose} disabled={isUpdating} className="px-5 py-2.5 text-sm font-semibold text-primary bg-accent hover:bg-accent/80 rounded-xl transition-colors disabled:opacity-40">{t('batch_update_modal.close')}</button>
      </div>
    </div>
  );
}
