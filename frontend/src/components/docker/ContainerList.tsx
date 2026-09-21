import { useEffect, useState, useMemo, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { type GroupContainerItem, type ContainerLike } from '../../utils/containerGroups';
import { AppGroupModal } from './AppGroupModal';
import { DockerInstallModal } from './DockerInstallModal';
import { BatchUpdateModal } from './BatchUpdateModal';
import { useBatchUpdate } from '../../contexts/BatchUpdateContext';
import {
  type Container,
  type PortInfo,
  CustomLinkModal,
  PrimaryContainerModal,
  StackGridCard,
  ContainerGridCard,
  ContainerTableView,
  ContainerListToolbar,
  ContainerSkeletonGrid,
  useFilteredContainers,
  useContainerCustomLinks,
  useContainerVisibility,
  useCloudflareRoutes,
} from './container-list';
import { CONTAINERS_QUERY_KEY } from '../../queries';
import { queryClient } from '../../lib/queryClient';

export type { Container, PortInfo };

let globalContainerCache: Container[] | null = null;

export function resetContainerCache() {
  globalContainerCache = null;
  queryClient.invalidateQueries({ queryKey: CONTAINERS_QUERY_KEY });
}

export function ContainerList() {
  const { t } = useTranslation();
  const [containers, setContainers] = useState<Container[]>(() => globalContainerCache || []);
  const [loading, setLoading] = useState(() => !globalContainerCache || globalContainerCache.length === 0);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [groupByStack, setGroupByStack] = useState<boolean>(true);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [selectedGroupModal, setSelectedGroupModal] = useState<GroupContainerItem | null>(null);
  const [primarySelectorModal, setPrimarySelectorModal] = useState<{ isOpen: boolean; group: GroupContainerItem | null }>({ isOpen: false, group: null });
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [updatesMap, setUpdatesMap] = useState<Record<string, { has_update: boolean }>>({});
  const { isModalOpen, openModal, closeModal } = useBatchUpdate();
  const [customLinks, setCustomLinks] = useState<Record<string, string>>({});
  const [isDockerInstallOpen, setIsDockerInstallOpen] = useState(false);
  const [watchtowerChecking, setWatchtowerChecking] = useState(false);
  
  // New filtering and sorting states
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'cpu' | 'ram' | 'disk'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const { isAdmin, isContainerHidden, toggleVisibility } = useContainerVisibility();
  const { cloudflareRoutes, fetchCloudflareRoutes } = useCloudflareRoutes(isAdmin, setCustomLinks);
  const handleToggleVisibility = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    toggleVisibility(id);
  };

  const fetchContainers = async (showLoading = true) => {
    if (showLoading && (!globalContainerCache || globalContainerCache.length === 0)) {
      setLoading(true);
    }
    try {
      const token = typeof localStorage !== 'undefined' ? localStorage.getItem('saturn_token') : null;
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      const res = await fetch('/api/docker/containers', { headers, credentials: 'include' });
      if (res.ok) {
        const data: Container[] = await res.json();
        
        // Update containers immediately with basic fast listing
        setContainers(prev => {
          const updated = data.map(c => {
            const existing = prev.find(p => p.id === c.id);
            return existing 
              ? { ...c, cpu_percent: existing.cpu_percent, memory_used: existing.memory_used, memory_limit: existing.memory_limit }
              : c;
          });
          globalContainerCache = updated;
          return updated;
        });
        setLoading(false);

        // Fetch CPU/RAM/Disk stats snapshot in the background without stalling the view
        fetch('/api/docker/containers/stats/snapshot', { headers, credentials: 'include' })
          .then(r => r.ok ? r.json() : null)
          .then(statsData => {
            if (Array.isArray(statsData)) {
              setContainers(prev => {
                const merged = prev.map(c => {
                  const s = statsData.find((st: any) => st.id && (st.id === c.id || c.id.startsWith(st.id) || st.id.startsWith(c.id)));
                  return s ? { ...c, cpu_percent: s.cpu_percent, memory_used: s.memory_used, memory_limit: s.memory_limit, size_rw: s.size_rw ?? c.size_rw, size_root_fs: s.size_root_fs ?? c.size_root_fs } : c;
                });
                globalContainerCache = merged;
                return merged;
              });
            }
          })
          .catch(() => {});
      }
    } catch (err) {
      console.error('Failed to fetch containers', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (e: React.MouseEvent, id: string, action: 'start' | 'stop' | 'restart' | 'pause' | 'unpause') => {
    e.stopPropagation();
    setActionLoading(id);
    try {
      await fetch(`/api/docker/containers/${id}/${action}`, { method: 'POST' });
      await fetchContainers();
    } catch (err) {
      console.error(`Failed to ${action} container`, err);
    } finally {
      setActionLoading(null);
    }
  };

  const fetchLinks = async () => {
    try {
      const res = await fetch('/api/docker/links', {
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      if (res.ok) {
        const data = await res.json();
        setCustomLinks(data);
      }
    } catch (err) {
      console.error('Failed to fetch links', err);
    }
  };

  const handleWatchtowerCheckNow = async () => {
    setWatchtowerChecking(true);
    try {
      const token = typeof localStorage !== 'undefined' ? localStorage.getItem('saturn_token') : null;
      await fetch('/api/docker/updates/check-now', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      await fetchUpdates();
      toast.success(t('containers.watchtower_check_complete', 'Varredura Watchtower concluída!'));
    } catch {
      toast.error(t('containers.watchtower_check_failed', 'Erro ao verificar atualizações'));
    } finally {
      setWatchtowerChecking(false);
    }
  };

  const {
    linkModal,
    setLinkModal,
    linkInput,
    setLinkInput,
    linkMode,
    setLinkMode,
    linkSubdomain,
    setLinkSubdomain,
    linkDomain,
    setLinkDomain,
    handleSetCustomLink,
    handleSaveLink,
  } = useContainerCustomLinks(containers, customLinks, cloudflareRoutes, fetchLinks);

  const fetchUpdates = async () => {
    try {
      const token = typeof localStorage !== 'undefined' ? localStorage.getItem('saturn_token') : null;
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch('/api/docker/containers/check-updates', {
        headers,
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setUpdatesMap(data);
      } else {
        console.warn('Failed to fetch container updates, status:', res.status);
      }
    } catch (err) {
      console.warn('Network error checking container updates:', err);
    }
  };

  const pendingUpdatesCount = useMemo(() => {
    return containers.filter(c => updatesMap[c.id]?.has_update || updatesMap[c.id?.substring(0, 12)]?.has_update).length;
  }, [containers, updatesMap]);

  const handleUpdateAllContainers = () => {
    openModal();
  };

  const handleSelectStackPrimary = (groupKey: string, containerId: string, containerName: string) => {
    localStorage.setItem(`saturn_stack_primary_${groupKey}`, containerId);
    toast.success(t('containers.primary_selected', { name: containerName }));
    setPrimarySelectorModal({ isOpen: false, group: null });
    // Force re-render of groups
    setContainers(prev => [...prev]);
  };

  const handleUpdateContainer = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    openModal(id);
  };

  useEffect(() => {
    const handleContainersUpdated = () => {
      fetchContainers(false);
      fetchUpdates();
      fetchCloudflareRoutes();
    };
    window.addEventListener('saturn:containers-updated', handleContainersUpdated);
    return () => window.removeEventListener('saturn:containers-updated', handleContainersUpdated);
  }, []);

  useEffect(() => {
    fetchContainers();
    fetchLinks();
    fetchUpdates();
    fetchCloudflareRoutes();
    const interval = setInterval(() => {
      if (!actionLoading) {
        fetchContainers(false);
      }
    }, 10000); // refresh every 10s as proposed
    return () => clearInterval(interval);
  }, [actionLoading]);

  const { filteredAndSortedContainers, displayItems } = useFilteredContainers(
    containers,
    searchQuery,
    sortBy,
    sortOrder,
    groupByStack,
    customLinks
  );

  const toggleGroupExpanded = (groupKey: string) => {
    setExpandedGroups(prev => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  const handleGroupAction = async (
    e: MouseEvent,
    group: GroupContainerItem,
    action: 'start' | 'stop' | 'restart'
  ) => {
    e.stopPropagation();
    setActionLoading(`group:${group.groupKey}:${action}`);
    try {
      await Promise.allSettled(
        group.containers.map((c: ContainerLike) => fetch(`/api/docker/containers/${c.id}/${action}`, { method: 'POST' }))
      );
      await fetchContainers(false);
    } catch (err) {
      console.error(`Failed to ${action} group ${group.name}`, err);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in zoom-in-95 duration-300">
      <ContainerListToolbar
        totalCount={containers.length}
        runningCount={containers.filter(c => c.state === 'running').length}
        groupByStack={groupByStack}
        onToggleGroupByStack={() => setGroupByStack(!groupByStack)}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        pendingUpdatesCount={pendingUpdatesCount}
        onUpdateAllContainers={handleUpdateAllContainers}
        onRefresh={() => {
          fetchContainers(true);
          fetchUpdates();
        }}
        loading={loading}
        onOpenDockerInstall={() => setIsDockerInstallOpen(true)}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        sortBy={sortBy}
        onSortByChange={setSortBy}
        sortOrder={sortOrder}
        onToggleSortOrder={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
        watchtowerChecking={watchtowerChecking}
        onWatchtowerCheckNow={handleWatchtowerCheckNow}
      />

      {loading && containers.length === 0 && (
        <ContainerSkeletonGrid count={10} />
      )}

      {filteredAndSortedContainers.length === 0 && !loading && (
        <div className="flex-1 flex items-center justify-center text-secondary border border-dashed border-border rounded-lg bg-card/50">
          Nenhum container encontrado.
        </div>
      )}

      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 overflow-y-auto pt-3 px-1.5 pb-6 -mt-1.5 -mx-1.5">
          {displayItems.map(item => {
            if (item.type === 'group') {
              return (
                <StackGridCard
                  key={item.id}
                  group={item}
                  actionLoading={actionLoading}
                  updatesMap={updatesMap}
                  onOpenGroupModal={(group) => setSelectedGroupModal(group)}
                  onOpenPrimarySelector={(group) => setPrimarySelectorModal({ isOpen: true, group })}
                  onGroupAction={handleGroupAction}
                  onUpdateContainer={handleUpdateContainer}
                />
              );
            }

            return (
              <ContainerGridCard
                key={item.container.id}
                container={item.container}
                customLinks={customLinks}
                updatesMap={updatesMap}
                actionLoading={actionLoading}
                onAction={handleAction}
                onUpdateContainer={handleUpdateContainer}
                onSetCustomLink={handleSetCustomLink}
                isAdmin={isAdmin}
                isHidden={isContainerHidden(item.container.id, item.container.name)}
                onToggleVisibility={handleToggleVisibility}
              />
            );
          })}
        </div>
      )}

      {viewMode === 'table' && containers.length > 0 && (
        <ContainerTableView
          items={displayItems}
          expandedGroups={expandedGroups}
          actionLoading={actionLoading}
          updatesMap={updatesMap}
          customLinks={customLinks}
          onToggleGroupExpanded={toggleGroupExpanded}
          onOpenGroupModal={(group) => setSelectedGroupModal(group)}
          onGroupAction={handleGroupAction}
          onAction={handleAction}
          onUpdateContainer={handleUpdateContainer}
          onSetCustomLink={handleSetCustomLink}
          isAdmin={isAdmin}
          isContainerHidden={isContainerHidden}
          onToggleVisibility={handleToggleVisibility}
        />
      )}

      {/* App Group / Stack Modal */}
      <AppGroupModal
        group={selectedGroupModal}
        isOpen={Boolean(selectedGroupModal)}
        onClose={() => setSelectedGroupModal(null)}
        onRefresh={() => fetchContainers(false)}
        onEditLink={(id) => handleSetCustomLink({ stopPropagation: () => {} } as any, id)}
        customLinks={customLinks}
        updatesMap={updatesMap}
        onUpdateContainer={handleUpdateContainer}
      />

      {/* Custom Link Modal */}
      <CustomLinkModal
        isOpen={linkModal.isOpen}
        linkMode={linkMode}
        setLinkMode={setLinkMode}
        linkSubdomain={linkSubdomain}
        setLinkSubdomain={setLinkSubdomain}
        linkDomain={linkDomain}
        setLinkDomain={setLinkDomain}
        linkInput={linkInput}
        setLinkInput={setLinkInput}
        detectedCloudflareUrl={linkModal.detectedCloudflareUrl}
        containerName={linkModal.containerName}
        onSave={handleSaveLink}
        onClose={() => setLinkModal({ isOpen: false, containerId: null })}
      />

      {/* Primary Container Selector Modal for Stacks */}
      <PrimaryContainerModal
        isOpen={primarySelectorModal.isOpen}
        group={primarySelectorModal.group}
        customLinks={customLinks}
        onClose={() => setPrimarySelectorModal({ isOpen: false, group: null })}
        onSelectPrimary={handleSelectStackPrimary}
        onEditLink={handleSetCustomLink}
      />

      {/* Docker Run / Compose Auto-Install Modal */}
      <DockerInstallModal
        isOpen={isDockerInstallOpen}
        onClose={() => setIsDockerInstallOpen(false)}
        onSuccess={() => fetchContainers(false)}
      />

      {/* Batch Container Update Modal */}
      <BatchUpdateModal
        isOpen={isModalOpen}
        onClose={closeModal}
        containers={containers}
        updatesMap={updatesMap}
        onUpdateComplete={async () => {
          await fetchContainers(false);
          await fetchUpdates();
        }}
      />
    </div>
  );
}
