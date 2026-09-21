import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Laptop,
  Smartphone,
  Tablet,
  Globe,
  Trash2,
  LogOut,
  Clock,
  ShieldCheck,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';

export interface UserSessionItem {
  id: string;
  user_id?: string;
  username: string;
  ip: string;
  user_agent: string;
  created_at: number;
  last_active_at: number;
  is_current: boolean;
  device_type: 'desktop' | 'mobile' | 'tablet' | string;
}

export function ActiveSessionsSection() {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<UserSessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingOthers, setRevokingOthers] = useState(false);

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('saturn_token');
      const res = await fetch('/api/auth/sessions', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setSessions(data);
        }
      }
    } catch {
      // Falha silenciosa
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleRevokeSession = async (sessionId: string) => {
    try {
      setRevokingId(sessionId);
      const token = localStorage.getItem('saturn_token');
      const res = await fetch(`/api/auth/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });

      if (res.ok) {
        toast.success(t('auth.session_revoked', 'Sessão revogada com sucesso!'));
        setSessions((prev) => (Array.isArray(prev) ? prev.filter((s) => s.id !== sessionId) : []));
      } else {
        toast.error(t('auth.session_revoke_failed', 'Falha ao revogar sessão'));
      }
    } catch {
      toast.error(t('auth.session_revoke_failed', 'Falha ao revogar sessão'));
    } finally {
      setRevokingId(null);
    }
  };

  const handleRevokeOthers = async () => {
    try {
      setRevokingOthers(true);
      const token = localStorage.getItem('saturn_token');
      const res = await fetch('/api/auth/sessions/revoke-others', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });

      if (res.ok) {
        toast.success(t('auth.other_sessions_revoked', 'Todos os outros dispositivos foram desconectados!'));
        setSessions((prev) => (Array.isArray(prev) ? prev.filter((s) => s.is_current) : []));
      } else {
        toast.error(t('auth.other_sessions_revoke_failed', 'Falha ao desconectar outros dispositivos'));
      }
    } catch {
      toast.error(t('auth.other_sessions_revoke_failed', 'Falha ao desconectar outros dispositivos'));
    } finally {
      setRevokingOthers(false);
    }
  };

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'mobile':
        return <Smartphone className="w-5 h-5 text-saturn-400" />;
      case 'tablet':
        return <Tablet className="w-5 h-5 text-saturn-400" />;
      default:
        return <Laptop className="w-5 h-5 text-saturn-400" />;
    }
  };

  const formatTimestamp = (timestampSecs: number) => {
    if (!timestampSecs) return '—';
    const date = new Date(timestampSecs * 1000);
    return date.toLocaleString();
  };

  const formatBrowser = (ua: string) => {
    if (!ua) return 'Navegador Web';
    if (ua.includes('Edg/')) return 'Microsoft Edge';
    if (ua.includes('Chrome/')) return 'Google Chrome';
    if (ua.includes('Firefox/')) return 'Mozilla Firefox';
    if (ua.includes('Safari/') && !ua.includes('Chrome/')) return 'Apple Safari';
    return 'Navegador Web';
  };

  const safeSessions = Array.isArray(sessions) ? sessions : [];

  return (
    <div className="border border-border/80 rounded-2xl p-5 sm:p-6 bg-card/60 backdrop-blur-sm shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/50">
        <div>
          <h3 className="text-base font-semibold text-primary flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-saturn-500" />
            {t('auth.active_sessions', 'Sessões Ativas & Dispositivos')}
          </h3>
          <p className="text-xs text-secondary mt-0.5">
            {t('auth.active_sessions_desc', 'Dispositivos e navegadores atualmente autenticados na sua conta.')}
          </p>
        </div>

        {safeSessions.filter((s) => !s.is_current).length > 0 && (
          <button
            onClick={handleRevokeOthers}
            disabled={revokingOthers}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 text-xs font-semibold transition-all active:scale-95 disabled:opacity-50 shrink-0"
          >
            {revokingOthers ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <LogOut className="w-3.5 h-3.5" />
            )}
            <span>{t('auth.revoke_all_others', 'Desconectar outros')}</span>
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-8 flex flex-col items-center justify-center gap-2 text-secondary">
          <Loader2 className="w-5 h-5 animate-spin text-saturn-500" />
          <span className="text-xs font-medium">{t('common.loading', 'Carregando sessões...')}</span>
        </div>
      ) : safeSessions.length === 0 ? (
        <div className="py-6 text-center text-secondary text-xs flex flex-col items-center gap-2">
          <AlertCircle className="w-6 h-6 text-secondary/60" />
          <span>{t('auth.no_sessions', 'Nenhuma sessão ativa encontrada')}</span>
        </div>
      ) : (
        <div className="space-y-3">
          {safeSessions.map((sess) => (
            <div
              key={sess.id}
              className={`p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                sess.is_current
                  ? 'bg-saturn-500/5 border-saturn-500/30'
                  : 'bg-muted/30 border-border/60 hover:border-border'
              }`}
            >
              <div className="flex items-start sm:items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-card border border-border/80 flex items-center justify-center shrink-0 shadow-sm">
                  {getDeviceIcon(sess.device_type)}
                </div>

                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-primary truncate">
                      {formatBrowser(sess.user_agent)}
                    </span>
                    {sess.is_current && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-saturn-500/20 text-saturn-400 border border-saturn-500/30">
                        {t('auth.current_session', 'Esta sessão')}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-[11px] text-secondary flex-wrap">
                    <span className="flex items-center gap-1 font-mono">
                      <Globe className="w-3 h-3 text-secondary/70" />
                      {sess.ip}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-secondary/70" />
                      {formatTimestamp(sess.last_active_at)}
                    </span>
                  </div>
                </div>
              </div>

              {!sess.is_current && (
                <button
                  onClick={() => handleRevokeSession(sess.id)}
                  disabled={revokingId === sess.id}
                  className="self-end sm:self-center p-2 rounded-lg text-secondary hover:text-rose-500 hover:bg-rose-500/10 transition-colors border border-transparent hover:border-rose-500/20"
                  title={t('auth.revoke_session', 'Encerrar esta sessão')}
                  aria-label={t('auth.revoke_session', 'Encerrar esta sessão')}
                >
                  {revokingId === sess.id ? (
                    <Loader2 className="w-4 h-4 animate-spin text-rose-500" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
