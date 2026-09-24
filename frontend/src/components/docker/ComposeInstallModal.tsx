import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  FileCode, 
  Terminal, 
  X, 
  Save, 
  Play, 
  Plus, 
  Download, 
  Loader2,
  Wand2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { COMPOSE_TEMPLATES } from '../compose/composeTemplates';
import { extractPortsFromYaml, validateComposeSyntax } from '../compose/yamlValidator';
import { DockerRunTab } from './DockerRunTab';
import { ComposeEditorTab, type StackOption } from './ComposeEditorTab';
import { ComposeWizardTab } from './ComposeWizardTab';
import { useInstall } from '../../contexts/InstallContext';
import { useConfirm } from '../../contexts/ConfirmContext';

export interface ComposeInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (appName: string) => void;
  initialTemplateId?: string;
  initialYaml?: string;
  initialEnv?: string;
}

export function ComposeInstallModal({
  isOpen,
  onClose,
  onSuccess,
  initialTemplateId,
  initialYaml,
  initialEnv
}: ComposeInstallModalProps) {
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const { startInstall } = useInstall();
  const [modalTab, setModalTab] = useState<'wizard' | 'compose' | 'dockerrun'>('compose');
  const [stackName, setStackName] = useState('');
  const [composeYaml, setComposeYaml] = useState(COMPOSE_TEMPLATES[0]?.yaml || '');
  const [envContent, setEnvContent] = useState(COMPOSE_TEMPLATES[0]?.env || '');
  const [existingStacks, setExistingStacks] = useState<StackOption[]>([]);
  const [loadingStacks, setLoadingStacks] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [conflictingPorts, setConflictingPorts] = useState<number[]>([]);
  const [checkingPorts, setCheckingPorts] = useState(false);

  const getAuthHeaders = useCallback((): HeadersInit => {
    const token = localStorage.getItem('saturn_token');
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
  }, []);

  const loadStacks = useCallback(async () => {
    try {
      setLoadingStacks(true);
      const res = await fetch('/api/docker/compose/stacks', {
        headers: getAuthHeaders(),
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setExistingStacks(data);
      }
    } catch {
      // Ignored
    } finally {
      setLoadingStacks(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    if (isOpen) {
      loadStacks();
      if (initialYaml) {
        setComposeYaml(initialYaml);
      } else if (initialTemplateId) {
        const tmpl = COMPOSE_TEMPLATES.find(t => t.id === initialTemplateId);
        if (tmpl) {
          setComposeYaml(tmpl.yaml);
          if (tmpl.env) setEnvContent(tmpl.env);
          setStackName(tmpl.id);
        }
      }
      if (initialEnv) setEnvContent(initialEnv);
    }
  }, [isOpen, initialTemplateId, initialYaml, initialEnv, loadStacks]);

  const loadStackContent = async (name: string) => {
    if (!name) return;
    try {
      setLoadingContent(true);
      const res = await fetch(`/api/docker/compose/stacks/${encodeURIComponent(name)}`, {
        headers: getAuthHeaders(),
        credentials: 'include'
      });
      if (!res.ok) throw new Error(t('compose_modal.load_failed', 'Falha ao carregar conteúdo da stack'));
      const data = await res.json();
      setStackName(data.name);
      setComposeYaml(data.compose_yaml || '');
      setEnvContent(data.env_content || '');
      toast.success(t('docker.stack_loaded', { name, defaultValue: `Stack ${name} carregada!` }));
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoadingContent(false);
    }
  };

  const validation = useMemo(() => {
    return validateComposeSyntax(composeYaml, t);
  }, [composeYaml, t]);

  // Port conflict check
  useEffect(() => {
    const ports = extractPortsFromYaml(composeYaml);
    if (ports.length === 0) {
      setConflictingPorts([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setCheckingPorts(true);
        const res = await fetch(`/api/docker/ports/check?ports=${ports.join(',')}`, {
          headers: getAuthHeaders(),
          credentials: 'include'
        });
        if (res.ok) {
          const results = await res.json();
          const conflicts = Array.isArray(results)
            ? results.filter((r: any) => r.in_use).map((r: any) => r.port)
            : (results.conflicts || []).filter((r: any) => r.in_use).map((r: any) => r.host_port);
          setConflictingPorts(conflicts);
        }
      } catch {
        // Ignored
      } finally {
        setCheckingPorts(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [composeYaml, getAuthHeaders]);

  const handleSelectTemplate = async (templateId: string) => {
    const tmpl = COMPOSE_TEMPLATES.find((t) => t.id === templateId);
    if (!tmpl) return;
    if (composeYaml.trim()) {
      const confirmed = await confirm({
        title: t('compose_modal.overwrite_title', 'Substituir Template'),
        message: t('compose_modal.overwrite_confirm', 'Substituir o conteúdo atual pelo template selecionado?'),
        confirmText: t('common.replace', 'Substituir'),
        cancelText: t('common.cancel', 'Cancelar'),
        isDestructive: false,
      });
      if (!confirmed) return;
    }
    setComposeYaml(tmpl.yaml);
    if (tmpl.env) setEnvContent(tmpl.env);
    if (!stackName) setStackName(tmpl.id);
  };

  const handleSaveDraft = async () => {
    const cleanName = stackName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    if (!cleanName) {
      toast.error(t('compose_modal.name_required', 'Informe um nome válido para a stack'));
      return;
    }

    if (!validation.valid) {
      toast.error(t('docker.fix_yaml_errors', { error: validation.error, defaultValue: `Corrija os erros do YAML: ${validation.error}` }));
      return;
    }

    setSaving(true);
    const toastId = toast.loading(t('docker.saving_draft', { name: cleanName, defaultValue: `Salvando rascunho de ${cleanName}...` }));

    try {
      const res = await fetch('/api/docker/compose/save', {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          name: cleanName,
          compose_yaml: composeYaml,
          env_content: envContent.trim() ? envContent : null,
        }),
      });

      if (!res.ok) {
        const errorMsg = await res.text();
        throw new Error(errorMsg || t('docker.failed_save_stack', 'Falha ao salvar a stack'));
      }

      toast.success(t('docker.draft_saved_success', 'Rascunho da stack salvo com sucesso!'), { id: toastId });
      loadStacks();
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`, { id: toastId });
    } finally {
      setSaving(false);
    }
  };

  const handleDeployWith = async (yamlToDeploy: string, nameToDeploy: string) => {
    const cleanName = nameToDeploy.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    if (!cleanName) {
      toast.error(t('compose_modal.name_required', 'Informe um nome válido para a stack'));
      return;
    }

    setDeploying(true);
    const toastId = toast.loading(t('docker.deploying_stack', { name: cleanName, defaultValue: `Instalando e executando stack ${cleanName}...` }));

    try {
      await fetch('/api/docker/compose/save', {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          name: cleanName,
          compose_yaml: yamlToDeploy,
          env_content: envContent.trim() ? envContent : null,
        }),
      });

      const res = await fetch('/api/docker/compose/install', {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          app_name: cleanName,
          compose_yaml: yamlToDeploy,
          override_ports: {}
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || t('docker.error_starting_container_install', 'Erro ao iniciar container da stack'));
      }

      const data = await res.json();
      toast.success(t('docker.stack_install_started', { name: cleanName, defaultValue: `Instalação de ${cleanName} iniciada com sucesso!` }), { id: toastId });

      if (data.task_id) {
        startInstall(data.task_id, cleanName);
      }

      onClose();
      if (onSuccess) onSuccess(cleanName);
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`, { id: toastId });
    } finally {
      setDeploying(false);
    }
  };

  const handleDeploy = () => {
    if (!validation.valid) {
      toast.error(t('docker.fix_yaml_errors', { error: validation.error, defaultValue: `Corrija os erros do YAML: ${validation.error}` }));
      return;
    }
    handleDeployWith(composeYaml, stackName);
  };

  const handleDownload = () => {
    const blob = new Blob([composeYaml], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'docker-compose.yml';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleNewStack = () => {
    setStackName('');
    setComposeYaml(COMPOSE_TEMPLATES[0]?.yaml || '');
    setEnvContent(COMPOSE_TEMPLATES[0]?.env || '');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div 
        className="bg-card border border-border rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden relative text-primary animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="compose-modal-title"
      >
        {/* Header */}
        <div className="p-4 sm:px-6 border-b border-border flex items-center justify-between bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-saturn-500/10 text-saturn-500 border border-saturn-500/20">
              <FileCode className="w-5 h-5" />
            </div>
            <div>
              <h2 id="compose-modal-title" className="text-base sm:text-lg font-bold text-primary tracking-tight">
                {t('compose_modal.title', 'Instalação Personalizada & Editor Compose')}
              </h2>
              <p className="text-xs text-secondary">
                {t('compose_modal.subtitle', 'Configure stacks customizadas com linting, templates e checagem de portas ou execute Docker Run.')}
              </p>
            </div>
          </div>

          <button 
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-accent text-secondary hover:text-primary transition-colors"
            aria-label={t('common.close', 'Fechar')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top Tab Mode Switcher */}
        <div className="flex border-b border-border px-6 gap-3 bg-muted/10 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setModalTab('wizard')}
            className={`py-3 flex items-center gap-2 border-b-2 transition-all ${
              modalTab === 'wizard'
                ? 'border-saturn-500 text-saturn-500 font-bold'
                : 'border-transparent text-secondary hover:text-primary'
            }`}
          >
            <Wand2 className="w-4 h-4" />
            <span>{t('compose_modal.tab_wizard', 'Assistente Visual')}</span>
          </button>

          <button
            type="button"
            onClick={() => setModalTab('compose')}
            className={`py-3 flex items-center gap-2 border-b-2 transition-all ${
              modalTab === 'compose'
                ? 'border-saturn-500 text-saturn-500 font-bold'
                : 'border-transparent text-secondary hover:text-primary'
            }`}
          >
            <FileCode className="w-4 h-4" />
            <span>{t('compose_modal.tab_editor', 'Editor Docker Compose')}</span>
          </button>

          <button
            type="button"
            onClick={() => setModalTab('dockerrun')}
            className={`py-3 flex items-center gap-2 border-b-2 transition-all ${
              modalTab === 'dockerrun'
                ? 'border-saturn-500 text-saturn-500 font-bold'
                : 'border-transparent text-secondary hover:text-primary'
            }`}
          >
            <Terminal className="w-4 h-4" />
            <span>{t('compose_modal.tab_dockerrun', 'Docker Run (Rápido)')}</span>
          </button>
        </div>

        {/* Body Area */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {modalTab === 'wizard' ? (
            <ComposeWizardTab
              onTransferToEditor={(yamlStr, name) => {
                setComposeYaml(yamlStr);
                if (name) setStackName(name);
                setModalTab('compose');
                toast.success('Configuração gerada e carregada no Editor Compose!');
              }}
              onDeployDirect={handleDeployWith}
              isDeploying={deploying}
            />
          ) : modalTab === 'dockerrun' ? (
            <DockerRunTab
              onTransferToEditor={(yamlStr, name) => {
                setComposeYaml(yamlStr);
                if (name) setStackName(name);
                setModalTab('compose');
                toast.success('Comando convertido e carregado no Editor Compose!');
              }}
              onSuccess={(appName) => {
                if (onSuccess) onSuccess(appName);
              }}
              onClose={onClose}
              startInstall={startInstall}
            />
          ) : (
            <ComposeEditorTab
              stackName={stackName}
              setStackName={setStackName}
              composeYaml={composeYaml}
              setComposeYaml={setComposeYaml}
              envContent={envContent}
              setEnvContent={setEnvContent}
              existingStacks={existingStacks}
              loadingStacks={loadingStacks}
              loadStacks={loadStacks}
              onLoadStackContent={loadStackContent}
              validation={validation}
              conflictingPorts={conflictingPorts}
              checkingPorts={checkingPorts}
              onSelectTemplate={handleSelectTemplate}
            />
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-3 sm:px-6 border-t border-border bg-muted/20 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleNewStack}
              className="px-3 py-1.5 bg-card hover:bg-accent text-secondary hover:text-primary rounded-xl text-xs font-semibold border border-border transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5 text-saturn-500" />
              <span>Nova Stack</span>
            </button>

            <button
              type="button"
              onClick={handleDownload}
              className="p-1.5 text-secondary hover:text-primary rounded-xl hover:bg-accent border border-border transition-colors"
              title="Baixar docker-compose.yml"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-secondary hover:text-primary hover:bg-accent rounded-xl transition-colors"
            >
              {t('common.cancel', 'Cancelar')}
            </button>

            {modalTab === 'compose' && (
              <>
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={saving || deploying || loadingContent}
                  className="px-4 py-2 bg-card hover:bg-accent text-primary rounded-xl text-xs font-semibold border border-border transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>Salvar Rascunho</span>
                </button>

                <button
                  type="button"
                  onClick={handleDeploy}
                  disabled={saving || deploying || loadingContent || !validation.valid}
                  className="px-4 py-2 bg-saturn-500 hover:bg-saturn-600 text-white rounded-xl text-xs font-semibold transition-all shadow-md shadow-saturn-500/20 flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                >
                  {deploying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                  <span>Salvar & Executar</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
