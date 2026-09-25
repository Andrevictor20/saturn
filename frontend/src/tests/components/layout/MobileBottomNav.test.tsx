import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MobileBottomNav } from '../../../components/layout/MobileBottomNav';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultVal: string) => defaultVal || key,
  }),
}));

describe('MobileBottomNav', () => {
  it('renders navigation links and more button', () => {
    const handleOpenMenu = vi.fn();
    render(
      <MemoryRouter initialEntries={['/']}>
        <MobileBottomNav onOpenMenu={handleOpenMenu} />
      </MemoryRouter>
    );

    expect(screen.getByText('Início')).toBeInTheDocument();
    expect(screen.getByText('Containers')).toBeInTheDocument();
    expect(screen.getByText('Store')).toBeInTheDocument();
    expect(screen.getByText('Arquivos')).toBeInTheDocument();
    expect(screen.getByText('Mais')).toBeInTheDocument();
  });

  it('triggers onOpenMenu when clicking the more button', () => {
    const handleOpenMenu = vi.fn();
    render(
      <MemoryRouter initialEntries={['/containers']}>
        <MobileBottomNav onOpenMenu={handleOpenMenu} />
      </MemoryRouter>
    );

    const moreBtn = screen.getByRole('button', { name: /mais/i });
    fireEvent.click(moreBtn);

    expect(handleOpenMenu).toHaveBeenCalledTimes(1);
  });
});
