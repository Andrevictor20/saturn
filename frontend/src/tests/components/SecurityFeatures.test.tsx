import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ActiveSessionsSection } from '../../components/auth/ActiveSessionsSection';
import { BlockedIpsSection } from '../../components/layout/BlockedIpsSection';

describe('ActiveSessionsSection component', () => {
  let originalFetch: typeof window.fetch;

  beforeEach(() => {
    originalFetch = window.fetch;
  });

  afterEach(() => {
    window.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders active sessions and allows revoking a session', async () => {
    const mockSessions = [
      {
        id: 'sess-1',
        username: 'admin',
        ip: '192.168.1.50',
        user_agent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0',
        created_at: 1700000000,
        last_active_at: 1700001000,
        is_current: true,
        device_type: 'desktop',
      },
      {
        id: 'sess-2',
        username: 'admin',
        ip: '10.0.0.99',
        user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16) Safari/604.1',
        created_at: 1700000500,
        last_active_at: 1700000800,
        is_current: false,
        device_type: 'mobile',
      },
    ];

    window.fetch = vi.fn().mockImplementation((url, options) => {
      if (url === '/api/auth/sessions' && !options?.method) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockSessions),
        });
      }
      if (url === '/api/auth/sessions/sess-2' && options?.method === 'DELETE') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ status: 'revoked' }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(<ActiveSessionsSection />);

    await waitFor(() => {
      expect(screen.getByText('Sessões Ativas & Dispositivos')).toBeInTheDocument();
      expect(screen.getByText('Esta sessão')).toBeInTheDocument();
      expect(screen.getByText('192.168.1.50')).toBeInTheDocument();
      expect(screen.getByText('10.0.0.99')).toBeInTheDocument();
    });

    // Revoke second session
    const revokeBtn = screen.getByTitle('Encerrar esta sessão');
    fireEvent.click(revokeBtn);

    await waitFor(() => {
      expect(screen.queryByText('10.0.0.99')).not.toBeInTheDocument();
    });
  });
});

describe('BlockedIpsSection component', () => {
  let originalFetch: typeof window.fetch;

  beforeEach(() => {
    originalFetch = window.fetch;
  });

  afterEach(() => {
    window.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders empty state when no IPs are blocked', async () => {
    window.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve([]),
      })
    );

    render(<BlockedIpsSection />);

    await waitFor(() => {
      expect(screen.getByText('Nenhum IP bloqueado no momento')).toBeInTheDocument();
    });
  });

  it('renders blocked IPs and unblocks an IP on action', async () => {
    const mockBlocked = [
      {
        ip: '203.0.113.88',
        attempts: 5,
        blocked_at: 1700000000,
        expires_at: Math.floor(Date.now() / 1000) + 600,
        reason: 'Múltiplas tentativas de autenticação incorretas',
      },
    ];

    window.fetch = vi.fn().mockImplementation((url, options) => {
      if (url === '/api/auth/security/blocked-ips') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockBlocked),
        });
      }
      if (url === '/api/auth/security/unblock-ip' && options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ status: 'unblocked' }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(<BlockedIpsSection />);

    await waitFor(() => {
      expect(screen.getByText('203.0.113.88')).toBeInTheDocument();
      expect(screen.getByText('5 tentativas')).toBeInTheDocument();
      expect(screen.getByText('Desbloquear')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Desbloquear'));

    await waitFor(() => {
      expect(screen.queryByText('203.0.113.88')).not.toBeInTheDocument();
    });
  });
});
