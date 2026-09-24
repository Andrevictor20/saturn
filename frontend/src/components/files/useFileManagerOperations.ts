import React from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useUploadManager } from '../../contexts/UploadManagerContext';
import { useTasks } from '../../contexts/InstallContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import type { FileItem } from '../../types/fileManager';

interface UseFileManagerOperationsProps {
  currentPath: string;
  loadFiles: (path: string) => void;
  loadTrash: () => void;
  navigateTo: (path: string) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  folderInputRef: React.RefObject<HTMLInputElement | null>;
  selectedItems: FileItem[];
  setSelectedItems: React.Dispatch<React.SetStateAction<FileItem[]>>;
  clipboard: { action: 'copy' | 'cut'; items: FileItem[] } | null;
  setClipboard: React.Dispatch<React.SetStateAction<{ action: 'copy' | 'cut'; items: FileItem[] } | null>>;
  setActiveImageFile: (file: FileItem | null) => void;
  setActiveAudioFile: (file: FileItem | null) => void;
  setActiveVideoFile: (file: FileItem | null) => void;
  setActivePdfFile: (file: FileItem | null) => void;
  setActiveTextFile: (file: FileItem | null) => void;
  setIsDraggingOver: (dragging: boolean) => void;
}

export function useFileManagerOperations({
  currentPath,
  loadFiles,
  loadTrash,
  navigateTo,
  fileInputRef,
  folderInputRef,
  selectedItems,
  setSelectedItems,
  clipboard,
  setClipboard,
  setActiveImageFile,
  setActiveAudioFile,
  setActiveVideoFile,
  setActivePdfFile,
  setActiveTextFile,
  setIsDraggingOver,
}: UseFileManagerOperationsProps) {
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const { enqueueMultipleUploads } = useUploadManager();
  const { startTask } = useTasks();

  const handleDownload = (item: FileItem) => {
    if (item.is_dir) {
      window.location.href = `/api/files/archive?path=${encodeURIComponent(item.path)}`;
    } else {
      window.location.href = `/api/files/download?path=${encodeURIComponent(item.path)}`;
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const filesArray = Array.from(fileList);
    await enqueueMultipleUploads(filesArray, currentPath);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const filesArray = Array.from(fileList);
    const formData = new FormData();
    filesArray.forEach((f) => {
      const relativePath = (f as any).webkitRelativePath || f.name;
      formData.append('files', f, relativePath);
    });

    startTask({
      type: 'file_upload',
      title: t('files.folder_upload_task_title', { count: filesArray.length, defaultValue: `Upload de Pasta (${filesArray.length} itens)` }),
      destinationUrl: `/files?path=${encodeURIComponent(currentPath)}`,
      initialLogs: [
        t('files.folder_upload_starting', { count: filesArray.length, path: currentPath, defaultValue: `[INFO] Iniciando upload de pasta com ${filesArray.length} itens para ${currentPath}...` }),
      ],
      runner: async (helpers) => {
        helpers.setProgress(40);
        helpers.setStatus('running');
        const token = localStorage.getItem('saturn_token');
        const res = await fetch(`/api/files/upload?destination=${encodeURIComponent(currentPath)}`, {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        });
        helpers.setProgress(90);
        if (!res.ok) throw new Error(t('files.folder_upload_failed', 'Falha no upload da pasta.'));
        helpers.setDone(t('files.folder_upload_done', 'Upload de pasta concluído com sucesso!'));
        toast.success(t('files.folder_upload_done', 'Pasta enviada com sucesso!'));
        loadFiles(currentPath);
      },
    });

    if (folderInputRef.current) folderInputRef.current.value = '';
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArray = Array.from(e.dataTransfer.files);
      await enqueueMultipleUploads(filesArray, currentPath);
    }
  };

  const handleInternalDrop = async (e: React.DragEvent, targetDestination: string) => {
    e.preventDefault();
    e.stopPropagation();
    const rawData = e.dataTransfer.getData('text/plain');
    if (!rawData) return;

    try {
      const paths: string[] = JSON.parse(rawData);
      if (!Array.isArray(paths) || paths.length === 0) return;

      for (const p of paths) {
        if (p === targetDestination) continue;
        const fileName = p.split('/').pop() || '';
        const destPath = targetDestination === '/' ? `/${fileName}` : `${targetDestination}/${fileName}`;

        await fetch('/api/files/move', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: p, destination: destPath }),
        });
      }

      toast.success(t('files.items_moved', { count: paths.length, defaultValue: `${paths.length} item(s) movido(s)!` }));
      loadFiles(currentPath);
    } catch {
      // Ignored
    }
  };

  const handleItemClick = (item: FileItem) => {
    if (item.is_dir) {
      navigateTo(item.path);
      return;
    }

    const ext = item.extension.toLowerCase();

    if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp'].includes(ext)) {
      setActiveImageFile(item);
      return;
    }

    if (['mp3', 'wav', 'flac', 'ogg', 'aac', 'm4a'].includes(ext)) {
      setActiveAudioFile(item);
      return;
    }

    if (['mp4', 'webm', 'mkv', 'mov', 'avi'].includes(ext)) {
      setActiveVideoFile(item);
      return;
    }

    if (ext === 'pdf') {
      setActivePdfFile(item);
      return;
    }

    const textExtensions = [
      'txt', 'md', 'json', 'js', 'ts', 'jsx', 'tsx', 'py', 'rs', 'go', 'c', 'cpp',
      'h', 'html', 'css', 'scss', 'yml', 'yaml', 'toml', 'xml', 'sql', 'sh', 'env',
      'dockerfile', 'gitignore', 'conf', 'ini', 'log', 'csv',
    ];
    if (textExtensions.includes(ext) || item.size < 500 * 1024) {
      setActiveTextFile(item);
      return;
    }

    handleDownload(item);
  };

  const handleExtractArchive = async (item: FileItem) => {
    const toastId = toast.loading(t('files.extracting_item', { name: item.name, defaultValue: `Extraindo ${item.name}...` }));
    try {
      const res = await fetch('/api/files/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: item.path, destination: currentPath }),
      });
      if (res.ok) {
        toast.success(t('files.extracted_success', { name: item.name, defaultValue: `Arquivo ${item.name} extraído com sucesso!` }), { id: toastId });
        loadFiles(currentPath);
      } else {
        const err = await res.json();
        toast.error(err.error || t('files.error_extracting', 'Erro ao extrair arquivo'), { id: toastId });
      }
    } catch {
      toast.error(t('files.server_comm_error', 'Falha ao comunicar com o servidor'), { id: toastId });
    }
  };

  const handleRestoreTrash = async (ids: string[]) => {
    const toastId = toast.loading(t('files.restoring_trash', 'Restaurando itens da lixeira...'));
    try {
      const res = await fetch('/api/files/trash/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (res.ok) {
        toast.success(t('files.items_restored', 'Itens restaurados com sucesso!'), { id: toastId });
        loadTrash();
      } else {
        toast.error(t('files.error_restoring', 'Erro ao restaurar itens'), { id: toastId });
      }
    } catch {
      toast.error(t('files.connection_error', 'Falha de conexão'), { id: toastId });
    }
  };

  const handleEmptyTrash = async () => {
    const confirmed = await confirm({
      title: t('files.empty_trash_title', 'Esvaziar Lixeira'),
      message: t('files.confirm_empty_trash', 'Tem certeza que deseja esvaziar permanentemente toda a lixeira?'),
      confirmText: t('common.empty_trash', 'Esvaziar Permanentemente'),
      cancelText: t('common.cancel', 'Cancelar'),
      isDestructive: true,
    });
    if (!confirmed) return;
    const toastId = toast.loading(t('files.emptying_trash', 'Esvaziando lixeira...'));
    try {
      const res = await fetch('/api/files/trash/empty', { method: 'DELETE' });
      if (res.ok) {
        toast.success(t('files.trash_emptied', 'Lixeira esvaziada com sucesso!'), { id: toastId });
        loadTrash();
      } else {
        toast.error(t('files.error_empty_trash', 'Erro ao esvaziar lixeira'), { id: toastId });
      }
    } catch {
      toast.error(t('files.connection_error', 'Falha de conexão'), { id: toastId });
    }
  };

  const handleMoveToTrash = async (items: FileItem[]) => {
    const paths = items.map((i) => i.path);
    const count = paths.length;
    const toastId = toast.loading(t('files.moving_to_trash', { count, defaultValue: `Movendo ${count} item(s) para a lixeira...` }));
    try {
      const res = await fetch('/api/files/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths, permanent: false }),
      });
      if (res.ok) {
        toast.success(t('files.moved_to_trash', { count, defaultValue: `${count} item(s) movido(s) para a lixeira!` }), { id: toastId });
        loadFiles(currentPath);
        setSelectedItems([]);
      } else {
        toast.error(t('files.error_moving_trash', 'Erro ao mover itens para a lixeira'), { id: toastId });
      }
    } catch {
      toast.error(t('files.connection_error', 'Falha na requisição'), { id: toastId });
    }
  };

  const handleCopy = (items: FileItem[]) => {
    setClipboard({ action: 'copy', items });
    toast.success(t('files.items_copied', { count: items.length, defaultValue: `${items.length} item(s) copiado(s)` }));
  };

  const handleCut = (items: FileItem[]) => {
    setClipboard({ action: 'cut', items });
    toast.success(t('files.items_cut', { count: items.length, defaultValue: `${items.length} item(s) recortado(s)` }));
  };

  const handlePaste = async () => {
    if (!clipboard || clipboard.items.length === 0) return;
    const actionLabel = clipboard.action === 'cut'
      ? t('files.moving_items', { count: clipboard.items.length, defaultValue: `Movendo ${clipboard.items.length} item(s)...` })
      : t('files.copying_items', { count: clipboard.items.length, defaultValue: `Copiando ${clipboard.items.length} item(s)...` });
    const toastId = toast.loading(actionLabel);

    try {
      for (const item of clipboard.items) {
        const fileName = item.name;
        const destPath = currentPath === '/' ? `/${fileName}` : `${currentPath}/${fileName}`;

        if (clipboard.action === 'cut') {
          await fetch('/api/files/move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source: item.path, destination: destPath }),
          });
        } else {
          await fetch('/api/files/copy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source: item.path, destination: destPath }),
          });
        }
      }

      toast.success(t('files.operation_success', 'Operação concluída com sucesso!'), { id: toastId });
      if (clipboard.action === 'cut') setClipboard(null);
      loadFiles(currentPath);
    } catch {
      toast.error(t('files.error_pasting', 'Erro ao colar itens'), { id: toastId });
    }
  };

  const handleCompressSelection = async () => {
    if (selectedItems.length === 0) return;
    const toastId = toast.loading(t('files.compressing_items', 'Compactando itens...'));
    try {
      const paths = selectedItems.map((i) => i.path);
      const res = await fetch('/api/files/compress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths, destination: currentPath }),
      });
      if (res.ok) {
        toast.success(t('files.items_compressed', 'Itens compactados com sucesso!'), { id: toastId });
        loadFiles(currentPath);
        setSelectedItems([]);
      } else {
        toast.error(t('files.error_compressing', 'Erro ao compactar itens'), { id: toastId });
      }
    } catch {
      toast.error(t('files.connection_error', 'Falha de conexão'), { id: toastId });
    }
  };

  return {
    handleDownload,
    handleFileUpload,
    handleFolderUpload,
    handleDrop,
    handleInternalDrop,
    handleItemClick,
    handleExtractArchive,
    handleRestoreTrash,
    handleEmptyTrash,
    handleMoveToTrash,
    handleCopy,
    handleCut,
    handlePaste,
    handleCompressSelection,
  };
}
