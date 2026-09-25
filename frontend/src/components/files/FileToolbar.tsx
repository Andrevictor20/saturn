import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  HardDrive,
  ChevronLeft,
  ChevronRight,
  Plus,
  FolderPlus,
  FilePlus,
  PieChart,
  Terminal,
  RefreshCw,
  Upload,
  Clipboard,
  ArrowUpDown,
  List,
  Grid,
  Trash2,
  CheckSquare,
  Square,
  Package,
  Copy,
  Scissors,
  X,
  Network,
} from 'lucide-react';
import type { FileItem } from '../../types/fileManager';
import type { OperationType } from './FileOperationsModal';
import { useAuth } from '../../contexts/AuthContext';

export interface FileToolbarProps {
  setIsStorageDrawerOpen: (open: boolean) => void;
  handleGoBack: () => void;
  historyIndex: number;
  handleGoForward: () => void;
  historyLength: number;
  currentFolderName: string;
  isTrashView: boolean;
  filteredFilesCount: number;
  showCreateMenu: boolean;
  setShowCreateMenu: React.Dispatch<React.SetStateAction<boolean>>;
  setOpTargetItem: (item: FileItem | null) => void;
  setOpModalType: (type: OperationType | null) => void;
  currentPath: string;
  loadFiles: (path: string) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  clipboard: { action: 'copy' | 'cut'; items: FileItem[] } | null;
  handlePaste: () => void;
  showSortMenu: boolean;
  setShowSortMenu: React.Dispatch<React.SetStateAction<boolean>>;
  sortBy: 'name' | 'size' | 'modified';
  setSortBy: (by: 'name' | 'size' | 'modified') => void;
  sortAsc: boolean;
  setSortAsc: React.Dispatch<React.SetStateAction<boolean>>;
  viewMode: 'grid' | 'list';
  setViewMode: React.Dispatch<React.SetStateAction<'grid' | 'list'>>;
  handleEmptyTrash: () => void;
  trashItemsCount: number;
  selectedItems: FileItem[];
  selectAll: () => void;
  handleCompressSelection: () => void;
  handleCopy: (items: FileItem[]) => void;
  handleCut: (items: FileItem[]) => void;
  handleMoveToTrash: (items: FileItem[]) => void;
  setSelectedItems: (items: FileItem[]) => void;
  onOpenSamba?: () => void;
}

export const FileToolbar: React.FC<FileToolbarProps> = ({
  setIsStorageDrawerOpen,
  handleGoBack,
  historyIndex,
  handleGoForward,
  historyLength,
  currentFolderName,
  isTrashView,
  filteredFilesCount,
  showCreateMenu,
  setShowCreateMenu,
  setOpTargetItem,
  setOpModalType,
  currentPath,
  loadFiles,
  fileInputRef,
  clipboard,
  handlePaste,
  showSortMenu,
  setShowSortMenu,
  sortBy,
  setSortBy,
  sortAsc,
  setSortAsc,
  viewMode,
  setViewMode,
  handleEmptyTrash,
  trashItemsCount,
  selectedItems,
  selectAll,
  handleCompressSelection,
  handleCopy,
  handleCut,
  handleMoveToTrash,
  setSelectedItems,
  onOpenSamba,
}) => {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();

  return (
    <>
      <header className="py-3 px-4 sm:px-6 border-b border-border/70 bg-card flex items-center justify-between gap-3 shrink-0">
        {/* Left Section: Back/Forward history & Current Folder Title */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Mobile Drawer Trigger */}
          <button
            onClick={() => setIsStorageDrawerOpen(true)}
            className="lg:hidden p-2 rounded-xl bg-card border border-border text-slate-700 dark:text-secondary hover:text-primary hover:bg-accent transition-colors flex items-center gap-1.5 text-xs shrink-0 shadow-sm"
            aria-label={t('files.storage_drives', 'Locais de armazenamento')}
          >
            <HardDrive className="w-4 h-4 text-saturn-600 dark:text-saturn-400" />
          </button>

          {/* History Back/Forward */}
          <div className="flex items-center gap-1 bg-accent/60 border border-border/70 p-0.5 rounded-xl shrink-0">
            <button
              onClick={handleGoBack}
              disabled={historyIndex <= 0}
              className="p-1.5 rounded-lg text-slate-700 dark:text-secondary hover:text-primary hover:bg-accent disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              title={t('common.back', 'Voltar')}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleGoForward}
              disabled={historyIndex >= historyLength - 1}
              className="p-1.5 rounded-lg text-slate-700 dark:text-secondary hover:text-primary hover:bg-accent disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              title={t('files.forward', 'Avançar')}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Folder Title & Count */}
          <div className="flex items-center gap-2.5 truncate">
            <h1 className="text-base sm:text-lg font-bold text-primary tracking-tight truncate">
              {currentFolderName}
            </h1>
            {!isTrashView && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-accent text-slate-700 dark:text-zinc-300 border border-border/60 shrink-0">
                {filteredFilesCount} {filteredFilesCount === 1 ? t('files.item', 'item') : t('files.items', 'itens')}
              </span>
            )}
          </div>
        </div>

        {/* Right Action Toolbar */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 flex-wrap sm:flex-nowrap">
          {!isTrashView && (
            <>
              {/* Create / New Menu */}
              <div className="relative">
                <button
                  onClick={() => setShowCreateMenu((prev) => !prev)}
                  className="p-2 rounded-xl border border-border/80 bg-card text-slate-700 dark:text-secondary hover:text-primary hover:bg-accent transition-colors shadow-sm"
                  title={t('files.new_file_or_folder', 'Novo arquivo ou pasta')}
                >
                  <Plus className="w-4 h-4" />
                </button>

                {showCreateMenu && (
                  <div className="absolute right-0 mt-1.5 w-48 bg-card border border-border rounded-xl shadow-2xl z-30 p-1 space-y-0.5 text-xs animate-in fade-in">
                    <button
                      onClick={() => {
                        setShowCreateMenu(false);
                        setOpTargetItem(null);
                        setOpModalType('new_folder');
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-primary hover:bg-accent transition-colors"
                    >
                      <FolderPlus className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                      <span>{t('files.new_folder', 'Nova pasta')}</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowCreateMenu(false);
                        setOpTargetItem(null);
                        setOpModalType('new_file');
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-primary hover:bg-accent transition-colors"
                    >
                      <FilePlus className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                      <span>{t('files.new_file', 'Novo arquivo')}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Disk Space Analyzer Button */}
              <Link
                to={`/disk-analyzer?path=${encodeURIComponent(currentPath)}`}
                className="hidden sm:flex items-center justify-center p-2 rounded-xl border border-border/80 bg-card text-slate-700 dark:text-secondary hover:text-violet-600 dark:hover:text-violet-400 hover:bg-accent transition-colors shadow-sm"
                title={t('files.disk_analyzer_title', 'Analisador de Espaço em Disco')}
              >
                <PieChart className="w-4 h-4" />
              </Link>

              {/* Open in Terminal Button (Admin only) */}
              {isAdmin && (
                <Link
                  to={`/terminal?cwd=${encodeURIComponent(currentPath)}`}
                  className="hidden sm:flex items-center justify-center p-2 rounded-xl border border-border/80 bg-card text-slate-700 dark:text-secondary hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-accent transition-colors shadow-sm"
                  title={t('files.open_terminal_here', 'Abrir Terminal Aqui')}
                >
                  <Terminal className="w-4 h-4" />
                </Link>
              )}

              {/* Samba Network Sharing Button */}
              {onOpenSamba && (
                <button
                  onClick={onOpenSamba}
                  className="hidden sm:flex items-center justify-center p-2 rounded-xl border border-border/80 bg-card text-slate-700 dark:text-secondary hover:text-saturn-500 hover:bg-accent transition-colors shadow-sm"
                  title={t('files.samba_network_sharing', 'Compartilhamento de Rede Samba (SMB)')}
                >
                  <Network className="w-4 h-4" />
                </button>
              )}

              {/* Refresh Button */}
              <button
                onClick={() => loadFiles(currentPath)}
                className="p-2 rounded-xl border border-border/80 bg-card text-slate-700 dark:text-secondary hover:text-primary hover:bg-accent transition-colors shadow-sm"
                title={t('files.refresh_folder', 'Atualizar pasta')}
              >
                <RefreshCw className="w-4 h-4" />
              </button>

              {/* Primary CTA: Import / Upload Button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl bg-saturn-500 hover:bg-saturn-600 text-white text-xs font-semibold shadow-md shadow-saturn-500/25 transition-all active:scale-95"
                title={t('files.import_or_upload', 'Importar ou carregar arquivos')}
              >
                <Upload className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">{t('files.import', 'Importar')}</span>
              </button>

              {/* Clipboard Paste button */}
              {clipboard && (
                <button
                  onClick={handlePaste}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-saturn-500/15 text-saturn-700 dark:text-saturn-300 border border-saturn-500/30 hover:bg-saturn-500/25 text-xs font-semibold transition-colors animate-in fade-in"
                  title={t('files.paste_items', 'Colar {{count}} item(s)', { count: clipboard.items.length })}
                >
                  <Clipboard className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t('common.paste', 'Colar')} ({clipboard.items.length})</span>
                </button>
              )}

              {/* Sort Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowSortMenu((prev) => !prev)}
                  className="p-2 rounded-xl border border-border/80 bg-card text-slate-700 dark:text-secondary hover:text-primary hover:bg-accent transition-colors shadow-sm"
                  title={t('files.sort_files', 'Ordenar arquivos')}
                >
                  <ArrowUpDown className="w-4 h-4" />
                </button>

                {showSortMenu && (
                  <div className="absolute right-0 mt-1.5 w-44 bg-card border border-border rounded-xl shadow-2xl z-30 p-1 space-y-0.5 text-xs animate-in fade-in">
                    <button
                      onClick={() => { setSortBy('name'); setSortAsc((prev) => (sortBy === 'name' ? !prev : true)); setShowSortMenu(false); }}
                      className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-primary hover:bg-accent transition-colors"
                    >
                      <span>{t('common.name', 'Nome')}</span>
                      {sortBy === 'name' && <span className="text-[10px] text-saturn-600 dark:text-saturn-400 font-semibold">{sortAsc ? 'A-Z' : 'Z-A'}</span>}
                    </button>
                    <button
                      onClick={() => { setSortBy('size'); setSortAsc((prev) => (sortBy === 'size' ? !prev : true)); setShowSortMenu(false); }}
                      className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-primary hover:bg-accent transition-colors"
                    >
                      <span>{t('common.size', 'Tamanho')}</span>
                      {sortBy === 'size' && <span className="text-[10px] text-saturn-600 dark:text-saturn-400 font-semibold">{sortAsc ? t('files.sort_smallest', 'Menor') : t('files.sort_largest', 'Maior')}</span>}
                    </button>
                    <button
                      onClick={() => { setSortBy('modified'); setSortAsc((prev) => (sortBy === 'modified' ? !prev : true)); setShowSortMenu(false); }}
                      className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-primary hover:bg-accent transition-colors"
                    >
                      <span>{t('files.modified', 'Modificado')}</span>
                      {sortBy === 'modified' && <span className="text-[10px] text-saturn-600 dark:text-saturn-400 font-semibold">{sortAsc ? t('files.sort_oldest', 'Antigo') : t('files.sort_newest', 'Recente')}</span>}
                    </button>
                  </div>
                )}
              </div>

              {/* View Mode Toggle */}
              <button
                data-testid="view-mode-toggle"
                onClick={() => setViewMode((v) => (v === 'grid' ? 'list' : 'grid'))}
                className="p-2 rounded-xl border border-border/80 bg-card text-slate-700 dark:text-secondary hover:text-primary hover:bg-accent transition-colors shadow-sm"
                title={viewMode === 'grid' ? t('files.list_mode', 'Modo Lista') : t('files.grid_mode', 'Modo Grade')}
              >
                {viewMode === 'grid' ? <List className="w-4 h-4" /> : <Grid className="w-4 h-4" />}
              </button>
            </>
          )}

          {isTrashView && isAdmin && (
            <button
              onClick={handleEmptyTrash}
              disabled={trashItemsCount === 0}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500/20 text-rose-700 dark:text-rose-400 border border-rose-500/30 hover:bg-rose-500/30 active:scale-95 text-xs font-semibold transition-all disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              <span>{t('files.empty_trash', 'Esvaziar Lixeira')}</span>
            </button>
          )}
        </div>
      </header>

      {/* Selected Batch Action Bar */}
      {selectedItems.length > 0 && !isTrashView && (
        <div className="px-4 sm:px-6 py-2 bg-saturn-500/10 border-b border-saturn-500/20 flex flex-wrap items-center justify-between gap-2 text-xs text-saturn-700 dark:text-saturn-300 animate-in fade-in">
          <div className="flex items-center gap-2">
            <button
              onClick={selectAll}
              className="flex items-center gap-1.5 font-semibold hover:underline text-primary"
            >
              {selectedItems.length === filteredFilesCount ? (
                <CheckSquare className="w-4 h-4 text-saturn-600 dark:text-saturn-400" />
              ) : (
                <Square className="w-4 h-4" />
              )}
              <span>{t('files.items_selected', '{{count}} item(s) selecionado(s)', { count: selectedItems.length })}</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={handleCompressSelection}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-card border border-border text-primary hover:bg-accent transition-colors font-medium"
              title={t('files.compress_zip_title', 'Compactar itens selecionados em .zip')}
            >
              <Package className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" /> <span className="hidden xs:inline">{t('files.compress_zip', 'Compactar (.zip)')}</span>
            </button>
            <button
              onClick={() => handleCopy(selectedItems)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-card border border-border text-primary hover:bg-accent transition-colors font-medium"
            >
              <Copy className="w-3.5 h-3.5" /> <span className="hidden xs:inline">{t('common.copy', 'Copiar')}</span>
            </button>
            {isAdmin && (
              <button
                onClick={() => handleCut(selectedItems)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-card border border-border text-primary hover:bg-accent transition-colors font-medium"
              >
                <Scissors className="w-3.5 h-3.5" /> <span className="hidden xs:inline">{t('files.cut', 'Recortar')}</span>
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => handleMoveToTrash(selectedItems)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400 hover:bg-rose-500/20 transition-colors font-medium"
                title={t('files.move_trash_title', 'Mover itens para a lixeira')}
              >
                <Trash2 className="w-3.5 h-3.5" /> <span>{t('files.trash', 'Lixeira')}</span>
              </button>
            )}
            <button
              onClick={() => setSelectedItems([])}
              className="p-1 rounded-lg text-slate-700 dark:text-secondary hover:text-primary hover:bg-accent ml-1"
              title={t('files.unselect_all', 'Desmarcar todos')}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
};
