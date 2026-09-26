import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { RefreshCw, X } from 'lucide-react';
import type { ContainerLike } from '../../utils/containerGroups';
import { useBatchUpdate } from '../../contexts/BatchUpdateContext';
import { ContainerSelectionPhase, ExecutionPhase } from './BatchUpdatePhases';

export interface BatchUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  containers: ContainerLike[];
  updatesMap: Record<string, { has_update?: boolean; image?: string }>;
  onUpdateComplete?: () => Promise<void> | void;
  initialSelectedId?: string;
}

const isSaturnSelf = (c: ContainerLike): boolean => {
  const cleanName = c.name.replace(/^\//, '');
  return (
    cleanName === 'saturn' ||
    cleanName === 'saturn-dashboard' ||
    Boolean(c.image?.includes('saturn')) ||
        cleanName === 'saturn-dashboard' ||
    Boolean(c.image?.includes('saturn-dashboard'))
  );
};

export const BatchUpdateModal: React.FC<BatchUpdateModalProps> = ({
  isOpen, onClose, containers, updatesMap, onUpdateComplete, initialSelectedId,
}) => {
  const { t } = useTranslation();
  const batch = useBatchUpdate();

  const [showLogs, setShowLogs] = useState(true);
  const [expandedErrors, setExpandedErrors] = useState<Record<string, boolean>>({});
  const [copiedLogs, setCopiedLogs] = useState(false);

  const outdatedContainers = useMemo(() =>
    containers.filter(c => updatesMap[c.id]?.has_update || updatesMap[c.id?.substring(0, 12)]?.has_update),
    [containers, updatesMap]
  );
  const updatableContainers = useMemo(() => outdatedContainers.filter(c => !isSaturnSelf(c)), [outdatedContainers]);

  useEffect(() => {
    if (isOpen && !batch.isUpdating && !batch.isCompleted) {
      setExpandedErrors({});
      if (initialSelectedId && outdatedContainers.find(c => c.id === initialSelectedId && !isSaturnSelf(c))) {
        batch.setSelectedIds([initialSelectedId]);
      } else {
        batch.setSelectedIds(updatableContainers.map(c => c.id));
      }
    }
  }, [isOpen, initialSelectedId, outdatedContainers.length, batch.isUpdating, batch.isCompleted]);

  if (!isOpen) return null;

  const handleSelectAll = () => {
    if (batch.selectedIds.length === updatableContainers.length) batch.deselectAllContainers();
    else batch.selectAllContainers(updatableContainers.map(c => c.id));
  };

  const handleToggle = (id: string) => {
    const target = containers.find(c => c.id === id);
    if (target && isSaturnSelf(target)) return;
    batch.toggleSelectContainer(id);
  };

  const handleStartUpdate = async () => {
    const targets = updatableContainers.filter(c => batch.selectedIds.includes(c.id));
    if (targets.length === 0) return;
    await batch.startBatchUpdate(targets);
    if (onUpdateComplete) await onUpdateComplete();
  };

  const handleRetryFailed = async () => {
    await batch.retryFailed(containers);
    if (onUpdateComplete) await onUpdateComplete();
  };

  const handleClose = () => { batch.closeModal(); onClose(); };
  const handleMinimize = () => { batch.minimizeModal(); onClose(); };

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(batch.logs.join('\n'));
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  const { isUpdating, isCompleted, taskStatuses, logs, selectedIds, successCount, failedCount, cancelledCount, completedTasks, totalTasks, progressPercent } = batch;

  return typeof document !== 'undefined' ? createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={!isUpdating ? handleClose : undefined}>
      <div className="relative w-full max-w-3xl max-h-[92vh] flex flex-col bg-card border border-border rounded-2xl shadow-2xl overflow-hidden text-primary my-auto" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="batch-update-title">

        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-border bg-card/90 backdrop-blur-md sticky top-0 z-10 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-saturn-500/15 text-saturn-500">
              <RefreshCw className={`w-5 h-5 ${isUpdating ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <h2 id="batch-update-title" className="text-base sm:text-lg font-semibold tracking-tight text-primary flex items-center gap-2">
                {t('batch_update_modal.title')}
                {updatableContainers.length > 0 && !isUpdating && !isCompleted && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 font-semibold">{updatableContainers.length} pendente(s)</span>
                )}
              </h2>
              <p className="text-xs text-slate-600 dark:text-secondary">{t('batch_update_modal.subtitle')}</p>
            </div>
          </div>
          <button onClick={isUpdating ? handleMinimize : handleClose} className="p-2 text-slate-700 dark:text-secondary hover:text-primary rounded-lg hover:bg-accent transition-colors" title={isUpdating ? 'Continuar em segundo plano' : 'Fechar'}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {!isUpdating && !isCompleted ? (
            <ContainerSelectionPhase
              displayedContainers={outdatedContainers}
              updatableContainers={updatableContainers}
              updatesMap={updatesMap}
              selectedIds={selectedIds}
              concurrency={batch.concurrency}
              setConcurrency={batch.setConcurrency}
              onToggle={handleToggle}
              onSelectAll={handleSelectAll}
              onStart={handleStartUpdate}
              onClose={handleClose}
              isSaturnSelf={isSaturnSelf}
            />
          ) : (
            <ExecutionPhase
              taskStatuses={taskStatuses}
              logs={logs}
              isUpdating={isUpdating}
              failedCount={failedCount}
              successCount={successCount}
              cancelledCount={cancelledCount}
              completedTasks={completedTasks}
              totalTasks={totalTasks}
              progressPercent={progressPercent}
              showLogs={showLogs}
              copiedLogs={copiedLogs}
              expandedErrors={expandedErrors}
              onToggleShowLogs={() => setShowLogs(!showLogs)}
              onCopyLogs={handleCopyLogs}
              onToggleError={(id) => setExpandedErrors(prev => ({ ...prev, [id]: !prev[id] }))}
              onCancelContainer={batch.cancelContainer}
              onCancelAll={batch.cancelAll}
              onMinimize={handleMinimize}
              onRetryFailed={handleRetryFailed}
              onClose={handleClose}
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  ) : null;
};
