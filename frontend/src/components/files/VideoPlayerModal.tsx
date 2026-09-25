import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { Play, Loader2 } from 'lucide-react';
import type { FileItem } from './AudioPlayerModal';
import { VideoControls } from './VideoControls';
import { VideoSubtitleMenu, type SubtitleItem } from './VideoSubtitleMenu';
import { VideoAudioMenu } from './VideoAudioMenu';
import { VideoErrorBanner } from './VideoErrorBanner';
import { VideoHeaderOverlay } from './VideoHeaderOverlay';
import { SubtitleOverlay } from './SubtitleOverlay';
import { CanvasSubtitleRenderer } from './CanvasSubtitleRenderer';
import { useVideoSubtitles } from './useVideoSubtitles';
import { formatVideoTime } from '../../utils/vttParser';

export type { SubtitleItem };

interface VideoPlayerModalProps {
  file: FileItem;
  onClose: () => void;
}

export function VideoPlayerModal({ file, onClose }: VideoPlayerModalProps) {
  const { t } = useTranslation();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isStalledFallback, setIsStalledFallback] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [copied, setCopied] = useState(false);

  const isDirectSupported = (ext: string) => ['mp4', 'webm'].includes(ext.toLowerCase());

  const [isTranscodeMode, setIsTranscodeMode] = useState(() => !isDirectSupported(file.extension));
  const [isForceTranscode, setIsForceTranscode] = useState(false);
  const [transcodeSeekTime, setTranscodeSeekTime] = useState<number | null>(null);

  const isTranscodeModeRef = useRef(isTranscodeMode);
  isTranscodeModeRef.current = isTranscodeMode;
  const transcodeSeekRef = useRef(transcodeSeekTime);
  transcodeSeekRef.current = transcodeSeekTime;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchdogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const token = typeof window !== 'undefined'
    ? (localStorage.getItem('saturn_token') || localStorage.getItem('token') || '')
    : '';

  const {
    subtitlesList,
    activeSubtitle,
    setActiveSubtitle,
    audioTracksList,
    activeAudioTrack,
    setActiveAudioTrack,
    subtitleOffset,
    setSubtitleOffset,
    currentCueText,
    syncCueAtTime,
    handleCustomSubtitleUpload,
    activeSubtitleItem,
    canvasSubtitleUrl,
    isCanvasTrack,
  } = useVideoSubtitles({
    filePath: file.path,
    token,
    onDurationLoaded: (dur) => {
      if (dur > 0) setDuration(dur);
    },
  });

  const modeParam = isForceTranscode ? '&mode=transcode' : '&mode=copy';
  const seekParam = transcodeSeekTime !== null && transcodeSeekTime > 0 ? `&start=${transcodeSeekTime}` : '';
  const audioParam = activeAudioTrack !== null ? `&audio=${activeAudioTrack}` : '';
  const effectiveTranscodeMode = isTranscodeMode || activeAudioTrack !== null;
  const baseStreamUrl = effectiveTranscodeMode
    ? `/api/files/stream/transcode?path=${encodeURIComponent(file.path)}${seekParam}${modeParam}${audioParam}`
    : `/api/files/stream?path=${encodeURIComponent(file.path)}`;
  const videoSrc = `${baseStreamUrl}${token ? `&token=${encodeURIComponent(token)}` : ''}`;

  const handleCopyStreamLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}${videoSrc}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      try {
        const p = videoRef.current.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch {}
      setIsPlaying(true);
    }
  }, [isPlaying]);

  // 7-second Watchdog timer for stalled streams
  useEffect(() => {
    if (watchdogTimerRef.current) {
      clearTimeout(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }

    if (isBuffering && !hasError && !isStalledFallback) {
      watchdogTimerRef.current = setTimeout(() => {
        const video = videoRef.current;
        if (video && video.readyState < 2 && video.currentTime === 0) {
          setIsBuffering(false);
          setIsStalledFallback(true);
        }
      }, 7000);
    }

    return () => {
      if (watchdogTimerRef.current) {
        clearTimeout(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }
    };
  }, [isBuffering, hasError, isStalledFallback]);

  // Video event handlers for streaming, buffering & subtitle sync
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      const vTime = video.currentTime;
      const offset = (isTranscodeModeRef.current && transcodeSeekRef.current !== null) ? transcodeSeekRef.current : 0;
      const actualTime = offset + vTime;
      setCurrentTime(actualTime);

      if (video.buffered.length > 0) {
        try {
          const currentBuf = video.buffered.end(video.buffered.length - 1);
          setBufferedEnd(offset + currentBuf);
        } catch {}
      }

      syncCueAtTime(actualTime);
    };
    
    const handleLoadedMetadata = () => {
      if (Number.isFinite(video.duration) && video.duration > 0 && (!isTranscodeModeRef.current || duration === 0)) {
        setDuration(video.duration);
      }
      setIsBuffering(false);
    };

    const handleLoadedData = () => setIsBuffering(false);
    const handleWaiting = () => setIsBuffering(true);
    const handleCanPlay = () => {
      setIsBuffering(false);
      setIsStalledFallback(false);
    };
    const handlePlaying = () => {
      setIsBuffering(false);
      setIsStalledFallback(false);
      setIsPlaying(true);
    };
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);
    const handleError = () => {
      setIsBuffering(false);
      if (!isTranscodeModeRef.current) {
        setIsTranscodeMode(true);
        setIsBuffering(true);
        setHasError(false);
      } else {
        setHasError(true);
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', handleError);
      if (watchdogTimerRef.current) {
        clearTimeout(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }
      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
      } catch {}
    };
  }, [duration, syncCueAtTime]);

  // Attempt auto-playback gracefully on source change
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    try {
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          setIsBuffering(false);
        });
      }
    } catch {
      setIsBuffering(false);
    }
  }, [videoSrc]);

  const toggleMute = () => {
    if (!videoRef.current) return;
    const newMuted = !isMuted;
    videoRef.current.volume = newMuted ? 0 : (volume || 0.5);
    setIsMuted(newMuted);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      containerRef.current.requestFullscreen().catch(() => {});
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (isTranscodeModeRef.current) {
      setTranscodeSeekTime(Math.floor(time));
      setIsBuffering(true);
    } else if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const handleSkip = useCallback((seconds: number) => {
    const current = currentTime;
    const target = seconds < 0 
      ? Math.max(0, current + seconds)
      : Math.min(duration, current + seconds);
    setCurrentTime(target);
    if (isTranscodeModeRef.current) {
      setTranscodeSeekTime(Math.floor(target));
      setIsBuffering(true);
    } else if (videoRef.current) {
      videoRef.current.currentTime = target;
    }
  }, [currentTime, duration]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleSkip(-5);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleSkip(5);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (videoRef.current) {
          const delta = e.key === 'ArrowUp' ? 0.1 : -0.1;
          const newVol = Math.max(0, Math.min(1, videoRef.current.volume + delta));
          videoRef.current.volume = newVol;
          setVolume(newVol);
        }
      } else if (e.key.toLowerCase() === 'm') {
        toggleMute();
      } else if (e.key.toLowerCase() === 'f') {
        toggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, handleSkip, isMuted, volume, onClose]);

  const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setVolume(vol);
    if (videoRef.current) {
      videoRef.current.volume = vol;
      setIsMuted(vol === 0);
    }
  };

  const handleRateChange = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  };

  return typeof document !== 'undefined' ? createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div 
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-5xl bg-zinc-950 border border-border rounded-2xl overflow-hidden shadow-2xl flex flex-col group aspect-video max-h-[90vh] my-auto"
      >
        {/* Header Overlay */}
        <VideoHeaderOverlay
          file={file}
          showControls={showControls}
          isTranscodeMode={isTranscodeMode}
          isForceTranscode={isForceTranscode}
          copied={copied}
          onToggleForceTranscode={() => {
            setIsForceTranscode(prev => !prev);
            setIsStalledFallback(false);
            setHasError(false);
            setIsBuffering(true);
          }}
          onCopyStreamLink={handleCopyStreamLink}
          onClose={onClose}
        />

        {/* Video Element & Overlays */}
        <div className="relative flex-1 w-full h-full flex items-center justify-center bg-black cursor-pointer overflow-hidden" onClick={togglePlay}>
          <video
            ref={videoRef}
            data-testid="video-element"
            src={videoSrc}
            preload="metadata"
            autoPlay
            playsInline
            crossOrigin="anonymous"
            className="w-full h-full object-contain"
          >
            {activeSubtitle !== 'off' && !isCanvasTrack && (() => {
              const currentTrack = subtitlesList.find(s => s.path === activeSubtitle);
              if (!currentTrack) return null;
              const trackSrc = currentTrack.path.startsWith('blob:') 
                ? currentTrack.path 
                : `/api/files/subtitles/vtt?path=${encodeURIComponent(currentTrack.path)}${token ? `&token=${encodeURIComponent(token)}` : ''}`;

              return (
                <track
                  key={currentTrack.path}
                  kind="subtitles"
                  src={trackSrc}
                  srcLang={currentTrack.lang || 'und'}
                  label={currentTrack.label}
                  default
                  onLoad={(e) => {
                    const trackElem = e.currentTarget as HTMLTrackElement;
                    if (trackElem.track) trackElem.track.mode = 'showing';
                  }}
                />
              );
            })()}
          </video>

          {/* Subtitle Overlays: Canvas for ASS/PGS and Native for SRT/VTT */}
          {!isCanvasTrack && <SubtitleOverlay currentCue={currentCueText} />}
          {isCanvasTrack && canvasSubtitleUrl && (
            <CanvasSubtitleRenderer
              videoRef={videoRef}
              subtitleUrl={canvasSubtitleUrl}
              format={activeSubtitleItem?.format || 'ass'}
              offset={subtitleOffset}
            />
          )}

          {/* Buffering Spinner */}
          {isBuffering && !hasError && !isStalledFallback && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/30 backdrop-blur-[2px]">
              <div className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-black/70 text-white shadow-2xl border border-white/10">
                <Loader2 className="w-8 h-8 text-saturn-400 animate-spin" />
                <span className="text-xs text-zinc-300 font-medium">{t('files.optimizing_stream', 'Otimizando fluxo...')}</span>
              </div>
            </div>
          )}

          {/* Error & Stalled Fallback Banner */}
          {(hasError || isStalledFallback) && (
            <VideoErrorBanner
              file={file}
              videoSrc={videoSrc}
              isTranscodeMode={isTranscodeMode}
              isForceTranscode={isForceTranscode}
              isStalled={isStalledFallback}
              onEnableTranscode={() => {
                setHasError(false);
                setIsStalledFallback(false);
                setIsForceTranscode(true);
                setIsBuffering(true);
                if (videoRef.current) {
                  videoRef.current.load();
                }
              }}
              onRetryRemux={() => {
                setIsStalledFallback(false);
                setHasError(false);
                setIsBuffering(true);
                if (videoRef.current) {
                  videoRef.current.load();
                }
              }}
              onCopyStreamLink={handleCopyStreamLink}
              copied={copied}
            />
          )}

          {/* Big Center Play Icon when paused and not buffering */}
          {!isPlaying && !isBuffering && !hasError && !isStalledFallback && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="p-5 rounded-full bg-saturn-500/90 text-white shadow-2xl backdrop-blur-sm transform scale-110">
                <Play className="w-10 h-10 fill-current ml-1" />
              </div>
            </div>
          )}
        </div>

        {/* Modular Video Controls */}
        <VideoControls
          isPlaying={isPlaying}
          onTogglePlay={togglePlay}
          currentTime={currentTime}
          duration={duration}
          bufferedEnd={bufferedEnd}
          volume={volume}
          isMuted={isMuted}
          onSeek={handleSeek}
          onVolumeChange={handleVolume}
          onToggleMute={toggleMute}
          onSkip={handleSkip}
          playbackRate={playbackRate}
          onRateChange={handleRateChange}
          onToggleFullscreen={toggleFullscreen}
          formatTime={formatVideoTime}
          showControls={showControls}
        >
          <VideoAudioMenu
            audioTracksList={audioTracksList}
            activeAudioTrack={activeAudioTrack}
            onAudioTrackChange={setActiveAudioTrack}
          />
          <VideoSubtitleMenu
            subtitlesList={subtitlesList}
            activeSubtitle={activeSubtitle}
            onSubtitleChange={setActiveSubtitle}
            onCustomSubtitleUpload={handleCustomSubtitleUpload}
            subtitleOffset={subtitleOffset}
            onSubtitleOffsetChange={setSubtitleOffset}
          />
        </VideoControls>
      </div>
    </div>,
    document.body
  ) : null;
}
