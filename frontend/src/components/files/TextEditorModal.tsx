import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { 
  Save, 
  X, 
  FileText, 
  Check, 
  AlertCircle, 
  Loader2, 
  Maximize, 
  Minimize, 
  Eye, 
  Code, 
  Columns, 
  Copy, 
  Sparkles,
  Globe 
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useConfirm } from '../../contexts/ConfirmContext';
import type { FileItem } from './AudioPlayerModal';

interface TextEditorModalProps {
  file: FileItem;
  onClose: () => void;
  onSaved?: () => void;
}

// Simple & clean Markdown to HTML parser for rich preview
function renderMarkdownToHtml(md: string): string {
  if (!md) return '';

  let html = md
    // Escape basic HTML to avoid injection, unless already in tags
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks with syntax badge
  html = html.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_match, lang, code) => {
    const cleanLang = (lang || 'code').replace(/[^a-zA-Z0-9_-]/g, '');
    return `<div class="my-4 rounded-xl border border-zinc-800 bg-zinc-950/80 overflow-hidden shadow-md">
      <div class="flex items-center justify-between px-3 py-1.5 bg-zinc-900/90 border-b border-zinc-800 text-[11px] font-mono text-zinc-400">
        <span>${cleanLang}</span>
      </div>
      <pre class="p-4 text-xs font-mono text-emerald-300 overflow-x-auto"><code>${code.trim()}</code></pre>
    </div>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-zinc-800 text-saturn-400 font-mono text-[12px] border border-zinc-700/50">$1</code>');

  // Headings
  html = html.replace(/^### (.*$)/gim, '<h3 class="text-base font-bold text-white mt-5 mb-2">$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2 class="text-lg font-bold text-white mt-6 mb-3 pb-1 border-b border-zinc-800">$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1 class="text-2xl font-extrabold text-white mt-6 mb-4 pb-2 border-b border-zinc-700 bg-gradient-to-r from-saturn-400 to-sky-400 bg-clip-text text-transparent">$1</h1>');

  // Blockquotes
  html = html.replace(/^> (.*$)/gim, '<blockquote class="border-l-4 border-saturn-500 pl-4 py-1.5 my-3 bg-saturn-500/10 rounded-r-xl text-zinc-300 italic text-sm">$1</blockquote>');

  // Task lists
  html = html.replace(/^- \[x\] (.*$)/gim, '<li class="flex items-center gap-2 list-none text-sm text-zinc-300 my-1"><span class="w-4 h-4 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center text-[10px]">✓</span> <s>$1</s></li>');
  html = html.replace(/^- \[ \] (.*$)/gim, '<li class="flex items-center gap-2 list-none text-sm text-zinc-300 my-1"><span class="w-4 h-4 rounded bg-zinc-800 border border-zinc-600 flex items-center justify-center text-[10px]"></span> $1</li>');

  // Unordered list items
  html = html.replace(/^\s*[-*]\s+(.*$)/gim, '<li class="ml-4 list-disc text-sm text-zinc-300 my-1">$1</li>');

  // Numbered list items
  html = html.replace(/^\s*(\d+)\.\s+(.*$)/gim, '<li class="ml-4 list-decimal text-sm text-zinc-300 my-1">$2</li>');

  // Horizontal Rules
  html = html.replace(/^(?:---|\*\*\*|___)\s*$/gim, '<hr class="my-6 border-zinc-800" />');

  // Bold & Italic & Strikethrough
  html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong class="font-bold text-white"><em>$1</em></strong>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-white">$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em class="italic text-zinc-300">$1</em>');
  html = html.replace(/~~(.*?)~~/g, '<del class="line-through text-zinc-500">$1</del>');

  // Markdown links with strict URL scheme filtering (blocks javascript:, data:, vbscript:)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text, href) => {
    const trimmedHref = href.trim();
    // Allow only safe protocols or relative paths/anchors
    const isSafe = /^(https?:\/\/|mailto:|\/|#)/i.test(trimmedHref) && !/^(javascript:|data:|vbscript:)/i.test(trimmedHref);
    if (!isSafe) {
      return text;
    }
    const safeHref = trimmedHref.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" class="text-saturn-400 hover:underline inline-flex items-center gap-0.5">${text}</a>`;
  });

  // Paragraphs / line breaks
  html = html.replace(/\n\n+/g, '</p><p class="my-3 text-sm text-zinc-300 leading-relaxed">');

  return `<p class="my-3 text-sm text-zinc-300 leading-relaxed">${html}</p>`;
}

export function TextEditorModal({ file, onClose, onSaved }: TextEditorModalProps) {
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const [content, setContent] = useState<string>('');
  const [originalContent, setOriginalContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const ext = (file.extension || '').toLowerCase();
  const isMarkdown = ['md', 'markdown', 'mdown'].includes(ext);
  const isHtml = ['html', 'htm'].includes(ext);
  const hasPreview = isMarkdown || isHtml;

  // View mode: 'edit' | 'preview' | 'split'
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'split'>(
    hasPreview ? 'split' : 'edit'
  );

  const isDirty = content !== originalContent;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    fetch(`/api/files/content?path=${encodeURIComponent(file.path)}`)
      .then(async res => {
        if (!res.ok) throw new Error(t('files.failed_load_file_content', 'Falha ao carregar conteúdo do arquivo'));
        return res.json();
      })
      .then(data => {
        setContent(data.content || '');
        setOriginalContent(data.content || '');
        setIsLoading(false);
      })
      .catch(err => {
        setError(err.message || t('files.error_opening', 'Erro ao abrir arquivo'));
        setIsLoading(false);
      });
  }, [file.path, t]);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/files/content', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: file.path,
          content,
        }),
      });

      if (!res.ok) throw new Error(t('files.error_saving', 'Erro ao salvar arquivo'));

      setOriginalContent(content);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
      if (onSaved) onSaved();
    } catch (err: any) {
      setError(err.message || t('files.error_saving_changes', 'Erro ao salvar alterações'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = async () => {
    if (isDirty) {
      const confirmed = await confirm({
        title: t('files.unsaved_changes_title', 'Alterações não salvas'),
        message: t('files.unsaved_changes_confirm', 'Existem alterações não salvas. Deseja realmente fechar?'),
        confirmText: t('common.discard_and_close', 'Descartar e Fechar'),
        cancelText: t('common.keep_editing', 'Continuar Editando'),
        isDestructive: true,
      });
      if (confirmed) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(content);
    toast.success(t('files.content_copied', 'Conteúdo copiado!'));
  };

  const lines = useMemo(() => content.split('\n'), [content]);
  const lineCount = lines.length;
  const charCount = content.length;

  const markdownPreviewHtml = useMemo(() => {
    if (!isMarkdown) return '';
    return renderMarkdownToHtml(content);
  }, [content, isMarkdown]);

  return typeof document !== 'undefined' ? createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4 animate-in fade-in duration-200" onClick={handleClose}>
      <div 
        ref={containerRef}
        className={`relative w-full bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 my-auto ${
          isFullscreen ? 'h-full max-w-none rounded-none border-0' : 'max-w-6xl h-[94vh] sm:h-[88vh]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 sm:px-6 py-2.5 sm:py-3 border-b border-border bg-card/90 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-saturn-500/10 text-saturn-600 dark:text-saturn-400 border border-saturn-500/20 shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-primary text-sm sm:text-base truncate max-w-[150px] xs:max-w-xs sm:max-w-md" title={file.name}>
                {file.name}
              </h3>
              <p className="text-[11px] text-secondary truncate font-mono hidden sm:block">{file.path}</p>
            </div>
          </div>

          {/* Mode Switcher Tabs (Code / Preview / Split) */}
          <div className="flex items-center gap-1 bg-accent/50 p-1 rounded-xl border border-border">
            <button
              data-testid="tab-edit"
              onClick={() => setViewMode('edit')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                viewMode === 'edit'
                  ? 'bg-saturn-500 text-white font-semibold shadow-sm'
                  : 'text-secondary hover:text-primary'
              }`}
              title={t('files.code_mode', 'Modo Código')}
            >
              <Code className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">{t('files.code', 'Código')}</span>
            </button>

            {hasPreview && (
              <>
                <button
                  data-testid="tab-preview"
                  onClick={() => setViewMode('preview')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    viewMode === 'preview'
                      ? 'bg-saturn-500 text-white font-semibold shadow-sm'
                      : 'text-secondary hover:text-primary'
                  }`}
                  title={isHtml ? t('files.site_preview', 'Prévia do Site') : t('files.markdown_preview', 'Prévia Markdown')}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span className="hidden xs:inline">{isHtml ? t('files.site', 'Site') : t('files.preview', 'Prévia')}</span>
                </button>

                <button
                  data-testid="tab-split"
                  onClick={() => setViewMode('split')}
                  className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    viewMode === 'split'
                      ? 'bg-saturn-500 text-white font-semibold shadow-sm'
                      : 'text-secondary hover:text-primary'
                  }`}
                  title={t('files.split_screen', 'Dividir tela (Código + Prévia)')}
                >
                  <Columns className="w-3.5 h-3.5" />
                  <span>{t('files.split', 'Dividido')}</span>
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {saveSuccess && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-semibold animate-in fade-in">
                <Check className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('files.saved', 'Salvo!')}</span>
              </span>
            )}

            <button
              onClick={handleCopyCode}
              className="p-2 rounded-xl text-secondary hover:text-primary hover:bg-accent/80 transition-colors"
              title={t('files.copy_code', 'Copiar código')}
            >
              <Copy className="w-4 h-4" />
            </button>

            <button
              data-testid="toggle-fullscreen-editor"
              onClick={toggleFullscreen}
              className="p-2 rounded-xl text-secondary hover:text-primary hover:bg-accent/80 transition-colors"
              title={isFullscreen ? t('common.exit_fullscreen', 'Sair da Tela Cheia') : t('common.fullscreen', 'Tela Cheia')}
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>

            <button
              data-testid="save-text-btn"
              onClick={handleSave}
              disabled={isSaving || !isDirty}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-all active:scale-95 shadow-sm ${
                isDirty 
                  ? 'bg-saturn-500 hover:bg-saturn-600 text-white shadow-saturn-500/25' 
                  : 'bg-accent/50 text-secondary cursor-not-allowed'
              }`}
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>{t('common.save', 'Salvar')}</span>
            </button>

            <button
              data-testid="close-text-modal"
              onClick={handleClose}
              className="p-2 rounded-xl text-secondary hover:text-primary hover:bg-accent/80 transition-colors"
              aria-label={t('files.close_editor', 'Fechar editor')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Editor / Preview Body Area */}
        <div className="flex-1 relative overflow-hidden bg-zinc-950 flex flex-col sm:flex-row">
          {isLoading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-secondary">
              <Loader2 className="w-8 h-8 animate-spin text-saturn-400" />
              <span className="text-sm font-medium">{t('files.loading_content', 'Carregando conteúdo...')}</span>
            </div>
          ) : error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <AlertCircle className="w-10 h-10 text-rose-400" />
              <p className="text-rose-400 text-sm">{error}</p>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-accent text-primary text-xs font-medium"
              >
                {t('common.close', 'Fechar')}
              </button>
            </div>
          ) : (
            <>
              {/* CODE EDITOR PANE */}
              {(viewMode === 'edit' || viewMode === 'split') && (
                <div className={`h-full flex overflow-hidden ${viewMode === 'split' ? 'w-full sm:w-1/2 border-r border-zinc-800' : 'w-full'}`}>
                  {/* Line Numbers Gutter */}
                  <div className="hidden xs:flex flex-col py-4 px-2.5 bg-zinc-900/60 select-none text-right font-mono text-xs text-zinc-600 border-r border-zinc-800/80 overflow-hidden">
                    {lines.map((_, i) => (
                      <span key={i} className="leading-relaxed">{i + 1}</span>
                    ))}
                  </div>

                  {/* Textarea Input */}
                  <div className="flex-1 relative h-full">
                    <textarea
                      ref={textareaRef}
                      data-testid="text-editor-area"
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      placeholder={t('files.editor_placeholder', 'Digite seu código ou texto aqui...')}
                      className="w-full h-full p-4 bg-transparent text-emerald-400 font-mono text-xs sm:text-sm resize-none focus:outline-none leading-relaxed selection:bg-saturn-500/30 overflow-auto"
                      spellCheck={false}
                      autoFocus
                    />
                  </div>
                </div>
              )}

              {/* LIVE PREVIEW PANE */}
              {(viewMode === 'preview' || viewMode === 'split') && (
                <div className={`h-full bg-zinc-900/40 overflow-auto p-4 sm:p-6 ${viewMode === 'split' ? 'w-full sm:w-1/2' : 'w-full'}`}>
                  {isHtml ? (
                    <div className="w-full h-full flex flex-col rounded-xl overflow-hidden border border-border shadow-xl bg-white">
                      <div className="bg-card/95 px-4 py-2 flex items-center justify-between text-xs text-secondary border-b border-border">
                        <div className="flex items-center gap-2 font-medium text-primary">
                          <Globe className="w-3.5 h-3.5 text-saturn-600 dark:text-saturn-400" />
                          <span>{t('files.site_preview_live', 'Prévia do Website (Live HTML)')}</span>
                        </div>
                      </div>
                      <iframe
                        data-testid="html-preview-frame"
                        srcDoc={content}
                        title="HTML Live Preview"
                        sandbox="allow-scripts allow-same-origin"
                        className="w-full flex-1 border-0 bg-white"
                      />
                    </div>
                  ) : isMarkdown ? (
                    <div className="max-w-3xl mx-auto py-2">
                      <div className="flex items-center gap-2 mb-4 pb-2 border-b border-zinc-800 text-xs font-semibold text-saturn-600 dark:text-saturn-400">
                        <Sparkles className="w-4 h-4" />
                        <span>{t('files.markdown_preview_styled', 'Prévia Markdown Estilizada')}</span>
                      </div>
                      <div 
                        data-testid="markdown-preview-container"
                        className="prose prose-invert max-w-none text-zinc-200"
                        dangerouslySetInnerHTML={{ __html: markdownPreviewHtml }}
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-secondary gap-2">
                      <FileText className="w-10 h-10 text-zinc-600" />
                      <p className="text-xs">{t('files.preview_not_available', 'Prévia não disponível para esta extensão.')}</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-3 sm:px-6 py-2 border-t border-border bg-card text-[11px] sm:text-xs text-secondary shrink-0">
          <div className="flex items-center gap-3 sm:gap-6">
            <span>{t('files.lines', 'Linhas:')} <strong className="text-primary font-mono">{lineCount}</strong></span>
            <span>{t('files.characters', 'Caracteres:')} <strong className="text-primary font-mono">{charCount}</strong></span>
            <span className="uppercase font-mono px-2 py-0.5 rounded bg-accent text-primary font-semibold text-[10px]">
              {file.extension || 'TXT'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isDirty ? (
              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                {t('files.modified', 'Modificado')}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                {t('files.saved_status', 'Salvo')}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  ) : null;
}
