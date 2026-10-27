// Utilitários de resiliência do upload em segundo plano (rede instável, aba oculta/congelada).

export const MAX_CHUNK_RETRIES = 10; // tentativas extras por chunk antes de marcar erro
export const CHUNK_RETRY_BACKOFF_MS = 1000; // backoff inicial entre tentativas (ms)
export const MAX_BACKOFF_MS = 30_000; // teto do backoff exponencial (ms)
export const CHUNK_REQUEST_TIMEOUT_MS = 60_000; // timeout por requisição de chunk (ms)

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Backoff exponencial com teto: 1s, 2s, 4s, ... até 30s. */
export const computeBackoffMs = (attempt: number): number =>
  Math.min(CHUNK_RETRY_BACKOFF_MS * Math.pow(2, attempt), MAX_BACKOFF_MS);

/** Falhas transitórias que valem retry (timeout, rate-limit, erros de servidor). */
export const isRetryableStatus = (status: number): boolean =>
  status === 408 || status === 429 || status >= 500;

/** Fetch com timeout explícito; aborta a requisição se o timeout expirar. */
export const fetchWithTimeout = (
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> => {
  let timeoutTimer: ReturnType<typeof setTimeout>;
  const controller = new AbortController();
  const outer = init.signal;
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener('abort', () => controller.abort(), { once: true });
  }
  const promise = fetch(url, { ...init, signal: controller.signal });

  const timeoutPromise = new Promise<Response>((_, reject) => {
    timeoutTimer = setTimeout(() => {
      controller.abort();
      reject(new Error(`Tempo esgotado após ${timeoutMs / 1000}s`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutTimer));
};

/**
 * Resolve `true` assim que o navegador estiver online (imediato se já estiver),
 * ou `false` se o signal for abortado enquanto offline.
 */
export const waitForOnline = (signal: AbortSignal): Promise<boolean> => {
  if (typeof navigator === 'undefined' || navigator.onLine !== false) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    const cleanup = () => {
      window.removeEventListener('online', onOnline);
      signal.removeEventListener('abort', onAbort);
    };
    const onOnline = () => {
      cleanup();
      resolve(true);
    };
    const onAbort = () => {
      cleanup();
      resolve(false);
    };
    window.addEventListener('online', onOnline);
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  });
};

/**
 * Mantém a aba "viva" durante o upload: um Web Lock ativo impede o Chrome de
 * congelar a aba em segundo plano. Retorna a função que libera o lock.
 * No-op seguro quando a API não é suportada.
 */
export const acquireUploadKeepAlive = (): (() => void) => {
  let release: () => void = () => {};
  if (typeof navigator === 'undefined' || !navigator.locks?.request) return release;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  navigator.locks.request('saturn-upload-keepalive', { mode: 'shared' }, () => held).catch(() => {});
  return () => release();
};

// Estima a cota de armazenamento do navegador (IndexedDB) para decidir se é
// seguro gravar o blob inteiro de um arquivo grande antes do upload.
export async function estimateIndexedDbQuota(): Promise<{ usage: number; quota: number; percentage: number } | null> {
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
