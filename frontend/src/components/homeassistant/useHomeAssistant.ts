import React, { useState, useRef, useMemo, useCallback, useTransition } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { HAConfig, HAEntity, HADeviceGroup, MainTabType, DeviceSubFilter } from './types';
import { groupEntities, groupAllDevices } from './haUtils';
import { useConfirm } from '../../contexts/ConfirmContext';

const getAuthHeaders = () => {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('saturn_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};

export function useHomeAssistant() {
  const { t, i18n } = useTranslation();
  const { confirm } = useConfirm();
  const [, startTransition] = useTransition();

  const [loadingConfig, setLoadingConfig] = useState(true);
  const [config, setConfig] = useState<HAConfig | null>(null);
  const clientEntitiesCacheRef = useRef<{ data: HAEntity[]; timestamp: number } | null>(null);

  const [urlInput, setUrlInput] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const [entities, setEntities] = useState<HAEntity[]>([]);
  const [loadingEntities, setLoadingEntities] = useState(false);
  const [entitiesError, setEntitiesError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MainTabType>('devices');
  const [deviceSubFilter, setDeviceSubFilter] = useState<DeviceSubFilter>('all');
  const [selectedAreaFilter, setSelectedAreaFilter] = useState<string>('all');
  const [selectedDevice, setSelectedDevice] = useState<HADeviceGroup | null>(null);
  const [isPendingAction, setIsPendingAction] = useState<Record<string, boolean>>({});
  const [deviceSearchQuery, setDeviceSearchQuery] = useState('');

  const fetchEntities = useCallback(async (force = false) => {
    if (!force && typeof document !== 'undefined' && document.hidden) return;
    if (!force && clientEntitiesCacheRef.current && Date.now() - clientEntitiesCacheRef.current.timestamp < 10000) {
      setEntities(clientEntitiesCacheRef.current.data);
      return;
    }
    try {
      setLoadingEntities(true);
      setEntitiesError(null);
      const res = await fetch('/api/homeassistant/entities', { headers: getAuthHeaders(), credentials: 'include' });
      if (res.ok) {
        const data: HAEntity[] = await res.json();
        clientEntitiesCacheRef.current = { data, timestamp: Date.now() };
        setEntities(data);
      } else {
        const err = await res.json().catch(() => ({ error: 'Error' }));
        setEntitiesError(err.error || t('homeassistant.error_loading'));
      }
    } catch (e: any) {
      setEntitiesError(e.message || t('homeassistant.error_loading'));
    } finally {
      setLoadingEntities(false);
    }
  }, [t]);

  const fetchConfig = useCallback(async () => {
    try {
      setLoadingConfig(true);
      const res = await fetch('/api/homeassistant/config', { headers: getAuthHeaders(), credentials: 'include' });
      if (res.ok) {
        const data: HAConfig = await res.json();
        setConfig(data);
        if (data.configured && data.connected) fetchEntities(false);
      }
    } catch {} finally {
      setLoadingConfig(false);
    }
  }, [fetchEntities]);

  const handleConnect = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim() || !tokenInput.trim()) return;
    setIsConnecting(true);
    setConnectError(null);
    try {
      const res = await fetch('/api/homeassistant/config', {
        method: 'POST', headers: getAuthHeaders(), credentials: 'include',
        body: JSON.stringify({ url: urlInput.trim(), token: tokenInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setConnectError(data.error || t('homeassistant.connection_failed', 'Falha na conexão')); toast.error(data.error || t('homeassistant.connection_failed', 'Falha ao conectar')); }
      else { toast.success(t('homeassistant.connect_title') + ': ' + t('common.success')); fetchConfig(); }
    } catch (err: any) { setConnectError(err.message || t('homeassistant.network_error', 'Erro de rede')); toast.error(t('homeassistant.connection_failed', 'Erro de conexão')); }
    finally { setIsConnecting(false); }
  }, [urlInput, tokenInput, t, fetchConfig]);

  const handleDisconnect = useCallback(async () => {
    const confirmed = await confirm({
      title: t('homeassistant.disconnect_title', 'Desconectar Home Assistant'),
      message: t('homeassistant.disconnect_confirm', 'Deseja realmente desconectar o Home Assistant?'),
      confirmText: t('common.disconnect', 'Desconectar'),
      cancelText: t('common.cancel', 'Cancelar'),
      isDestructive: true,
    });
    if (!confirmed) return;
    try {
      const res = await fetch('/api/homeassistant/config', { method: 'DELETE', headers: getAuthHeaders(), credentials: 'include' });
      if (res.ok) {
        toast.success(t('homeassistant.disconnect') + ': ' + t('common.success'));
        clientEntitiesCacheRef.current = null;
        setConfig(null); setEntities([]); setUrlInput(''); setTokenInput('');
        fetchConfig();
      }
    } catch { toast.error(t('homeassistant.disconnect_error', 'Erro ao desconectar')); }
  }, [t, fetchConfig]);

  const callService = useCallback(async (domain: string, service: string, payload: Record<string, any>) => {
    const entityId = payload.entity_id;
    if (entityId) setIsPendingAction(prev => ({ ...prev, [entityId]: true }));
    try {
      const res = await fetch(`/api/homeassistant/services/${domain}/${service}`, {
        method: 'POST', headers: getAuthHeaders(), credentials: 'include', body: JSON.stringify(payload),
      });
      if (res.ok) {
        clientEntitiesCacheRef.current = null;
        if (service === 'turn_on' || service === 'turn_off' || service === 'toggle') {
          const nextState = service === 'turn_on' ? 'on' : service === 'turn_off' ? 'off' : undefined;
          setEntities(prev => prev.map(ent => {
            if (ent.entity_id !== entityId) return ent;
            const updatedState = nextState !== undefined ? nextState : ent.state === 'on' ? 'off' : 'on';
            return { ...ent, state: updatedState };
          }));
        } else if (service === 'select_option' && payload.option) {
          setEntities(prev => prev.map(ent => ent.entity_id === entityId ? { ...ent, state: payload.option } : ent));
        }
      } else { toast.error(t('homeassistant.action_failed', 'Falha ao executar ação')); }
    } catch { toast.error(t('homeassistant.command_send_error', 'Erro ao enviar comando')); }
    finally { if (entityId) setIsPendingAction(prev => ({ ...prev, [entityId]: false })); }
  }, [t]);

  const handleToggle = useCallback((entity: HAEntity) => {
    const [domain] = entity.entity_id.split('.');
    callService(domain, entity.state === 'on' ? 'turn_off' : 'turn_on', { entity_id: entity.entity_id });
  }, [callService]);

  const handleToggleEntityId = useCallback(async (entityId: string, currentState: string) => {
    const [domain] = entityId.split('.');
    await callService(domain, currentState === 'on' ? 'turn_off' : 'turn_on', { entity_id: entityId });
  }, [callService]);

  const handleGenericServiceCall = useCallback(async (domain: string, service: string, serviceData: Record<string, any>) => {
    await callService(domain, service, serviceData);
  }, [callService]);

  const allDeviceGroups = useMemo(() => groupAllDevices(entities), [entities]);

  const activeSelectedDevice = useMemo(() =>
    selectedDevice ? allDeviceGroups.find(g => g.id === selectedDevice.id) || selectedDevice : null,
    [selectedDevice, allDeviceGroups]
  );

  const dynamicAreas = useMemo(() => {
    const areaMap = new Map<string, number>();
    allDeviceGroups.forEach(dev => { const a = dev.area?.trim() || 'Geral'; areaMap.set(a, (areaMap.get(a) || 0) + 1); });
    return Array.from(areaMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [allDeviceGroups]);

  const filteredDeviceGroups = useMemo(() => {
    let list = allDeviceGroups;
    if (selectedAreaFilter !== 'all') list = list.filter(dev => (dev.area?.trim() || 'Geral').toLowerCase() === selectedAreaFilter.toLowerCase());
    if (deviceSubFilter !== 'all') {
      const catMap: Record<string, string> = { lights: 'light', switches: 'switch', media: 'media', climate: 'climate', cameras: 'camera', mobile: 'mobile', network: 'network', system: 'system', automation: 'automation', sensors: 'sensor' };
      const cat = catMap[deviceSubFilter];
      if (cat) list = list.filter(dev => dev.category === cat);
    }
    if (deviceSearchQuery.trim()) {
      const q = deviceSearchQuery.toLowerCase().trim();
      list = list.filter(dev =>
        dev.name.toLowerCase().includes(q) || (dev.description || '').toLowerCase().includes(q) ||
        (dev.area || '').toLowerCase().includes(q) ||
        dev.entities.some(e => e.entity_id.toLowerCase().includes(q) || (e.attributes.friendly_name || '').toLowerCase().includes(q))
      );
    }
    return list;
  }, [allDeviceGroups, selectedAreaFilter, deviceSubFilter, deviceSearchQuery]);

  const grouped = useMemo(() => groupEntities(entities), [entities]);

  const stats = useMemo(() => {
    let lightsOn = 0, switchesOn = 0, sensorsCount = 0;
    entities.forEach(ent => {
      const [domain] = ent.entity_id.split('.');
      if (domain === 'light' && ent.state === 'on') lightsOn++;
      if (domain === 'switch' && ent.state === 'on') switchesOn++;
      if (domain === 'sensor' || domain === 'binary_sensor') sensorsCount++;
    });
    return { total: entities.length, lightsOn, switchesOn, sensorsCount };
  }, [entities]);

  const formattedDate = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-US' : 'pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date());
    } catch { return ''; }
  }, [i18n.language]);

  const handleSubFilterChange = useCallback((filter: DeviceSubFilter) => {
    startTransition(() => { setActiveTab('devices'); setDeviceSubFilter(filter); });
  }, [startTransition]);

  const isPending = useCallback((entityId: string) => !!isPendingAction[entityId], [isPendingAction]);

  return {
    loadingConfig, config, urlInput, setUrlInput, tokenInput, setTokenInput,
    showToken, setShowToken, isConnecting, connectError, entities, loadingEntities,
    entitiesError, activeTab, setActiveTab, deviceSubFilter, selectedAreaFilter,
    setSelectedAreaFilter, selectedDevice, setSelectedDevice, isPendingAction,
    deviceSearchQuery, setDeviceSearchQuery, fetchConfig, fetchEntities,
    handleConnect, handleDisconnect, handleToggle, handleToggleEntityId,
    handleGenericServiceCall, allDeviceGroups, activeSelectedDevice,
    dynamicAreas, filteredDeviceGroups, grouped, stats, formattedDate,
    handleSubFilterChange, isPending, startTransition,
  };
}
