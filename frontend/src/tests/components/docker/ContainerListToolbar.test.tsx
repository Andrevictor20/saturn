import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ContainerListToolbar } from '../../../components/docker/container-list/ContainerListToolbar';
import { vi, describe, it, expect } from 'vitest';

describe('ContainerListToolbar Component', () => {
  const defaultProps = {
    totalCount: 5,
    runningCount: 3,
    groupByStack: false,
    onToggleGroupByStack: vi.fn(),
    viewMode: 'grid' as const,
    onViewModeChange: vi.fn(),
    pendingUpdatesCount: 0,
    onUpdateAllContainers: vi.fn(),
    onRefresh: vi.fn(),
    loading: false,
    onOpenDockerInstall: vi.fn(),
    searchQuery: '',
    onSearchQueryChange: vi.fn(),
    sortBy: 'name' as const,
    onSortByChange: vi.fn(),
    sortOrder: 'asc' as const,
    onToggleSortOrder: vi.fn(),
  };

  it('renders toolbar with title and counts', () => {
    render(<ContainerListToolbar {...defaultProps} />);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('renders update all button without count badge when no updates are pending', () => {
    render(<ContainerListToolbar {...defaultProps} pendingUpdatesCount={0} />);
    const updateBtn = screen.getByTitle(/atualizar/i);
    expect(updateBtn).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('renders update badge when updates are pending and triggers onUpdateAllContainers', () => {
    const onUpdateAllContainers = vi.fn();
    render(
      <ContainerListToolbar
        {...defaultProps}
        pendingUpdatesCount={4}
        onUpdateAllContainers={onUpdateAllContainers}
      />
    );

    expect(screen.getByText('4')).toBeInTheDocument();
    const updateBtn = screen.getByTitle(/atualizar/i);
    fireEvent.click(updateBtn);
    expect(onUpdateAllContainers).toHaveBeenCalledTimes(1);
  });

  it('renders Watchtower check button and calls onWatchtowerCheckNow', () => {
    const onWatchtowerCheckNow = vi.fn();
    render(
      <ContainerListToolbar
        {...defaultProps}
        onWatchtowerCheckNow={onWatchtowerCheckNow}
        watchtowerChecking={false}
      />
    );

    const watchtowerBtn = screen.getByTitle(/watchtower/i);
    expect(watchtowerBtn).toBeInTheDocument();
    fireEvent.click(watchtowerBtn);
    expect(onWatchtowerCheckNow).toHaveBeenCalledTimes(1);
  });
});
