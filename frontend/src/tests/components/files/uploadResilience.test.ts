import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  computeBackoffMs,
  isRetryableStatus,
  waitForOnline,
  acquireUploadKeepAlive,
  MAX_BACKOFF_MS,
  MAX_CHUNK_RETRIES,
} from '../../../utils/uploadResilience';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('computeBackoffMs', () => {
  it('cresce exponencialmente a partir de 1s', () => {
    expect(computeBackoffMs(0)).toBe(1000);
    expect(computeBackoffMs(1)).toBe(2000);
    expect(computeBackoffMs(3)).toBe(8000);
  });

  it('respeita o teto de 30s', () => {
    expect(MAX_BACKOFF_MS).toBe(30_000);
    expect(computeBackoffMs(10)).toBe(30_000);
  });

  it('permite pelo menos 10 tentativas por chunk', () => {
    expect(MAX_CHUNK_RETRIES).toBeGreaterThanOrEqual(10);
  });
});

describe('isRetryableStatus', () => {
  it.each([
    [429, true],
    [500, true],
    [502, true],
    [503, true],
    [408, true],
    [400, false],
    [401, false],
    [403, false],
    [413, false],
    [200, false],
  ])('status %i => %s', (status, expected) => {
    expect(isRetryableStatus(status)).toBe(expected);
  });
});

describe('waitForOnline', () => {
  it('resolve imediatamente quando já está online', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    await expect(waitForOnline(new AbortController().signal)).resolves.toBe(true);
  });

  it('aguarda o evento online quando offline', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const p = waitForOnline(new AbortController().signal);
    window.dispatchEvent(new Event('online'));
    await expect(p).resolves.toBe(true);
  });

  it('resolve false quando abortado enquanto offline', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const controller = new AbortController();
    const p = waitForOnline(controller.signal);
    controller.abort();
    await expect(p).resolves.toBe(false);
  });
});

describe('acquireUploadKeepAlive', () => {
  it('segura um Web Lock até release() ser chamado', async () => {
    let lockReleased = false;
    const request = vi.fn((_name: string, _opts: unknown, cb: () => Promise<void>) =>
      cb().then(() => {
        lockReleased = true;
      }),
    );
    vi.stubGlobal('navigator', { locks: { request }, onLine: true });

    const release = acquireUploadKeepAlive();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe('saturn-upload-keepalive');
    expect(lockReleased).toBe(false);

    release();
    await Promise.resolve();
    await Promise.resolve();
    expect(lockReleased).toBe(true);
  });

  it('é no-op seguro quando Web Locks não é suportado', () => {
    vi.stubGlobal('navigator', { onLine: true });
    const release = acquireUploadKeepAlive();
    expect(() => release()).not.toThrow();
  });
});
