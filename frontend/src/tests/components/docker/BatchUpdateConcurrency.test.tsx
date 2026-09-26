import { render, screen, fireEvent } from '@testing-library/react';
import { BatchUpdateModal } from '../../../components/docker/BatchUpdateModal';
import { BatchUpdateProvider, useBatchUpdate } from '../../../contexts/BatchUpdateContext';
import { vi, describe, it, expect } from 'vitest';
import type { ContainerLike } from '../../../utils/containerGroups';

window.HTMLElement.prototype.scrollIntoView = vi.fn();

describe('BatchUpdate Concurrency Feature', () => {
  const mockOnClose = vi.fn();
  const mockContainers: ContainerLike[] = [
    {
      id: 'c1',
      name: '/app-backend',
      image: 'node:20-alpine',
      state: 'running',
      status: 'Up 2 hours',
    },
    {
      id: 'c2',
      name: '/app-frontend',
      image: 'nginx:alpine',
      state: 'running',
      status: 'Up 2 hours',
    },
    {
      id: 'c3',
      name: '/app-database',
      image: 'postgres:16',
      state: 'running',
      status: 'Up 2 hours',
    },
  ];

  const mockUpdatesMap = {
    c1: { has_update: true },
    c2: { has_update: true },
    c3: { has_update: true },
  };

  it('provides concurrency state and updater in BatchUpdateContext', () => {
    let capturedContext: any = null;
    const TestConsumer = () => {
      capturedContext = useBatchUpdate();
      return <div>Consumer</div>;
    };

    render(
      <BatchUpdateProvider>
        <TestConsumer />
      </BatchUpdateProvider>
    );

    expect(capturedContext.concurrency).toBeDefined();
    expect(typeof capturedContext.setConcurrency).toBe('function');
    // Default recommended concurrency is 2
    expect(capturedContext.concurrency).toBe(2);
  });

  it('renders parallelism selector in BatchUpdateModal with options', () => {
    render(
      <BatchUpdateProvider>
        <BatchUpdateModal
          isOpen={true}
          onClose={mockOnClose}
          containers={mockContainers}
          updatesMap={mockUpdatesMap}
        />
      </BatchUpdateProvider>
    );

    // Parallelism / Concurrency controls
    expect(screen.getByTestId('batch-concurrency-selector')).toBeTruthy();
    expect(screen.getByText('1x')).toBeTruthy();
    expect(screen.getByText('2x')).toBeTruthy();
    expect(screen.getByText('3x')).toBeTruthy();
    expect(screen.getByText('5x')).toBeTruthy();
  });

  it('changes concurrency level when selecting 3x or 5x', () => {
    render(
      <BatchUpdateProvider>
        <BatchUpdateModal
          isOpen={true}
          onClose={mockOnClose}
          containers={mockContainers}
          updatesMap={mockUpdatesMap}
        />
      </BatchUpdateProvider>
    );

    const button3x = screen.getByText('3x');
    fireEvent.click(button3x);

    // Button 3x should have active class / aria-pressed
    expect(button3x.closest('button')?.getAttribute('aria-pressed')).toBe('true');
  });
});
