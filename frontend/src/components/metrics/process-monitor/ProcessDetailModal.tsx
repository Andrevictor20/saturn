import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Terminal, X, Box, Monitor, Trash2 } from 'lucide-react';
import { formatRAM, formatBytes } from '../../../utils/format';
import type { ProcessInfo } from '../ProcessMonitor';

interface ProcessDetailModalProps {
  selectedProcess: ProcessInfo | null;
  onClose: () => void;
  onInitiateKill: (process: ProcessInfo) => void;
}

export function ProcessDetailModal({
  selectedProcess,
  onClose,
  onInitiateKill,
}: ProcessDetailModalProps) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!selectedProcess) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedProcess, onClose]);

  if (!selectedProcess) return null;

  const modalContent = (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div 
        className="bg-card border border-border rounded-2xl p-5 sm:p-6 w-full max-w-xl shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-border pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-saturn-500/10 text-saturn-400">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-primary font-mono">{selectedProcess.name}</h3>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-secondary font-mono">
                <span>PID: {selectedProcess.pid}</span>
                {selectedProcess.ppid && <span>(PPID: {selectedProcess.ppid})</span>}
                <span>•</span>
                <span>{t('metrics.user', 'Usuário')}: {selectedProcess.user || 'root'}</span>
              </div>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-lg text-secondary hover:text-primary hover:bg-accent transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Origin & Status Badge */}
        <div className="grid grid-cols-2 gap-3 bg-background p-3 rounded-xl border border-border/60 text-xs">
          <div>
            <span className="text-secondary block mb-1">{t('metrics.process_origin', 'Origem do Processo')}</span>
            {selectedProcess.container_name ? (
              <div className="flex items-center gap-1.5 font-semibold text-saturn-600 dark:text-saturn-400">
                <Box className="w-4 h-4" />
                <span>Container: {selectedProcess.container_name}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-zinc-300">
                <Monitor className="w-4 h-4" />
                <span>Host</span>
              </div>
            )}
          </div>
          <div>
            <span className="text-secondary block mb-1">{t('metrics.task_status', 'Status da Tarefa')}</span>
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">{selectedProcess.status}</span>
          </div>
        </div>

        {/* Metrics Breakdown */}
        <div className="grid grid-cols-3 gap-2.5 text-center">
          <div className="bg-background/80 p-3 rounded-xl border border-border/50">
            <span className="text-[10px] uppercase font-bold text-purple-700 dark:text-purple-400 block mb-1">{t('metrics.normalized_cpu', 'CPU Normalizada')}</span>
            <span className="text-base font-bold text-primary font-mono">{(selectedProcess.cpu_usage ?? 0).toFixed(1)}%</span>
          </div>
          <div className="bg-background/80 p-3 rounded-xl border border-border/50">
            <span className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400 block mb-1">{t('metrics.real_memory', 'Memória Real (RSS)')}</span>
            <span className="text-base font-bold text-primary font-mono">{formatRAM(selectedProcess.memory_rss ?? 0)}</span>
          </div>
          <div className="bg-background/80 p-3 rounded-xl border border-border/50">
            <span className="text-[10px] uppercase font-bold text-saturn-700 dark:text-saturn-400 block mb-1">{t('metrics.percent_ram', '% da RAM Total')}</span>
            <span className="text-base font-bold text-primary font-mono">{(selectedProcess.memory_percent ?? 0).toFixed(2)}%</span>
          </div>
        </div>

        {/* Command Line & Executable Path */}
        <div className="space-y-3 pt-1">
          <div>
            <span className="text-xs font-semibold text-secondary block mb-1">{t('metrics.executable_path', 'Executável (Path):')}</span>
            <div className="bg-background p-2.5 rounded-lg border border-border font-mono text-xs text-primary break-all">
              {selectedProcess.exe || selectedProcess.name}
            </div>
          </div>

          <div>
            <span className="text-xs font-semibold text-secondary block mb-1">{t('metrics.full_command', 'Linha de Comando Completa (Arguments):')}</span>
            <div className="bg-background p-2.5 rounded-lg border border-border font-mono text-xs text-primary max-h-32 overflow-y-auto break-all select-all">
              {Array.isArray(selectedProcess.cmd) && selectedProcess.cmd.length > 0 ? selectedProcess.cmd.join(' ') : selectedProcess.exe || selectedProcess.name}
            </div>
          </div>

          {/* Disk I/O */}
          <div className="flex items-center justify-between text-xs text-secondary bg-background p-2.5 rounded-lg border border-border font-mono">
            <span>{t('metrics.disk_read', 'Leitura em Disco:')} <strong className="text-primary">{formatBytes(selectedProcess.disk_read_bytes ?? 0)}</strong></span>
            <span>{t('metrics.disk_write', 'Escrita em Disco:')} <strong className="text-primary">{formatBytes(selectedProcess.disk_written_bytes ?? 0)}</strong></span>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <button
            onClick={() => {
              onInitiateKill(selectedProcess);
              onClose();
            }}
            className="px-4 py-2 bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            {t('metrics.kill_process', 'Finalizar Processo...')}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-accent hover:bg-accent/80 text-secondary hover:text-primary rounded-xl text-xs sm:text-sm font-medium transition-colors"
          >
            {t('common.close', 'Fechar')}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
}
