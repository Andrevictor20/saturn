import { useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X, RefreshCw, CheckCircle2, Download, Minimize2, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { SaturnLogo } from '../ui/SaturnLogo';
import { isNewerVersion } from '../../utils/version';
import { parseReleaseNotes } from './releaseNotesParser';
import { UpdateProgressView, type UpdateTaskState } from './UpdateProgressView';
import { UpdateReleaseNotesView } from './UpdateReleaseNotesView';
import { useSystemUpdate } from '../../contexts/SystemUpdateContext';
import { useConfirm } from '../../contexts/ConfirmContext';

export interface SystemUpdateInfo {
  current_version: string;
  latest_version: string;
  has_update: boolean;
  platform: string;
  arch: string;
  release_name: string;
  release_notes: string;
  published_at?: string | null;
  ci_status?: 'building' | 'ready' | 'failed' | null;
  ci_workflow_url?: string | null;
}

interface UpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  updateInfo: SystemUpdateInfo | null;
  onRefreshInfo: () => void;
}

export function UpdateModal({ isOpen, onClose, updateInfo, onRefreshInfo }: UpdateModalProps) {
  const { t } = useTranslation();
  const {
    isUpdating,
    status,
    progress,
    currentStep,
    logs,
    error,
    reconnectAttempts,
    startUpdate,
    minimize,
    dismissSuccess
  } = useSystemUpdate();
  const { confirm } = useConfirm();

  const terminalEndRef = useRef<HTMLDivElement>(null);

  const isProgressMode = isUpdating || status === 'recreating' || status === 'done' || (status === 'error' && logs.length > 0);

  const taskState: UpdateTaskState = {
    status,
    progress,
    current_step: currentStep,
    logs,
    error,
  };

  const hasNewVersion = Boolean(
    updateInfo?.has_update &&
    updateInfo?.latest_version &&
    updateInfo?.current_version &&
    isNewerVersion(updateInfo.latest_version, updateInfo.current_version)
  );

  // Auto-scroll terminal on new logs
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [logs]);

  // Auto-poll update info when image is still being built in GitHub Actions
  useEffect(() => {
    if (!isOpen || isProgressMode || updateInfo?.ci_status !== 'building') return;

    const interval = setInterval(() => {
      onRefreshInfo();
    }, 7000);

    return () => clearInterval(interval);
  }, [isOpen, isProgressMode, updateInfo?.ci_status, onRefreshInfo]);

  const parsedSections = useMemo(
    () => parseReleaseNotes(updateInfo?.release_notes || '', t),
    [updateInfo?.release_notes, t]
  );

  const handleStartUpdate = async () => {
    if (updateInfo?.ci_status === 'building') {
      toast.error(t('system.image_building_wait', 'A imagem ainda está sendo compilada no GitHub Actions. Aguarde.'));
      return;
    }

    const targetVer = updateInfo?.latest_version || '';
    const displayVer = targetVer.startsWith('v') ? targetVer : `v${targetVer}`;
    const confirmed = await confirm({
      title: t('system.update_modal_title', 'Atualização do Saturn'),
      message: t('system.confirm_update_version', {
        version: displayVer,
        defaultValue: `Deseja iniciar a atualização do Saturn para ${displayVer}? O painel reiniciará em instantes.`
      }),
      confirmText: t('system.start_update', 'Iniciar Atualização'),
      isDestructive: false,
    });

    if (!confirmed) {
      return;
    }

    await startUpdate(updateInfo?.latest_version);
  };

  const handleClose = () => {
    if (isUpdating && status !== 'done' && status !== 'error') {
      minimize();
      onClose();
      toast(t('system.update_minimized_toast', 'Atualização continuando em segundo plano...'), {
        icon: '🔄',
        duration: 4000
      });
    } else {
      if (status === 'done' || status === 'error') {
        dismissSuccess();
      }
      onClose();
    }
  };

  const formatPlatformName = (platform: string, arch: string) => {
    if (platform.includes('arm64') || arch === 'aarch64') return 'ARM64 (Raspberry Pi / ARM)';
    if (platform.includes('arm')) return 'ARMv7 (Raspberry Pi 32-bit)';
    if (platform.includes('amd64') || arch === 'x86_64') return 'x86_64 / AMD64 (PC & Server)';
    return `${platform} (${arch})`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-card/90 backdrop-blur-3xl saturate-[190%] border border-border/80 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-250 transition-all">
        
        {/* Top Header Card */}
        <div className="px-5 py-4 border-b border-border/80 flex items-center justify-between bg-card">
          <div className="flex items-center gap-3">
            <SaturnLogo size={36} className="rounded-xl shadow-md shadow-saturn-500/10" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-primary leading-tight">
                  {isProgressMode ? t('system.updating_saturn', 'Atualizando Saturn') : t('system.update_title', 'Atualização do Sistema')}
                </h2>
                {!isProgressMode && updateInfo?.ci_status === 'building' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                    <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                    <span>{t('system.building_image', 'Compilando Imagem')}</span>
                  </span>
                )}
                {!isProgressMode && hasNewVersion && updateInfo?.ci_status !== 'building' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    {t('system.new_version_available', 'Nova Versão Disponível')}
                  </span>
                )}
                {isProgressMode && status !== 'done' && status !== 'error' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-saturn-500/20 text-saturn-400 border border-saturn-500/30 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-saturn-400 animate-ping" />
                    <span>Segundo Plano</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-secondary mt-0.5">
                {isProgressMode 
                  ? (taskState.current_step || t('system.downloading_and_restarting', 'Processando download em segundo plano...'))
                  : t('system.version_management_desc', 'Gerenciamento de versão e resumo das melhorias')
                }
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {isProgressMode && status !== 'done' && status !== 'error' && (
              <button
                onClick={() => {
                  minimize();
                  onClose();
                  toast(t('system.update_minimized_toast', 'Atualização continuando em segundo plano...'), {
                    icon: '🔄',
                    duration: 4000
                  });
                }}
                className="p-1.5 text-secondary hover:text-primary rounded-xl hover:bg-accent transition-colors"
                title="Minimizar para segundo plano"
                aria-label="Minimizar"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={handleClose}
              className="p-1.5 text-slate-700 dark:text-secondary hover:text-primary rounded-xl hover:bg-accent transition-colors"
              aria-label={t('common.close', 'Fechar')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-hidden flex flex-col bg-background/40">
          {!isProgressMode ? (
            <UpdateReleaseNotesView
              updateInfo={updateInfo}
              hasNewVersion={hasNewVersion}
              onRefreshInfo={onRefreshInfo}
              formatPlatformName={formatPlatformName}
              parsedSections={parsedSections}
            />
          ) : (
            <UpdateProgressView
              taskState={taskState}
              reconnectAttempts={reconnectAttempts}
              terminalEndRef={terminalEndRef}
              onMinimize={() => {
                minimize();
                onClose();
                toast(t('system.update_minimized_toast', 'Atualização continuando em segundo plano...'), {
                  icon: '🔄',
                  duration: 4000
                });
              }}
            />
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 px-5 border-t border-border/80 bg-card flex items-center justify-between gap-3">
          <button
            onClick={handleClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-secondary hover:text-primary hover:bg-accent transition-colors"
          >
            {isProgressMode && status !== 'done' && status !== 'error' ? t('system.minimize', 'Minimizar') : t('common.close', 'Fechar')}
          </button>

          {!isProgressMode ? (
            updateInfo?.ci_status === 'building' ? (
              <button
                disabled
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs font-semibold cursor-not-allowed opacity-80"
                title={t('system.building_image_tooltip', 'A imagem Docker multi-arch está sendo gerada no GitHub. O botão será liberado automaticamente.')}
              >
                <RefreshCw className="w-4 h-4 animate-spin text-amber-500" />
                <span>{t('system.building_image_github', 'Compilando Imagem no GitHub...')}</span>
              </button>
            ) : !hasNewVersion ? (
              <button
                disabled
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-card border border-border/80 text-slate-700 dark:text-secondary text-xs font-semibold cursor-default opacity-80"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>{t('system.system_up_to_date', 'Sistema na Versão Mais Recente')}</span>
              </button>
            ) : (
              <button
                onClick={handleStartUpdate}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-saturn-500 hover:bg-saturn-600 active:scale-95 text-white text-xs font-semibold shadow-md shadow-saturn-500/25 transition-all"
              >
                <Download className="w-4 h-4" />
                <span>{t('system.update_to_version', { version: updateInfo?.latest_version, defaultValue: `Atualizar para v${updateInfo?.latest_version}` })}</span>
              </button>
            )
          ) : status === 'done' ? (
            <button
              onClick={() => {
                window.location.reload();
              }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white text-xs font-semibold shadow-md shadow-emerald-500/25 transition-all"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{t('system.reload_to_apply', 'Recarregar Painel')}</span>
            </button>
          ) : null}
        </div>

      </div>
    </div>
  );
}

export default UpdateModal;
