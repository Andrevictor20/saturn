import { render, screen } from '@testing-library/react';
import { AlertsPanel } from '../../../components/metrics/AlertsPanel';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';

vi.mock('../../../contexts/AlertsContext', () => ({
  useAlerts: vi.fn()
}));
import { useAlerts } from '../../../contexts/AlertsContext';

describe('AlertsPanel', () => {
  it('renders healthy state when no alerts exist covering 48 hours', () => {
    (useAlerts as any).mockReturnValue({ alerts: [], loading: false, error: null });
    render(<AlertsPanel />);
    expect(screen.getByText('Sistemas Estáveis')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma anomalia registrada nas últimas 48h.')).toBeInTheDocument();
    expect(screen.getByText('Avisos & Insights (Últimas 48h)')).toBeInTheDocument();
  });

  it('renders warning alert correctly with formatted date and time', () => {
    const fixedTime = new Date('2026-09-25T14:30:00Z').getTime();
    const mockAlerts = [{
      id: '1',
      timestamp: fixedTime,
      level: 'warning',
      title: 'Alta Temperatura',
      message: 'A temperatura do host atingiu 82°C.',
      source: 'metrics'
    }];
    (useAlerts as any).mockReturnValue({ alerts: mockAlerts, loading: false, error: null });
    render(<AlertsPanel />);
    expect(screen.getByText('Alta Temperatura')).toBeInTheDocument();
    expect(screen.getByText('A temperatura do host atingiu 82°C.')).toBeInTheDocument();
    // Verify badge contains both date and time (e.g. 25/09 and 14:30 or equivalent)
    const expectedDateTime = new Date(fixedTime).toLocaleString([], {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    expect(screen.getByText(expectedDateTime)).toBeInTheDocument();
  });

  it('renders critical alert correctly', () => {
    const mockAlerts = [{
      id: '2',
      timestamp: Date.now(),
      level: 'critical',
      title: 'Alto Consumo de RAM',
      message: 'O uso de memória RAM está em 95%.',
      source: 'metrics'
    }];
    (useAlerts as any).mockReturnValue({ alerts: mockAlerts, loading: false, error: null });
    render(<AlertsPanel />);
    expect(screen.getByText('Alto Consumo de RAM')).toBeInTheDocument();
    expect(screen.getByText('O uso de memória RAM está em 95%.')).toBeInTheDocument();
  });
});

