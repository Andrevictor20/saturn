import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Server, ArrowUpRight, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import type {
  CloudflareConfigResponse,
  CloudflareTunnelsResponse,
  SaveCloudflareConfigRequest,
  IngressRule,
} from '../types/cloudflare';
import { CloudflareHeader } from '../components/cloudflare/CloudflareHeader';
import { CloudflareMetrics } from '../components/cloudflare/CloudflareMetrics';
import { CloudflareConfigModal } from '../components/cloudflare/CloudflareConfigModal';
import { CloudflareRoutesTable } from '../components/cloudflare/CloudflareRoutesTable';
import { CloudflareAddRouteModal } from '../components/cloudflare/CloudflareAddRouteModal';
import { useConfirm } from '../contexts/ConfirmContext';

export function Cloudflare() {
  const { t } = useTranslation();
  const { confirm } = useConfirm();

  const [config, setConfig] = useState<CloudflareConfigResponse | null>(null);
  const [tunnelsData, setTunnelsData] = useState<CloudflareTunnelsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showAddRouteModal, setShowAddRouteModal] = useState(false);
  const [copiedHost, setCopiedHost] = useState<string | null>(null);

  // Form states
  const [apiToken, setApiToken] = useState('');
  const [accountId, setAccountId] = useState('');
  const [tunnelId, setTunnelId] = useState('');
  const [autoSync, setAutoSync] = useState(true);

  const getAuthHeaders = () => {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('saturn_token') : null;
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  const loadData = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    try {
      const [configRes, tunnelsRes] = await Promise.all([
        fetch('/api/cloudflare/config', {
          headers: getAuthHeaders(),
          credentials: 'include',
        }),
        fetch('/api/cloudflare/tunnels', {
          headers: getAuthHeaders(),
          credentials: 'include',
        }),
      ]);

      if (configRes.ok) {
        const cfg: CloudflareConfigResponse = await configRes.json();
        setConfig(cfg);
        setAccountId(cfg.account_id || '');
        setTunnelId(cfg.tunnel_id || '');
        setAutoSync(cfg.auto_sync_links ?? true);
        if (cfg.api_token) {
          setApiToken(cfg.api_token);
        }
      }

      if (tunnelsRes.ok) {
        const tun: CloudflareTunnelsResponse = await tunnelsRes.json();
        setTunnelsData(tun);
      }
    } catch {
      toast.error(t('cloudflare.fetch_error', 'Falha ao carregar dados do Cloudflare'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleApplyDetected = () => {
    if (!config?.detected) return;
    if (config.detected.account_id) {
      setAccountId(config.detected.account_id);
    }
    if (config.detected.tunnel_id) {
      setTunnelId(config.detected.tunnel_id);
    }
    setShowConfig(true);
    toast.success(
      t(
        'cloudflare.detected_applied',
        'Identificações do contêiner aplicadas no formulário. Adicione o API Token se desejar sync remoto via API.'
      )
    );
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: SaveCloudflareConfigRequest = {
        account_id: accountId.trim(),
        tunnel_id: tunnelId.trim(),
        api_token: apiToken.trim() || undefined,
        auto_sync_links: autoSync,
        enabled: true,
      };

      const res = await fetch('/api/cloudflare/config', {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success(t('cloudflare.config_saved', 'Configuração salva com sucesso!'));
        setShowConfig(false);
        await loadData(true);
      } else {
        toast.error(t('cloudflare.config_save_error', 'Falha ao salvar configuração'));
      }
    } catch {
      toast.error(t('cloudflare.config_save_error', 'Falha na comunicação com o servidor'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfig = async () => {
    const confirmed = await confirm({
      title: t('cloudflare.delete_config_title', 'Remover Credenciais do Cloudflare'),
      message: t('cloudflare.confirm_delete_config', 'Deseja remover as credenciais salvas do Cloudflare?'),
      confirmText: t('common.remove', 'Remover'),
      cancelText: t('common.cancel', 'Cancelar'),
      isDestructive: true,
    });
    if (!confirmed) {
      return;
    }
    try {
      const res = await fetch('/api/cloudflare/config', {
        method: 'DELETE',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (res.ok) {
        toast.success(t('cloudflare.config_deleted', 'Configuração removida.'));
        setAccountId('');
        setTunnelId('');
        setApiToken('');
        setShowConfig(false);
        await loadData(true);
      }
    } catch {
      toast.error(t('cloudflare.config_save_error', 'Falha ao remover configuração'));
    }
  };

  const handleSyncLinks = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/cloudflare/sync-links', {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(
          t('cloudflare.sync_success', '{{count}} links públicos sincronizados com os contêineres!', {
            count: data.synced_count,
          })
        );
        await loadData();
      } else {
        toast.error(t('cloudflare.sync_error', 'Falha ao sincronizar links'));
      }
    } catch {
      toast.error(t('cloudflare.sync_error', 'Erro na sincronização de links'));
    } finally {
      setSyncing(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHost(label);
    toast.success(t('common.copied', 'Copiado para a área de transferência!'));
    setTimeout(() => setCopiedHost(null), 2000);
  };

  const handleRouteCreated = (newRoute: IngressRule) => {
    setTunnelsData((prev) => {
      if (!prev) return prev;
      const existing = prev.rules.filter((r) => r.hostname !== newRoute.hostname);
      return {
        ...prev,
        rules: [newRoute, ...existing],
        status: {
          ...prev.status,
          routes_count: existing.length + 1,
        },
      };
    });
    // Trigger background refresh to ensure server and containers are aligned
    loadData(false);
  };

  const handleRouteDeleted = (deletedHostname: string) => {
    setTunnelsData((prev) => {
      if (!prev) return prev;
      const updated = prev.rules.filter((r) => r.hostname !== deletedHostname);
      return {
        ...prev,
        rules: updated,
        status: {
          ...prev.status,
          routes_count: updated.length,
        },
      };
    });
  };

  const status = tunnelsData?.status;
  const rules = tunnelsData?.rules || [];
  const matchedCount = rules.filter((r) => r.matched_container_id).length;
  const isConfigured = Boolean(
    config?.configured || (status?.account_id && status?.tunnel_id)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-saturn-500 border-t-transparent animate-spin" />
          <p className="text-xs text-secondary font-medium">
            {t('cloudflare.loading', 'Carregando integração Cloudflare...')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-fade-in">
      {/* Header */}
      <CloudflareHeader
        status={status}
        isConfigured={isConfigured}
        rulesCount={rules.length}
        syncing={syncing}
        refreshing={refreshing}
        showConfig={showConfig}
        onSyncLinks={handleSyncLinks}
        onToggleConfig={() => setShowConfig(!showConfig)}
        onRefresh={() => loadData(true)}
        onAddRouteClick={() => setShowAddRouteModal(true)}
      />

      {/* Auto-detected Container Banner */}
      {config?.detected && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/10 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 backdrop-blur-md">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0 mt-0.5">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-primary">
                  {t('cloudflare.detected_title', 'Contêiner cloudflared detectado no Docker!')}
                </h3>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                  {config.detected.container_name}
                </span>
              </div>
              <p className="text-xs text-secondary mt-1 max-w-2xl">
                {t(
                  'cloudflare.detected_desc',
                  'Identificamos seu túnel local em execução. As identificações de Conta e Túnel foram extraídas automaticamente.'
                )}
              </p>
              {config.detected.local_config_path && (
                <div className="mt-1.5 text-[11px] font-mono text-secondary/80 flex items-center gap-1.5">
                  <Server className="w-3 h-3" />
                  <span>Config: {config.detected.local_config_path}</span>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={handleApplyDetected}
            className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-all shadow-sm shrink-0 flex items-center justify-center gap-1.5 active:scale-[0.98]"
          >
            <span>{t('cloudflare.apply_detected', 'Preencher Credenciais')}</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Configuration Form Card (Collapsible) */}
      {showConfig && (
        <CloudflareConfigModal
          config={config}
          accountId={accountId}
          setAccountId={setAccountId}
          tunnelId={tunnelId}
          setTunnelId={setTunnelId}
          apiToken={apiToken}
          setApiToken={setApiToken}
          autoSync={autoSync}
          setAutoSync={setAutoSync}
          onSave={handleSaveConfig}
          onDelete={handleDeleteConfig}
          onClose={() => setShowConfig(false)}
          saving={saving}
        />
      )}

      {/* Overview Metric Stats */}
      <CloudflareMetrics
        status={status}
        rulesCount={rules.length}
        matchedCount={matchedCount}
        autoSync={autoSync}
      />

      {/* Error alert if fetch error */}
      {status?.error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 flex items-start gap-3 text-rose-500">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-bold">{t('cloudflare.api_warning', 'Aviso da API Cloudflare')}</p>
            <p className="mt-0.5 opacity-90">{status.error}</p>
          </div>
        </div>
      )}

      {/* Ingress Rules Table Card */}
      <CloudflareRoutesTable
        rules={rules}
        isConfigured={isConfigured}
        onAddRouteClick={() => setShowAddRouteModal(true)}
        onRouteDeleted={handleRouteDeleted}
        copyToClipboard={copyToClipboard}
        copiedHost={copiedHost}
        onRefresh={() => loadData(false)}
      />

      {/* Add Route Modal */}
      <CloudflareAddRouteModal
        isOpen={showAddRouteModal}
        onClose={() => setShowAddRouteModal(false)}
        onRouteCreated={handleRouteCreated}
        tunnelId={status?.tunnel_id || config?.tunnel_id}
        existingRules={rules}
      />
    </div>
  );
}

export default Cloudflare;
