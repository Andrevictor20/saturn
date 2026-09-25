import React from 'react';
import { useTranslation } from 'react-i18next';
import { Subtitles, Upload } from 'lucide-react';

export interface SubtitleItem {
  name: string;
  path: string;
  label: string;
  lang: string;
  format?: 'vtt' | 'ass' | 'pgs' | 'srt';
  is_bitmap?: boolean;
}

interface VideoSubtitleMenuProps {
  subtitlesList: SubtitleItem[];
  activeSubtitle: string;
  onSubtitleChange: (path: string) => void;
  onCustomSubtitleUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  subtitleOffset?: number;
  onSubtitleOffsetChange?: (offset: number) => void;
}

export function VideoSubtitleMenu({
  subtitlesList,
  activeSubtitle,
  onSubtitleChange,
  onCustomSubtitleUpload,
  subtitleOffset = 0,
  onSubtitleOffsetChange,
}: VideoSubtitleMenuProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-1.5 bg-zinc-800/80 px-2 py-1 rounded-lg border border-zinc-700/50 shadow-sm">
      <Subtitles className="w-4 h-4 text-saturn-400 shrink-0" />
      <select
        data-testid="subtitle-selector"
        value={activeSubtitle}
        onChange={(e) => onSubtitleChange(e.target.value)}
        className="bg-transparent text-xs text-white outline-none cursor-pointer max-w-[120px] sm:max-w-[180px] md:max-w-[240px] truncate"
        title={t('files.select_subtitle', 'Selecionar legenda')}
      >
        <option value="off" className="bg-zinc-900 text-zinc-300">
          {subtitlesList.length === 0 
            ? t('files.no_subtitles_found', 'Sem legendas detectadas (Off)')
            : t('files.subtitles_off', 'Legendas: Off')}
        </option>
        {subtitlesList.map((sub, idx) => {
          const badge = sub.format === 'ass' ? ' [ASS]' : sub.format === 'pgs' ? ' [PGS]' : '';
          return (
            <option key={idx} value={sub.path} className="bg-zinc-900 text-white">
              {sub.label}{badge} ({sub.name})
            </option>
          );
        })}
      </select>
      
      <label
        className="flex items-center gap-1 px-1.5 py-0.5 hover:bg-zinc-700/80 rounded text-zinc-300 hover:text-white cursor-pointer transition-colors border border-zinc-700/60"
        title={t('files.upload_device_subtitle', 'Carregar arquivo de legenda do seu dispositivo (.srt, .vtt, .ass, .ssa, .sub, .sbv)')}
      >
        <Upload className="w-3 h-3 text-saturn-400" />
        <span className="text-[11px] font-medium hidden sm:inline">{t('files.add_subtitle', 'Legenda')}</span>
        <span className="text-[10px] font-mono sm:hidden">.CC</span>
        <input
          type="file"
          accept=".srt,.vtt,.ass,.ssa,.sub,.sbv"
          onChange={onCustomSubtitleUpload}
          className="hidden"
        />
      </label>

      {activeSubtitle !== 'off' && onSubtitleOffsetChange && (
        <div className="flex items-center gap-0.5 border-l border-zinc-700/60 pl-1.5 ml-0.5">
          <button
            type="button"
            onClick={() => onSubtitleOffsetChange(Number((subtitleOffset - 0.5).toFixed(1)))}
            className="px-1 py-0.5 text-[10px] font-mono text-zinc-400 hover:text-white hover:bg-zinc-700/60 rounded"
            title={t('files.sub_delay', 'Atrasar legenda (-0.5s)')}
          >
            -0.5s
          </button>
          {subtitleOffset !== 0 && (
            <button
              type="button"
              onClick={() => onSubtitleOffsetChange(0)}
              className="px-1 py-0.5 text-[10px] font-mono text-amber-400 hover:underline"
              title={t('files.reset_sub_sync', 'Resetar sincronização para 0s')}
            >
              {subtitleOffset > 0 ? `+${subtitleOffset.toFixed(1)}s` : `${subtitleOffset.toFixed(1)}s`}
            </button>
          )}
          <button
            type="button"
            onClick={() => onSubtitleOffsetChange(Number((subtitleOffset + 0.5).toFixed(1)))}
            className="px-1 py-0.5 text-[10px] font-mono text-zinc-400 hover:text-white hover:bg-zinc-700/60 rounded"
            title={t('files.sub_advance', 'Adiantar legenda (+0.5s)')}
          >
            +0.5s
          </button>
        </div>
      )}
    </div>
  );
}
