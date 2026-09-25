import { render, screen, act } from '@testing-library/react';
import { createRef } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CanvasSubtitleRenderer } from '../../../components/files/CanvasSubtitleRenderer';

const mockDestroy = vi.fn();
const mockSetTimeOffset = vi.fn();

vi.mock('jassub', () => {
  return {
    default: class MockJASSUB {
      destroy = mockDestroy;
      setTimeOffset = mockSetTimeOffset;
      constructor() {}
    },
  };
});

describe('CanvasSubtitleRenderer Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders canvas element with proper testid and positioning classes', () => {
    const videoRef = createRef<HTMLVideoElement>();
    const { container } = render(
      <CanvasSubtitleRenderer
        videoRef={videoRef}
        subtitleUrl="/api/files/subtitles/raw?path=movie.ass&format=ass"
        format="ass"
      />
    );

    const canvas = screen.getByTestId('canvas-subtitle-renderer');
    expect(canvas).toBeTruthy();
    expect(canvas.tagName.toLowerCase()).toBe('canvas');
    expect(container.firstChild).toBe(canvas);
  });

  it('invokes cleanup and destroy on unmount', async () => {
    const videoRef = createRef<HTMLVideoElement>();
    // Mock video element
    const mockVideo = document.createElement('video');
    Object.defineProperty(videoRef, 'current', { value: mockVideo, writable: true });

    const { unmount } = render(
      <CanvasSubtitleRenderer
        videoRef={videoRef}
        subtitleUrl="/api/files/subtitles/raw?path=movie.ass&format=ass"
        format="ass"
      />
    );

    await act(async () => {
      // allow dynamic import / effect promise to resolve
      await new Promise((r) => setTimeout(r, 10));
    });

    unmount();

    expect(mockDestroy).toHaveBeenCalled();
  });

  it('renders nothing or hides canvas when subtitleUrl is empty', () => {
    const videoRef = createRef<HTMLVideoElement>();
    const { container } = render(
      <CanvasSubtitleRenderer
        videoRef={videoRef}
        subtitleUrl=""
        format="ass"
      />
    );

    expect(container.firstChild).toBeNull();
  });
});
