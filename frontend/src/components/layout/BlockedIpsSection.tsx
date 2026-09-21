import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ShieldAlert,
  ShieldCheck,
  Globe,
  Unlock,
  RefreshCw,
  Loader2,
  Clock,
} from 'lucide-react';
import toast from 'react-hot-toast';

export interface BlockedIpItem {
  ip: string;
  attempts: number;
  blocked_at: number;
  expires_at: number;
  reason: string;
}

export function BlockedIpsSection() {
  const { t } = useTranslation();
  const [blockedIps, setBlockedIps] = useState<BlockedIpItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [unblockingIp, setUnblockingIp] = useState<string | null>(null);

  const fetchBlockedIps = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('saturn_token');
      const res = await fetch('/api/auth/security/blocked-ips', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setBlockedIps(data);
        }
      }
    } catch {
      // Ignored
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBlockedIps();
  }, []);

  const handleUnblock = async (ip: string) => {
    try {
      setUnblockingIp(ip);
      const token = localStorage.getItem('saturn_token');
      const res = await fetch('/api/auth/security/unblock-ip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ ip }),
      });

      if (res.ok) {
        toast.success(t('auth.ip_unblocked', `IP ${ip} desbloqueado com sucesso!`));
        setBlockedIps((prev) => (Array.isArray(prev) ? prev.filter((item) => item.ip !== ip) : []));
      } else {
        toast.error(t('auth.ip_unblock_failed', 'Falha ao desbloquear IP'));
      }
    } catch {
      toast.error(t('auth.ip_unblock_failed', 'Falha ao desbloquear IP'));
    } finally {
      setUnblockingIp(null);
    }
  };

  const formatRemainingMinutes = (expiresAtSecs: number) => {
    const now = Math.floor(Date.now() / 1000);
    const diff = expiresAtSecs - now;
    if (diff <= 0) return 'Expirando...';
    const minutes = Math.ceil(diff / 60);
    return `${minutes} min restantes`;
  };

  const safeBlockedIps = Array.isArray(blockedIps) ? blockedIps : [];

  return (
    <div className="border border-border/80 rounded-2xl p-5 sm:p-6 bg-card/60 backdrop-blur-sm shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/50">
        <div>
          <h3 className="text-base font-semibold text-primary flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-500" />
            {t('auth.blocked_ips', 'Proteção Anti-Brute Force (IPs Bloqueados)')}
          </h3>
          <p className="text-xs text-secondary mt-0.5">
            {t(
              'auth.blocked_ips_desc',
              'Endereços IP temporariamente bloqueados após 5 falhas consecutivas de autenticação.'
            )}
          </p>
        </div>

        <button
          onClick={fetchBlockedIps}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border/80 bg-background/50 hover:bg-accent text-secondary hover:text-primary text-xs font-semibold transition-all active:scale-95 shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>{t('common.refresh', 'Atualizar')}</span>
        </button>
      </div>

      {loading ? (
        <div className="py-8 flex flex-col items-center justify-center gap-2 text-secondary">
          <Loader2 className="w-5 h-5 animate-spin text-saturn-500" />
          <span className="text-xs font-medium">{t('common.loading', 'Carregando lista de IPs...')}</span>
        </div>
      ) : safeBlockedIps.length === 0 ? (
        <div className="py-6 text-center text-secondary text-xs flex flex-col items-center gap-2 bg-muted/20 border border-border/40 rounded-xl">
          <ShieldCheck className="w-8 h-8 text-emerald-500/70" />
          <span className="font-medium text-primary">
            {t('auth.no_blocked_ips', 'Nenhum IP bloqueado no momento')}
          </span>
          <span className="text-[11px] text-secondary">
            {t('auth.firewall_healthy', 'O sistema está protegido e todas as tentativas de acesso estão regulares.')}
          </span>
        </div>
      ) : (
        <div className="space-y-3">
          {safeBlockedIps.map((item) => (
            <div
              key={item.ip}
              className="p-3.5 rounded-xl border border-rose-500/25 bg-rose-500/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold font-mono text-primary flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-rose-500" />
                    {item.ip}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                    {item.attempts} {t('auth.failed_attempts', 'tentativas')}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-[11px] text-secondary flex-wrap">
                  <span className="flex items-center gap-1 text-amber-400">
                    <Clock className="w-3 h-3" />
                    {formatRemainingMinutes(item.expires_at)}
                  </span>
                  <span className="text-secondary/80 truncate">
                    {item.reason}
                  </span>
                </div>
              </div>

              <button
                onClick={() => handleUnblock(item.ip)}
                disabled={unblockingIp === item.ip}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 text-xs font-semibold transition-all active:scale-95 disabled:opacity-50 self-end sm:self-center"
              >
                {unblockingIp === item.ip ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Unlock className="w-3.5 h-3.5" />
                )}
                <span>{t('auth.unblock_now', 'Desbloquear')}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
