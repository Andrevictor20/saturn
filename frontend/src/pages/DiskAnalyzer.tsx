import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  PieChart,
  FolderTree,
  Sparkles,
  ShieldAlert,
  ArrowRight,
  FolderSearch,
  Compass,
  Activity,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useDiskAnalyzerStore, diskAnalyzerStore } from '../stores/diskAnalyzerStore';
import type { DiskItemStat } from '../stores/diskAnalyzerStore';
import { isPhysicalStorage } from '../utils/format';
import { getPathSafetyInfo } from '../utils/pathSafety';
import { DiskMountDeck, type MountItem } from '../components/disk/DiskMountDeck';
import { DiskTopConsumers } from '../components/disk/DiskTopConsumers';
import { DiskDirectoryTree } from '../components/disk/DiskDirectoryTree';
import { DiskInsightsTab } from '../components/disk/DiskInsightsTab';
import { DiskSafetyGuideTab } from '../components/disk/DiskSafetyGuideTab';
import { DiskSmartSection } from '../components/files/DiskSmartSection';
import { useTranslation } from 'react-i18next';
import { useConfirm } from '../contexts/ConfirmContext';

export function DiskAnalyzer() {
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentUrlPath = searchParams.get('path') || '/';

  const store = useDiskAnalyzerStore();
  const currentPath = store.targetPath || currentUrlPath;
  const [customInputPath, setCustomInputPath] = useState<string>(currentUrlPath);

  const data = store.results;
  const loading = store.isScanning;
  const error = store.error;

  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [storages, setStorages] = useState<MountItem[]>([]);
  const [activeTab, setActiveTab] = useState<'ncdu' | 'insights' | 'safety' | 'smart'>('ncdu');

  // Search and Sort states
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState<'size' | 'percentage' | 'name'>('size');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  // Prune / Cleanup loading states
  const [isPruningDocker, setIsPruningDocker] = useState<boolean>(false);
  const [isCleaningTrash, setIsCleaningTrash] = useState<boolean>(false);

  // Load mount points / disks
  const loadMounts = async () => {
    try {
      const res = await fetch('/api/system/storage');
      if (!res.ok) throw new Error(t('disk.get_disks_error', 'Falha ao obter discos'));
      const json: MountItem[] = await res.json();
      const physicalOnly = (Array.isArray(json) ? json : []).filter((s) =>
        isPhysicalStorage(s.name, s.mount_point, s.fs_type)
      );
      setStorages(physicalOnly);
    } catch {
      // Ignore fallback
    }
  };

  useEffect(() => {
    loadMounts();
  }, []);

  // Fetch or trigger analysis
  const fetchAnalysis = (targetPath: string) => {
    setCustomInputPath(targetPath);
    setElapsedSeconds(0);

    let totalBytes = 0;
    if (storages.length > 0) {
      const storage = storages.find((s) => targetPath.startsWith(s.mount_point));
      if (storage) {
        totalBytes = storage.total_bytes;
      }
    }
    diskAnalyzerStore.startAnalysis(targetPath, totalBytes);
  };

  // Timer effect during scanning
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    if (loading) {
      timer = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [loading]);

  useEffect(() => {
    if (store.targetPath) {
      setCustomInputPath(store.targetPath);
    }
  }, [store.targetPath]);

  useEffect(() => {
    if (currentUrlPath) {
      fetchAnalysis(currentUrlPath);
    }
  }, [currentUrlPath]);

  const handleNavigate = (newPath: string) => {
    setSearchParams({ path: newPath });
    setCustomInputPath(newPath);
    fetchAnalysis(newPath);
  };

  const handleGoUp = () => {
    if (!currentPath || currentPath === '/') return;
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    const parentPath = '/' + parts.join('/');
    handleNavigate(parentPath || '/');
  };

  const handleCustomPathSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customInputPath.trim()) return;
    handleNavigate(customInputPath.trim());
  };

  // Top 5 Space Consumers
  const topConsumers = useMemo(() => {
    if (!data || !data.items) return [];
    return [...data.items].sort((a, b) => b.size - a.size).slice(0, 5);
  }, [data]);

  // Filtered & Sorted items
  const filteredItems = useMemo(() => {
    if (!data || !data.items) return [];
    let items = [...data.items];

    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      items = items.filter((item) => item.name.toLowerCase().includes(q));
    }

    items.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'size') comparison = a.size - b.size;
      else if (sortBy === 'percentage') comparison = a.percentage - b.percentage;
      else if (sortBy === 'name') comparison = a.name.localeCompare(b.name);
      return sortAsc ? comparison : -comparison;
    });

    return items;
  }, [data, searchFilter, sortBy, sortAsc]);

  // Breadcrumbs
  const breadcrumbSegments = useMemo(() => {
    if (!currentPath || currentPath === '/') {
      return [{ label: '/', path: '/' }];
    }
    const segments = currentPath.split('/').filter(Boolean);
    const result = [{ label: '/', path: '/' }];
    let acc = '';
    for (const seg of segments) {
      acc += '/' + seg;
      result.push({ label: seg, path: acc });
    }
    return result;
  }, [currentPath]);

  // Safe delete handler with prompt
  const handleDeleteItem = async (item: DiskItemStat) => {
    const safety = getPathSafetyInfo(item.path, t);
    if (safety.level === 'critical') {
      toast.error(t('disk.critical_warning', { name: item.name, defaultValue: `Bloqueado: "${item.name}" é um arquivo crítico do sistema e não deve ser removido.` }));
      return;
    }

    const confirmedMove = await confirm({
      title: t('disk.move_trash_title', 'Mover para Lixeira'),
      message: t('disk.confirm_move_trash', { name: item.name, defaultValue: `Tem certeza que deseja mover "${item.name}" para a lixeira?` }),
      confirmText: t('common.move_to_trash', 'Mover para Lixeira'),
      cancelText: t('common.cancel', 'Cancelar'),
      isDestructive: true,
    });
    if (!confirmedMove) return;

    try {
      const res = await fetch('/api/files/trash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: [item.path] }),
      });
      if (!res.ok) throw new Error(t('disk.delete_item_error', 'Erro ao excluir item'));
      toast.success(t('disk.moved_to_trash', { name: item.name, defaultValue: `"${item.name}" movido para a lixeira!` }));
      fetchAnalysis(currentPath);
    } catch {
      toast.error(t('disk.delete_item_fail', 'Falha ao excluir item.'));
    }
  };

  // 1-Click Docker Prune
  const handleDockerPrune = async () => {
    const confirmedPrune = await confirm({
      title: t('disk.docker_prune_title', 'Limpeza do Docker'),
      message: t('disk.docker_prune_confirm', 'Deseja executar a limpeza do Docker (remover imagens órfãs, build cache e containers parados)?'),
      confirmText: t('disk.prune_now', 'Executar Limpeza'),
      cancelText: t('common.cancel', 'Cancelar'),
      isDestructive: false,
    });
    if (!confirmedPrune) return;

    setIsPruningDocker(true);
    try {
      const res = await fetch('/api/docker/images/prune', { method: 'POST' });
      if (!res.ok) throw new Error('Falha ao limpar Docker');
      const resJson = await res.json();
      const freed = resJson.space_reclaimed ? t('disk.docker_pruned_freed', { size: resJson.space_reclaimed, defaultValue: ` (${resJson.space_reclaimed} liberados)` }) : '';
      toast.success(`${t('disk.docker_pruned_success', 'Docker limpo com sucesso!')}${freed}`);
      loadMounts();
      fetchAnalysis(currentPath);
    } catch {
      toast.error(t('disk.docker_prune_error', 'Erro ao executar docker prune.'));
    } finally {
      setIsPruningDocker(false);
    }
  };

  // 1-Click Empty System Trash
  const handleEmptyTrash = async () => {
    const confirmedEmpty = await confirm({
      title: t('disk.empty_trash_title', 'Esvaziar Lixeira'),
      message: t('disk.empty_trash_confirm', 'Tem certeza que deseja esvaziar permanentemente a lixeira do sistema?'),
      confirmText: t('common.empty_trash', 'Esvaziar Permanentemente'),
      cancelText: t('common.cancel', 'Cancelar'),
      isDestructive: true,
    });
    if (!confirmedEmpty) return;

    setIsCleaningTrash(true);
    try {
      const res = await fetch('/api/files/trash', { method: 'DELETE' });
      if (!res.ok) throw new Error('Erro ao esvaziar');
      toast.success(t('disk.empty_trash_success', 'Lixeira esvaziada com sucesso!'));
      loadMounts();
      fetchAnalysis(currentPath);
    } catch {
      toast.error(t('disk.empty_trash_error', 'Erro ao esvaziar lixeira.'));
    } finally {
      setIsCleaningTrash(false);
    }
  };

  // Quick Preset Folders
  const presetFolders = [
    { label: t('disk.preset_system', 'Sistema (/)'), path: '/' },
    { label: t('disk.preset_home', 'Início (/home)'), path: '/home' },
    { label: t('disk.preset_docker', 'Docker (/var/lib/docker)'), path: '/var/lib/docker' },
    { label: t('disk.preset_logs', 'Logs (/var/log)'), path: '/var/log' },
    { label: t('disk.preset_cache_apt', 'Cache APT (/var/cache/apt)'), path: '/var/cache/apt' },
    { label: t('disk.preset_temp', 'Temporários (/tmp)'), path: '/tmp' },
    { label: t('disk.preset_external', 'HD Externo (/mnt)'), path: '/mnt' },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 space-y-4 sm:space-y-6 animate-in fade-in duration-200">
      {/* Top Header Card */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-card border border-border/80 rounded-2xl p-4 sm:p-6 shadow-lg">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-saturn-500/15 text-saturn-400 border border-saturn-500/30 shadow-inner">
            <PieChart className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-primary">
              {t('disk.title', 'Analisador de Espaço em Disco')}
            </h1>
            <p className="text-xs text-secondary mt-0.5">
              {t('disk.subtitle', 'Análise hierárquica precisa, maiores consumidores de espaço e diretrizes de segurança')}
            </p>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-1 bg-accent/60 border border-border/80 p-1 rounded-xl shrink-0 w-full lg:w-auto overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab('ncdu')}
            className={`flex-1 lg:flex-initial flex items-center justify-center gap-2 px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              activeTab === 'ncdu'
                ? 'bg-saturn-500 text-white shadow-md shadow-saturn-500/25'
                : 'text-secondary hover:text-primary hover:bg-accent'
            }`}
          >
            <FolderTree className="w-3.5 h-3.5" />
            <span>{t('disk.folder_tree', 'Árvore de Pastas')}</span>
          </button>
          <button
            onClick={() => setActiveTab('insights')}
            className={`flex-1 lg:flex-initial flex items-center justify-center gap-2 px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              activeTab === 'insights'
                ? 'bg-saturn-500 text-white shadow-md shadow-saturn-500/25'
                : 'text-secondary hover:text-primary hover:bg-accent'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>{t('disk.insights_and_tips', 'Insights & Dicas')}</span>
          </button>
          <button
            onClick={() => setActiveTab('safety')}
            className={`flex-1 lg:flex-initial flex items-center justify-center gap-2 px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              activeTab === 'safety'
                ? 'bg-saturn-500 text-white shadow-md shadow-saturn-500/25'
                : 'text-secondary hover:text-primary hover:bg-accent'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
            <span>{t('disk.do_not_touch', 'O que NÃO Mexer')}</span>
          </button>
          <button
            onClick={() => setActiveTab('smart')}
            className={`flex-1 lg:flex-initial flex items-center justify-center gap-2 px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              activeTab === 'smart'
                ? 'bg-saturn-500 text-white shadow-md shadow-saturn-500/25'
                : 'text-secondary hover:text-primary hover:bg-accent'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-indigo-400" />
            <span>{t('disk.smart_tab', 'Saúde & S.M.A.R.T.')}</span>
          </button>
        </div>
      </div>

      {/* Disks Mounts Selector Deck */}
      <DiskMountDeck
        storages={storages}
        currentPath={currentPath}
        handleNavigate={handleNavigate}
      />

      {/* DIRECT PATH INPUT & QUICK PRESET CHIPS */}
      {activeTab !== 'smart' && (
        <div className="bg-card/85 backdrop-blur-2xl border border-border/80 rounded-2xl p-3 sm:p-4 space-y-3 shadow-sm">
        <form onSubmit={handleCustomPathSubmit} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative flex-1">
            <FolderSearch className="w-4 h-4 text-secondary absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={customInputPath}
              onChange={(e) => setCustomInputPath(e.target.value)}
              placeholder={t('disk.custom_path_placeholder', 'Digite qualquer caminho de pasta (ex: /var/lib/docker, /home, /var/log, /mnt)...')}
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-background border border-border text-xs text-primary font-mono placeholder:text-secondary/60 focus:outline-none focus:border-saturn-500 shadow-inner"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-saturn-500 hover:bg-saturn-600 active:scale-95 text-white text-xs font-semibold shadow-md shadow-saturn-500/20 transition-all disabled:opacity-50 shrink-0"
          >
            <span>{t('disk.analyze_folder', 'Analisar Pasta')}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </form>

        {/* Preset Chips */}
        <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
          <span className="text-secondary font-medium mr-1 flex items-center gap-1">
            <Compass className="w-3 h-3 text-saturn-400" />
            {t('disk.quick_shortcuts', 'Atalhos Rápidos:')}
          </span>
          {presetFolders.map((p) => (
            <button
              key={p.path}
              onClick={() => handleNavigate(p.path)}
              className={`px-2.5 py-1 rounded-lg border transition-all font-mono ${
                currentPath === p.path
                  ? 'bg-saturn-500/15 text-saturn-600 dark:text-saturn-300 border-saturn-500/40 font-semibold shadow-sm'
                  : 'bg-accent/60 text-secondary border-border/70 hover:text-primary hover:bg-accent'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      )}

      {/* TAB 1: DIRECTORY TREE & TOP CONSUMERS */}
      {activeTab === 'ncdu' && (
        <div className="space-y-4">
          <DiskTopConsumers
            topConsumers={topConsumers}
            currentPath={currentPath}
            totalSize={data?.total_size || 0}
            handleNavigate={handleNavigate}
          />
          <DiskDirectoryTree
            currentPath={currentPath}
            breadcrumbSegments={breadcrumbSegments}
            handleGoUp={handleGoUp}
            handleNavigate={handleNavigate}
            searchFilter={searchFilter}
            setSearchFilter={setSearchFilter}
            sortBy={sortBy}
            setSortBy={setSortBy}
            sortAsc={sortAsc}
            setSortAsc={setSortAsc}
            fetchAnalysis={fetchAnalysis}
            loading={loading}
            totalSize={data?.total_size || 0}
            itemCount={data?.item_count || 0}
            store={store}
            elapsedSeconds={elapsedSeconds}
            error={error}
            filteredItems={filteredItems}
            handleDeleteItem={handleDeleteItem}
          />
        </div>
      )}

      {/* TAB 2: SMART INSIGHTS & CLEANUP ADVISOR */}
      {activeTab === 'insights' && (
        <DiskInsightsTab
          handleDockerPrune={handleDockerPrune}
          isPruningDocker={isPruningDocker}
          handleNavigate={handleNavigate}
          handleEmptyTrash={handleEmptyTrash}
          isCleaningTrash={isCleaningTrash}
        />
      )}

      {/* TAB 3: FILESYSTEM SAFETY GUIDE */}
      {activeTab === 'safety' && <DiskSafetyGuideTab />}

      {/* TAB 4: S.M.A.R.T. PHYSICAL HEALTH */}
      {activeTab === 'smart' && <DiskSmartSection />}
    </div>
  );
}

export default DiskAnalyzer;
