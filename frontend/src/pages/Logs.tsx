import { useEffect, useState, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Terminal as TerminalIcon, RefreshCw, AlertTriangle, Copy, CheckCircle2, Download, Maximize2, Minimize2, ArrowDown, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import { LogsToolbar, type LogSource, type LogLevel } from '../components/logs/LogsToolbar';
import { useConfirm } from '../contexts/ConfirmContext';

interface LogsResponse {
  logs: string[];
  source: string;
  available_sources: string[];
  total: number;
}

export function Logs() {
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<LogSource>('saturn');
  const [level, setLevel] = useState<LogLevel>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [lineLimit, setLineLimit] = useState<number>(500);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(5000);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [copied, setCopied] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copiedLineIndex, setCopiedLineIndex] = useState<number | null>(null);

  const logsContainerRef = useRef<HTMLDivElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const fetchLogs = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('saturn_token');
      const params = new URLSearchParams({ source, level, lines: lineLimit.toString() });
      if (searchQuery.trim()) params.append('q', searchQuery.trim());
      const res = await fetch(`/api/logs?${params.toString()}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error(`Falha ao buscar logs: ${res.status} ${res.statusText}`);
      const data: LogsResponse = await res.json();
      setLogs(data.logs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(true); }, [source, level, lineLimit, searchQuery]);
  useEffect(() => {
    if (autoRefreshInterval <= 0) return;
    const interval = setInterval(() => fetchLogs(false), autoRefreshInterval);
    return () => clearInterval(interval);
  }, [source, level, lineLimit, searchQuery, autoRefreshInterval]);
  useEffect(() => {
    if (autoScroll && logsEndRef.current?.scrollIntoView) logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [logs, autoScroll]);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape' && isFullscreen) setIsFullscreen(false); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  const handleCopyLogs = async () => {
    if (logs.length === 0) return;
    try { await navigator.clipboard.writeText(logs.join('\n')); setCopied(true); toast.success('Logs copiados!'); setTimeout(() => setCopied(false), 2000); }
    catch { toast.error('Erro ao copiar logs'); }
  };
  const handleCopyLine = async (line: string, index: number) => {
    try { await navigator.clipboard.writeText(line); setCopiedLineIndex(index); toast.success('Linha copiada!'); setTimeout(() => setCopiedLineIndex(null), 1500); }
    catch { toast.error('Erro ao copiar linha'); }
  };
  const handleDownloadLogs = () => {
    if (logs.length === 0) return;
    const blob = new Blob([logs.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `saturn-${source}-logs-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.log`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    toast.success(t('logs.download_started', 'Download iniciado!'));
  };
  const handleClearLogs = async () => {
    const isSaturn = source === 'saturn';
    const confirmMsg = isSaturn
      ? t('logs.clear_confirm_saturn', 'Deseja realmente limpar os registros de log do Saturn?')
      : t('logs.clear_confirm_system', 'Deseja executar a limpeza e compactação de logs?');
    const confirmed = await confirm({
      title: isSaturn ? t('logs.clear_title_saturn', 'Limpar Logs do Saturn') : t('logs.clear_title_system', 'Limpar Logs do Sistema'),
      message: confirmMsg,
      confirmText: t('common.clear', 'Limpar Logs'),
      cancelText: t('common.cancel', 'Cancelar'),
      isDestructive: true,
    });
    if (!confirmed) return;
    setClearing(true);
    try {
      const token = localStorage.getItem('saturn_token');
      const res = await fetch(`/api/logs/clear?source=${source}`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (res.ok) {
        toast.success(isSaturn ? t('logs.clear_success_saturn', 'Logs do Saturn limpos!') : t('logs.clear_success_system', 'Logs limpos e espaço compactado!'));
        await fetchLogs(true);
      } else {
        toast.error(t('logs.clear_error', 'Erro ao limpar logs.'));
      }
    } catch {
      toast.error(t('logs.clear_conn_error', 'Erro de conexão ao limpar logs.'));
    } finally {
      setClearing(false);
    }
  };

  const logStats = useMemo(() => {
    let errors = 0, warnings = 0;
    for (const line of logs) {
      if (/error|crit|emerg|failed|fatal|\[err/i.test(line)) errors++;
      else if (/warn|warning/i.test(line)) warnings++;
    }
    return { errors, warnings };
  }, [logs]);

  return (
    <div className={`space-y-4 ${isFullscreen ? 'fixed inset-0 z-50 bg-[#070a0f] p-4 flex flex-col' : ''}`}>
      {!isFullscreen && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-saturn-500/10 border border-saturn-500/20 text-saturn-400">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">{t('logs.title')}</h1>
              </div>
            </div>
          </div>
          <LogsToolbar
            source={source} level={level} searchQuery={searchQuery} lineLimit={lineLimit}
            autoRefreshInterval={autoRefreshInterval} autoScroll={autoScroll}
            loading={loading} clearing={clearing} copied={copied}
            onSourceChange={setSource} onLevelChange={setLevel} onSearchChange={setSearchQuery}
            onLineLimitChange={setLineLimit} onAutoRefreshChange={setAutoRefreshInterval}
            onAutoScrollToggle={() => setAutoScroll(!autoScroll)}
            onCopy={handleCopyLogs} onDownload={handleDownloadLogs}
            onClear={handleClearLogs} onRefresh={() => fetchLogs(true)}
          />
        </>
      )}

      <div className={`bg-card rounded-2xl border border-border/80 shadow-2xl overflow-hidden flex flex-col relative ${isFullscreen ? 'flex-1 h-full' : 'h-[66vh]'}`}>
        {/* Console Header */}
        <div className="h-11 bg-muted/70 border-b border-border/70 px-3 sm:px-4 flex items-center justify-between gap-3 select-none shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full shrink-0 ${autoRefreshInterval > 0 && !loading ? 'bg-emerald-500 animate-pulse' : 'bg-saturn-500'}`} />
              <TerminalIcon className="w-3.5 h-3.5 text-saturn-500 shrink-0" />
            </div>
            <div className="flex items-center gap-1.5 font-mono text-xs truncate">
              <span className="text-secondary hidden sm:inline">saturn@host:</span>
              <span className="text-saturn-600 dark:text-saturn-300 font-semibold px-2 py-0.5 rounded-md bg-saturn-500/10 border border-saturn-500/20">/var/log/{source}</span>
            </div>
            {logStats.errors > 0 && <span className="hidden md:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-[10px] font-mono">{logStats.errors} erros</span>}
            {logStats.warnings > 0 && <span className="hidden lg:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-300 text-[10px] font-mono">{logStats.warnings} avisos</span>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-2 font-mono text-[11px] text-secondary">
              <span className="px-2 py-0.5 rounded bg-accent border border-border/60 hidden sm:inline">{logs.length} linhas</span>
              {loading && <span className="text-saturn-500 flex items-center gap-1 text-[11px]"><RefreshCw className="w-3 h-3 animate-spin" /><span className="hidden sm:inline">Atualizando...</span></span>}
            </div>
            <div className="h-4 w-px bg-border/60 mx-1 hidden sm:block" />
            <button onClick={handleCopyLogs} disabled={logs.length === 0} className="p-1.5 text-secondary hover:text-primary hover:bg-accent rounded-lg transition-colors text-xs flex items-center gap-1 disabled:opacity-40" title="Copiar todos os logs">
              <Copy className="w-3.5 h-3.5" /><span className="hidden xl:inline text-[11px]">Copiar</span>
            </button>
            <button onClick={handleDownloadLogs} disabled={logs.length === 0} className="p-1.5 text-secondary hover:text-primary hover:bg-accent rounded-lg transition-colors text-xs flex items-center gap-1 disabled:opacity-40" title="Baixar arquivo de log">
              <Download className="w-3.5 h-3.5" /><span className="hidden xl:inline text-[11px]">Baixar</span>
            </button>
            <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-1.5 text-secondary hover:text-primary hover:bg-accent rounded-lg transition-colors text-xs flex items-center gap-1" title={isFullscreen ? 'Sair da tela cheia (Esc)' : 'Expandir em tela cheia'}>
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Log Content */}
        {error ? (
          <div className="flex-1 flex items-center justify-center p-8 text-rose-500 gap-3">
            <AlertTriangle className="w-6 h-6 shrink-0" />
            <div>
              <p className="font-semibold text-sm">Falha ao carregar logs</p>
              <p className="text-xs text-rose-600 dark:text-rose-400/80 mt-0.5">{error}</p>
            </div>
          </div>
        ) : (
          <div ref={logsContainerRef} className="flex-1 overflow-y-auto p-3 font-mono text-xs text-primary space-y-0.5 scrollbar-thin select-text bg-card">
            {logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-secondary space-y-2 py-16">
                <TerminalIcon className="w-8 h-8 stroke-1 text-secondary/60" />
                <p className="italic text-xs">Nenhum registro de log encontrado para os filtros selecionados.</p>
              </div>
            ) : (
              logs.map((line, i) => {
                const isError = /error|crit|emerg|failed|fatal|\[err/i.test(line);
                const isWarn = /warn|warning/i.test(line);
                const isDebug = /debug/i.test(line);
                const isInfo = /info/i.test(line);
                let textColor = 'text-primary';
                let badgeColor = 'bg-accent text-slate-700 dark:text-zinc-300 border-border/70 font-semibold';
                let badgeText = 'LOG';
                if (isError) { textColor = 'text-rose-700 dark:text-rose-300 font-medium'; badgeColor = 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30 font-semibold'; badgeText = 'ERR'; }
                else if (isWarn) { textColor = 'text-amber-700 dark:text-amber-300 font-medium'; badgeColor = 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 font-semibold'; badgeText = 'WRN'; }
                else if (isDebug) { textColor = 'text-purple-700 dark:text-purple-300'; badgeColor = 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30 font-semibold'; badgeText = 'DBG'; }
                else if (isInfo) { textColor = 'text-emerald-700 dark:text-emerald-300/90'; badgeColor = 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 font-semibold'; badgeText = 'INF'; }
                const isLineCopied = copiedLineIndex === i;
                return (
                  <div key={i} className="flex items-start gap-2.5 py-0.5 px-2 rounded-lg hover:bg-accent/60 transition-colors group relative">
                    <span className="text-[10px] text-secondary/60 select-none font-mono w-9 text-right shrink-0 pt-0.5 font-medium">{i + 1}</span>
                    <span className={`text-[9px] uppercase font-bold px-1.5 py-0.2 rounded border select-none shrink-0 tracking-wider ${badgeColor}`}>{badgeText}</span>
                    <span className={`flex-1 break-all whitespace-pre-wrap font-mono text-[11.5px] leading-relaxed ${textColor}`}>{line}</span>
                    <button onClick={() => handleCopyLine(line, i)} className="opacity-0 group-hover:opacity-100 p-1 text-secondary hover:text-primary bg-card hover:bg-accent rounded border border-border/70 transition-all shrink-0 select-none shadow-sm" title="Copiar esta linha">
                      {isLineCopied ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                );
              })
            )}
            <div ref={logsEndRef} />
          </div>
        )}

        {!autoScroll && logs.length > 50 && (
          <button onClick={() => logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })} className="absolute bottom-4 right-4 px-3 py-1.5 rounded-xl bg-saturn-600/90 hover:bg-saturn-500 text-white text-xs font-medium shadow-lg shadow-black/50 border border-saturn-400/30 flex items-center gap-1.5 backdrop-blur-md transition-all active:scale-95 z-10" title="Ir para o final dos logs">
            <ArrowDown className="w-3.5 h-3.5" />
            <span>Fim dos logs</span>
          </button>
        )}
      </div>
    </div>
  );
}
