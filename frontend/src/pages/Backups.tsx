import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Archive, 
  Plus, 
  Clock, 
  UploadCloud, 
  RefreshCw, 
  Search, 
  Sparkles,
  Sliders,
  Boxes,
  HardDrive,
  RotateCcw
} from 'lucide-react';
import toast from 'react-hot-toast';
import { CreateBackupModal } from '../components/backups/CreateBackupModal';
import { ApplyBackupModal } from '../components/backups/ApplyBackupModal';
import { RestoreConfirmModal } from '../components/backups/RestoreConfirmModal';
import { ScheduleModal, type BackupScheduleConfig } from '../components/backups/ScheduleModal';
import { BackupKpiCards } from '../components/backups/BackupKpiCards';
import { BackupTable } from '../components/backups/BackupTable';
import type { BackupItem } from '../components/backups/types';
import { useTranslation } from 'react-i18next';
import { useConfirm } from '../contexts/ConfirmContext';

export type { BackupItem };

export default function Backups() {
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [apps, setApps] = useState<string[]>([]);
  const [schedule, setSchedule] = useState<BackupScheduleConfig>({
    enabled: false,
    interval_hours: 24,
    max_backups_per_app: 5,
    apps: [],
    last_run: null,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [backupToRestore, setBackupToRestore] = useState<BackupItem | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [backupsRes, scheduleRes, stacksRes, containersRes] = await Promise.allSettled([
        fetch('/api/backups'),
        fetch('/api/backups/schedule'),
        fetch('/api/docker/compose/stacks'),
        fetch('/api/docker/containers'),
      ]);

      if (backupsRes.status === 'fulfilled' && backupsRes.value.ok) {
        setBackups(await backupsRes.value.json());
      }
      if (scheduleRes.status === 'fulfilled' && scheduleRes.value.ok) {
        setSchedule(await scheduleRes.value.json());
      }

      const detected = new Set<string>();
      if (stacksRes.status === 'fulfilled' && stacksRes.value.ok) {
        const stacks = await stacksRes.value.json();
        stacks.forEach((s: any) => s.name && detected.add(s.name));
      }
      if (containersRes.status === 'fulfilled' && containersRes.value.ok) {
        const containers = await containersRes.value.json();
        containers.forEach((c: any) => {
          const name = c.names?.[0]?.replace(/^\//, '') || c.name?.replace(/^\//, '');
          if (name) detected.add(name);
        });
      }
      setApps(Array.from(detected).sort());
    } catch (err: any) {
      toast.error('Erro ao carregar dados de backup: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const totalStorage = useMemo(() => {
    return backups.reduce((acc, b) => acc + b.size_bytes, 0);
  }, [backups]);

  const filteredBackups = useMemo(() => {
    if (!search.trim()) return backups;
    const q = search.toLowerCase();
    return backups.filter(
      (b) => b.app_name.toLowerCase().includes(q) || b.filename.toLowerCase().includes(q)
    );
  }, [backups, search]);

  const getItemVisuals = (b: BackupItem) => {
    const isFull = b.target_type === 'system_full' || b.filename.includes('system_full') || b.app_name.includes('Sistema Completo');
    const isConfigs = b.target_type === 'saturn_configs' || b.filename.includes('saturn_configs') || b.app_name.includes('Configurações Saturn');
    const isAll = b.target_type === 'all_containers' || b.filename.includes('all_containers');

    if (isFull) {
      return {
        icon: Sparkles,
        badge: t('backups.badge_full_system', 'Sistema Completo'),
        badgeColor: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30',
        avatarColor: 'bg-purple-500/15 text-purple-600 border-purple-500/30',
      };
    }
    if (isConfigs) {
      return {
        icon: Sliders,
        badge: t('backups.badge_saturn_configs', 'Configurações Saturn'),
        badgeColor: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
        avatarColor: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
      };
    }
    if (isAll) {
      return {
        icon: Boxes,
        badge: t('backups.badge_all_containers', 'Todos os Contêineres'),
        badgeColor: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
        avatarColor: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
      };
    }
    return {
      icon: HardDrive,
      badge: t('backups.badge_single_app', 'Contêiner'),
      badgeColor: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
      avatarColor: 'bg-saturn-500/10 text-saturn-500 border-saturn-500/20',
    };
  };

  const handleCreateBackup = async (param: { targetType: string; appName?: string; stopContainer?: boolean } | string) => {
    let targetType = 'single_app';
    let appName = '';
    let stop = true;

    if (typeof param === 'string') {
      appName = param;
      targetType = param === 'system_full' ? 'system_full' : param === 'saturn_configs' ? 'saturn_configs' : param === 'all_containers' ? 'all_containers' : 'single_app';
    } else {
      targetType = param.targetType;
      appName = param.appName || param.targetType;
      stop = param.stopContainer ?? true;
    }

    const label = targetType === 'system_full'
      ? t('backups.scope_full_system', 'Sistema Completo')
      : targetType === 'saturn_configs'
      ? t('backups.scope_configs_only', 'Configurações Saturn')
      : targetType === 'all_containers'
      ? t('backups.scope_all_containers', 'Todos os Contêineres')
      : appName;

    const toastId = toast.loading(`Criando backup (${label})...`);
    try {
      const res = await fetch('/api/backups/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_type: targetType,
          app_id: targetType === 'single_app' ? appName : targetType,
          app_name: label,
          stop_container: stop,
        }),
      });
      if (!res.ok) {
        const errorMsg = await res.text();
        throw new Error(errorMsg || 'Falha ao criar backup');
      }
      toast.success(`Backup (${label}) criado com sucesso!`, { id: toastId });
      loadData();
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`, { id: toastId });
      throw err;
    }
  };

  const handleRestoreBackup = async () => {
    if (!backupToRestore) return;
    const toastId = toast.loading(t('backups.restoring_app', { name: backupToRestore.app_name, defaultValue: `Restaurando ${backupToRestore.app_name}...` }));
    try {
      const res = await fetch('/api/backups/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: backupToRestore.id,
          filename: backupToRestore.filename,
          app_name: backupToRestore.app_name,
        }),
      });
      if (!res.ok) {
        const errorMsg = await res.text();
        throw new Error(errorMsg || t('backups.restore_failed', 'Falha na restauração'));
      }
      toast.success(t('backups.app_restored_success', { name: backupToRestore.app_name, defaultValue: `App ${backupToRestore.app_name} restaurado com sucesso!` }), { id: toastId });
      loadData();
      if (backupToRestore.target_type === 'system_full' || backupToRestore.target_type === 'saturn_configs' || backupToRestore.target_type === 'saturn_configs') {
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      }
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`, { id: toastId });
      throw err;
    }
  };

  const handleDeleteBackup = async (filename: string) => {
    const confirmed = await confirm({
      title: t('backups.delete_title', 'Excluir Backup'),
      message: t('backups.confirm_delete_permanent', { filename, defaultValue: `Deseja realmente excluir permanentemente ${filename}?` }),
      confirmText: t('common.delete', 'Excluir'),
      cancelText: t('common.cancel', 'Cancelar'),
      isDestructive: true,
    });
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/backups/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(t('backups.delete_error', 'Falha ao excluir backup'));
      toast.success(t('backups.deleted', 'Backup excluído!'));
      setBackups((prev) => prev.filter((b) => b.filename !== filename));
    } catch (err: any) {
      toast.error(t('common.error', 'Erro ao excluir: ') + err.message);
    }
  };

  const handleSaveSchedule = async (newConfig: BackupScheduleConfig) => {
    try {
      const res = await fetch('/api/backups/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig),
      });
      if (!res.ok) throw new Error('Falha ao salvar agendamento');
      setSchedule(newConfig);
      toast.success('Agendamento de backups atualizado!');
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
      throw err;
    }
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('backup', file);

    setUploading(true);
    const toastId = toast.loading(`Enviando ${file.name}...`);
    try {
      const res = await fetch('/api/backups/upload', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const errorMsg = await res.text();
        throw new Error(errorMsg || 'Falha no upload do arquivo');
      }
      const uploadedItem: BackupItem = await res.json();
      toast.success('Backup importado com sucesso!', { id: toastId });
      loadData();
      setBackupToRestore(uploadedItem);
    } catch (err: any) {
      toast.error('Erro no upload: ' + err.message, { id: toastId });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-saturn-500/10 text-saturn-500 rounded-xl border border-saturn-500/20">
              <Archive className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-primary tracking-tight">{t('backups.title', 'Backups & Restauração')}</h1>
              <p className="text-secondary text-sm">
                {t('backups.subtitle', 'Snapshots 1-clique compactados em .tar.gz com restauração atômica e agendamento')}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleUploadFile}
            accept=".tar.gz,.tgz"
            className="hidden"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-3.5 py-2 bg-accent/80 hover:bg-accent text-secondary hover:text-primary rounded-xl text-xs font-semibold border border-border transition-colors flex items-center gap-2"
            title={t('backups.import_snapshot_title', 'Importar arquivo .tar.gz existente')}
          >
            <UploadCloud className="w-4 h-4 text-saturn-500" />
            <span>{uploading ? t('backups.uploading', 'Enviando...') : t('backups.import_snapshot', 'Importar Snapshot')}</span>
          </button>

          <button
            onClick={() => setShowScheduleModal(true)}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors flex items-center gap-2 ${
              schedule.enabled
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                : 'bg-accent/80 hover:bg-accent text-secondary hover:text-primary border-border'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>{schedule.enabled ? t('backups.routine_every', { hours: schedule.interval_hours, defaultValue: `Rotina: A cada ${schedule.interval_hours}h` }) : t('backups.routine_disabled', 'Rotina: Desativada')}</span>
          </button>

          <button
            onClick={() => setShowApplyModal(true)}
            className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 rounded-xl text-xs font-semibold border border-rose-500/30 transition-all flex items-center gap-2 shadow-sm active:scale-95"
            title={t('backups.apply_backup_tooltip', 'Restaurar configurações, temas, integrações e contêineres')}
          >
            <RotateCcw className="w-4 h-4 text-rose-500" />
            <span>{t('backups.apply_backup', 'Restaurar / Aplicar Backup')}</span>
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-saturn-500 hover:bg-saturn-600 text-white rounded-xl text-xs font-semibold transition-all shadow-sm shadow-saturn-500/20 hover:shadow-saturn-500/30 active:scale-95 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>{t('backups.new_backup', 'Novo Backup')}</span>
          </button>

          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 text-secondary hover:text-primary rounded-xl hover:bg-accent border border-border transition-colors"
            title={t('backups.refresh_list', 'Atualizar lista')}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <BackupKpiCards
        totalBackups={backups.length}
        totalStorage={totalStorage}
        schedule={schedule}
        formatBytes={formatBytes}
      />

      {/* Filter / Search Bar */}
      <div className="bg-card border border-border rounded-2xl p-4 shadow-sm flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-secondary" />
          <input
            type="text"
            placeholder={t('backups.search_placeholder', 'Filtrar por app ou nome do arquivo...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-accent/40 border border-border rounded-xl pl-9 pr-4 py-2 text-xs text-primary placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-saturn-500"
          />
        </div>
        <div className="text-xs text-secondary font-medium">
          {t('backups.showing_count', { filtered: filteredBackups.length, total: backups.length, defaultValue: `Exibindo ${filteredBackups.length} de ${backups.length} backups` })}
        </div>
      </div>

      {/* Backups List */}
      {filteredBackups.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-12 text-center space-y-4">
          <div className="w-16 h-16 bg-saturn-500/10 text-saturn-500 rounded-2xl mx-auto flex items-center justify-center border border-saturn-500/20">
            <Archive className="w-8 h-8" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h3 className="text-base font-bold text-primary">{t('backups.no_backups_found', 'Nenhum backup encontrado')}</h3>
            <p className="text-xs text-secondary leading-relaxed">
              {t('backups.empty_desc', 'Crie seu primeiro snapshot 1-clique para proteger as configurações, bancos de dados e volumes dos seus aplicativos.')}
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-saturn-500 hover:bg-saturn-600 text-white rounded-xl text-xs font-semibold transition-all inline-flex items-center gap-2 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>{t('backups.create_now', 'Criar Snapshot Agora')}</span>
          </button>
        </div>
      ) : (
        <BackupTable
          backups={filteredBackups}
          getItemVisuals={getItemVisuals}
          formatBytes={formatBytes}
          onRestore={setBackupToRestore}
          onDelete={handleDeleteBackup}
        />
      )}

      {/* Modals */}
      {showCreateModal && (
        <CreateBackupModal
          apps={apps}
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateBackup}
        />
      )}

      {showApplyModal && (
        <ApplyBackupModal
          backups={backups}
          getItemVisuals={getItemVisuals}
          formatBytes={formatBytes}
          onClose={() => setShowApplyModal(false)}
          onSuccess={loadData}
        />
      )}

      {backupToRestore && (
        <RestoreConfirmModal
          backup={backupToRestore}
          onClose={() => setBackupToRestore(null)}
          onConfirm={handleRestoreBackup}
        />
      )}

      {showScheduleModal && (
        <ScheduleModal
          initialConfig={schedule}
          availableApps={apps}
          onClose={() => setShowScheduleModal(false)}
          onSave={handleSaveSchedule}
        />
      )}
    </div>
  );
}
