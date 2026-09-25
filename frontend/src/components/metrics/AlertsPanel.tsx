import { useAlerts } from '../../contexts/AlertsContext';
import { AlertTriangle, Info, Bell, XCircle, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function AlertsPanel() {
  const { alerts, loading } = useAlerts();
  const { t } = useTranslation();

  // Show only top 3 most recent alerts to avoid cluttering the UI
  const displayAlerts = alerts.slice(0, 3);

  return (
    <div className="w-full space-y-3 mb-6 animate-in fade-in slide-in-from-top-4 duration-500">
      <div className="flex items-center gap-2 px-1">
        <Bell className="w-4 h-4 text-saturn-500" />
        <h3 className="text-sm font-semibold text-primary uppercase tracking-wider">
          {t('metrics.recent_alerts', 'Avisos & Insights (Últimas 48h)')}
        </h3>
      </div>
      
      {alerts.length === 0 && !loading ? (
        <div className="flex items-center gap-3 p-3.5 rounded-xl border border-border/40 bg-card/30">
          <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div>
            <h4 className="text-sm font-medium text-emerald-400/90">{t('metrics.systems_stable', 'Sistemas Estáveis')}</h4>
            <p className="text-[11px] text-secondary">{t('metrics.no_anomalies_48h', 'Nenhuma anomalia registrada nas últimas 48h.')}</p>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {displayAlerts.map((alert) => {
              const isCritical = alert.level === 'critical';
              const isWarning = alert.level === 'warning';

              const bgColor = isCritical ? 'bg-rose-500/10' : isWarning ? 'bg-amber-500/10' : 'bg-blue-500/10';
              const borderColor = isCritical ? 'border-rose-500/30' : isWarning ? 'border-amber-500/30' : 'border-blue-500/30';
              const textColor = isCritical ? 'text-rose-400' : isWarning ? 'text-amber-400' : 'text-blue-400';
              const Icon = isCritical ? XCircle : isWarning ? AlertTriangle : Info;
              const formattedDate = new Date(alert.timestamp).toLocaleString([], {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div 
                  key={alert.id}
                  className={`flex items-start gap-3 p-3.5 rounded-xl double-bezel ${bgColor} ${borderColor} transition-all hover:scale-[1.02] cursor-default`}
                >
                  <div className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${isCritical ? 'bg-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.3)]' : isWarning ? 'bg-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.2)]' : 'bg-blue-500/20'}`}>
                    <Icon className={`w-4 h-4 ${textColor}`} />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <h4 className={`text-sm font-semibold truncate ${textColor}`}>
                        {alert.title}
                      </h4>
                      <span className="text-[10px] text-zinc-500 font-mono shrink-0 bg-black/20 px-1.5 py-0.5 rounded-md border border-white/5">
                        {formattedDate}
                      </span>
                    </div>
                    <p className="text-xs text-secondary leading-relaxed line-clamp-2">
                      {alert.message}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          
          {alerts.length > 3 && (
            <div className="px-2 text-xs text-secondary/70 italic flex items-center justify-center pt-2">
              + {alerts.length - 3} aviso(s) adicionais gravados nos logs do sistema.
            </div>
          )}
        </>
      )}
    </div>
  );
}
