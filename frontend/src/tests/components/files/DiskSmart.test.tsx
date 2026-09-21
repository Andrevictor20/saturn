import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DiskSmartSection } from '../../../components/files/DiskSmartSection';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultVal?: any) => (typeof defaultVal === 'string' ? defaultVal : key),
  }),
}));

describe('DiskSmartSection Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(() => {})));
    render(<DiskSmartSection />);
    expect(screen.getByText(/Lendo sensores físicos e registros S.M.A.R.T.../i)).toBeInTheDocument();
  });

  it('renders disks with SMART health telemetry when fetch succeeds', async () => {
    const mockDisks = [
      {
        device: '/dev/nvme0n1',
        name: 'Samsung SSD 980 PRO 1TB',
        model: 'Samsung SSD 980 PRO',
        disk_type: 'nvme',
        size_bytes: 1000204886016,
        health_status: 'passed',
        passed: true,
        temperature: 38,
        power_on_hours: 4512,
        wear_out_percent: 97,
        reallocated_sectors: 0,
        smart_supported: true,
      },
      {
        device: '/dev/sda',
        name: 'WDC WD40EFRX 4TB',
        model: 'WDC WD40EFRX',
        disk_type: 'hdd',
        size_bytes: 4000787030016,
        health_status: 'passed',
        passed: true,
        temperature: 32,
        power_on_hours: 18200,
        wear_out_percent: undefined,
        reallocated_sectors: 0,
        smart_supported: true,
      },
    ];

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockDisks,
      })
    );

    render(<DiskSmartSection />);

    await waitFor(() => {
      expect(screen.getByText('Samsung SSD 980 PRO 1TB')).toBeInTheDocument();
      expect(screen.getByText('WDC WD40EFRX 4TB')).toBeInTheDocument();
    });

    expect(screen.getByText('38°C')).toBeInTheDocument();
    expect(screen.getByText('32°C')).toBeInTheDocument();
    expect(screen.getByText('97%')).toBeInTheDocument();
    expect(screen.getAllByText('Saudável (PASSED)').length).toBe(2);
  });

  it('renders warning badge when sectors are reallocated or health is warning', async () => {
    const mockFailingDisk = [
      {
        device: '/dev/sdb',
        name: 'Old Disk 500GB',
        model: 'Old Disk',
        disk_type: 'hdd',
        size_bytes: 500107862016,
        health_status: 'warning',
        passed: true,
        temperature: 46,
        reallocated_sectors: 24,
        smart_supported: true,
      },
    ];

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockFailingDisk,
      })
    );

    render(<DiskSmartSection />);

    await waitFor(() => {
      expect(screen.getByText('Old Disk 500GB')).toBeInTheDocument();
    });

    expect(screen.getByText('Atenção')).toBeInTheDocument();
    expect(screen.getByText('46°C')).toBeInTheDocument();
  });
});
