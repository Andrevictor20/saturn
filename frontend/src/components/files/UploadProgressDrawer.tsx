import { 
  Upload, 
  X, 
  ChevronDown, 
  ChevronUp, 
  Pause, 
  Play, 
  CheckCircle2, 
  AlertCircle,
  Trash2,
  FileText,
  HardDrive
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUploadManager } from '../../contexts/UploadManagerContext';
import { formatBytes } from '../../utils/format';

// Formata segundos em uma string legível de tempo restante (ex: "2m 30s", "45s", "1h 10m").
function formatEta(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function UploadProgressDrawer() {
  const { t } = useTranslation();
  const {
    uploads,
    isDrawerOpen,
    setIsDrawerOpen,
    isMinimized,
    setIsMinimized,
    pauseUpload,
    resumeUpload,
    cancelUpload,
    clearCompleted,
  } = useUploadManager();

  if (uploads.length === 0 || !isDrawerOpen) {
    return null;
  }

  const activeUploads = uploads.filter((u) => u.status === 'uploading');
  const completedUploads = uploads.filter((u) => u.status === 'completed');
  const totalSpeed = activeUploads.reduce((acc, curr) => acc + curr.speedMBs, 0);

  // Calculate overall progress across all items
  const totalBytes = uploads.reduce((acc, curr) => acc + curr.fileSize, 0);
  const uploadedBytes = uploads.reduce((acc, curr) => {
    return acc + (curr.fileSize * (curr.progress / 100));
  }, 0);
  const overallProgress = totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0;

  // Minimized floating pill
  if (isMinimized) {
    return (
      <div className="fixed bottom-5 right-5 z-50 animate-fade-in">
        <button
          onClick={() => setIsMinimized(false)}
          className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-card/95 backdrop-blur-xl border border-border/80 hover:border-saturn-500/50 shadow-2xl text-xs font-semibold text-primary transition-all duration-150 hover:-translate-y-0.5"
        >
          <div className="p-1 rounded-lg bg-saturn-500/15 text-saturn-500">
            <Upload className="w-4 h-4 animate-bounce" />
          </div>
          <span>
            {activeUploads.length > 0
              ? t('files.upload_sending', { count: activeUploads.length, progress: overallProgress, defaultValue: `${activeUploads.length} enviando (${overallProgress}%)` })
              : t('files.upload_completed_single', { count: completedUploads.length, defaultValue: `${completedUploads.length} concluído(s)` })}
          </span>
          {totalSpeed > 0 && (
            <>
              <span className="text-[11px] font-mono text-secondary">
                • {totalSpeed.toFixed(1)} MB/s
              </span>
              {totalBytes > 0 && uploadedBytes < totalBytes && (
                <span className="text-[11px] font-mono text-secondary ml-1">
                  • ~{formatEta((totalBytes - uploadedBytes) / (totalSpeed * 1024 * 1024))} restante
                </span>
              )}
            </>
          )}
          <ChevronUp className="w-4 h-4 text-secondary ml-1" />
        </button>
      </div>
    );
  }

  // Expanded floating drawer
  return (
    <div className="fixed bottom-5 right-5 z-50 w-80 sm:w-96 max-w-[calc(100vw-2.5rem)] animate-slide-up">
      <div className="bg-card/95 backdrop-blur-xl border border-border/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[28rem]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/80 bg-accent/30">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-saturn-500/15 text-saturn-500">
              <Upload className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-primary">{t('files.upload_drawer_title', 'Envio de Arquivos')}</h4>
              <p className="text-[10px] text-secondary font-mono">
                {t('files.upload_completed_count', { completed: completedUploads.length, total: uploads.length, defaultValue: `${completedUploads.length}/${uploads.length} concluído(s)` })}
                {totalSpeed > 0 && ` • ${totalSpeed.toFixed(1)} MB/s`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsMinimized(true)}
              className="p-1.5 text-secondary hover:text-primary rounded-lg hover:bg-accent transition-colors"
              title={t('files.minimize', 'Minimizar')}
            >
              <ChevronDown className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsDrawerOpen(false)}
              className="p-1.5 text-secondary hover:text-primary rounded-lg hover:bg-accent transition-colors"
              title={t('common.close', 'Fechar')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Global Progress Bar */}
        <div className="w-full h-1 bg-muted overflow-hidden">
          <div
            className="h-full bg-saturn-500 transition-all duration-200"
            style={{ width: `${overallProgress}%` }}
          />
        </div>

        {/* Upload List */}
        <div className="p-3 space-y-2.5 overflow-y-auto custom-scrollbar flex-1">
          {uploads.map((item) => {
            const isUploading = item.status === 'uploading';
            const isCompleted = item.status === 'completed';
            const isPaused = item.status === 'paused';
            const isError = item.status === 'error';

            return (
              <div
                key={item.id}
                className="bg-accent/40 border border-border/70 rounded-xl p-2.5 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-col">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-saturn-500 shrink-0" />
                      <span className="font-semibold text-primary truncate max-w-[140px] sm:max-w-[180px]" title={item.fileName}>
                        {item.fileName}
                      </span>
                    </div>
                    {item.destinationPath && (
                      <div className="flex items-center gap-1 min-w-0">
                        <HardDrive className="w-3 h-3 text-secondary shrink-0" />
                        <span className="text-[10px] text-secondary truncate max-w-[200px]" title={item.destinationPath}>
                          {item.destinationPath}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {isUploading && (
                      <button
                        onClick={() => pauseUpload(item.id)}
                        className="p-1 rounded text-secondary hover:text-amber-500 hover:bg-accent transition-colors"
                        title={t('files.pause_upload', 'Pausar envio')}
                      >
                        <Pause className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {isPaused && (
                      <button
                        onClick={() => resumeUpload(item.id)}
                        className="p-1 rounded text-secondary hover:text-emerald-500 hover:bg-accent transition-colors"
                        title={t('files.resume_upload', 'Retomar envio')}
                      >
                        <Play className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => cancelUpload(item.id)}
                      className="p-1 rounded text-secondary hover:text-rose-500 hover:bg-accent transition-colors"
                      title={t('files.cancel_upload', 'Cancelar ou remover')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Progress bar per item */}
                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-150 ${
                      isCompleted 
                        ? 'bg-emerald-500' 
                        : isError 
                        ? 'bg-rose-500' 
                        : isPaused 
                        ? 'bg-amber-500' 
                        : 'bg-saturn-500'
                    }`}
                    style={{ width: `${item.progress}%` }}
                  />
                </div>

                {/* Status subtext */}
                <div className="flex items-center justify-between text-[11px] font-mono text-secondary">
                  <div className="flex items-center gap-1">
                    {isCompleted ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> {t('files.upload_completed', 'Concluído')}
                      </span>
                    ) : isError ? (
                      <span className="text-rose-500 flex items-center gap-1" title={item.error}>
                        <AlertCircle className="w-3 h-3" /> {t('files.upload_error', 'Erro')}
                      </span>
                    ) : isPaused ? (
                      <span className="text-amber-600 dark:text-amber-400">{t('files.upload_paused', 'Pausado')}</span>
                    ) : (
                      <span className="text-saturn-600 dark:text-saturn-400">
                        {item.progress}%
                        {item.speedMBs > 0 && `• ${item.speedMBs} MB/s`}
                        {item.etaSeconds !== undefined && ` • ${formatEta(item.etaSeconds)} restante`}
                      </span>
                    )}
                  </div>
                  <span>{formatBytes(item.fileSize)}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        {completedUploads.length > 0 && (
          <div className="px-4 py-2 border-t border-border/80 bg-accent/20 flex justify-end">
            <button
              onClick={clearCompleted}
              className="text-[11px] text-secondary hover:text-primary transition-colors font-medium"
            >
              {t('files.clear_completed', 'Limpar concluídos')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
