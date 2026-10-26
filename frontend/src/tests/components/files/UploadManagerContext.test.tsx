import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import {
  UploadManagerProvider,
  useUploadManager,
  UploadItem,
} from '../../../contexts/UploadManagerContext';
import * as uploadDb from '../../../utils/uploadDb';

// --- Mocks de I/O externo (nunca mockar a unidade sob teste) ---

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultVal?: any) =>
      typeof defaultVal === 'string' ? defaultVal : key,
  }),
}));

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

// uploadDb é a camada de I/O do IndexedDB (fronteira externa). Mockamos as
// funções para controlar se o arquivo está ou não disponível na hidratação.
vi.mock('../../../utils/uploadDb', () => ({
  saveFileToDb: vi.fn(),
  getFileFromDb: vi.fn(),
  removeFileFromDb: vi.fn(),
  getUploadMetadata: vi.fn(),
}));

// --- Harness de teste ---

let capturedCtx: ReturnType<typeof useUploadManager> | null = null;

function ContextCapture() {
  capturedCtx = useUploadManager();
  return null;
}

function makeUploadItem(overrides: Partial<UploadItem> = {}): UploadItem {
  return {
    id: 'upl-error-1',
    fileName: 'video.mp4',
    fileSize: 100 * 1024 * 1024,
    destinationPath: '/DATA/videos',
    chunkSize: 5 * 1024 * 1024,
    totalChunks: 20,
    uploadedChunks: [0, 1, 2],
    progress: 15,
    speedMBs: 0,
    status: 'error',
    error: 'Falha de rede',
    createdAt: Date.now() - 10000,
    ...overrides,
  };
}

const mockFile = new File(['mock video content'], 'video.mp4', {
  type: 'video/mp4',
});

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  capturedCtx = null;

  // Mock fetch para evitar chamadas de rede reais durante processUpload
  (globalThis.fetch as any) = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ received_chunks: [] }),
    text: async () => 'OK',
  });
});

afterEach(() => {
  capturedCtx = null;
  (globalThis.fetch as any) = undefined;
});

// --- Testes de regressão: hidratação após F5 com status 'error' ---

describe('UploadManagerContext — hidratação de uploads com erro após F5', () => {
  it('AC1: mantém itens com status error na lista após hidratação (não somem)', async () => {
    const item = makeUploadItem({ status: 'error' });
    localStorage.setItem('saturn_active_uploads', JSON.stringify([item]));

    (uploadDb.getFileFromDb as any).mockResolvedValue(null);

    render(
      <UploadManagerProvider>
        <ContextCapture />
      </UploadManagerProvider>
    );

    await waitFor(() => {
      expect(capturedCtx).not.toBeNull();
      expect(capturedCtx!.uploads.length).toBe(1);
    });

    const hydrated = capturedCtx!.uploads.find((u) => u.id === 'upl-error-1');
    expect(hydrated).not.toBeUndefined();
    expect(hydrated!.status).toBe('error');
    expect(hydrated!.fileName).toBe('video.mp4');
  });

  it('AC2: item com error e arquivo no IndexedDB pode ser retomado via resumeUpload', async () => {
    const item = makeUploadItem({ status: 'error' });
    localStorage.setItem('saturn_active_uploads', JSON.stringify([item]));

    (uploadDb.getFileFromDb as any).mockResolvedValue(mockFile);

    render(
      <UploadManagerProvider>
        <ContextCapture />
      </UploadManagerProvider>
    );

    await waitFor(() => {
      expect(capturedCtx!.uploads.length).toBe(1);
      expect(capturedCtx!.uploads[0].status).toBe('error');
    });

    // Hidratação leu o arquivo do IndexedDB
    expect(uploadDb.getFileFromDb).toHaveBeenCalledWith('upl-error-1');

    // Retomada deve iniciar processUpload (fetch é chamado para checar status)
    await capturedCtx!.resumeUpload('upl-error-1');

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    const updated = capturedCtx!.uploads.find((u) => u.id === 'upl-error-1');
    expect(updated!.status).not.toBe('error');
  });

  it('AC3: item com error sem arquivo no IndexedDB mantém mensagem de erro clara após hidratação', async () => {
    const item = makeUploadItem({
      status: 'error',
      error: 'Erro antigo de rede',
    });
    localStorage.setItem('saturn_active_uploads', JSON.stringify([item]));

    (uploadDb.getFileFromDb as any).mockResolvedValue(null);

    render(
      <UploadManagerProvider>
        <ContextCapture />
      </UploadManagerProvider>
    );

    await waitFor(() => {
      expect(capturedCtx!.uploads.length).toBe(1);
    });

    const hydrated = capturedCtx!.uploads[0];
    expect(hydrated.status).toBe('error');
    // A mensagem antiga deve ser substituída pela clara de indisponibilidade local
    expect(hydrated.error).toBe(
      'Arquivo não está mais disponível localmente. Reenvie o arquivo.'
    );
    expect(hydrated.error).not.toBe('Erro antigo de rede');
  });

  it('AC4: resumeUpload chama processUpload quando o arquivo está disponível', async () => {
    const item = makeUploadItem({ status: 'error' });
    localStorage.setItem('saturn_active_uploads', JSON.stringify([item]));

    (uploadDb.getFileFromDb as any).mockResolvedValue(mockFile);

    render(
      <UploadManagerProvider>
        <ContextCapture />
      </UploadManagerProvider>
    );

    await waitFor(() => {
      expect(capturedCtx!.uploads.length).toBe(1);
    });

    // Antes de retomar, fetch não deve ter sido chamado (hidratação de error não chama fetch)
    expect(globalThis.fetch).not.toHaveBeenCalled();

    await capturedCtx!.resumeUpload('upl-error-1');

    // processUpload deve chamar fetch para verificar status no servidor
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    // Verifica que fetch foi chamado com a URL de status do upload
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/files/upload/status?upload_id=upl-error-1',
      expect.objectContaining({ signal: expect.anything() })
    );
  });
});
