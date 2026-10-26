/**
 * IndexedDB storage for resumable large file uploads across page reloads (F5 resistance).
 *
 * Para evitar estourar a cota do navegador com vídeos grandes, o blob do File
 * é gravado apenas quando há cota disponível. Em caso de QuotaExceededError,
 * grava apenas metadados leves (nome, tamanho, tipo, caminho, chunks) e
 * reporta savedBlob: false para que o contexto avise o usuário de que a
 * retomada após recarregar a página (F5) não estará disponível para esse arquivo.
 */

const DB_NAME = 'saturn_uploads_db';
const DB_VERSION = 1;
const STORE_NAME = 'files';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export interface StoredUploadFile {
  id: string;
  file?: File;
  name: string;
  size: number;
  type: string;
  addedAt: number;
  destinationPath?: string;
  totalChunks?: number;
  uploadedChunks?: number[];
}

export interface SaveFileResult {
  savedBlob: boolean;
}

function isQuotaExceeded(err: unknown): boolean {
  return err != null && typeof err === 'object' && 'name' in err && (err as { name?: string }).name === 'QuotaExceededError';
}

function putRecord(db: IDBDatabase, record: StoredUploadFile): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(record);
    let settled = false;
    req.onsuccess = () => {
      settled = true;
      resolve();
    };
    req.onerror = () => {
      settled = true;
      reject(req.error);
    };
    tx.onerror = () => {
      if (!settled) {
        settled = true;
        reject(tx.error);
      }
    };
  });
}

/**
 * Grava o arquivo no IndexedDB. Se a cota do navegador estiver esgotada
 * (QuotaExceededError), grava apenas metadados leves sem o blob e retorna
 * savedBlob: false. Outros erros são propagados (não silenciados).
 */
export async function saveFileToDb(id: string, file: File): Promise<SaveFileResult> {
  const db = await openDb();
  const fullRecord: StoredUploadFile = {
    id,
    file,
    name: file.name,
    size: file.size,
    type: file.type,
    addedAt: Date.now(),
  };

  try {
    await putRecord(db, fullRecord);
    return { savedBlob: true };
  } catch (err) {
    if (isQuotaExceeded(err)) {
      const lightRecord: StoredUploadFile = {
        id,
        name: file.name,
        size: file.size,
        type: file.type,
        addedAt: Date.now(),
      };
      await putRecord(db, lightRecord);
      return { savedBlob: false };
    }
    throw err;
  }
}

/**
 * Lê o File salvo no IndexedDB. Retorna null quando não há blob (ex: só
 * metadados leves por causa de cota esgotada) ou quando o registro não existe.
 */
export async function getFileFromDb(id: string): Promise<File | null> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => {
        const res = req.result as StoredUploadFile | undefined;
        resolve(res?.file ?? null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('[IndexedDB] Failed to read file blob:', err);
    return null;
  }
}

/**
 * Lê apenas os metadados leves de um upload armazenado (útil quando o blob
 * não foi gravado por exceder a cota do IndexedDB).
 */
export async function getUploadMetadata(id: string): Promise<StoredUploadFile | null> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => {
        const res = req.result as StoredUploadFile | undefined;
        resolve(res ?? null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('[IndexedDB] Failed to read upload metadata:', err);
    return null;
  }
}

export async function removeFileFromDb(id: string): Promise<void> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('[IndexedDB] Failed to remove file blob:', err);
  }
}
