import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  X, 
  Network, 
  Folder, 
  Copy, 
  Check, 
  Trash2, 
  Plus, 
  Power, 
  ShieldCheck, 
  Lock, 
  RefreshCw,
  FolderSymlink
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useConfirm } from '../../contexts/ConfirmContext';
import type { FileItem } from '../../pages/FileManager';

interface SambaShare {
  name: string;
  path: string;
  read_only: boolean;
  guest_ok: boolean;
  comment?: string;
}

interface SambaStatus {
  running: boolean;
  enabled: boolean;
  lan_ip: string;
  active_shares: number;
  smb_url_windows: string;
  smb_url_mac: string;
  workgroup: string;
}

interface SambaModalProps {
  folder?: FileItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export function SambaModal({ folder, isOpen, onClose }: SambaModalProps) {
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const [status, setStatus] = useState<SambaStatus | null>(null);
  const [shares, setShares] = useState<SambaShare[]>([]);
  const [loading, setLoading] = useState(false);
  const [togglingService, setTogglingService] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // New share form state
  const [shareName, setShareName] = useState('');
  const [sharePath, setSharePath] = useState('');
  const [readOnly, setReadOnly] = useState(false);
  const [guestOk, setGuestOk] = useState(true);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchStatusAndShares = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('saturn_token');
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      const [statusRes, sharesRes] = await Promise.all([
        fetch('/api/samba/status', { headers }),
        fetch('/api/samba/shares', { headers })
      ]);

      if (statusRes.ok) {
        const sData = await statusRes.json();
        setStatus(sData);
      }
      if (sharesRes.ok) {
        const shData = await sharesRes.json();
        setShares(shData);
      }
    } catch {
      toast.error(t('files.samba_load_error', 'Erro ao carregar dados do Samba'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (isOpen) {
      fetchStatusAndShares();
      if (folder) {
        const sanitized = folder.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
        setShareName(sanitized);
        setSharePath(folder.path);
        setComment(t('files.samba_folder_share_desc', { name: folder.name, defaultValue: `Compartilhamento da pasta ${folder.name}` }));
      } else {
        setShareName('');
        setSharePath('');
        setComment('');
      }
    }
  }, [isOpen, folder, fetchStatusAndShares, t]);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success(t('files.samba_network_path_copied', 'Caminho de rede copiado!'));
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleToggleService = async () => {
    if (!status) return;
    try {
      setTogglingService(true);
      const token = localStorage.getItem('saturn_token');
      const nextState = !status.enabled;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch('/api/samba/toggle', {
        method: 'POST',
        headers,
        body: JSON.stringify({ enabled: nextState })
      });

      if (res.ok) {
        toast.success(nextState ? t('files.samba_enabled', 'Serviço Samba ativado') : t('files.samba_disabled', 'Serviço Samba desativado'));
        fetchStatusAndShares();
      } else {
        toast.error(t('files.samba_toggle_failed', 'Falha ao alternar serviço Samba'));
      }
    } catch {
      toast.error(t('files.connection_error', 'Erro de conexão'));
    } finally {
      setTogglingService(false);
    }
  };

  const handleCreateShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shareName.trim() || !sharePath.trim()) {
      toast.error(t('files.samba_fill_name_and_path', 'Preencha o nome e o caminho do compartilhamento'));
      return;
    }

    try {
      setIsSubmitting(true);
      const token = localStorage.getItem('saturn_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch('/api/samba/shares', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: shareName.trim(),
          path: sharePath.trim(),
          read_only: readOnly,
          guest_ok: guestOk,
          comment: comment.trim() || undefined
        })
      });

      if (res.ok) {
        toast.success(t('files.samba_share_success', { name: shareName, defaultValue: `Pasta compartilhada com sucesso como '${shareName}'!` }));
        fetchStatusAndShares();
        if (!folder) {
          setShareName('');
          setSharePath('');
          setComment('');
        }
      } else {
        const err = await res.text();
        toast.error(err ? `Erro: ${err}` : t('files.samba_create_failed', 'Não foi possível criar compartilhamento'));
      }
    } catch {
      toast.error(t('files.samba_server_conn_error', 'Erro ao conectar com o servidor'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteShare = async (name: string) => {
    const confirmed = await confirm({
      title: t('files.samba_remove_title', 'Remover Compartilhamento'),
      message: t('files.samba_confirm_remove', { name, defaultValue: `Deseja realmente remover o compartilhamento '${name}'? Os arquivos não serão deletados.` }),
      confirmText: t('common.remove', 'Remover'),
      cancelText: t('common.cancel', 'Cancelar'),
      isDestructive: true,
    });
    if (!confirmed) {
      return;
    }

    try {
      const token = localStorage.getItem('saturn_token');
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`/api/samba/shares/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers
      });

      if (res.ok) {
        toast.success(t('files.samba_share_removed', { name, defaultValue: `Compartilhamento '${name}' removido` }));
        fetchStatusAndShares();
      } else {
        toast.error(t('files.samba_remove_error', 'Erro ao remover compartilhamento'));
      }
    } catch {
      toast.error(t('files.samba_remove_conn_error', 'Erro de conexão ao remover compartilhamento'));
    }
  };

  if (!isOpen) return null;

  const lanIp = status?.lan_ip || '127.0.0.1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div 
        className="bg-card border border-border/80 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/80 bg-accent/30">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-saturn-500/15 text-saturn-500 border border-saturn-500/30">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-primary">{t('files.samba_network_sharing', 'Compartilhamento Samba (SMB)')}</h2>
              <p className="text-xs text-secondary">
                {t('files.samba_modal_desc', 'Acesse seus arquivos diretamente pelo Windows Explorer, Mac Finder ou rede local')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-secondary hover:text-primary rounded-xl hover:bg-accent transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar flex-1">
          {/* Service Banner & Quick Access */}
          <div className="bg-accent/40 border border-border/80 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className={`w-2.5 h-2.5 rounded-full ${status?.enabled ? 'bg-emerald-500 ring-4 ring-emerald-500/20' : 'bg-secondary/40'}`} />
                <div>
                  <span className="text-xs font-semibold text-primary">
                    {t('files.samba_server_label', 'Servidor Samba')}: {status?.enabled ? t('files.samba_status_active', 'Ativo') : t('files.samba_status_inactive', 'Desativado')}
                  </span>
                  <div className="text-[11px] text-secondary font-mono">
                    IP LAN: <strong className="text-primary">{lanIp}</strong> | Workgroup: {status?.workgroup || 'WORKGROUP'}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleToggleService}
                disabled={togglingService}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shadow-sm ${
                  status?.enabled
                    ? 'bg-rose-500/15 text-rose-500 hover:bg-rose-500/25 border border-rose-500/30'
                    : 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-emerald-500/20'
                }`}
              >
                <Power className={`w-3.5 h-3.5 ${togglingService ? 'animate-spin' : ''}`} />
                <span>{status?.enabled ? t('files.samba_disable', 'Desativar') : t('files.samba_enable', 'Ativar Samba')}</span>
              </button>
            </div>

            {/* Quick Links */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-border/50 text-xs">
              <div className="flex items-center justify-between bg-card/60 px-3 py-2 rounded-lg border border-border/60">
                <span className="font-mono text-secondary truncate">\\\\{lanIp}</span>
                <button
                  onClick={() => handleCopy(`\\\\${lanIp}`, 'win_base')}
                  className="p-1 hover:text-saturn-500 transition-colors ml-2 text-secondary shrink-0"
                  title={t('files.samba_copy_win_shortcut', 'Copiar atalho Windows')}
                >
                  {copiedKey === 'win_base' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="flex items-center justify-between bg-card/60 px-3 py-2 rounded-lg border border-border/60">
                <span className="font-mono text-secondary truncate">smb://{lanIp}</span>
                <button
                  onClick={() => handleCopy(`smb://${lanIp}`, 'mac_base')}
                  className="p-1 hover:text-saturn-500 transition-colors ml-2 text-secondary shrink-0"
                  title={t('files.samba_copy_mac_shortcut', 'Copiar atalho Mac / Linux')}
                >
                  {copiedKey === 'mac_base' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {/* Form to Share Folder */}
          <form onSubmit={handleCreateShare} className="bg-card border border-border/80 rounded-xl p-4 space-y-3 shadow-sm">
            <h3 className="text-xs font-bold text-primary flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-saturn-500" />
              {folder ? t('files.samba_share_folder_title', { name: folder.name, defaultValue: `Compartilhar Pasta: ${folder.name}` }) : t('files.samba_create_new_share', 'Criar Novo Compartilhamento')}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-secondary mb-1">
                  {t('files.samba_share_name', 'Nome do Compartilhamento (Rede)')}
                </label>
                <input
                  type="text"
                  placeholder={t('files.samba_share_name_placeholder', 'ex: public, backups, filmes')}
                  value={shareName}
                  onChange={(e) => setShareName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                  className="w-full bg-accent/50 border border-border rounded-xl px-3 py-1.5 text-xs text-primary focus:outline-none focus:ring-1 focus:ring-saturn-500 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-secondary mb-1">
                  {t('files.samba_host_path', 'Caminho no Host')}
                </label>
                <input
                  type="text"
                  placeholder={t('files.samba_host_path_placeholder', '/DATA ou caminho da pasta')}
                  value={sharePath}
                  onChange={(e) => setSharePath(e.target.value)}
                  className="w-full bg-accent/50 border border-border rounded-xl px-3 py-1.5 text-xs text-primary focus:outline-none focus:ring-1 focus:ring-saturn-500 font-mono"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-secondary mb-1">
                {t('files.samba_desc_optional', 'Descrição / Comentário (Opcional)')}
              </label>
              <input
                type="text"
                placeholder={t('files.samba_comment_placeholder', 'ex: Arquivos e downloads da rede')}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="w-full bg-accent/50 border border-border rounded-xl px-3 py-1.5 text-xs text-primary focus:outline-none focus:ring-1 focus:ring-saturn-500"
              />
            </div>

            <div className="flex items-center justify-between flex-wrap gap-3 pt-1">
              <div className="flex items-center gap-4 text-xs">
                <label className="flex items-center gap-2 cursor-pointer text-secondary hover:text-primary">
                  <input
                    type="checkbox"
                    checked={guestOk}
                    onChange={(e) => setGuestOk(e.target.checked)}
                    className="rounded border-border text-saturn-500 focus:ring-saturn-500"
                  />
                  <span>{t('files.samba_guest_access', 'Acesso Convidado (Sem Senha)')}</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-secondary hover:text-primary">
                  <input
                    type="checkbox"
                    checked={readOnly}
                    onChange={(e) => setReadOnly(e.target.checked)}
                    className="rounded border-border text-saturn-500 focus:ring-saturn-500"
                  />
                  <span>{t('files.samba_read_only', 'Somente Leitura')}</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-saturn-500 hover:bg-saturn-600 text-white rounded-xl text-xs font-semibold shadow-md shadow-saturn-500/25 transition-all flex items-center gap-1.5"
              >
                {isSubmitting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FolderSymlink className="w-3.5 h-3.5" />
                )}
                <span>{t('files.samba_save_share', 'Salvar Compartilhamento')}</span>
              </button>
            </div>
          </form>

          {/* Active Shares List */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-primary flex items-center justify-between">
              <span>{t('files.samba_active_shares', { count: shares.length, defaultValue: `Compartilhamentos Ativos (${shares.length})` })}</span>
              {loading && <RefreshCw className="w-3 h-3 animate-spin text-saturn-500" />}
            </h3>

            {shares.length === 0 ? (
              <div className="text-center py-6 text-xs text-secondary bg-accent/20 rounded-xl border border-dashed border-border/80">
                {t('files.samba_no_shares', 'Nenhum compartilhamento configurado ainda.')}
              </div>
            ) : (
              <div className="space-y-2">
                {shares.map((sh) => {
                  const winSharePath = `\\\\${lanIp}\\${sh.name}`;
                  const macSharePath = `smb://${lanIp}/${sh.name}`;

                  return (
                    <div
                      key={sh.name}
                      className="bg-card/80 border border-border/80 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-saturn-500/40 transition-colors"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                          <span className="text-xs font-bold text-primary font-mono">{sh.name}</span>
                          <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-medium ${
                            sh.read_only 
                              ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30' 
                              : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                          }`}>
                            {sh.read_only ? t('files.samba_read', 'Leitura') : t('files.samba_read_write', 'Leitura & Escrita')}
                          </span>
                          {sh.guest_ok ? (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 font-mono font-medium flex items-center gap-0.5">
                              <ShieldCheck className="w-2.5 h-2.5" /> {t('files.public', 'Público')}
                            </span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30 font-mono font-medium flex items-center gap-0.5">
                              <Lock className="w-2.5 h-2.5" /> {t('files.authenticated', 'Autenticado')}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-secondary font-mono truncate max-w-md">
                          {sh.path} {sh.comment && `— ${sh.comment}`}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                        <button
                          onClick={() => handleCopy(winSharePath, `win_${sh.name}`)}
                          className="px-2 py-1 bg-accent hover:bg-accent/80 text-secondary hover:text-primary rounded-lg text-[11px] font-mono flex items-center gap-1 transition-colors border border-border/50"
                          title={`Copiar Windows: ${winSharePath}`}
                        >
                          {copiedKey === `win_${sh.name}` ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                          <span>Win</span>
                        </button>
                        <button
                          onClick={() => handleCopy(macSharePath, `mac_${sh.name}`)}
                          className="px-2 py-1 bg-accent hover:bg-accent/80 text-secondary hover:text-primary rounded-lg text-[11px] font-mono flex items-center gap-1 transition-colors border border-border/50"
                          title={`Copiar Mac/Linux: ${macSharePath}`}
                        >
                          {copiedKey === `mac_${sh.name}` ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                          <span>Mac</span>
                        </button>
                        <button
                          onClick={() => handleDeleteShare(sh.name)}
                          className="p-1.5 text-secondary hover:text-rose-500 rounded-lg hover:bg-rose-500/10 transition-colors"
                          title={t('files.samba_remove_share', 'Remover compartilhamento')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border/80 bg-accent/20 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-card hover:bg-accent border border-border rounded-xl text-xs font-semibold text-secondary hover:text-primary transition-colors"
          >
            {t('common.close', 'Fechar')}
          </button>
        </div>
      </div>
    </div>
  );
}
