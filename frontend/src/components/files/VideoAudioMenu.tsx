import { useTranslation } from 'react-i18next';
import { Volume2 } from 'lucide-react';
import type { AudioTrackItem } from './useVideoSubtitles';

interface VideoAudioMenuProps {
  audioTracksList: AudioTrackItem[];
  activeAudioTrack: number | null;
  onAudioTrackChange: (index: number | null) => void;
}

export function VideoAudioMenu({
  audioTracksList,
  activeAudioTrack,
  onAudioTrackChange,
}: VideoAudioMenuProps) {
  const { t } = useTranslation();

  if (audioTracksList.length <= 1) {
    return null;
  }

  return (
    <div className="flex items-center gap-1.5 bg-zinc-800/80 px-2 py-1 rounded-lg border border-zinc-700/50 shadow-sm">
      <Volume2 className="w-4 h-4 text-saturn-400 shrink-0" />
      <select
        data-testid="audio-selector"
        value={activeAudioTrack === null ? 'default' : activeAudioTrack.toString()}
        onChange={(e) => {
          const val = e.target.value;
          onAudioTrackChange(val === 'default' ? null : parseInt(val, 10));
        }}
        className="bg-transparent text-xs text-white outline-none cursor-pointer max-w-[110px] sm:max-w-[160px] truncate"
        title={t('files.select_audio_track', 'Selecionar faixa de áudio')}
      >
        <option value="default" className="bg-zinc-900 text-zinc-300">
          {t('files.audio_default', 'Áudio: Padrão')}
        </option>
        {audioTracksList.map((track) => (
          <option key={track.index} value={track.index} className="bg-zinc-900 text-white">
            {track.label}
          </option>
        ))}
      </select>
    </div>
  );
}
