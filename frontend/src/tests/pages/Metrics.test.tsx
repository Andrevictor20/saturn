import { render, screen, fireEvent } from '@testing-library/react';
import { Metrics } from '../../pages/Metrics';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('recharts', () => {
  return {
    ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
    AreaChart: ({ children }: any) => <div data-testid="area-chart">{children}</div>,
    Area: (props: any) => (
      <div 
        data-testid={`area-${props.dataKey}`} 
        data-name={props.name}
        data-stroke={props.stroke}
        data-animation={props.isAnimationActive ? 'true' : 'false'}
      />
    ),
    XAxis: () => <div data-testid="xaxis" />,
    YAxis: () => <div data-testid="yaxis" />,
    CartesianGrid: () => <div data-testid="grid" />,
    Tooltip: () => <div data-testid="tooltip" />,
  };
});

vi.mock('../../contexts/StatsContext', () => ({
  useStats: vi.fn(),
  StatsProvider: ({ children }: any) => children,
}));

vi.mock('../../components/metrics/AlertsPanel', () => ({ 
  AlertsPanel: () => <div data-testid="alerts-mock">Alerts</div> 
}));

vi.mock('../../components/metrics/ProcessMonitor', () => ({
  ProcessMonitor: () => <div data-testid="process-monitor-mock">Process Monitor View</div>
}));

import { useStats } from '../../contexts/StatsContext';
import { MemoryRouter } from 'react-router-dom';

describe('Metrics Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders disconnected state when stats are missing', () => {
    (useStats as any).mockReturnValue({
      stats: null,
      history: [],
      isConnected: false
    });

    render(<MemoryRouter><Metrics /></MemoryRouter>);
    expect(screen.getByText('Métricas do Sistema')).toBeTruthy();
  });

  it('renders both Host and Containers network monitoring with live rates and area series', async () => {
    const mockStats = {
      cpu_usage: 12.5,
      memory_used: 4 * 1024 * 1024 * 1024,
      memory_total: 16 * 1024 * 1024 * 1024,
      disks: [],
      network_tx: 512 * 1024, // 512 KB/s
      network_rx: 1024 * 1024, // 1 MB/s
      temperature: 45.0,
      docker_cpu: 8.0,
      docker_memory: 2 * 1024 * 1024 * 1024,
      docker_tx: 256 * 1024, // 256 KB/s
      docker_rx: 200 * 1024, // 200 KB/s
      saturn_cpu: 0.5,
      saturn_memory: 50 * 1024 * 1024,
      network_interface: 'eth0',
      network_interface_type: 'ethernet',
    };

    const mockHistory = [
      {
        time: '12:00:00',
        timestamp: Date.now() - 1000,
        cpu: 12.5,
        dockerCpu: 8.0,
        saturnCpu: 0.5,
        memory: 4000000000,
        dockerMemory: 2000000000,
        saturnMemory: 50000000,
        tx: 512 * 1024,
        rx: 1024 * 1024,
        dockerTx: 256 * 1024,
        dockerRx: 200 * 1024,
      }
    ];

    (useStats as any).mockReturnValue({
      stats: mockStats,
      history: mockHistory,
      isConnected: true
    });

    render(<MemoryRouter><Metrics /></MemoryRouter>);

    // Verify network interface badge is present
    expect(screen.getByText(/eth0/i)).toBeTruthy();

    // Verify both Host and Containers areas are rendered
    const hostRxArea = screen.getByTestId('area-rx');
    const hostTxArea = screen.getByTestId('area-tx');
    const dockerRxArea = screen.getByTestId('area-dockerRx');
    const dockerTxArea = screen.getByTestId('area-dockerTx');

    expect(hostRxArea).toBeTruthy();
    expect(hostRxArea.getAttribute('data-name')).toBe('Host Download');
    expect(hostTxArea.getAttribute('data-name')).toBe('Host Upload');
    expect(dockerRxArea.getAttribute('data-name')).toBe('Containers Download');
    expect(dockerTxArea.getAttribute('data-name')).toBe('Containers Upload');

    // In 'overview' tab, all series have non-transparent stroke
    expect(hostRxArea.getAttribute('data-stroke')).toBe('#38bdf8');
    expect(hostTxArea.getAttribute('data-stroke')).toBe('#818cf8');
    expect(dockerRxArea.getAttribute('data-stroke')).toBe('#fb923c');
    expect(dockerTxArea.getAttribute('data-stroke')).toBe('#f43f5e');

    // Verify live rate labels in header
    expect(screen.getByText('Host:')).toBeTruthy();
    expect(screen.getByText('Containers:')).toBeTruthy();

    // Switch to 'Host' tab
    const hostTabButton = screen.getByRole('button', { name: /host/i });
    fireEvent.click(hostTabButton);

    // In 'system' tab, Host areas remain visible, while Containers areas become transparent
    expect(screen.getByTestId('area-rx').getAttribute('data-stroke')).toBe('#38bdf8');
    expect(screen.getByTestId('area-tx').getAttribute('data-stroke')).toBe('#818cf8');
    expect(screen.getByTestId('area-dockerRx').getAttribute('data-stroke')).toBe('transparent');
    expect(screen.getByTestId('area-dockerTx').getAttribute('data-stroke')).toBe('transparent');
  });

  it('renders extended time ranges 12h, 24h, 72h and enables fluid animations on areas', () => {
    const mockStats = {
      cpu_usage: 10.0,
      memory_used: 1024,
      memory_total: 2048,
      disks: [],
      network_tx: 100,
      network_rx: 200,
      temperature: 40.0,
      docker_cpu: 5.0,
      docker_memory: 512,
      docker_tx: 50,
      docker_rx: 100,
      saturn_cpu: 1.0,
      saturn_memory: 100,
    };

    (useStats as any).mockReturnValue({
      stats: mockStats,
      history: [{ time: '12:00:00', timestamp: Date.now(), cpu: 10, dockerCpu: 5, saturnCpu: 1, memory: 1024, dockerMemory: 512, saturnMemory: 100, tx: 100, rx: 200, dockerTx: 50, dockerRx: 100 }],
      isConnected: true
    });

    render(<MemoryRouter><Metrics /></MemoryRouter>);

    // Verify 12h, 24h and 72h period buttons are rendered
    expect(screen.getByRole('button', { name: /12 horas/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /24 horas/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /72 horas/i })).toBeTruthy();

    // Verify fluid animation is active (not disabled)
    const hostRxArea = screen.getByTestId('area-rx');
    expect(hostRxArea.getAttribute('data-animation')).toBe('true');
  });
});

