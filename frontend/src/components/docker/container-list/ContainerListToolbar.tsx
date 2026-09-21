import { useTranslation } from 'react-i18next';
import {
  Layers,
  LayoutGrid,
  List,
  DownloadCloud,
  RefreshCw,
  Terminal,
} from 'lucide-react';

interface ContainerListToolbarProps {
  totalCount: number;
  runningCount: number;
  groupByStack: boolean;
  onToggleGroupByStack: () => void;
  viewMode: 'grid' | 'table';
  onViewModeChange: (mode: 'grid' | 'table') => void;
  pendingUpdatesCount: number;
  onUpdateAllContainers: () => void;
  onRefresh: () => void;
  loading: boolean;
  onOpenDockerInstall: () => void;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  sortBy: 'name' | 'cpu' | 'ram' | 'disk';
  onSortByChange: (sort: 'name' | 'cpu' | 'ram' | 'disk') => void;
  sortOrder: 'asc' | 'desc';
  onToggleSortOrder: () => void;
  watchtowerChecking?: boolean;
  onWatchtowerCheckNow?: () => void;
}

export function ContainerListToolbar({
  totalCount,
  runningCount,
  groupByStack,
  onToggleGroupByStack,
  viewMode,
  onViewModeChange,
  pendingUpdatesCount,
  onUpdateAllContainers,
  onRefresh,
  loading,
  onOpenDockerInstall,
  searchQuery,
  onSearchQueryChange,
  sortBy,
  onSortByChange,
  sortOrder,
  onToggleSortOrder,
  watchtowerChecking = false,
  onWatchtowerCheckNow,
}: ContainerListToolbarProps) {
  const { t } = useTranslation();

  return (
    <>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary">
            {t('containers.title')}
          </h1>
          <p className="text-secondary text-sm">
            {t('containers.active_count', { count: totalCount, running: runningCount })}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto justify-end">
          <button
            onClick={onToggleGroupByStack}
            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all ${
              groupByStack
                ? 'bg-saturn-500/20 text-saturn-300 border-saturn-500/40 shadow-sm'
                : 'bg-card text-secondary hover:text-primary border-border'
            }`}
            title={t('dashboard.group_managed')}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{t('dashboard.group_managed')}</span>
          </button>

          <div className="flex bg-card p-1 rounded-md border border-border">
            <button
              onClick={() => onViewModeChange('grid')}
              className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-accent text-white shadow-sm' : 'text-secondary hover:text-white'}`}
              aria-label="Grid"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => onViewModeChange('table')}
              className={`p-1.5 rounded ${viewMode === 'table' ? 'bg-accent text-white shadow-sm' : 'text-secondary hover:text-white'}`}
              aria-label="Table"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={onUpdateAllContainers}
            className={`px-3 sm:px-4 py-2 rounded-md flex items-center gap-2 transition-all text-xs sm:text-sm font-medium border ${
              pendingUpdatesCount > 0
                ? 'bg-violet-600/25 hover:bg-violet-600/40 text-violet-800 dark:text-violet-300 border-violet-500/50 shadow-sm font-semibold'
                : 'bg-card hover:bg-accent text-slate-700 dark:text-secondary hover:text-primary border-border'
            }`}
            title={t('containers.update_all')}
          >
            <DownloadCloud className={`w-3.5 h-3.5 ${pendingUpdatesCount > 0 ? 'text-violet-600 dark:text-violet-400' : ''}`} />
            <span>{t('containers.update_all')}</span>
            {pendingUpdatesCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-violet-600 text-white text-[10px] font-bold">
                {pendingUpdatesCount}
              </span>
            )}
          </button>

          <button
            onClick={onRefresh}
            className="px-3 sm:px-4 py-2 bg-card hover:bg-accent text-slate-700 dark:text-secondary hover:text-primary rounded-md flex items-center gap-2 transition-colors text-xs sm:text-sm font-medium border border-border"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {t('common.refresh')}
          </button>

          {onWatchtowerCheckNow && (
            <button
              type="button"
              onClick={onWatchtowerCheckNow}
              disabled={watchtowerChecking}
              className="px-3 py-2 bg-card hover:bg-accent text-slate-700 dark:text-secondary hover:text-primary rounded-md flex items-center gap-1.5 transition-colors text-xs sm:text-sm font-medium border border-border disabled:opacity-50"
              title={t('containers.watchtower_check_title', 'Verificar atualizações no Docker Registry via Watchtower')}
            >
              <RefreshCw className={`w-3.5 h-3.5 text-saturn-500 ${watchtowerChecking ? 'animate-spin' : ''}`} />
              <span className="hidden lg:inline">{t('containers.watchtower_check', 'Varredura Watchtower')}</span>
            </button>
          )}

          <button
            onClick={onOpenDockerInstall}
            className="px-3 sm:px-4 py-2 bg-saturn-500 hover:bg-saturn-600 active:scale-95 text-white rounded-lg flex items-center gap-1.5 transition-all text-xs sm:text-sm font-semibold shadow-sm shadow-saturn-500/20"
            title={t('docker_install.title')}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>{t('containers.new_container')}</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6 bg-card border border-border p-3 rounded-lg shadow-sm">
        <div className="flex-1">
          <input
            type="text"
            placeholder={t('containers.search_placeholder')}
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-saturn-500/50 transition-all text-primary"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-secondary font-medium whitespace-nowrap">
            {t('containers.sort_by')}:
          </label>
          <select
            value={sortBy}
            onChange={(e) => onSortByChange(e.target.value as any)}
            className="bg-background border border-border rounded-md px-3 py-2 text-sm outline-none text-primary cursor-pointer hover:border-accent"
          >
            <option value="name">{t('containers.sort_name')}</option>
            <option value="cpu">{t('containers.sort_cpu')}</option>
            <option value="ram">{t('containers.sort_ram')}</option>
            <option value="disk">{t('containers.sort_disk')}</option>
          </select>
          <button
            onClick={onToggleSortOrder}
            className="px-3 py-2 bg-background border border-border rounded-md text-sm text-secondary hover:text-primary hover:border-accent transition-colors"
            title={sortOrder === 'asc' ? t('containers.sort_asc') : t('containers.sort_desc')}
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </div>
    </>
  );
}
