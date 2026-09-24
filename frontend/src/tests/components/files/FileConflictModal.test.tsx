import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FileConflictModal } from '../../../components/files/FileConflictModal';

describe('FileConflictModal Component', () => {
  const defaultProps = {
    fileName: 'config.yaml',
    serverContent: 'KEY=server_value\nPORT=8080\n',
    localContent: 'KEY=local_value\nPORT=9090\n',
    onReload: vi.fn(),
    onOverwrite: vi.fn(),
    onSaveCopy: vi.fn(),
    onClose: vi.fn(),
  };

  it('renders modal with file name and both server and local versions', () => {
    render(<FileConflictModal {...defaultProps} />);

    expect(screen.getByText('config.yaml')).toBeTruthy();
    expect(screen.getByText('Conflito de Versão Detectado')).toBeTruthy();
    expect(screen.getByText(/KEY=server_value/)).toBeTruthy();
    expect(screen.getByText(/KEY=local_value/)).toBeTruthy();
  });

  it('switches between view modes (split, server-only, local-only)', () => {
    render(<FileConflictModal {...defaultProps} />);

    // Click server only
    const serverOnlyBtn = screen.getByText('Apenas Servidor');
    fireEvent.click(serverOnlyBtn);
    expect(screen.getByText(/KEY=server_value/)).toBeTruthy();

    // Click local only
    const localOnlyBtn = screen.getByText('Suas Alterações');
    fireEvent.click(localOnlyBtn);
    expect(screen.getByText(/KEY=local_value/)).toBeTruthy();

    // Click split view
    const splitBtn = screen.getByText('Lado a Lado');
    fireEvent.click(splitBtn);
    expect(screen.getByText(/KEY=server_value/)).toBeTruthy();
    expect(screen.getByText(/KEY=local_value/)).toBeTruthy();
  });

  it('calls onReload when reload button is clicked', () => {
    render(<FileConflictModal {...defaultProps} />);
    const reloadBtn = screen.getByText('Recarregar do Disco');
    fireEvent.click(reloadBtn);
    expect(defaultProps.onReload).toHaveBeenCalled();
  });

  it('calls onOverwrite when overwrite button is clicked', () => {
    render(<FileConflictModal {...defaultProps} />);
    const overwriteBtn = screen.getByText('Sobrescrever Servidor');
    fireEvent.click(overwriteBtn);
    expect(defaultProps.onOverwrite).toHaveBeenCalled();
  });

  it('calls onSaveCopy when save copy button is clicked', () => {
    render(<FileConflictModal {...defaultProps} />);
    const copyBtn = screen.getByText('Salvar como Cópia');
    fireEvent.click(copyBtn);
    expect(defaultProps.onSaveCopy).toHaveBeenCalled();
  });

  it('calls onClose when close button or keep editing is clicked', () => {
    render(<FileConflictModal {...defaultProps} />);
    const keepEditingBtn = screen.getByText('Continuar Editando');
    fireEvent.click(keepEditingBtn);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });
});
