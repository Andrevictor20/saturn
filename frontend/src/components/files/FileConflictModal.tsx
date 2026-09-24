import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { 
  AlertTriangle, 
  RotateCcw, 
  Copy, 
  Flame, 
  X, 
  Columns, 
  Server,
  UserCheck
} from 'lucide-react';

export interface FileConflictModalProps {
  fileName: string;
  serverContent: string;
  localContent: string;
  onReload: () => void;
  onOverwrite: () => void;
  onSaveCopy: () => void;
  onClose: () => void;
}

export function FileConflictModal({
  fileName,
  serverContent,
  localContent,
  onReload,
  onOverwrite,
  onSaveCopy,
  onClose,
}: FileConflictModalProps) {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<'split' | 'server' | 'local'>('split');

  return typeof document !== 'undefined' ? createPortal(
    <div 
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-6 animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="conflict-modal-title"
    >
      <div 
        className="relative w-full max-w-5xl bg-card border border-amber-500/30 rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-amber-500/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 id="conflict-modal-title" className="text-base font-bold text-foreground flex items-center gap-2">
                <span>{t('files.conflict_title', 'Conflito de Versão Detectado')}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono border border-amber-500/30">
                  {fileName}
                </span>
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('files.conflict_description', 'Este arquivo foi modificado no disco por outro usuário ou processo enquanto você o editava. Escolha como deseja resolver o conflito para não perder dados.')}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            title={t('common.close', 'Fechar')}
            aria-label={t('common.close', 'Fechar')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* View Mode Bar */}
        <div className="flex items-center justify-between px-5 py-2.5 bg-muted/40 border-b border-border text-xs">
          <span className="text-muted-foreground font-medium">
            {t('files.conflict_compare', 'Comparação de Conteúdo:')}
          </span>
          <div className="flex items-center gap-1 bg-card/60 p-1 rounded-xl border border-border">
            <button
              onClick={() => setViewMode('split')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all font-medium ${
                viewMode === 'split'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Columns className="w-3.5 h-3.5" />
              <span>{t('files.conflict_split', 'Lado a Lado')}</span>
            </button>
            <button
              onClick={() => setViewMode('server')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all font-medium ${
                viewMode === 'server'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Server className="w-3.5 h-3.5" />
              <span>{t('files.conflict_server_only', 'Apenas Servidor')}</span>
            </button>
            <button
              onClick={() => setViewMode('local')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all font-medium ${
                viewMode === 'local'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>{t('files.conflict_local_only', 'Suas Alterações')}</span>
            </button>
          </div>
        </div>

        {/* Content Comparison Body */}
        <div className="flex-1 overflow-hidden p-4 bg-zinc-950/40">
          {viewMode === 'split' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 h-full max-h-[50vh]">
              {/* Server Version Column */}
              <div className="flex flex-col border border-border rounded-xl bg-card/40 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-muted/60 border-b border-border text-xs font-medium text-amber-300">
                  <span className="flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5" />
                    {t('files.conflict_server_version', 'Versão Salva no Servidor (Disco)')}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {serverContent.length} {t('files.chars', 'caracteres')}
                  </span>
                </div>
                <pre className="p-3 text-xs font-mono text-zinc-300 overflow-auto flex-1 whitespace-pre leading-relaxed selection:bg-amber-500/30">
                  <code>{serverContent}</code>
                </pre>
              </div>

              {/* Local Version Column */}
              <div className="flex flex-col border border-border rounded-xl bg-card/40 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-muted/60 border-b border-border text-xs font-medium text-saturn-300">
                  <span className="flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5" />
                    {t('files.conflict_local_version', 'Suas Alterações (No Editor)')}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {localContent.length} {t('files.chars', 'caracteres')}
                  </span>
                </div>
                <pre className="p-3 text-xs font-mono text-zinc-300 overflow-auto flex-1 whitespace-pre leading-relaxed selection:bg-saturn-500/30">
                  <code>{localContent}</code>
                </pre>
              </div>
            </div>
          ) : viewMode === 'server' ? (
            <div className="flex flex-col border border-border rounded-xl bg-card/40 overflow-hidden h-full max-h-[50vh]">
              <div className="flex items-center justify-between px-3 py-2 bg-muted/60 border-b border-border text-xs font-medium text-amber-300">
                <span className="flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5" />
                  {t('files.conflict_server_version', 'Versão Salva no Servidor (Disco)')}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {serverContent.length} {t('files.chars', 'caracteres')}
                </span>
              </div>
              <pre className="p-3 text-xs font-mono text-zinc-300 overflow-auto flex-1 whitespace-pre leading-relaxed">
                <code>{serverContent}</code>
              </pre>
            </div>
          ) : (
            <div className="flex flex-col border border-border rounded-xl bg-card/40 overflow-hidden h-full max-h-[50vh]">
              <div className="flex items-center justify-between px-3 py-2 bg-muted/60 border-b border-border text-xs font-medium text-saturn-300">
                <span className="flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5" />
                  {t('files.conflict_local_version', 'Suas Alterações (No Editor)')}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {localContent.length} {t('files.chars', 'caracteres')}
                </span>
              </div>
              <pre className="p-3 text-xs font-mono text-zinc-300 overflow-auto flex-1 whitespace-pre leading-relaxed">
                <code>{localContent}</code>
              </pre>
            </div>
          )}
        </div>

        {/* Action Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-t border-border bg-card/80">
          <button
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          >
            {t('common.keep_editing', 'Continuar Editando')}
          </button>

          <div className="flex flex-wrap items-center gap-2">
            {/* Save as copy */}
            <button
              onClick={onSaveCopy}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium bg-muted hover:bg-muted/80 text-foreground border border-border transition-all active:scale-95"
            >
              <Copy className="w-4 h-4 text-saturn-400" />
              <span>{t('files.conflict_save_copy', 'Salvar como Cópia')}</span>
            </button>

            {/* Reload from disk */}
            <button
              onClick={onReload}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium bg-muted hover:bg-muted/80 text-foreground border border-border transition-all active:scale-95"
            >
              <RotateCcw className="w-4 h-4 text-blue-400" />
              <span>{t('files.conflict_reload', 'Recarregar do Disco')}</span>
            </button>

            {/* Force overwrite */}
            <button
              onClick={onOverwrite}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/20 transition-all active:scale-95"
            >
              <Flame className="w-4 h-4" />
              <span>{t('files.conflict_overwrite', 'Sobrescrever Servidor')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  ) : null;
}
