import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { saveFileToDb, getFileFromDb, removeFileFromDb } from '../utils/uploadDb';
import { getAuthToken } from '../utils/auth';

export const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB per chunk for high throughput & low overhead
export const MAX_CHUNK_RETRIES = 3; // retry automático em falhas transitórias de rede
export const CHUNK_RETRY_BACKOFF_MS = 1000; // backoff inicial entre tentativas (ms)
export const CHUNK_REQUEST_TIMEOUT_MS = 60_000; // timeout por requisição de chunk (ms)

// Pequeno atraso para backoff exponencial entre tentativas de chunk
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Fetch com timeout explícito; aborta o signal do upload se o timeout expirar
const fetchWithTimeout = (
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> => {
  let timeoutTimer: ReturnType<typeof setTimeout>;
  const controller = new AbortController();
  const promise = fetch(url, { ...init, signal: controller.signal });

  const timeoutPromise = new Promise<Response>((_, reject) => {
    timeoutTimer = setTimeout(() => {
      controller.abort();
      reject(new Error(`Tempo esgotado após ${timeoutMs / 1000}s`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutTimer));
};

// Estima a cota de armazenamento do navegador (IndexedDB) para decidir se é
// seguro gravar o blob inteiro de um arquivo grande antes do upload.
async function estimateIndexedDbQuota(): Promise<{ usage: number; quota: number; percentage: number } | null> {
  if (typeof navigator.storage?.estimate !== 'function') return null;
  try {
    const est = await navigator.storage.estimate();
    const quota = est.quota ?? 0;
    const usage = est.usage ?? 0;
    return { usage, quota, percentage: quota > 0 ? (usage / quota) * 100 : 0 };
  } catch {
    return null;
  }
}

// Limiar a partir do qual pulamos a gravação do blob no IndexedDB (cota quase esgotada).
const INDEXED_DB_QUOTA_WARN_PERCENT = 85;

export interface UploadItem {
  id: string;
  fileName: string;
  fileSize: number;
  destinationPath: string;
  chunkSize: number;
  totalChunks: number;
  uploadedChunks: number[];
  progress: number;
  speedMBs: number;
  etaSeconds?: number; // tempo estimado restante em segundos
  status: 'uploading' | 'paused' | 'completed' | 'error';
  error?: string;
  createdAt: number;
}

interface UploadManagerContextType {
  uploads: UploadItem[];
  isDrawerOpen: boolean;
  setIsDrawerOpen: (open: boolean) => void;
  isMinimized: boolean;
  setIsMinimized: (min: boolean) => void;
  enqueueUpload: (file: File, destinationPath: string) => Promise<string>;
  enqueueMultipleUploads: (files: File[], destinationPath: string) => Promise<void>;
  pauseUpload: (id: string) => void;
  resumeUpload: (id: string) => Promise<void>;
  cancelUpload: (id: string) => void;
  clearCompleted: () => void;
}

const UploadManagerContext = createContext<UploadManagerContextType | undefined>(undefined);

const SATURN_STORAGE_KEY = 'saturn_active_uploads';

export function UploadManagerProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [uploads, setUploads] = useState<UploadItem[]>(() => {
    try {
      const raw = localStorage.getItem(SATURN_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // In-memory references to active files & abort controllers
  const fileCacheRef = useRef<Map<string, File>>(new Map());
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const runningUploadsRef = useRef<Set<string>>(new Set());

  // Persist uploads list metadata to localStorage
  useEffect(() => {
    try {
      // Keep up to 20 recent uploads in metadata
      const serialized = JSON.stringify(uploads.slice(0, 20));
      localStorage.setItem(SATURN_STORAGE_KEY, serialized);
          } catch {}
  }, [uploads]);

  const updateItem = useCallback((id: string, patch: Partial<UploadItem>) => {
    setUploads((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }, []);

  // Upload runner for a single item
  const processUpload = useCallback(async (item: UploadItem, file: File) => {
    if (runningUploadsRef.current.has(item.id)) return;
    runningUploadsRef.current.add(item.id);

    const controller = new AbortController();
    abortControllersRef.current.set(item.id, controller);

    updateItem(item.id, { status: 'uploading', error: undefined });

    try {
      // 1. Check server status to resume existing chunks
      const token = getAuthToken();
      const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      let currentUploadedChunks = [...item.uploadedChunks];
      try {
        const statusRes = await fetch(`/api/files/upload/status?upload_id=${encodeURIComponent(item.id)}`, {
          headers: authHeaders,
          signal: controller.signal,
        });
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          if (statusData.received_chunks && Array.isArray(statusData.received_chunks)) {
            currentUploadedChunks = Array.from(new Set([...currentUploadedChunks, ...statusData.received_chunks]));
          }
        }
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
      }

      const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
      let uploadedCount = currentUploadedChunks.length;
      let lastBytesSent = uploadedCount * CHUNK_SIZE;
      let lastTime = Date.now();
      // Throttle de UI: evita re-render da gaveta de progresso a cada chunk em arquivos grandes
      let lastReportedPercent = item.progress;

      // Timeout dinâmico por chunk: arquivo maior => rede provavelmente mais lenta.
      // Base 60s + 30s a cada 100MB do arquivo, teto 300s (5 min).
      const chunkTimeoutMs = Math.min(
        CHUNK_REQUEST_TIMEOUT_MS + Math.floor(file.size / (100 * 1024 * 1024)) * 30_000,
        300_000,
      );

      // 2. Upload missing chunks sequentially (com retry + timeout por requisição)
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        if (controller.signal.aborted) return;

        if (currentUploadedChunks.includes(chunkIndex)) {
          continue;
        }

        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(file.size, (chunkIndex + 1) * CHUNK_SIZE);
        const chunkBlob = file.slice(start, end);

        const buildFormData = () => {
          const fd = new FormData();
          fd.append('chunk', chunkBlob, file.name);
          fd.append('upload_id', item.id);
          fd.append('chunk_index', chunkIndex.toString());
          fd.append('total_chunks', totalChunks.toString());
          fd.append('filename', file.name);
          fd.append('destination_path', item.destinationPath);
          return fd;
        };

        let lastChunkError: Error | null = null;
        let chunkOk = false;

        for (let attempt = 0; attempt <= MAX_CHUNK_RETRIES; attempt++) {
          if (controller.signal.aborted) return;

          try {
            const chunkRes = await fetchWithTimeout(
              '/api/files/upload/chunk',
              {
                method: 'POST',
                headers: authHeaders,
                body: buildFormData(),
                signal: controller.signal,
              },
              chunkTimeoutMs,
            );

            if (chunkRes.ok) {
              chunkOk = true;
              break;
            }

            // Erros 4xx (exceto 429/5xx transitórios) não se beneficiam de retry
            const errText = await chunkRes.text().catch(() => 'Falha no chunk');
            if (chunkRes.status === 429 || chunkRes.status >= 500) {
              lastChunkError = new Error(errText || `Falha no envio do bloco ${chunkIndex + 1}`);
            } else {
              throw new Error(errText || `Falha no envio do bloco ${chunkIndex + 1}`);
            }
          } catch (err: any) {
            if (err?.name === 'AbortError') return;
            lastChunkError = err;
          }

          if (attempt < MAX_CHUNK_RETRIES) {
            const backoff = CHUNK_RETRY_BACKOFF_MS * Math.pow(2, attempt);
            await sleep(backoff);
          }
        }

        if (!chunkOk) {
          throw lastChunkError || new Error(`Falha no envio do bloco ${chunkIndex + 1}`);
        }

        currentUploadedChunks.push(chunkIndex);
        uploadedCount++;

        // Calculate speed (atualizado apenas periodicamente para não saturar a UI)
        const now = Date.now();
        const timeDiffSec = (now - lastTime) / 1000;
        let speed = item.speedMBs;
        if (timeDiffSec >= 0.8) {
          const bytesDiff = (uploadedCount * CHUNK_SIZE) - lastBytesSent;
          speed = Math.max(0, parseFloat((bytesDiff / (1024 * 1024 * timeDiffSec)).toFixed(2)));
          lastBytesSent = uploadedCount * CHUNK_SIZE;
          lastTime = now;
        }

        const progressPercent = Math.min(99, Math.round((uploadedCount / totalChunks) * 100));

        // Throttle: grava no estado só quando o percentual muda ou a cada 4 chunks
        const shouldReport = progressPercent !== lastReportedPercent || uploadedCount % 4 === 0;
        if (shouldReport) {
          lastReportedPercent = progressPercent;
          // Estima o tempo restante (ETA) com base na velocidade atual e bytes pendentes.
          const bytesUploaded = uploadedCount * CHUNK_SIZE;
          const bytesRemaining = Math.max(0, fileSize - bytesUploaded);
          const speedBps = speed * 1024 * 1024;
          const etaSeconds = speedBps > 0 ? Math.ceil(bytesRemaining / speedBps) : undefined;
          updateItem(item.id, {
            uploadedChunks: [...currentUploadedChunks],
            progress: progressPercent,
            speedMBs: speed,
            ...(etaSeconds !== undefined ? { etaSeconds } : {}),
          });
        }
      }

      // 3. Complete and assemble upload on server
      const completeHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...authHeaders,
      };
      const completeRes = await fetch('/api/files/upload/complete', {
        method: 'POST',
        headers: completeHeaders,
        body: JSON.stringify({
          upload_id: item.id,
          filename: file.name,
          destination: item.destinationPath,
          total_chunks: totalChunks,
        }),
        signal: controller.signal,
      });

      if (!completeRes.ok) {
        const err = await completeRes.text().catch(() => 'Erro na montagem do arquivo');
        throw new Error(err || 'Erro na montagem do arquivo no servidor');
      }

      // 4. Mark completed and cleanup
      updateItem(item.id, {
        status: 'completed',
        progress: 100,
        speedMBs: 0,
        uploadedChunks: Array.from({ length: totalChunks }, (_, i) => i),
      });

      await removeFileFromDb(item.id);
      fileCacheRef.current.delete(item.id);

      toast.success(t('files.upload_single_success', { name: file.name, defaultValue: `Upload de "${file.name}" concluído com sucesso!` }));
      window.dispatchEvent(new CustomEvent('saturn:files_changed', { detail: { path: item.destinationPath } }));
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        // Handled by pause/cancel
        return;
      }
      console.error('Upload failed:', err);
      updateItem(item.id, {
        status: 'error',
        error: err?.message || 'Erro inesperado no envio',
        speedMBs: 0,
      });
      toast.error(`Falha no upload de "${item.fileName}": ${err?.message || 'Erro de rede'}`);
    } finally {
      runningUploadsRef.current.delete(item.id);
      abortControllersRef.current.delete(item.id);
    }
  }, [updateItem]);

  // Enqueue a new file
  const enqueueUpload = useCallback(async (file: File, destinationPath: string): Promise<string> => {
    const id = `upl_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));

    const newItem: UploadItem = {
      id,
      fileName: file.name,
      fileSize: file.size,
      destinationPath,
      chunkSize: CHUNK_SIZE,
      totalChunks,
      uploadedChunks: [],
      progress: 0,
      speedMBs: 0,
      status: 'uploading',
      createdAt: Date.now(),
    };

    setUploads((prev) => [newItem, ...prev]);
    setIsDrawerOpen(true);
    setIsMinimized(false);

    // Cache em memória (sessão atual) independente do IndexedDB
    fileCacheRef.current.set(id, file);

    // Persiste no IndexedDB para suporte a F5. Pula o blob quando a cota do
    // navegador está quase esgotada para não falhar silenciosamente.
    const quota = await estimateIndexedDbQuota();
    const nearQuotaLimit = quota ? quota.percentage >= INDEXED_DB_QUOTA_WARN_PERCENT : false;

    if (nearQuotaLimit) {
      toast.error(t('files.upload_indexeddb_quota_low', { name: file.name, defaultValue: `Cota de armazenamento do navegador quase esgotada. "${file.name}" será enviado sem suporte a retomada após F5.` }));
    } else {
      try {
        const result = await saveFileToDb(id, file);
        if (!result.savedBlob) {
          toast.error(t('files.upload_indexeddb_quota_exceeded', { name: file.name, defaultValue: `Sem cota no IndexedDB para "${file.name}". Retomada após F5 indisponível.` }));
        }
      } catch (err) {
        console.error('[UploadManager] Falha ao persistir no IndexedDB:', err);
        toast.error(t('files.upload_indexeddb_save_failed', { name: file.name, defaultValue: `Não foi possível preparar "${file.name}" para retomada após F5.` }));
      }
    }

    // Start upload process
    processUpload(newItem, file);
    return id;
  }, [processUpload]);

  // Enqueue multiple files
  const enqueueMultipleUploads = useCallback(async (files: File[], destinationPath: string) => {
    for (const f of files) {
      await enqueueUpload(f, destinationPath);
    }
  }, [enqueueUpload]);

  // Pause upload
  const pauseUpload = useCallback((id: string) => {
    const controller = abortControllersRef.current.get(id);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(id);
    }
    runningUploadsRef.current.delete(id);
    updateItem(id, { status: 'paused', speedMBs: 0 });
    toast('Upload pausado', { icon: '⏸️' });
  }, [updateItem]);

  // Resume upload
  const resumeUpload = useCallback(async (id: string) => {
    let file = fileCacheRef.current.get(id);
    if (!file) {
      file = await getFileFromDb(id) || undefined;
      if (file) fileCacheRef.current.set(id, file);
    }

    const item = uploads.find((u) => u.id === id);
    if (!item) return;

    if (!file) {
      toast.error(t('files.original_file_not_found', 'Arquivo original não encontrado. Por favor, reenvie o arquivo.'));
      updateItem(id, { status: 'error', error: 'Arquivo expirado do cache local' });
      return;
    }

    processUpload(item, file);
  }, [uploads, processUpload, updateItem, t]);

  // Cancel upload
  const cancelUpload = useCallback(async (id: string) => {
    const controller = abortControllersRef.current.get(id);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(id);
    }
    runningUploadsRef.current.delete(id);
    fileCacheRef.current.delete(id);
    await removeFileFromDb(id);

    setUploads((prev) => prev.filter((u) => u.id !== id));
    toast(t('files.upload_cancelled', 'Upload cancelado'), { icon: '🛑' });
  }, [t]);

  // Clear completed uploads from list
  const clearCompleted = useCallback(() => {
    setUploads((prev) => prev.filter((u) => u.status !== 'completed'));
  }, []);

  // Hydrate active uploads on mount / F5 (uploading, paused, error). 'completed' is handled by clearCompleted.
  useEffect(() => {
    const hydrateActiveUploads = async () => {
      for (const item of uploads) {
        if (item.status !== 'uploading' && item.status !== 'paused' && item.status !== 'error') continue;
        const file = await getFileFromDb(item.id);
        if (file) {
          fileCacheRef.current.set(item.id, file);
          // Auto-retoma apenas 'uploading'; 'error' fica visível para retomada manual.
          if (item.status === 'uploading') processUpload(item, file);
        } else if (item.status === 'error') {
          updateItem(item.id, {
            error: t('files.upload_file_not_available_locally', 'Arquivo não está mais disponível localmente. Reenvie o arquivo.'),
          });
        } else {
          updateItem(item.id, {
            status: 'paused',
            error: t('files.upload_page_reloaded', 'Página recarregada. Clique em Retomar para continuar o envio.'),
          });
        }
      }
    };

    hydrateActiveUploads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <UploadManagerContext.Provider
      value={{
        uploads,
        isDrawerOpen,
        setIsDrawerOpen,
        isMinimized,
        setIsMinimized,
        enqueueUpload,
        enqueueMultipleUploads,
        pauseUpload,
        resumeUpload,
        cancelUpload,
        clearCompleted,
      }}
    >
      {children}
    </UploadManagerContext.Provider>
  );
}

const defaultContextValue: UploadManagerContextType = {
  uploads: [],
  isDrawerOpen: false,
  setIsDrawerOpen: () => {},
  isMinimized: false,
  setIsMinimized: () => {},
  enqueueUpload: async () => '',
  enqueueMultipleUploads: async () => {},
  pauseUpload: () => {},
  resumeUpload: async () => {},
  cancelUpload: () => {},
  clearCompleted: () => {},
};

export function useUploadManager() {
  const ctx = useContext(UploadManagerContext);
  return ctx || defaultContextValue;
}
