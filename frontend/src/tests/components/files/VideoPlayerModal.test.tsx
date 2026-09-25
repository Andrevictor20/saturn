import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { VideoPlayerModal } from '../../../components/files/VideoPlayerModal';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('VideoPlayerModal Component', () => {
  const mockFile = {
    name: 'movie.mkv',
    path: '/DATA/movies/movie.mkv',
    is_dir: false,
    size: 104857600,
    modified: '2026-08-22T10:15:00Z',
    extension: 'mkv'
  };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          subtitles: [
            { name: 'movie.pt-BR.vtt', path: '/DATA/movies/movie.pt-BR.vtt', label: 'Português' },
            { name: 'movie.en.vtt', path: '/DATA/movies/movie.en.vtt', label: 'English' },
          ]
        }),
      })
    ));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders video player modal with MKV title and subtitle options', async () => {
    render(<VideoPlayerModal file={mockFile} onClose={vi.fn()} />);

    expect(screen.getByText('movie.mkv')).toBeTruthy();
    expect(screen.getByTestId('video-element')).toBeTruthy();
    
    // Subtitles selector
    expect(await screen.findByTestId('subtitle-selector')).toBeTruthy();
    expect(await screen.findByText(/Português/i)).toBeTruthy();
  });

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn();
    render(<VideoPlayerModal file={mockFile} onClose={onClose} />);

    const closeBtn = await screen.findByTestId('close-video-modal');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders play button and progress slider', async () => {
    render(<VideoPlayerModal file={mockFile} onClose={vi.fn()} />);

    const playBtn = await screen.findByTestId('video-play-btn');
    expect(playBtn).toBeTruthy();

    const progressSlider = await screen.findByTestId('video-progress');
    expect(progressSlider).toBeTruthy();
  });

  it('allows changing active subtitle track', async () => {
    render(<VideoPlayerModal file={mockFile} onClose={vi.fn()} />);

    const subSelector = await screen.findByTestId('subtitle-selector') as HTMLSelectElement;
    expect(subSelector).toBeTruthy();

    // Wait for subtitles to be loaded from fetch and populated as options
    await screen.findByRole('option', { name: /English/i });

    fireEvent.change(subSelector, { target: { value: '/DATA/movies/movie.en.vtt' } });
    expect(subSelector.value).toBe('/DATA/movies/movie.en.vtt');
  });

  it('renders only the active subtitle track (lazy track injection) and removes track when off', async () => {
    render(<VideoPlayerModal file={mockFile} onClose={vi.fn()} />);

    // Wait for subtitles to load and select default preferred track
    await screen.findByRole('option', { name: /Português/i });

    // Should only have exactly 1 track element rendered in the video, preventing concurrent ffmpeg calls
    const initialTracks = document.querySelectorAll('video track');
    expect(initialTracks.length).toBe(1);
    expect(initialTracks[0].getAttribute('src')).toContain(encodeURIComponent('/DATA/movies/movie.pt-BR.vtt'));

    // Switch to 'off'
    const subSelector = await screen.findByTestId('subtitle-selector');
    fireEvent.change(subSelector, { target: { value: 'off' } });

    // When off, 0 tracks should be mounted in the DOM
    const updatedTracks = document.querySelectorAll('video track');
    expect(updatedTracks.length).toBe(0);
  });

  it('renders VLC / Stream copy button and handles click', async () => {
    const writeTextMock = vi.fn(() => Promise.resolve());
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<VideoPlayerModal file={mockFile} onClose={vi.fn()} />);

    const copyBtn = screen.getByTitle(/VLC/i);
    expect(copyBtn).toBeTruthy();

    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/files/stream/transcode?path=')
      );
    });
  });

  it('handles video decode error by auto-switching MP4 to transcode mode, then displaying error banner if transcode also fails', async () => {
    const mp4File = { ...mockFile, name: 'video.mp4', extension: 'mp4' };
    render(<VideoPlayerModal file={mp4File} onClose={vi.fn()} />);

    const videoEl = screen.getByTestId('video-element');
    expect(videoEl.getAttribute('src')).toContain('/api/files/stream?path=');

    // First error on direct stream triggers auto-fallback to transcode mode
    fireEvent.error(videoEl);
    expect(videoEl.getAttribute('src')).toContain('/api/files/stream/transcode?path=');

    // Second error in transcode mode displays error banner
    fireEvent.error(videoEl);
    expect(await screen.findByText(/Falha na Decodificação do Vídeo/i)).toBeTruthy();
    expect(screen.getByText(/Abrir no VLC/i)).toBeTruthy();
    expect(screen.getByText(/Baixar Arquivo/i)).toBeTruthy();
  });

  it('calls onClose when Escape key is pressed', async () => {
    const onClose = vi.fn();
    render(<VideoPlayerModal file={mockFile} onClose={onClose} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('pauses and unloads video element on unmount', () => {
    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    const loadSpy = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});

    const { unmount } = render(<VideoPlayerModal file={mockFile} onClose={vi.fn()} />);
    unmount();

    expect(pauseSpy).toHaveBeenCalled();
    expect(loadSpy).toHaveBeenCalled();
  });

  it('updates duration from subtitles API response when available', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          subtitles: [],
          duration: 3600,
        }),
      })
    ));

    render(<VideoPlayerModal file={mockFile} onClose={vi.fn()} />);

    expect(await screen.findByText(/1:00:00/)).toBeTruthy();
  });

  it('handles stalled watchdog by auto-switching MP4 direct stream to remux/transcode mode', () => {
    vi.useFakeTimers();
    const mp4File = { ...mockFile, name: 'stalled.mp4', extension: 'mp4' };
    render(<VideoPlayerModal file={mp4File} onClose={vi.fn()} />);

    const videoEl = screen.getByTestId('video-element') as HTMLVideoElement;
    expect(videoEl.getAttribute('src')).toContain('/api/files/stream?path=');

    Object.defineProperty(videoEl, 'readyState', { value: 1, configurable: true });
    Object.defineProperty(videoEl, 'currentTime', { value: 0, configurable: true });

    act(() => {
      vi.advanceTimersByTime(6500);
    });

    expect(videoEl.getAttribute('src')).toContain('/api/files/stream/transcode?path=');
    vi.useRealTimers();
  });

  it('correctly sets mode=transcode when forcing transcode from error banner', async () => {
    const mp4File = { ...mockFile, name: 'stalled.mp4', extension: 'mp4' };
    render(<VideoPlayerModal file={mp4File} onClose={vi.fn()} />);

    const videoEl = screen.getByTestId('video-element');
    fireEvent.error(videoEl);
    fireEvent.error(videoEl);

    const forceBtn = await screen.findByText(/Forçar Transcodificação/i);
    fireEvent.click(forceBtn);

    expect(videoEl.getAttribute('src')).toContain('&mode=transcode');
  });
});



