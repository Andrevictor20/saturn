import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ShieldCheck,
  Layers,
  Globe,
  Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { PiHoleConfig, PiHoleStats, PiHoleDomainItem, PiHoleTab } from '../types/pihole';
import { PiHoleStatsCards } from '../components/pihole/PiHoleStatsCards';
import { PiHoleTopDomains } from '../components/pihole/PiHoleTopDomains';
import { PiHoleTopClients } from '../components/pihole/PiHoleTopClients';
import { PiHoleNetworkAnalytics } from '../components/pihole/PiHoleNetworkAnalytics';
import { PiHoleRecentQueries } from '../components/pihole/PiHoleRecentQueries';
import { PiHoleDomainList } from '../components/pihole/PiHoleDomainList';
import { PiHoleConfigModal } from '../components/pihole/PiHoleConfigModal';
import { PiHoleControls } from '../components/pihole/PiHoleControls';
import { PiHoleConnectBanner } from '../components/pihole/PiHoleConnectBanner';
import { useConfirm } from '../contexts/ConfirmContext';

export function PiHole() {
  const { t } = useTranslation();
  const { confirm } = useConfirm();

  const [config, setConfig] = useState<PiHoleConfig | null>(null);
  const [stats, setStats] = useState<PiHoleStats | null>(null);
  const [domains, setDomains] = useState<PiHoleDomainItem[]>([]);

  const [loadingConfig, setLoadingConfig] = useState(true);
  const [loadingStats, setLoadingStats] = useState(false);
  const [loadingDomains, setLoadingDomains] = useState(false);
  const [isTogglingBlocking, setIsTogglingBlocking] = useState(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<PiHoleTab>('overview');

  const getAuthHeaders = () => {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('saturn_token') : null;
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  const fetchConfig = async () => {
    try {
      setLoadingConfig(true);
      const res = await fetch('/api/pihole/config', {
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (res.ok) {
        const data: PiHoleConfig = await res.json();
        setConfig(data);
        if (data.configured && data.connected) {
          fetchStats();
          fetchDomains();
        }
      }
    } catch {
      // offline / network error
    } finally {
      setLoadingConfig(false);
    }
  };

  const fetchStats = async () => {
    try {
      setLoadingStats(true);
      const res = await fetch('/api/pihole/stats', {
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (res.ok) {
        const data: PiHoleStats = await res.json();
        setStats(data);
      }
    } catch {
      // error fetching stats
    } finally {
      setLoadingStats(false);
    }
  };

  const fetchDomains = async () => {
    try {
      setLoadingDomains(true);
      const res = await fetch('/api/pihole/domains', {
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (res.ok) {
        const data: PiHoleDomainItem[] = await res.json();
        setDomains(data);
      }
    } catch {
      // error fetching domains
    } finally {
      setLoadingDomains(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleConnect = async (url: string, token: string) => {
    const res = await fetch('/api/pihole/config', {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({ url, token }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to connect to Pi-hole');
    }

    await fetchConfig();
  };

  const handleDisconnect = async () => {
    const confirmed = await confirm({
      title: t('pihole.disconnect_title', 'Desconectar Pi-hole'),
      message: t('pihole.disconnect_confirm', 'Deseja realmente desconectar a integração com o Pi-hole?'),
      confirmText: t('common.disconnect', 'Desconectar'),
      cancelText: t('common.cancel', 'Cancelar'),
      isDestructive: true,
    });
    if (!confirmed) {
      return;
    }

    try {
      const res = await fetch('/api/pihole/config', {
        method: 'DELETE',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (res.ok) {
        setConfig(null);
        setStats(null);
        setDomains([]);
        toast.success(t('pihole.disconnected_success'));
        await fetchConfig();
      }
    } catch {
      toast.error(t('pihole.disconnect_failed'));
    }
  };

  const handleToggleBlocking = async (enable: boolean, durationSeconds?: number) => {
    try {
      setIsTogglingBlocking(true);
      const res = await fetch('/api/pihole/blocking', {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ enable, duration_seconds: durationSeconds }),
      });

      if (res.ok) {
        const data = await res.json();
        const newStatus = data.status;
        toast.success(
          enable
            ? t('pihole.blocking_enabled_success')
            : durationSeconds
            ? t('pihole.blocking_paused_seconds_success', { seconds: durationSeconds })
            : t('pihole.blocking_disabled_success')
        );
        if (config) {
          setConfig((prev) => (prev ? { ...prev, status: newStatus } : null));
        }
        if (stats) {
          setStats((prev) => (prev ? { ...prev, status: newStatus } : null));
        }
        fetchStats();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || t('pihole.toggle_failed'));
      }
    } catch {
      toast.error(t('pihole.toggle_failed'));
    } finally {
      setIsTogglingBlocking(false);
    }
  };

  const handleAddDomain = async (domain: string, listType: 'white' | 'black') => {
    const res = await fetch('/api/pihole/domains', {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({ domain, list_type: listType }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to add domain');
    }

    await fetchDomains();
  };

  const handleRemoveDomain = async (domain: string, listType: 'white' | 'black') => {
    const res = await fetch('/api/pihole/domains', {
      method: 'DELETE',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({ domain, list_type: listType }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to remove domain');
    }

    await fetchDomains();
  };

  const isBlockingEnabled = stats?.status
    ? stats.status === 'enabled'
    : config?.status === 'enabled';

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 shadow-sm">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-primary">
                {t('pihole.title')}
              </h1>
              {config?.configured && (
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold flex items-center gap-1.5 border ${
                    config.connected
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      config.connected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                    }`}
                  />
                  {config.connected
                    ? t('pihole.status_connected')
                    : t('pihole.status_disconnected')}
                </span>
              )}
            </div>
            <p className="text-xs text-secondary mt-0.5">
              {t('pihole.subtitle')}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <PiHoleControls
          config={config}
          isBlockingEnabled={isBlockingEnabled}
          isTogglingBlocking={isTogglingBlocking}
          loadingStats={loadingStats}
          onToggleBlocking={handleToggleBlocking}
          onRefresh={() => {
            fetchStats();
            fetchDomains();
          }}
          onDisconnect={handleDisconnect}
          onOpenConfig={() => setIsConfigModalOpen(true)}
        />
      </div>

      {/* Main Content Area */}
      {loadingConfig ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-saturn-500" />
          <span className="text-xs text-secondary">{t('common.loading')}</span>
        </div>
      ) : !config?.configured || !config.connected ? (
        /* Empty / Connect Call-to-Action */
        <PiHoleConnectBanner onOpenConfig={() => setIsConfigModalOpen(true)} />
      ) : (
        /* Connected Dashboard */
        <div className="space-y-5">
          {/* Tabs */}
          <div className="flex items-center gap-2 border-b border-border/60 pb-3">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'overview'
                  ? 'bg-saturn-500/10 text-saturn-500 border border-saturn-500/20'
                  : 'text-secondary hover:text-primary hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>{t('pihole.tab_overview')}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('domains')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'domains'
                  ? 'bg-saturn-500/10 text-saturn-500 border border-saturn-500/20'
                  : 'text-secondary hover:text-primary hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              <Globe className="w-4 h-4" />
              <span>{t('pihole.tab_domains')}</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-zinc-200 dark:bg-zinc-800 text-secondary">
                {domains.length}
              </span>
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === 'overview' ? (
            <div className="space-y-5">
              {/* 1. Stat Cards */}
              <PiHoleStatsCards stats={stats} loading={loadingStats} />

              {/* 2. Top Permitted & Blocked Domains */}
              <PiHoleTopDomains
                topQueries={stats?.top_queries}
                topAds={stats?.top_ads}
                onAddDomain={handleAddDomain}
                loading={loadingStats}
              />

              {/* 3. Top Clients & Network Analytics */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <PiHoleTopClients clients={stats?.top_clients} loading={loadingStats} />
                <PiHoleNetworkAnalytics
                  queryTypes={stats?.query_types}
                  upstreams={stats?.upstreams}
                  loading={loadingStats}
                />
              </div>

              {/* 4. Live Recent Queries Feed */}
              <PiHoleRecentQueries
                queries={stats?.recent_queries}
                onAddDomain={handleAddDomain}
                loading={loadingStats}
              />
            </div>
          ) : (
            <PiHoleDomainList
              domains={domains}
              loading={loadingDomains}
              onAddDomain={handleAddDomain}
              onRemoveDomain={handleRemoveDomain}
            />
          )}
        </div>
      )}

      {/* Connection Modal */}
      <PiHoleConfigModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        onConnect={handleConnect}
        initialUrl={config?.url || ''}
      />
    </div>
  );
}
