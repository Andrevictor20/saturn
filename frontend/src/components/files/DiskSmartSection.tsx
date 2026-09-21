import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HardDrive,
  Cpu,
  Database,
  Thermometer,
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  RefreshCw,
  Loader2,
  Clock,
  Activity,
  CheckCircle2,
} from 'lucide-react';
import { formatBytes } from '../../utils/format';

export interface DiskSmartInfo {
  device: string;
  name: string;
  model: string;
  serial?: string;
  disk_type: 'nvme' | 'ssd' | 'hdd' | 'sdcard' | string;
  size_bytes: number;
  health_status: 'passed' | 'warning' | 'failing' | 'unknown' | string;
  passed: boolean;
  temperature?: number;
  power_on_hours?: number;
  wear_out_percent?: number;
  reallocated_sectors?: number;
  smart_supported: boolean;
  message?: string;
}

export function DiskSmartSection() {
  const { t } = useTranslation();
  const [disks, setDisks] = useState<DiskSmartInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSmartData = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('saturn_token');
      const res = await fetch('/api/system/disks/smart', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error('Falha ao carregar diagnóstico S.M.A.R.T.');
      }

      const data = await res.json();
      if (Array.isArray(data)) {
        setDisks(data);
      }
    } catch (err: any) {
      setError(err?.message || 'Erro de comunicação');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSmartData();
  }, []);

  const getDiskIcon = (type: string) => {
    switch (type) {
      case 'nvme':
        return <Cpu className="w-5 h-5 text-indigo-400" />;
      case 'ssd':
        return <Database className="w-5 h-5 text-saturn-400" />;
      case 'sdcard':
        return <Database className="w-5 h-5 text-amber-400" />;
      default:
        return <HardDrive className="w-5 h-5 text-blue-400" />;
    }
  };

  const getHealthBadge = (disk: DiskSmartInfo) => {
    if (disk.health_status === 'failing' || !disk.passed) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
          <AlertOctagon className="w-3.5 h-3.5" />
          {t('smart.failing', 'Falha Iminente')}
        </span>
      );
    }
    if (disk.health_status === 'warning' || (disk.reallocated_sectors && disk.reallocated_sectors > 0)) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
          <AlertTriangle className="w-3.5 h-3.5" />
          {t('smart.warning', 'Atenção')}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
        <ShieldCheck className="w-3.5 h-3.5" />
        {t('smart.healthy', 'Saudável (PASSED)')}
      </span>
    );
  };

  const getTempColor = (temp?: number) => {
    if (temp === undefined || temp === null) return 'text-secondary';
    if (temp >= 55) return 'text-rose-400';
    if (temp >= 45) return 'text-amber-400';
    return 'text-emerald-400';
  };

  const safeDisks = Array.isArray(disks) ? disks : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/60">
        <div>
          <h3 className="text-base font-semibold text-primary flex items-center gap-2">
            <Activity className="w-4 h-4 text-saturn-500" />
            {t('smart.title', 'Diagnóstico Físico de Discos (S.M.A.R.T.)')}
          </h3>
          <p className="text-xs text-secondary mt-0.5">
            {t('smart.subtitle', 'Temperatura em tempo real, integridade física de setores e vida útil estimada de SSDs/NVMe.')}
          </p>
        </div>

        <button
          onClick={fetchSmartData}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border/80 bg-background/50 hover:bg-accent text-secondary hover:text-primary text-xs font-semibold transition-all active:scale-95 disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>{t('common.refresh', 'Atualizar')}</span>
        </button>
      </div>

      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center gap-3 text-secondary">
          <Loader2 className="w-6 h-6 animate-spin text-saturn-500" />
          <span className="text-xs font-medium">{t('smart.loading', 'Lendo sensores físicos e registros S.M.A.R.T...')}</span>
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-400 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : safeDisks.length === 0 ? (
        <div className="py-8 text-center text-secondary text-xs flex flex-col items-center gap-2 bg-muted/20 border border-border/40 rounded-xl">
          <HardDrive className="w-8 h-8 text-secondary/50" />
          <span className="font-medium text-primary">{t('smart.no_disks', 'Nenhuma unidade física detectada')}</span>
          <span className="text-[11px] text-secondary">
            {t('smart.no_disks_hint', 'As unidades do sistema podem estar sendo servidas via overlay conteinerizado.')}
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {safeDisks.map((disk) => {
            const hasWear = disk.wear_out_percent !== undefined && disk.wear_out_percent !== null;
            const wearVal = Math.min(100, Math.max(0, disk.wear_out_percent ?? 100));

            return (
              <div
                key={disk.device}
                className="p-5 rounded-2xl border border-border/80 bg-card/70 backdrop-blur-sm shadow-sm space-y-4 hover:border-border transition-all flex flex-col justify-between"
              >
                {/* Header */}
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-muted/60 border border-border/60">
                        {getDiskIcon(disk.disk_type)}
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-primary truncate max-w-[180px] sm:max-w-[200px]" title={disk.name}>
                          {disk.name || disk.model || disk.device}
                        </h4>
                        <div className="flex items-center gap-2 text-[11px] text-secondary font-mono mt-0.5">
                          <span>{disk.device}</span>
                          <span>•</span>
                          <span className="uppercase font-semibold text-[10px] px-1.5 py-0.2 rounded bg-muted">
                            {disk.disk_type}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    {getHealthBadge(disk)}
                    <span className="text-xs font-semibold font-mono text-primary">
                      {formatBytes(disk.size_bytes)}
                    </span>
                  </div>
                </div>

                {/* Metrics */}
                <div className="space-y-3 pt-2 border-t border-border/50">
                  {/* Temperature */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-secondary flex items-center gap-1.5">
                      <Thermometer className="w-3.5 h-3.5 text-secondary/70" />
                      {t('smart.temperature', 'Temperatura')}
                    </span>
                    <span className={`font-bold font-mono ${getTempColor(disk.temperature)}`}>
                      {disk.temperature !== undefined && disk.temperature !== null ? `${disk.temperature}°C` : '—'}
                    </span>
                  </div>

                  {/* Wear out / Health % */}
                  {hasWear && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-secondary flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-secondary/70" />
                          {t('smart.life_left', 'Vida Útil Restante')}
                        </span>
                        <span className={`font-bold font-mono ${wearVal > 80 ? 'text-emerald-400' : wearVal > 50 ? 'text-amber-400' : 'text-rose-400'}`}>
                          {wearVal}%
                        </span>
                      </div>
                      <div className="w-full bg-muted/70 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            wearVal > 80 ? 'bg-emerald-500' : wearVal > 50 ? 'bg-amber-500' : 'bg-rose-500'
                          }`}
                          style={{ width: `${wearVal}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Power on hours */}
                  {disk.power_on_hours !== undefined && disk.power_on_hours !== null && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-secondary flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-secondary/70" />
                        {t('smart.power_hours', 'Horas em Operação')}
                      </span>
                      <span className="font-medium text-primary font-mono text-[11px]">
                        {disk.power_on_hours.toLocaleString()}h (~{Math.round(disk.power_on_hours / 24)}d)
                      </span>
                    </div>
                  )}

                  {/* Reallocated sectors */}
                  {disk.reallocated_sectors !== undefined && disk.reallocated_sectors !== null && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-secondary">
                        {t('smart.bad_sectors', 'Setores Realocados')}
                      </span>
                      <span
                        className={`font-semibold font-mono text-[11px] ${
                          disk.reallocated_sectors === 0 ? 'text-emerald-400' : 'text-rose-400 font-bold'
                        }`}
                      >
                        {disk.reallocated_sectors}
                      </span>
                    </div>
                  )}
                </div>

                {/* Footer Info */}
                {disk.message && (
                  <p className="text-[10px] text-secondary/70 italic border-t border-border/40 pt-2">
                    {disk.message}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
