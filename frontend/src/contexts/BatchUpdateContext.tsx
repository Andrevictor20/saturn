import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { ContainerLike } from '../utils/containerGroups';
import { type ContainerUpdateState, type ContainerTaskStatus } from '../utils/batchUpdateRunner';
import { useBatchUpdateRunner, clearBatchSession, loadBatchSession } from './useBatchUpdateRunner';
import { getAuthToken } from '../utils/auth';

export type { ContainerUpdateState, ContainerTaskStatus };

export interface BatchUpdateContextType {
  isUpdating: boolean;
  isCompleted: boolean;
  isModalOpen: boolean;
  taskStatuses: Record<string, ContainerTaskStatus>;
  logs: string[];
  selectedIds: string[];
  activeContainerName: string | null;
  progressPercent: number;
  completedTasks: number;
  totalTasks: number;
  successCount: number;
  failedCount: number;
  cancelledCount: number;
  openModal: (initialId?: string) => void;
  closeModal: () => void;
  minimizeModal: () => void;
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  toggleSelectContainer: (id: string) => void;
  selectAllContainers: (ids: string[]) => void;
  deselectAllContainers: () => void;
  concurrency: number;
  setConcurrency: (val: number) => void;
  startBatchUpdate: (targetContainers: ContainerLike[]) => Promise<void>;
  retryFailed: (containers: ContainerLike[]) => Promise<void>;
  cancelAll: () => void;
  cancelContainer: (id: string) => void;
  clear: () => void;
}

const BatchUpdateContext = createContext<BatchUpdateContextType | undefined>(undefined);

export const BatchUpdateProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  const [isUpdating, setIsUpdating] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [taskStatuses, setTaskStatuses] = useState<Record<string, ContainerTaskStatus>>({});
  const [logs, setLogs] = useState<string[]>([]);
  const [activeContainerName, setActiveContainerName] = useState<string | null>(null);
  const [concurrency, setConcurrencyState] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('saturn_batch_concurrency');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if ([1, 2, 3, 5].includes(parsed)) return parsed;
      }
    } catch {}
    return 2;
  });

  const setConcurrency = useCallback((val: number) => {
    setConcurrencyState(val);
    try {
      localStorage.setItem('saturn_batch_concurrency', String(val));
    } catch {}
  }, []);

  const updatingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const cancelledIdsRef = useRef<Set<string>>(new Set());

  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  }, []);

  const { runUpdateLoop } = useBatchUpdateRunner({
    updatingRef, abortControllerRef, cancelledIdsRef,
    setIsUpdating, setIsCompleted, setActiveContainerName,
    setTaskStatuses, setLogs, addLog,
  });

  const openModal = useCallback((initialId?: string) => {
    if (initialId) setSelectedIds([initialId]);
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => setIsModalOpen(false), []);
  const minimizeModal = useCallback(() => {
    setIsModalOpen(false);
    toast(t('batch_update_modal.updating_bg_toast', 'Atualização de containers continuando em segundo plano'), { icon: '🔄', duration: 3500 });
  }, [t]);

  const toggleSelectContainer = useCallback((id: string) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]), []);
  const selectAllContainers = useCallback((ids: string[]) => setSelectedIds(ids), []);
  const deselectAllContainers = useCallback(() => setSelectedIds([]), []);

  const cancelAll = useCallback(async () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    clearBatchSession();
    const token = getAuthToken();
    try {
      await fetch('/api/docker/containers/update/cancel-all', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} });
    } catch {}
    addLog('Cancelamento solicitado. Parando todos os processos...');
  }, [addLog]);

  const cancelContainer = useCallback(async (id: string) => {
    cancelledIdsRef.current.add(id);
    const token = getAuthToken();
    try {
      await fetch(`/api/docker/containers/${id}/update/cancel`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} });
    } catch {}
    setTaskStatuses(prev => {
      const task = prev[id];
      if (task && task.state !== 'success' && task.state !== 'error') {
        addLog(t('batch_update_modal.cancelled_by_user_log', { name: task.name, defaultValue: `[${task.name}] Cancelado pelo usuário.` }));
        return { ...prev, [id]: { ...task, state: 'cancelled', error: t('batch_update_modal.cancelled_by_user', 'Cancelado pelo usuário') } };
      }
      return prev;
    });
  }, [addLog, t]);

  const clear = useCallback(() => {
    if (updatingRef.current) return;
    clearBatchSession();
    setIsUpdating(false);
    setIsCompleted(false);
    setTaskStatuses({});
    setLogs([]);
    setActiveContainerName(null);
    cancelledIdsRef.current.clear();
  }, []);

  // Auto-Resume after F5
  useEffect(() => {
    const session = loadBatchSession();
    if (!session) return;
    toast(t('batch_update_modal.recovering_batch_update', 'Recuperando atualização em lote em andamento...'), { icon: '🔄', duration: 4000 });
    runUpdateLoop(session.orderedTargets, session.startIndex, session.taskStatuses, session.logs, concurrency);
  }, [t, concurrency]);

  const startBatchUpdate = async (targetContainers: ContainerLike[]) => {
    if (targetContainers.length === 0) return;
    await runUpdateLoop(targetContainers, 0, undefined, undefined, concurrency);
  };

  const retryFailed = async (containers: ContainerLike[]) => {
    const failedIds = Object.values(taskStatuses).filter(t => t.state === 'error').map(t => t.id);
    const targets = containers.filter(c => failedIds.includes(c.id));
    if (targets.length === 0) return;
    await runUpdateLoop(targets, 0, undefined, undefined, concurrency);
  };

  const successCount = Object.values(taskStatuses).filter(t => t.state === 'success').length;
  const failedCount = Object.values(taskStatuses).filter(t => t.state === 'error').length;
  const cancelledCount = Object.values(taskStatuses).filter(t => t.state === 'cancelled').length;
  const totalTasks = Object.keys(taskStatuses).length;
  const completedTasks = successCount + failedCount + cancelledCount;
  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <BatchUpdateContext.Provider
      value={{
        isUpdating, isCompleted, isModalOpen, taskStatuses, logs, selectedIds,
        activeContainerName, progressPercent, completedTasks, totalTasks,
        successCount, failedCount, cancelledCount,
        concurrency, setConcurrency,
        openModal, closeModal, minimizeModal, setSelectedIds,
        toggleSelectContainer, selectAllContainers, deselectAllContainers,
        startBatchUpdate, retryFailed, cancelAll, cancelContainer, clear,
      }}
    >
      {children}
    </BatchUpdateContext.Provider>
  );
};

const defaultBatchUpdateContext: BatchUpdateContextType = {
  isUpdating: false, isCompleted: false, isModalOpen: false, taskStatuses: {},
  logs: [], selectedIds: [], activeContainerName: null, progressPercent: 0,
  completedTasks: 0, totalTasks: 0, successCount: 0, failedCount: 0, cancelledCount: 0,
  concurrency: 2, setConcurrency: () => {},
  openModal: () => {}, closeModal: () => {}, minimizeModal: () => {}, setSelectedIds: () => {},
  toggleSelectContainer: () => {}, selectAllContainers: () => {}, deselectAllContainers: () => {},
  startBatchUpdate: async () => {}, retryFailed: async () => {}, cancelAll: () => {}, cancelContainer: () => {}, clear: () => {},
};

export const useBatchUpdate = () => {
  const context = useContext(BatchUpdateContext);
  return context || defaultBatchUpdateContext;
};
