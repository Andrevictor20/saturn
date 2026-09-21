import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ComposeWizardTab } from '../../../components/docker/ComposeWizardTab';
import { ComposeInstallModal } from '../../../components/docker/ComposeInstallModal';
import { InstallProvider } from '../../../contexts/InstallContext';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('ComposeWizardTab Component', () => {
  const mockOnTransferToEditor = vi.fn();
  const mockOnDeployDirect = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/api/system/settings/check-port')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ available: true, in_use: false }),
          });
        }
        if (url.includes('/api/docker/compose/stacks')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([]),
          });
        }
        return Promise.reject(new Error('Not found'));
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders form with default values and inputs', () => {
    render(
      <ComposeWizardTab
        onTransferToEditor={mockOnTransferToEditor}
        onDeployDirect={mockOnDeployDirect}
      />
    );

    expect(screen.getByPlaceholderText('ex: meu-site-web')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('ex: nginx:alpine, redis:7')).toBeInTheDocument();
    expect(screen.getByText('Mapeamento de Portas')).toBeInTheDocument();
    expect(screen.getByText('Volumes & Armazenamento')).toBeInTheDocument();
    expect(screen.getByText('Variáveis de Ambiente')).toBeInTheDocument();
  });

  it('adds and removes port, volume, and environment variable rows', () => {
    render(
      <ComposeWizardTab
        onTransferToEditor={mockOnTransferToEditor}
        onDeployDirect={mockOnDeployDirect}
      />
    );

    // Initial port 8080:80 is present
    expect(screen.getAllByPlaceholderText('Porta Container (ex: 80)').length).toBe(1);

    // Add port
    const addPortBtn = screen.getByText('Adicionar Porta');
    fireEvent.click(addPortBtn);
    expect(screen.getAllByPlaceholderText('Porta Container (ex: 80)').length).toBe(2);

    // Add volume
    const addVolumeBtn = screen.getByText('Adicionar Volume');
    fireEvent.click(addVolumeBtn);
    expect(screen.getByPlaceholderText('No Contêiner (ex: /var/lib/data)')).toBeInTheDocument();

    // Add env
    const addEnvBtn = screen.getByText('Adicionar Variável');
    fireEvent.click(addEnvBtn);
    expect(screen.getByPlaceholderText('CHAVE (ex: DB_PASSWORD)')).toBeInTheDocument();
  });

  it('checks port availability when clicking testar', async () => {
    render(
      <ComposeWizardTab
        onTransferToEditor={mockOnTransferToEditor}
        onDeployDirect={mockOnDeployDirect}
      />
    );

    const testPortBtn = screen.getByText('Testar');
    fireEvent.click(testPortBtn);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/system/settings/check-port?port=8080'),
        expect.anything()
      );
    });
  });

  it('calls onTransferToEditor with generated YAML and service name', () => {
    render(
      <ComposeWizardTab
        onTransferToEditor={mockOnTransferToEditor}
        onDeployDirect={mockOnDeployDirect}
      />
    );

    const imageInput = screen.getByPlaceholderText('ex: nginx:alpine, redis:7');
    fireEvent.change(imageInput, { target: { value: 'nginx:alpine' } });

    const nameInput = screen.getByPlaceholderText('ex: meu-site-web');
    fireEvent.change(nameInput, { target: { value: 'custom-web' } });

    const generateBtn = screen.getByText('Gerar Compose & Abrir Editor');
    fireEvent.click(generateBtn);

    expect(mockOnTransferToEditor).toHaveBeenCalledWith(
      expect.stringContaining('services:\n  custom-web:'),
      'custom-web'
    );
  });

  it('switches to wizard tab inside ComposeInstallModal and uses wizard', async () => {
    render(
      <InstallProvider>
        <ComposeInstallModal isOpen={true} onClose={mockOnClose} />
      </InstallProvider>
    );

    const wizardTabBtn = screen.getByRole('button', { name: /assistente visual/i });
    fireEvent.click(wizardTabBtn);

    expect(screen.getByPlaceholderText('ex: meu-site-web')).toBeInTheDocument();
    expect(screen.getByText('Gerar Compose & Abrir Editor')).toBeInTheDocument();
  });
});
