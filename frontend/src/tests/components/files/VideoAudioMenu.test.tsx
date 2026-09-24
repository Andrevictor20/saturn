import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VideoAudioMenu } from '../../../components/files/VideoAudioMenu';

describe('VideoAudioMenu Component', () => {
  const sampleTracks = [
    {
      index: 1,
      label: 'English (Stereo)',
      lang: 'eng',
      codec: 'aac',
      channels: 2,
    },
    {
      index: 2,
      label: 'Português (5.1)',
      lang: 'por',
      codec: 'ac3',
      channels: 6,
    },
  ];

  it('renders nothing when only 1 or 0 audio tracks exist', () => {
    const { container } = render(
      <VideoAudioMenu
        audioTracksList={[sampleTracks[0]]}
        activeAudioTrack={null}
        onAudioTrackChange={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders selector when multiple audio tracks exist', () => {
    render(
      <VideoAudioMenu
        audioTracksList={sampleTracks}
        activeAudioTrack={null}
        onAudioTrackChange={vi.fn()}
      />
    );
    const select = screen.getByTestId('audio-selector');
    expect(select).toBeInTheDocument();
    expect(screen.getByText('English (Stereo)')).toBeInTheDocument();
    expect(screen.getByText('Português (5.1)')).toBeInTheDocument();
  });

  it('calls onAudioTrackChange when an audio track is selected', () => {
    const onAudioTrackChange = vi.fn();
    render(
      <VideoAudioMenu
        audioTracksList={sampleTracks}
        activeAudioTrack={null}
        onAudioTrackChange={onAudioTrackChange}
      />
    );
    const select = screen.getByTestId('audio-selector');
    fireEvent.change(select, { target: { value: '2' } });
    expect(onAudioTrackChange).toHaveBeenCalledWith(2);
  });

  it('calls onAudioTrackChange(null) when default audio option is chosen', () => {
    const onAudioTrackChange = vi.fn();
    render(
      <VideoAudioMenu
        audioTracksList={sampleTracks}
        activeAudioTrack={2}
        onAudioTrackChange={onAudioTrackChange}
      />
    );
    const select = screen.getByTestId('audio-selector');
    fireEvent.change(select, { target: { value: 'default' } });
    expect(onAudioTrackChange).toHaveBeenCalledWith(null);
  });
});
