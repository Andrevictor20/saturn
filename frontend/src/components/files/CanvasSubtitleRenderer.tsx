import React, { useEffect, useRef } from 'react';

export interface CanvasSubtitleRendererProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  subtitleUrl: string;
  format: 'ass' | 'pgs' | 'vtt' | 'srt';
  offset?: number;
  onError?: (error: Error) => void;
}

interface DestroyableSubtitleRenderer {
  destroy: () => void;
  setTimeOffset?: (offset: number) => void;
}

export function CanvasSubtitleRenderer({
  videoRef,
  subtitleUrl,
  format,
  offset = 0,
  onError,
}: CanvasSubtitleRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<DestroyableSubtitleRenderer | null>(null);

  useEffect(() => {
    if (!subtitleUrl || (format !== 'ass' && format !== 'pgs')) {
      if (rendererRef.current) {
        rendererRef.current.destroy();
        rendererRef.current = null;
      }
      return;
    }

    let isDisposed = false;

    async function initRenderer() {
      try {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || isDisposed) return;

        // Cleanup existing instance before spinning up a new one
        if (rendererRef.current) {
          rendererRef.current.destroy();
          rendererRef.current = null;
        }

        if (format === 'ass') {
          const { default: JASSUB } = await import('jassub');
          if (isDisposed) return;

          const instance = new JASSUB({
            video,
            subUrl: subtitleUrl,
            canvas,
            timeOffset: offset,
            debug: false,
          });

          rendererRef.current = instance;
        } else if (format === 'pgs') {
          const libpgsModule = await import('libpgs');
          if (isDisposed) return;

          const LibPGS = (libpgsModule as { default?: unknown; LibPGS?: unknown }).default ||
            (libpgsModule as { LibPGS?: unknown }).LibPGS;

          if (typeof LibPGS === 'function') {
            // @ts-expect-error dynamic WASM instantiation
            const instance = new LibPGS({
              video,
              subUrl: subtitleUrl,
              canvas,
              timeOffset: offset,
            });
            rendererRef.current = instance;
          }
        }
      } catch (err) {
        if (!isDisposed) {
          console.error('[CanvasSubtitleRenderer] Failed to initialize WASM subtitle engine:', err);
          onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      }
    }

    void initRenderer();

    return () => {
      isDisposed = true;
      if (rendererRef.current) {
        try {
          rendererRef.current.destroy();
        } catch {
          // suppress cleanup errors on teardown
        }
        rendererRef.current = null;
      }
    };
  }, [subtitleUrl, format, videoRef, onError]);

  // Handle dynamic time offset updates
  useEffect(() => {
    if (rendererRef.current?.setTimeOffset) {
      rendererRef.current.setTimeOffset(offset);
    }
  }, [offset]);

  // Handle canvas sizing synchronization with video container
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const resizeObserver = new ResizeObserver(() => {
      if (!canvas || !video) return;
      const rect = video.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    });

    resizeObserver.observe(video);

    return () => {
      resizeObserver.disconnect();
    };
  }, [videoRef]);

  if (!subtitleUrl || (format !== 'ass' && format !== 'pgs')) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      data-testid="canvas-subtitle-renderer"
      className="absolute inset-0 pointer-events-none z-20 w-full h-full"
      aria-hidden="true"
    />
  );
}
