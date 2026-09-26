import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProcessMonitor } from '../../components/metrics/ProcessMonitor';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const mockProcessesData = {
  total_processes: 3,
  running_processes: 1,
  sleeping_processes: 2,
  zombie_processes: 0,
  host_processes_count: 1,
  container_processes_count: 2,
  top_cpu_process: {
    pid: 101,
    name: 'ar-saude-coletor',
    value: 12.5,
    container_name: 'ar-saude-coletor'
  },
  top_memory_process: {
    pid: 102,
    name: 'grafana-server',
    value: 150 * 1024 * 1024,
    container_name: 'grafana'
  },
  total_cpu_usage: 15.0,
  total_memory_used: 1024 * 1024 * 1024,
  total_memory_available: 4 * 1024 * 1024 * 1024,
  processes: [
    {
      pid: 101,
      ppid: 1,
      name: 'ar-saude-coletor',
      cmd: ['/usr/bin/coletor', '--debug'],
      exe: '/usr/bin/coletor',
      user: 'root',
      cpu_usage: 12.5,
      memory_rss: 50 * 1024 * 1024,
      memory_vms: 100 * 1024 * 1024,
      memory_percent: 1.2,
      status: 'Running',
      container_id: 'a1b2c3d4e5f6',
      container_name: 'ar-saude-coletor',
      start_time: 1000,
      disk_read_bytes: 1024,
      disk_written_bytes: 2048,
    },
    {
      pid: 102,
      ppid: 1,
      name: 'grafana-server',
      cmd: ['/usr/share/grafana/bin/grafana-server'],
      exe: '/usr/share/grafana/bin/grafana-server',
      user: 'grafana',
      cpu_usage: 2.1,
      memory_rss: 150 * 1024 * 1024,
      memory_vms: 300 * 1024 * 1024,
      memory_percent: 3.6,
      status: 'Sleeping',
      container_id: 'b2c3d4e5f6a1',
      container_name: 'grafana',
      start_time: 1050,
      disk_read_bytes: 4096,
      disk_written_bytes: 8192,
    },
    {
      pid: 201,
      ppid: 1,
      name: 'systemd-journald',
      cmd: ['/usr/lib/systemd/systemd-journald'],
      exe: '/usr/lib/systemd/systemd-journald',
      user: 'root',
      cpu_usage: 0.5,
      memory_rss: 20 * 1024 * 1024,
      memory_vms: 40 * 1024 * 1024,
      memory_percent: 0.5,
      status: 'Sleeping',
      container_id: undefined,
      container_name: undefined,
      start_time: 500,
      disk_read_bytes: 512,
      disk_written_bytes: 1024,
    }
  ]
};

describe('ProcessMonitor Component', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url) => {
      if (url.includes('/api/system/processes')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockProcessesData)
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders process monitor KPIs and table', async () => {
    render(<ProcessMonitor />);

    await waitFor(() => {
      expect(screen.getByText('Total de Processos')).toBeTruthy();
      expect(screen.getAllByText('ar-saude-coletor').length).toBeGreaterThan(0);
      expect(screen.getAllByText('grafana-server').length).toBeGreaterThan(0);
      expect(screen.getByText('systemd-journald')).toBeTruthy();
    });
  });

  it('filters processes by search query', async () => {
    render(<ProcessMonitor />);

    await waitFor(() => {
      expect(screen.getAllByText('ar-saude-coletor').length).toBeGreaterThan(0);
    });

    const searchInput = screen.getByPlaceholderText(/PID/i);
    fireEvent.change(searchInput, { target: { value: 'journald' } });

    await waitFor(() => {
      expect(screen.getByText('systemd-journald')).toBeTruthy();
      // Table should only contain journald, grafana-server should not be in the table
      const grafanaMatches = screen.queryAllByText('grafana-server');
      // Only 1 match in the KPI header, none in the table
      expect(grafanaMatches.length).toBe(1);
    });
  });

  it('opens process details modal when details button is clicked', async () => {
    render(<ProcessMonitor />);

    await waitFor(() => {
      expect(screen.getByText('systemd-journald')).toBeTruthy();
    });

    const infoButtons = screen.getAllByTitle('Ver detalhes do processo');
    expect(infoButtons.length).toBe(3);

    fireEvent.click(infoButtons[2]);

    await waitFor(() => {
      expect(screen.getByText('Linha de Comando Completa (Arguments):')).toBeTruthy();
      expect(screen.getAllByText('/usr/lib/systemd/systemd-journald').length).toBeGreaterThan(0);
    });
  });

  it('opens process details modal when clicking on a process row in the table', async () => {
    render(<ProcessMonitor />);

    await waitFor(() => {
      expect(screen.getByText('systemd-journald')).toBeTruthy();
    });

    const rowName = screen.getByText('systemd-journald');
    fireEvent.click(rowName);

    await waitFor(() => {
      expect(screen.getByText('Linha de Comando Completa (Arguments):')).toBeTruthy();
      expect(screen.getAllByText('PID: 201').length).toBeGreaterThan(0);
    });
  });

  it('opens process details modal when clicking on top CPU or top RAM process cards', async () => {
    render(<ProcessMonitor />);

    await waitFor(() => {
      expect(screen.getByTestId('top-cpu-process-card')).toBeTruthy();
    });

    const topCpuCard = screen.getByTestId('top-cpu-process-card');
    fireEvent.click(topCpuCard);

    await waitFor(() => {
      expect(screen.getByText('Linha de Comando Completa (Arguments):')).toBeTruthy();
      expect(screen.getAllByText('PID: 101').length).toBeGreaterThan(0);
    });
  });
});

