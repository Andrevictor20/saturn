import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ShieldAlert, RefreshCw } from 'lucide-react';
import type { ProcessInfo } from '../ProcessMonitor';

interface ProcessKillModalProps {
  killModalProcess: ProcessInfo | null;
  killSignal: 'SIGTERM' | 'SIGKILL';
  setKillSignal: (sig: 'SIGTERM' | 'SIGKILL') => void;
  killing: boolean;
  onClose: () => void;
  onConfirmKill: () => void;
}

export function ProcessKillModal({
  killModalProcess,
  killSignal,
  setKillSignal,
  killing,
  onClose,
  onConfirmKill,
}: ProcessKillModalProps) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!killModalProcess) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !killing) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [killModalProcess, killing, onClose]);

  if (!killModalProcess) return null;

  const modalContent = (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={!killing ? onClose : undefined}
      role="dialog"
      aria-modal="true"
    >
      <div 
        className="bg-card border border-border rounded-2xl p-5 sm:p-6 w-full max-w-md shadow-2xl space-y-4 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 text-rose-400">
          <div className="p-2.5 rounded-xl bg-rose-500/10">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-primary">{t('metrics.kill_process_title', 'Finalizar Processo?')}</h3>
            <p className="text-xs text-secondary">PID: {killModalProcess.pid} ({killModalProcess.name})</p>
          </div>
        </div>

        <p className="text-xs sm:text-sm text-secondary leading-relaxed">
          {t('metrics.kill_process_confirm', 'Tem certeza que deseja enviar um sinal de encerramento para o processo {{name}}?', { name: killModalProcess.name })}
        </p>

        {/* Signal Choice */}
        <div className="space-y-2 bg-background p-3 rounded-xl border border-border text-xs">
          <span className="font-semibold text-secondary block">{t('metrics.select_signal', 'Selecione o sinal:')}</span>
          <label className="flex items-center gap-2 cursor-pointer">
            <input 
              type="radio" 
              name="signal" 
              checked={killSignal === 'SIGTERM'} 
              onChange={() => setKillSignal('SIGTERM')} 
              className="accent-saturn-500"
            />
            <div>
              <span className="font-semibold text-primary">{t('metrics.sigterm_title', 'SIGTERM (Sinal 15 - Recomendado)')}</span>
              <p className="text-[11px] text-secondary">{t('metrics.sigterm_desc', 'Solicita encerramento gracioso do processo.')}</p>
            </div>
          </label>
          <label className="flex items-center gap-2 cursor-pointer mt-1">
            <input 
              type="radio" 
              name="signal" 
              checked={killSignal === 'SIGKILL'} 
              onChange={() => setKillSignal('SIGKILL')} 
              className="accent-rose-500"
            />
            <div>
              <span className="font-semibold text-rose-700 dark:text-rose-400">{t('metrics.sigkill_title', 'SIGKILL (Sinal 9 - Forçado)')}</span>
              <p className="text-[11px] text-secondary">{t('metrics.sigkill_desc', 'Mata o processo imediatamente sem cleanup.')}</p>
            </div>
          </label>
        </div>

        <div className="flex justify-end gap-2.5 pt-2">
          <button
            onClick={onClose}
            disabled={killing}
            className="px-4 py-2 rounded-xl text-secondary hover:text-primary hover:bg-accent transition-colors text-xs sm:text-sm font-medium"
          >
            {t('common.cancel', 'Cancelar')}
          </button>
          <button
            onClick={onConfirmKill}
            disabled={killing}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-md shadow-rose-900/20 flex items-center gap-1.5"
          >
            {killing && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            {killing ? t('metrics.killing', 'Finalizando...') : t('metrics.confirm_kill', 'Confirmar Encerramento')}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
}
