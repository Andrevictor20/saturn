import { useState, useEffect, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Server,
  Network,
  Clock,
  CloudSun,
  ShieldAlert,
  Home,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Info,
  MapPin,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useSettings } from '../../contexts/SettingsContext';
import type { PortConflictInfo } from '../../types/settings';
import { BlockedIpsSection } from './BlockedIpsSection';

export function SystemSettingsTab() {
  const { t } = useTranslation();
  const { settings, updateSettings, checkPortAvailability } = useSettings();

  const [serverName, setServerName] = useState(settings.server_name);
  const [port, setPort] = useState(settings.port);
  const [defaultPage, setDefaultPage] = useState(settings.default_page);
  const [refreshRate, setRefreshRate] = useState(settings.metrics_refresh_rate);
  const [showWeatherCard, setShowWeatherCard] = useState(settings.show_weather_card);
  const [weatherCity, setWeatherCity] = useState(settings.weather_city || '');
  const [confirmDangerousActions, setConfirmDangerousActions] = useState(settings.confirm_dangerous_actions);

  useEffect(() => {
    setServerName(settings.server_name);
    setPort(settings.port);
    setDefaultPage(settings.default_page);
    setRefreshRate(settings.metrics_refresh_rate);
    setShowWeatherCard(settings.show_weather_card);
    setWeatherCity(settings.weather_city || '');
    setConfirmDangerousActions(settings.confirm_dangerous_actions);
  }, [settings]);

  const [checkingPort, setCheckingPort] = useState(false);
  const [portCheckResult, setPortCheckResult] = useState<PortConflictInfo | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleCheckPort = async () => {
    if (!port || port <= 0 || port > 65535) {
      toast.error(t('settings.invalid_port', 'Informe uma porta válida entre 1 e 65535'));
      return;
    }

    try {
      setCheckingPort(true);
      const res = await checkPortAvailability(port);
      setPortCheckResult(res);
      if (res.in_use) {
        toast.error(
          t('settings.port_in_use', `A porta ${port} já está em uso no host! Sugestão: ${res.suggested_port}`)
        );
      } else {
        toast.success(t('settings.port_available', `A porta ${port} está livre e disponível!`));
      }
    } catch {
      toast.error(t('settings.port_check_failed', 'Falha ao verificar porta'));
    } finally {
      setCheckingPort(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!port || port <= 0 || port > 65535) {
      toast.error(t('settings.invalid_port', 'Informe uma porta válida entre 1 e 65535'));
      return;
    }

    try {
      setIsSaving(true);
      await updateSettings({
        server_name: serverName.trim() || 'Saturn',
        port,
        default_page: defaultPage,
        metrics_refresh_rate: refreshRate,
        show_weather_card: showWeatherCard,
        weather_city: weatherCity.trim(),
        confirm_dangerous_actions: confirmDangerousActions,
      });

      toast.success(t('settings.saved_success', 'Configurações do sistema salvas com sucesso!'));
    } catch (err: any) {
      toast.error(err.message || t('settings.save_failed', 'Falha ao salvar configurações'));
    } finally {
      setIsSaving(false);
    }
  };

  const isPortChanged = port !== settings.port;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="pb-2 border-b border-border/60">
        <h3 className="text-sm font-bold text-primary">
          {t('settings.system_title', 'Configurações do Servidor & Saturn')}
        </h3>
        <p className="text-xs text-secondary mt-0.5">
          {t(
            'settings.system_subtitle',
            'Personalize a porta web do container, identificação do host e preferências de telemetria.'
          )}
        </p>
      </div>

      {/* 1. Nome do Servidor */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-primary flex items-center gap-1.5">
          <Server className="w-3.5 h-3.5 text-saturn-500" />
          <span>{t('settings.server_name_label', 'Nome de Exibição do Servidor')}</span>
        </label>
        <input
          type="text"
          value={serverName}
          onChange={(e) => setServerName(e.target.value)}
          placeholder="Ex: Saturn HomeLab"
          className="w-full px-3.5 py-2 text-xs rounded-xl bg-surface dark:bg-zinc-800 border border-border focus:border-saturn-500 focus:outline-none transition-colors"
        />
      </div>

      {/* 2. Porta Web do Saturn */}
      <div className="space-y-2 rounded-2xl border border-border/80 bg-surface/70 dark:bg-zinc-800/40 p-3.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-primary flex items-center gap-1.5">
            <Network className="w-3.5 h-3.5 text-saturn-500" />
            <span>{t('settings.port_label', 'Porta Web do Saturn (Container/Host)')}</span>
          </label>
          <span className="text-[10px] text-secondary font-mono">
            {t('settings.default_port', 'Padrão: 5172')}
          </span>
        </div>

        <div className="flex gap-2">
          <input
            type="number"
            min={1}
            max={65535}
            value={port}
            onChange={(e) => {
              setPort(Number(e.target.value));
              setPortCheckResult(null);
            }}
            className="flex-1 px-3.5 py-2 text-xs rounded-xl bg-surface dark:bg-zinc-800 border border-border focus:border-saturn-500 focus:outline-none transition-colors font-mono"
          />
          <button
            type="button"
            onClick={handleCheckPort}
            disabled={checkingPort}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 text-secondary hover:text-primary transition-all flex items-center gap-1.5 disabled:opacity-50"
          >
            {checkingPort ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            <span>{t('settings.check_port', 'Testar Porta')}</span>
          </button>
        </div>

        {portCheckResult && (
          <div
            className={`text-[11px] p-2 rounded-xl flex items-center gap-1.5 border ${
              portCheckResult.in_use
                ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
            }`}
          >
            {portCheckResult.in_use ? (
              <>
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                <span>
                  {t('settings.port_conflict_detected', 'Porta ocupada! Sugestão:')}{' '}
                  <strong className="font-mono">{portCheckResult.suggested_port}</strong>
                </span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                <span>{t('settings.port_free_to_use', 'Porta livre e pronta para uso!')}</span>
              </>
            )}
          </div>
        )}

        {isPortChanged && (
          <div className="text-[11px] text-amber-500 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-xl flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              {t(
                'settings.port_restart_warning',
                'Aviso: Ao alterar a porta do Saturn, atualize o redirecionamento de porta (-p nova_porta:5172 ou docker-compose) e reinicie o container para aplicar o novo endereço.'
              )}
            </span>
          </div>
        )}
      </div>

      {/* 3. Página Inicial Padrão */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-primary flex items-center gap-1.5">
          <Home className="w-3.5 h-3.5 text-saturn-500" />
          <span>{t('settings.default_page_label', 'Página Inicial Pós-Login')}</span>
        </label>
        <select
          value={defaultPage}
          onChange={(e) => setDefaultPage(e.target.value)}
          className="w-full px-3.5 py-2 text-xs rounded-xl bg-surface dark:bg-zinc-800 border border-border focus:border-saturn-500 focus:outline-none transition-colors"
        >
          <option value="/">{t('sidebar.overview', 'Visão Geral')}</option>
          <option value="/containers">{t('sidebar.containers', 'Containers')}</option>
          <option value="/store">{t('sidebar.store', 'App Store')}</option>
          <option value="/files">{t('sidebar.files', 'Gerenciador de Arquivos')}</option>
          <option value="/metrics">{t('sidebar.metrics', 'Métricas')}</option>
        </select>
      </div>

      {/* 4. Frequência de Métricas (Polling) */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-primary flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-saturn-500" />
          <span>{t('settings.refresh_rate_label', 'Frequência de Atualização de CPU/RAM')}</span>
        </label>
        <select
          value={refreshRate}
          onChange={(e) => setRefreshRate(Number(e.target.value))}
          className="w-full px-3.5 py-2 text-xs rounded-xl bg-surface dark:bg-zinc-800 border border-border focus:border-saturn-500 focus:outline-none transition-colors"
        >
          <option value={2}>2s - {t('settings.refresh_fast', 'Alta Precisão')}</option>
          <option value={5}>5s - {t('settings.refresh_normal', 'Padrão Recomendado')}</option>
          <option value={10}>10s - {t('settings.refresh_eco', 'Econômico (Raspberry Pi)')}</option>
        </select>
      </div>

      {/* 5. Toggles de UI & Confirmações */}
      <div className="space-y-3 pt-2">
        {/* Card de Clima */}
        <div className="flex items-center justify-between rounded-xl border border-border/60 p-3 bg-surface/50 dark:bg-zinc-800/30">
          <div className="flex items-center gap-2.5">
            <CloudSun className="w-4 h-4 text-saturn-500 shrink-0" />
            <div>
              <span className="text-xs font-semibold text-primary block">
                {t('settings.show_weather_label', 'Exibir Card de Previsão do Tempo')}
              </span>
              <span className="text-[11px] text-secondary">
                {t('settings.show_weather_desc', 'Mostra temperatura e clima da cidade na tela inicial')}
              </span>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={showWeatherCard}
            onClick={() => setShowWeatherCard(!showWeatherCard)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              showWeatherCard ? 'bg-saturn-500' : 'bg-zinc-300 dark:bg-zinc-700'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                showWeatherCard ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Localização da Previsão do Tempo */}
        {showWeatherCard && (
          <div className="rounded-xl border border-border/60 p-3 bg-surface/30 dark:bg-zinc-800/20 space-y-1.5 ml-2 border-l-2 border-l-saturn-500">
            <div className="flex items-center justify-between">
              <label htmlFor="weather-city-input" className="text-xs font-semibold text-primary flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-saturn-500" />
                {t('settings.weather_city_label', 'Localização do Clima (Cidade / Região)')}
              </label>
              {weatherCity && (
                <button
                  type="button"
                  onClick={() => setWeatherCity('')}
                  className="text-[10px] text-secondary hover:text-saturn-500 transition-colors"
                >
                  {t('settings.weather_city_auto', 'Usar detecção automática')}
                </button>
              )}
            </div>
            <div className="relative">
              <input
                id="weather-city-input"
                data-testid="weather-city-input"
                type="text"
                placeholder={t('settings.weather_city_placeholder', 'Ex: São Paulo, Rio de Janeiro, Lisboa (ou vazio para automático)')}
                value={weatherCity}
                onChange={(e) => setWeatherCity(e.target.value)}
                className="w-full bg-surface dark:bg-zinc-900 border border-border text-primary rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-saturn-500 placeholder:text-muted"
              />
            </div>
            <p className="text-[11px] text-secondary">
              {t('settings.weather_city_desc', 'Defina a cidade padrão para exibir temperatura e previsões. Deixe vazio para geolocalização automática por IP.')}
            </p>
          </div>
        )}

        {/* Confirmações Perigosas */}
        <div className="flex items-center justify-between rounded-xl border border-border/60 p-3 bg-surface/50 dark:bg-zinc-800/30">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
            <div>
              <span className="text-xs font-semibold text-primary block">
                {t('settings.confirm_actions_label', 'Confirmar Ações Destrutivas')}
              </span>
              <span className="text-[11px] text-secondary">
                {t('settings.confirm_actions_desc', 'Exibir diálogo ao excluir containers, stacks ou arquivos')}
              </span>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={confirmDangerousActions}
            onClick={() => setConfirmDangerousActions(!confirmDangerousActions)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              confirmDangerousActions ? 'bg-saturn-500' : 'bg-zinc-300 dark:bg-zinc-700'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                confirmDangerousActions ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Salvar Botão */}
      <div className="pt-2">
        <button
          type="submit"
          disabled={isSaving}
          className="w-full bg-saturn-500 hover:bg-saturn-600 text-white font-semibold py-2.5 rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-md shadow-saturn-500/20 text-xs disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          <span>{t('settings.save_settings', 'Salvar Configurações')}</span>
        </button>
      </div>

      {/* Proteção Anti-Brute Force (Fail2Ban) */}
      <BlockedIpsSection />
    </form>
  );
}
