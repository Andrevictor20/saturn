import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ConfirmProvider, useConfirm } from '../../contexts/ConfirmContext';

function TestConsumer() {
  const { confirm } = useConfirm();

  const handleTestNormal = async () => {
    const ok = await confirm({
      title: 'Atualizar Saturn',
      message: 'Deseja iniciar a atualização do Saturn para v4.0.0?',
      confirmText: 'Atualizar Agora',
      cancelText: 'Cancelar',
      isDestructive: false,
    });
    const resultSpan = document.getElementById('result');
    if (resultSpan) resultSpan.textContent = ok ? 'confirmed' : 'cancelled';
  };

  const handleTestDestructive = async () => {
    const ok = await confirm({
      title: 'Excluir Item',
      message: 'Tem certeza que deseja apagar?',
      confirmText: 'Excluir Definitivamente',
      isDestructive: true,
    });
    const resultSpan = document.getElementById('result');
    if (resultSpan) resultSpan.textContent = ok ? 'deleted' : 'cancelled';
  };

  return (
    <div>
      <span id="result">idle</span>
      <button onClick={handleTestNormal}>Open Update Modal</button>
      <button onClick={handleTestDestructive}>Open Delete Modal</button>
    </div>
  );
}

describe('ConfirmContext & useConfirm Modal', () => {
  it('opens custom modal and resolves false on cancel', async () => {
    render(
      <ConfirmProvider>
        <TestConsumer />
      </ConfirmProvider>
    );

    expect(screen.queryByText('Atualizar Saturn')).toBeNull();

    // Trigger confirmation
    fireEvent.click(screen.getByText('Open Update Modal'));

    // Modal appears in document
    expect(screen.getByText('Atualizar Saturn')).toBeTruthy();
    expect(screen.getByText('Deseja iniciar a atualização do Saturn para v4.0.0?')).toBeTruthy();
    expect(screen.getByText('Atualizar Agora')).toBeTruthy();
    expect(screen.getByText('Cancelar')).toBeTruthy();

    // Click Cancel
    fireEvent.click(screen.getByText('Cancelar'));

    await waitFor(() => {
      expect(screen.getByText('cancelled')).toBeTruthy();
      expect(screen.queryByText('Atualizar Saturn')).toBeNull();
    });
  });

  it('opens custom modal and resolves true on confirm', async () => {
    render(
      <ConfirmProvider>
        <TestConsumer />
      </ConfirmProvider>
    );

    fireEvent.click(screen.getByText('Open Delete Modal'));

    expect(screen.getByText('Excluir Item')).toBeTruthy();
    expect(screen.getByText('Tem certeza que deseja apagar?')).toBeTruthy();

    // Click Confirm
    fireEvent.click(screen.getByText('Excluir Definitivamente'));

    await waitFor(() => {
      expect(screen.getByText('deleted')).toBeTruthy();
      expect(screen.queryByText('Excluir Item')).toBeNull();
    });
  });

  it('closes and resolves false when Escape key is pressed', async () => {
    render(
      <ConfirmProvider>
        <TestConsumer />
      </ConfirmProvider>
    );

    fireEvent.click(screen.getByText('Open Update Modal'));
    expect(screen.getByText('Atualizar Saturn')).toBeTruthy();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    await waitFor(() => {
      expect(screen.getByText('cancelled')).toBeTruthy();
      expect(screen.queryByText('Atualizar Saturn')).toBeNull();
    });
  });
});
