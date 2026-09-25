import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Package, 
  RefreshCw, 
  Terminal, 
  Sparkles, 
  ChevronRight, 
  Flame,
  LayoutGrid,
  FolderGit2,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ComposeInstallModal } from '../components/docker/ComposeInstallModal';
import { CustomInstallModal } from '../components/docker/CustomInstallModal';
import { PortConflictDialog } from '../components/docker/PortConflictDialog';
import toast from 'react-hot-toast';

import { useStoreAppsQuery, STORE_APPS_QUERY_KEY } from '../queries';
import { 
  AppStoreCard, 
  AppStoreSidebar, 
  AppStoreHeroCarousel, 
  StoreRepositoriesModal,
  AppStoreArchFilter,
  useAppStoreInstall,
  useAppInstalled,
  type DockerContainerLite
} from '../components/appstore';
import { useSystemVersionQuery } from '../queries/useSystemVersionQuery';
import { parseAppArchitectures, isArchCompatibleWithHost } from '../utils/architecture';
import { queryClient } from '../lib/queryClient';
import { useAuth } from '../contexts/AuthContext';



export function AppStore() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: queryApps, isLoading: queryLoading } = useStoreAppsQuery();
  const apps = useMemo(() => queryApps || [], [queryApps]);
  const [installedContainers, setInstalledContainers] = useState<DockerContainerLite[]>([]);
  const loading = queryLoading && apps.length === 0;

  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Discover');
  const [selectedArch, setSelectedArch] = useState<string>('all');
  const { data: systemVersion } = useSystemVersionQuery();
  const hostArch = systemVersion?.arch;
  const [selectedStore, setSelectedStore] = useState<string>('All');
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const [isRepositoriesOpen, setIsRepositoriesOpen] = useState(false);
  const [heroIndex, setHeroIndex] = useState(0);

  const {
    installing,
    customModalApp,
    setCustomModalApp,
    portConflictData,
    setPortConflictData,
    isDockerInstallOpen,
    setIsDockerInstallOpen,
    handleInstall,
    handleCustomInstall,
    handleAcceptSuggestedPorts,
    handleOpenCustomFromConflict,
  } = useAppStoreInstall();

  useEffect(() => {
    if (searchParams.get('custom') === 'true') {
      setIsDockerInstallOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const fetchInstalledContainers = async () => {
    try {
      const token = localStorage.getItem('saturn_token');
      const res = await fetch('/api/docker/containers', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setInstalledContainers(data);
        }
      }
    } catch {
      // Ignore background container fetch errors
    }
  };

  useEffect(() => {
    fetchInstalledContainers();
  }, []);

  const handleSync = async () => {
    try {
      setSyncing(true);
      const loadingToast = toast.loading(t('store.syncing_stores', 'Sincronizando lojas de aplicativos...'));
      const token = localStorage.getItem('saturn_token');
      const res = await fetch('/api/store/sync', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(t('store.catalog_updated', { count: data.total_apps || 0, defaultValue: `Catálogo atualizado! (${data.total_apps || 0} apps)` }), { id: loadingToast });
        queryClient.invalidateQueries({ queryKey: STORE_APPS_QUERY_KEY });
      } else {
        toast.error(t('store.sync_error', 'Erro ao sincronizar lojas.'), { id: loadingToast });
      }
    } catch (err: any) {
      console.error('Sync error:', err);
      toast.error(t('store.sync_connection_error', 'Erro de conexão ao sincronizar.'));
    } finally {
      setSyncing(false);
    }
  };

  const dynamicCategories = useMemo(() => {
    const unique = Array.from(new Set(apps.map(app => app.category))).filter(Boolean).sort();
    return unique;
  }, [apps]);

  const stores = useMemo(() => ['All', ...Array.from(new Set(apps.map(app => app.store)))].sort(), [apps]);

  const isAppInstalled = useAppInstalled(installedContainers);

  // Featured apps for Hero Banner
  const featuredApps = useMemo(() => {
    if (apps.length === 0) return [];
    return apps.slice(0, 5);
  }, [apps]);

  // Auto-advance hero banner
  useEffect(() => {
    if (featuredApps.length <= 1) return;
    const interval = setInterval(() => {
      setHeroIndex(prev => (prev + 1) % featuredApps.length);
    }, 7000);
    return () => clearInterval(interval);
  }, [featuredApps.length]);

  const filteredApps = useMemo(() => {
    const q = search.trim().toLowerCase();
    return apps.filter(app => {
      const matchesSearch = !q || 
                            app.name.toLowerCase().includes(q) ||
                            app.description.toLowerCase().includes(q) ||
                            app.category.toLowerCase().includes(q);
      
      const matchesCategory = selectedCategory === 'Discover' || 
                              selectedCategory === 'All' || 
                              app.category.toLowerCase() === selectedCategory.toLowerCase();
                              
      const matchesStore = selectedStore === 'All' || app.store === selectedStore;
      const matchesArch = (() => {
        if (selectedArch === 'all') return true;
        const info = parseAppArchitectures(app.architectures);
        if (selectedArch === 'compatible') return isArchCompatibleWithHost(info, hostArch).isCompatible;
        if (selectedArch === 'multi') return info.isMultiArch;
        if (selectedArch === 'x86') return info.isOnlyX86;
        if (selectedArch === 'arm') return info.isOnlyArm;
        return true;
      })();
      
      return matchesSearch && matchesCategory && matchesStore && matchesArch;
    });
  }, [apps, search, selectedCategory, selectedStore, selectedArch, hostArch]);

  const isDiscoverMode = selectedCategory === 'Discover' && !search.trim() && selectedStore === 'All' && selectedArch === 'all';

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card border border-border/70 p-4 sm:p-5 rounded-2xl shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-saturn-500/10 border border-saturn-500/20 flex items-center justify-center text-saturn-400 shadow-inner shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-primary flex items-center gap-2">
              {t('store.title')}
              <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-saturn-500/15 text-saturn-400 border border-saturn-500/30">
                Hub
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-secondary mt-0.5">
              {t('store.subtitle')}
            </p>
          </div>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2.5 flex-wrap w-full sm:w-auto">
            <button
              onClick={() => setIsDockerInstallOpen(true)}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-saturn-500 hover:bg-saturn-600 text-white shadow-md shadow-saturn-500/20 transition-all active:scale-[0.98]"
              title={t('docker_install.title')}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>{t('store.install_custom')}</span>
            </button>
            
            <button
              onClick={() => setIsRepositoriesOpen(true)}
              className="flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium bg-card hover:bg-accent border border-border text-secondary hover:text-primary transition-all active:scale-[0.98] shadow-sm"
              title={t('store.manage_repositories', 'Gerenciar Repositórios')}
            >
              <FolderGit2 className="w-3.5 h-3.5 text-saturn-400" />
              <span className="hidden sm:inline">{t('store.repositories', 'Repositórios')}</span>
            </button>

            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium bg-card hover:bg-accent border border-border text-secondary hover:text-primary transition-all active:scale-[0.98] disabled:opacity-50 shadow-sm"
              title={t('store.sync_stores')}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin text-saturn-500' : ''}`} />
              <span className="hidden sm:inline">{syncing ? t('store.syncing_stores') : t('store.sync_stores')}</span>
            </button>
          </div>
        )}
      </div>

      <ComposeInstallModal isOpen={isDockerInstallOpen} onClose={() => setIsDockerInstallOpen(false)} />
      
      <StoreRepositoriesModal 
        isOpen={isRepositoriesOpen} 
        onClose={() => setIsRepositoriesOpen(false)}
        onSyncTriggered={() => queryClient.invalidateQueries({ queryKey: STORE_APPS_QUERY_KEY })}
      />

      {/* Main Grid: Left Category Sidebar + Right Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-[250px_1fr] gap-6 items-start">
        {/* Left Navigation Sidebar */}
        <AppStoreSidebar
          stores={stores}
          selectedStore={selectedStore}
          onSelectStore={setSelectedStore}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          apps={apps}
          dynamicCategories={dynamicCategories}
          search={search}
          onSearchChange={setSearch}
          onClearSearch={() => setSearch('')}
          isCategoryMenuOpen={isCategoryMenuOpen}
          onToggleCategoryMenu={() => setIsCategoryMenuOpen(!isCategoryMenuOpen)}
          onCloseCategoryMenu={() => setIsCategoryMenuOpen(false)}
        />

        {/* Right Content Area */}
        <main className="space-y-7 min-w-0">
          {loading && apps.length === 0 ? (
            <div className="space-y-6 animate-pulse">
              {/* Hero Banner Skeleton */}
              <div className="h-56 bg-card border border-border/60 rounded-3xl p-8 flex items-end">
                <div className="flex items-center gap-4 w-full">
                  <div className="w-16 h-16 rounded-2xl bg-accent/60 shrink-0" />
                  <div className="space-y-2 flex-1">
                    <div className="h-4 w-24 bg-accent/60 rounded-full" />
                    <div className="h-7 w-64 bg-accent/80 rounded-lg" />
                    <div className="h-3 w-96 bg-accent/40 rounded" />
                  </div>
                </div>
              </div>

              {/* Grid Skeleton */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="bg-card border border-border/60 rounded-2xl p-5 h-48 flex flex-col justify-between">
                    <div className="flex items-start justify-between gap-3">
                      <div className="w-12 h-12 rounded-xl bg-accent/60 shrink-0" />
                      <div className="h-5 w-16 bg-accent/60 rounded-full" />
                    </div>
                    <div className="space-y-2 mt-3">
                      <div className="h-4 w-3/4 bg-accent/70 rounded" />
                      <div className="h-3 w-full bg-accent/40 rounded" />
                      <div className="h-3 w-4/5 bg-accent/40 rounded" />
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-border/40">
                      <div className="h-8 bg-accent/40 rounded-xl" />
                      <div className="h-8 bg-accent/60 rounded-xl" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : apps.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-4 text-center bg-card border border-border/70 rounded-3xl space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-saturn-500/10 border border-saturn-500/20 flex items-center justify-center text-saturn-400 shadow-inner">
                <Package className="w-8 h-8" />
              </div>
              <div className="space-y-1 max-w-md">
                <h3 className="text-lg font-bold text-primary">{t('store.no_apps_local', 'Nenhum aplicativo no catálogo local')}</h3>
                <p className="text-xs sm:text-sm text-secondary">
                  {t('store.no_apps_local_desc', 'O catálogo está sendo baixado em segundo plano ou você pode iniciar a sincronização imediata agora.')}
                </p>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-saturn-500 hover:bg-saturn-600 text-white shadow-md shadow-saturn-500/20 transition-all active:scale-[0.98]"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                  <span>{syncing ? t('store.syncing', 'Sincronizando...') : t('store.sync_catalog', 'Sincronizar Catálogo')}</span>
                </button>
                <button
                  onClick={() => setIsDockerInstallOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium bg-card hover:bg-accent border border-border text-secondary hover:text-primary transition-all active:scale-[0.98]"
                >
                  <Terminal className="w-3.5 h-3.5" />
                  <span>{t('store.install_manual', 'Instalar Manualmente')}</span>
                </button>
              </div>
            </div>
          ) : isDiscoverMode ? (
            /* ===== DISCOVER / FEATURED VIEW ===== */
            <>
              {/* Hero Banner Carousel */}
              <AppStoreHeroCarousel
                featuredApps={featuredApps}
                heroIndex={heroIndex}
                onSetHeroIndex={setHeroIndex}
                isAppInstalled={isAppInstalled}
                onExplore={(id) => navigate(`/store/app/${id}`)}
              />


              {/* Trending Now Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Flame className="w-4 h-4 text-amber-500" />
                    <span className="text-base font-bold text-primary tracking-tight">Trending Now</span>
                    <span className="text-xs text-secondary">· {t('store.popular_community', 'Populares na comunidade')}</span>
                  </div>
                  <button 
                    onClick={() => setSelectedCategory('All')}
                    className="text-xs font-semibold text-saturn-400 hover:text-saturn-300 transition-colors flex items-center gap-1"
                  >
                    <span>{t('store.view_all', 'Ver todos')}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5 3xl:grid-cols-6 gap-4">
                  {apps.slice(0, 4).map((app, index) => (
                    <AppStoreCard
                      key={`trending-${app.id}-${index}`}
                      app={app}
                      index={index}
                      isInstalled={isAppInstalled(app)}
                      installing={installing}
                      hostArch={hostArch}
                      onExplore={(id) => navigate(`/store/app/${id}`)}
                      onManage={() => navigate('/')}
                      onInstall={handleInstall}
                      onOpenCustom={(app) => setCustomModalApp(app)}
                    />
                  ))}
                </div>
              </div>

              {/* All Catalog Section */}
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <LayoutGrid className="w-4 h-4 text-saturn-500" />
                    <span className="text-base font-bold text-primary tracking-tight">
                      {t('store.catalog_applications', 'Catálogo de Aplicações')}
                    </span>
                    <span className="text-xs text-secondary">
                      {t('store.available_count', { count: filteredApps.length, defaultValue: `(${filteredApps.length} disponíveis)` })}
                    </span>
                  </div>
                  <AppStoreArchFilter selectedArch={selectedArch} onSelectArch={setSelectedArch} hostArch={hostArch} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 3xl:grid-cols-5 gap-4">
                  {filteredApps.map((app, index) => (
                    <AppStoreCard
                      key={`${app.store}-${app.id}-${index}`}
                      app={app}
                      index={index}
                      isInstalled={isAppInstalled(app)}
                      installing={installing}
                      hostArch={hostArch}
                      onExplore={(id) => navigate(`/store/app/${id}`)}
                      onManage={() => navigate('/')}
                      onInstall={handleInstall}
                      onOpenCustom={(app) => setCustomModalApp(app)}
                    />
                  ))}
                </div>
              </div>
            </>
          ) : (
            /* ===== CATEGORY / SEARCH FILTERED VIEW ===== */
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-1 border-b border-border/50 gap-4 flex-wrap">
                <div>
                  <h2 className="text-base font-bold text-primary tracking-tight">
                    {selectedCategory === 'All' ? t('store.all_applications', 'Todas as Aplicações') : selectedCategory}
                  </h2>
                  <p className="text-xs text-secondary mt-0.5">
                    {filteredApps.length === 1
                      ? t('store.apps_found_one', { count: 1, defaultValue: '1 aplicativo encontrado' })
                      : t('store.apps_found_other', { count: filteredApps.length, defaultValue: `${filteredApps.length} aplicativos encontrados` })}
                  </p>
                </div>
                <AppStoreArchFilter selectedArch={selectedArch} onSelectArch={setSelectedArch} hostArch={hostArch} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 3xl:grid-cols-5 gap-4">
                {filteredApps.map((app, index) => (
                  <AppStoreCard
                    key={`${app.store}-${app.id}-${index}`}
                    app={app}
                    index={index}
                    isInstalled={isAppInstalled(app)}
                    installing={installing}
                    hostArch={hostArch}
                    onExplore={(id) => navigate(`/store/app/${id}`)}
                    onManage={() => navigate('/')}
                    onInstall={handleInstall}
                    onOpenCustom={(app) => setCustomModalApp(app)}
                  />
                ))}
                
                {filteredApps.length === 0 && (
                  <div className="col-span-full py-16 text-center space-y-3 bg-card/20 rounded-2xl border border-dashed border-border/60">
                    <Package className="w-10 h-10 text-secondary/50 mx-auto" />
                    <p className="text-sm font-semibold text-primary">{t('store.no_apps_found', 'Nenhum aplicativo encontrado')}</p>
                    <p className="text-xs text-secondary max-w-sm mx-auto">
                      {t('store.no_apps_search_desc', { term: search, defaultValue: `Não encontramos apps com o termo "${search}". Tente buscar por outra categoria ou termo.` })}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {customModalApp && (
        <CustomInstallModal
          appId={customModalApp.id}
          appName={customModalApp.name}
          onClose={() => setCustomModalApp(null)}
          onInstall={handleCustomInstall}
        />
      )}

      {portConflictData && (
        <PortConflictDialog
          isOpen={portConflictData.isOpen}
          onClose={() => setPortConflictData(null)}
          appName={portConflictData.appName}
          conflicts={portConflictData.conflicts}
          onAcceptSuggested={handleAcceptSuggestedPorts}
          onOpenCustom={handleOpenCustomFromConflict}
          installing={installing === portConflictData.appId}
        />
      )}
    </div>
  );
}
