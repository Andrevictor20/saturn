import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { parseWebVtt, convertTextToVttBlob, type SubtitleCue } from '../../utils/vttParser';
import type { SubtitleItem } from './VideoSubtitleMenu';

export interface AudioTrackItem {
  index: number;
  label: string;
  lang: string;
  codec: string;
  channels: number;
}

interface UseVideoSubtitlesOptions {
  filePath: string;
  token: string;
  onDurationLoaded?: (duration: number) => void;
}

export function useVideoSubtitles({ filePath, token, onDurationLoaded }: UseVideoSubtitlesOptions) {
  const { t } = useTranslation();
  const [subtitlesList, setSubtitlesList] = useState<SubtitleItem[]>([]);
  const [activeSubtitle, setActiveSubtitle] = useState<string>('off');
  const [audioTracksList, setAudioTracksList] = useState<AudioTrackItem[]>([]);
  const [activeAudioTrack, setActiveAudioTrack] = useState<number | null>(null);
  const [subtitleOffset, setSubtitleOffset] = useState<number>(0);
  const subtitleOffsetRef = useRef<number>(0);
  subtitleOffsetRef.current = subtitleOffset;
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [currentCueText, setCurrentCueText] = useState<string>('');
  const cuesRef = useRef<SubtitleCue[]>([]);
  cuesRef.current = cues;

  // Fetch available companion and embedded subtitle tracks + duration
  useEffect(() => {
    const queryToken = token ? `&token=${encodeURIComponent(token)}` : '';
    fetch(`/api/files/subtitles?path=${encodeURIComponent(filePath)}${queryToken}`, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      credentials: 'include'
    })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (data.duration && typeof data.duration === 'number' && Number.isFinite(data.duration) && data.duration > 0) {
          onDurationLoaded?.(data.duration);
        }
        if (data.subtitles && Array.isArray(data.subtitles) && data.subtitles.length > 0) {
          setSubtitlesList(data.subtitles);
          const preferred = data.subtitles.find((s: SubtitleItem) => 
            s.lang === 'pt-BR' || s.lang === 'por' || s.label.toLowerCase().includes('portugu') || s.label.toLowerCase().includes('brazil')
          ) || data.subtitles[0];
          if (preferred) {
            setActiveSubtitle(preferred.path);
          }
        }
        if (data.audio_tracks && Array.isArray(data.audio_tracks) && data.audio_tracks.length > 0) {
          setAudioTracksList(data.audio_tracks);
        }
      })
      .catch(() => {});
  }, [filePath, token, onDurationLoaded]);

  // Fetch active subtitle VTT text and parse cues for high-fidelity overlay
  useEffect(() => {
    if (activeSubtitle === 'off') {
      setCues([]);
      setCurrentCueText('');
      return;
    }

    const currentTrack = subtitlesList.find(s => s.path === activeSubtitle);
    if (!currentTrack) return;

    if (currentTrack.path.startsWith('blob:')) {
      fetch(currentTrack.path)
        .then(res => res.text())
        .then(text => setCues(parseWebVtt(text)))
        .catch(() => setCues([]));
      return;
    }

    const trackUrl = `/api/files/subtitles/vtt?path=${encodeURIComponent(currentTrack.path)}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
    fetch(trackUrl, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      credentials: 'include'
    })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then(text => setCues(parseWebVtt(text)))
      .catch(() => setCues([]));
  }, [activeSubtitle, subtitlesList, token]);

  const syncCueAtTime = useCallback((actualTime: number) => {
    const activeCues = cuesRef.current;
    if (activeCues.length > 0) {
      const adjustedTime = actualTime + subtitleOffsetRef.current;
      const match = activeCues.find(c => adjustedTime >= c.start && adjustedTime <= c.end);
      setCurrentCueText(match ? match.text : '');
    } else {
      setCurrentCueText('');
    }
  }, []);

  const handleCustomSubtitleUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const fileUploaded = e.target.files?.[0];
    if (!fileUploaded) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (!text) return;
      const blobUrl = URL.createObjectURL(convertTextToVttBlob(text));
      const newSub: SubtitleItem = {
        name: fileUploaded.name,
        path: blobUrl,
        label: t('files.custom_subtitle_file', { name: fileUploaded.name, defaultValue: `Arquivo (${fileUploaded.name})` }),
        lang: 'custom',
      };
      setSubtitlesList(prev => [newSub, ...prev]);
      setActiveSubtitle(blobUrl);
    };
    reader.readAsText(fileUploaded);
  }, [t]);

  return {
    subtitlesList,
    activeSubtitle,
    setActiveSubtitle,
    audioTracksList,
    activeAudioTrack,
    setActiveAudioTrack,
    subtitleOffset,
    setSubtitleOffset,
    cues,
    currentCueText,
    syncCueAtTime,
    handleCustomSubtitleUpload,
  };
}
