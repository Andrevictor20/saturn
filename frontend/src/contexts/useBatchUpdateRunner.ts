import { useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { ContainerLike } from '../utils/containerGroups';
import type { ContainerTaskStatus } from '../utils/batchUpdateRunner';
import { isTunnelOrProxy, sanitizeErrorMessage, pollContainerUpdate } from '../utils/batchUpdateRunner';
import { getAuthToken } from '../utils/auth';

const SATURN_BATCH_STORAGE_KEY = 'saturn_batch_update_session';

interface PersistedBatchSession {
  orderedTargets: ContainerLike[];
  startIndex: number;
  taskStatuses: Record<string, ContainerTaskStatus>;
  logs: string[];
  activeContainerName: string | null;
  timestamp: number;
}

const saveBatchSession = (session: PersistedBatchSession) => {
  try {
    const serialized = JSON.stringify(session);
    localStorage.setItem(SATURN_BATCH_STORAGE_KEY, serialized);
      } catch {}
};

export const clearBatchSession = () => {
  try {
    localStorage.removeItem(SATURN_BATCH_STORAGE_KEY);
      } catch {}
};

export function loadBatchSession(): PersistedBatchSession | null {
  try {
    const raw = localStorage.getItem(SATURN_BATCH_STORAGE_KEY);
    if (!raw) return null;
    const session: PersistedBatchSession = JSON.parse(raw);
    if (!session?.orderedTargets?.length) { clearBatchSession(); return null; }
    if (Date.now() - session.timestamp > 3600000) { clearBatchSession(); return null; }
    return session;
  } catch { return null; }
}

interface BatchRunnerDeps {
  updatingRef: React.MutableRefObject<boolean>;
  abortControllerRef: React.MutableRefObject<AbortController | null>;
  cancelledIdsRef: React.MutableRefObject<Set<string>>;
  setIsUpdating: (v: boolean) => void;
  setIsCompleted: (v: boolean) => void;
  setActiveContainerName: (v: string | null) => void;
  setTaskStatuses: React.Dispatch<React.SetStateAction<Record<string, ContainerTaskStatus>>>;
  setLogs: React.Dispatch<React.SetStateAction<string[]>>;
  addLog: (msg: string) => void;
}

export function useBatchUpdateRunner(deps: BatchRunnerDeps) {
  const { t } = useTranslation();
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const runUpdateLoop = useCallback(async (
    targetContainers: ContainerLike[],
    startIndex = 0,
    savedStatuses?: Record<string, ContainerTaskStatus>,
    savedLogs?: string[],
    concurrency = 2
  ) => {
    const d = depsRef.current;
    if (d.updatingRef.current) return;
    d.updatingRef.current = true;
    d.setIsUpdating(true);
    d.setIsCompleted(false);
    d.cancelledIdsRef.current.clear();

    const controller = new AbortController();
    d.abortControllerRef.current = controller;

    const normalContainers = targetContainers.filter(c => !isTunnelOrProxy(c));
    const proxyContainers = targetContainers.filter(c => isTunnelOrProxy(c));
    const orderedTargets = [...normalContainers, ...proxyContainers];

    const currentStatuses: Record<string, ContainerTaskStatus> = savedStatuses ? { ...savedStatuses } : {};
    if (!savedStatuses) {
      orderedTargets.forEach(c => {
        currentStatuses[c.id] = { id: c.id, name: c.name.replace(/^\//, ''), image: c.image, state: 'pending' };
      });
      d.setTaskStatuses(currentStatuses);
      d.addLog(t('batch_update_modal.starting_update_log', { 
        count: orderedTargets.length, 
        defaultValue: `Iniciando atualização de ${orderedTargets.length} container(s) [Paralelismo: ${concurrency}x]...` 
      }));
    } else {
      d.setTaskStatuses(currentStatuses);
      if (savedLogs?.length) d.setLogs(savedLogs);
      d.addLog(`Retomando lote a partir do container ${startIndex + 1}/${orderedTargets.length} [Paralelismo: ${concurrency}x]...`);
    }

    const token = getAuthToken();
    let localSuccess = Object.values(currentStatuses).filter(t => t.state === 'success').length;
    let localFailed = Object.values(currentStatuses).filter(t => t.state === 'error').length;
    const activeNamesSet = new Set<string>();

    const refreshActiveNames = () => {
      if (activeNamesSet.size === 0) {
        d.setActiveContainerName(null);
      } else {
        const names = Array.from(activeNamesSet);
        d.setActiveContainerName(names.length > 2 ? `${names.slice(0, 2).join(', ')} (+${names.length - 2})` : names.join(', '));
      }
    };

    const processContainer = async (c: ContainerLike): Promise<'success' | 'error' | 'cancelled'> => {
      const cleanName = c.name.replace(/^\//, '');
      if (controller.signal.aborted || d.cancelledIdsRef.current.has(c.id)) {
        d.setTaskStatuses(prev => ({ ...prev, [c.id]: { ...prev[c.id], state: 'cancelled', error: t('batch_update_modal.cancelled_by_user', 'Cancelado pelo usuário') } }));
        d.addLog(t('batch_update_modal.cancelled_by_user_log', { name: cleanName, defaultValue: `[${cleanName}] Cancelado pelo usuário.` }));
        return 'cancelled';
      }

      if (currentStatuses[c.id]?.state === 'success') {
        return 'success';
      }

      activeNamesSet.add(cleanName);
      refreshActiveNames();

      currentStatuses[c.id] = { ...currentStatuses[c.id], state: 'pulling' };
      d.setTaskStatuses(prev => ({ ...prev, [c.id]: { ...prev[c.id], state: 'pulling' } }));
      d.addLog(`[${cleanName}] Iniciando download de '${c.image}'...`);

      try {
        let skipTrigger = false;
        try {
          const checkRes = await fetch(`/api/docker/containers/${c.id}/update-status`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: controller.signal });
          if (checkRes.ok) {
            const activeData = await checkRes.json().catch(() => null);
            if (activeData?.status === 'pulling' || activeData?.status === 'recreating') {
              skipTrigger = true;
              d.addLog(t('batch_update_modal.synced_existing_log', { name: cleanName, defaultValue: `[${cleanName}] Sincronizado com processo já em execução...` }));
            } else if (activeData?.status === 'success') {
              localSuccess++;
              currentStatuses[c.id] = { ...currentStatuses[c.id], state: 'success' };
              d.setTaskStatuses(prev => ({ ...prev, [c.id]: { ...prev[c.id], state: 'success' } }));
              d.addLog(t('batch_update_modal.already_updated_log', { name: cleanName, defaultValue: `[${cleanName}] Já atualizado com sucesso!` }));
              activeNamesSet.delete(cleanName);
              refreshActiveNames();
              return 'success';
            }
          }
        } catch {}

        if (!skipTrigger) {
          const response = await fetch(`/api/docker/containers/${c.id}/update?force=true`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            signal: controller.signal,
          });
          const rawText = await response.text().catch(() => '');
          let data: any = null;
          try { data = JSON.parse(rawText); } catch {}

          if (!response.ok || data?.status === 'error') {
            localFailed++;
            const errorMessage = data?.message || sanitizeErrorMessage(rawText, response.status, t);
            currentStatuses[c.id] = { ...currentStatuses[c.id], state: 'error', error: errorMessage, details: data?.details || rawText };
            d.setTaskStatuses(prev => ({ ...prev, [c.id]: currentStatuses[c.id] }));
            d.addLog(`[${cleanName}] ${t('common.error', 'ERRO')}: ${errorMessage}`);
            activeNamesSet.delete(cleanName);
            refreshActiveNames();
            return 'error';
          }
          if (data?.status === 'success') {
            localSuccess++;
            currentStatuses[c.id] = { ...currentStatuses[c.id], state: 'success' };
            d.setTaskStatuses(prev => ({ ...prev, [c.id]: { ...prev[c.id], state: 'success' } }));
            d.addLog(`[${cleanName}] ${t('batch_update_runner.success_log', 'Container atualizado com sucesso!')}`);
            activeNamesSet.delete(cleanName);
            refreshActiveNames();
            return 'success';
          }
        }

        const pollResult = await pollContainerUpdate({
          containerId: c.id, cleanName, token, signal: controller.signal,
          isCancelled: () => d.cancelledIdsRef.current.has(c.id),
          onStatusChange: (status) => d.setTaskStatuses(prev => ({ ...prev, [c.id]: { ...prev[c.id], state: status } })),
          addLog: d.addLog,
          t,
        });

        activeNamesSet.delete(cleanName);
        refreshActiveNames();

        if (pollResult.wasCancelled) {
          d.setTaskStatuses(prev => ({ ...prev, [c.id]: { ...prev[c.id], state: 'cancelled', error: t('batch_update_runner.cancelled', 'Cancelado') } }));
          d.addLog(`[${cleanName}] ${t('batch_update_runner.cancelled', 'Cancelado')}.`);
          return 'cancelled';
        } else if (pollResult.success) {
          localSuccess++;
          currentStatuses[c.id] = { ...currentStatuses[c.id], state: 'success' };
          d.setTaskStatuses(prev => ({ ...prev, [c.id]: { ...prev[c.id], state: 'success' } }));
          d.addLog(`[${cleanName}] ${t('batch_update_runner.success_log', 'Atualizado e reiniciado com sucesso!')}`);
          return 'success';
        } else {
          localFailed++;
          const err = pollResult.error || t('batch_update_runner.update_failed', 'Falha na atualização');
          currentStatuses[c.id] = { ...currentStatuses[c.id], state: 'error', error: err, details: pollResult.details };
          d.setTaskStatuses(prev => ({ ...prev, [c.id]: currentStatuses[c.id] }));
          d.addLog(`[${cleanName}] ERRO: ${err}`);
          return 'error';
        }
      } catch (err: any) {
        activeNamesSet.delete(cleanName);
        refreshActiveNames();
        if (controller.signal.aborted) {
          d.setTaskStatuses(prev => ({ ...prev, [c.id]: { ...prev[c.id], state: 'cancelled', error: t('batch_update_runner.cancelled', 'Cancelado') } }));
          d.addLog(`[${cleanName}] ${t('batch_update_runner.cancelled', 'Cancelado')}.`);
          return 'cancelled';
        } else {
          localFailed++;
          const errorText = err?.message || t('batch_update_runner.conn_error', 'Erro de conexão');
          d.setTaskStatuses(prev => ({ ...prev, [c.id]: { ...prev[c.id], state: 'error', error: errorText, details: String(err) } }));
          d.addLog(`[${cleanName}] ERRO: ${errorText}`);
          return 'error';
        }
      }
    };

    // 1. Process Normal Containers (with configurable concurrency pool)
    const normalTargetsToProcess = normalContainers.slice(Math.min(startIndex, normalContainers.length));
    const effectiveConcurrency = Math.max(1, concurrency);

    if (effectiveConcurrency === 1) {
      for (const c of normalTargetsToProcess) {
        if (controller.signal.aborted) break;
        await processContainer(c);
        saveBatchSession({ orderedTargets, startIndex: orderedTargets.indexOf(c) + 1, taskStatuses: currentStatuses, logs: [], activeContainerName: null, timestamp: Date.now() });
      }
    } else {
      const executing = new Set<Promise<any>>();
      for (const c of normalTargetsToProcess) {
        if (controller.signal.aborted) break;
        const p: Promise<any> = processContainer(c).then(() => {
          executing.delete(p);
          saveBatchSession({ orderedTargets, startIndex: orderedTargets.indexOf(c) + 1, taskStatuses: currentStatuses, logs: [], activeContainerName: null, timestamp: Date.now() });
        });
        executing.add(p);
        if (executing.size >= effectiveConcurrency) {
          await Promise.race(executing);
        }
      }
      await Promise.all(executing);
    }

    // 2. Process Proxy/Tunnel Containers Sequentially (Safe Network Isolation)
    if (!controller.signal.aborted && proxyContainers.length > 0) {
      const proxyStartIndex = Math.max(0, startIndex - normalContainers.length);
      const proxyTargetsToProcess = proxyContainers.slice(proxyStartIndex);
      if (proxyTargetsToProcess.length > 0) {
        d.addLog(t('batch_update_modal.updating_proxies_log', { defaultValue: 'Atualizando proxies e túneis de rede (ordem sequencial de segurança)...' }));
        for (const c of proxyTargetsToProcess) {
          if (controller.signal.aborted) break;
          await processContainer(c);
          saveBatchSession({ orderedTargets, startIndex: orderedTargets.indexOf(c) + 1, taskStatuses: currentStatuses, logs: [], activeContainerName: null, timestamp: Date.now() });
        }
      }
    }

    // Handle cancel remaining if aborted
    if (controller.signal.aborted) {
      orderedTargets.forEach(c => {
        if (currentStatuses[c.id]?.state === 'pending' || currentStatuses[c.id]?.state === 'pulling') {
          const remName = c.name.replace(/^\//, '');
          currentStatuses[c.id] = { ...currentStatuses[c.id], state: 'cancelled', error: t('batch_update_modal.cancelled_by_user', 'Cancelado pelo usuário') };
          d.addLog(t('batch_update_modal.cancelled_by_user_log', { name: remName, defaultValue: `[${remName}] Cancelado pelo usuário.` }));
        }
      });
      d.setTaskStatuses({ ...currentStatuses });
      clearBatchSession();
    }

    d.updatingRef.current = false;
    d.abortControllerRef.current = null;
    d.setIsUpdating(false);
    d.setIsCompleted(true);
    d.setActiveContainerName(null);
    clearBatchSession();

    const wasCancelled = controller.signal.aborted;
    d.addLog(t('batch_update_modal.batch_done_summary', { success: localSuccess, failed: localFailed, defaultValue: `${wasCancelled ? 'Cancelado' : 'Concluído'}. ${localSuccess} atualizado(s), ${localFailed} falha(s).` }));

    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('saturn:containers-updated'));
    if (localFailed === 0 && localSuccess > 0) toast.success(`${localSuccess} container(s) atualizado(s) com sucesso!`, { duration: 5000 });
    else if (localFailed > 0) toast.error(`${localSuccess} com sucesso, ${localFailed} com falha.`, { duration: 6000 });
  }, [t]);

  return { runUpdateLoop };
}
