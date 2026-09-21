import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  FileCode,
  Play,
  Loader2,
  ShieldCheck,
  Server,
  Folder,
  Sliders,
  Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  type PortEntry,
  type VolumeEntry,
  type EnvEntry,
  POPULAR_IMAGES,
  buildComposeYaml,
} from './wizardUtils';

export type { PortEntry, VolumeEntry, EnvEntry };

interface ComposeWizardTabProps {
  onTransferToEditor: (yamlStr: string, name: string) => void;
  onDeployDirect: (yamlStr: string, name: string) => Promise<void>;
  isDeploying?: boolean;
}

export const ComposeWizardTab: React.FC<ComposeWizardTabProps> = ({
  onTransferToEditor,
  onDeployDirect,
  isDeploying = false,
}) => {
  const { t } = useTranslation();

  const [serviceName, setServiceName] = useState('');
  const [image, setImage] = useState('nginx:alpine');
  const [restartPolicy, setRestartPolicy] = useState('unless-stopped');
  const [networkMode, setNetworkMode] = useState('bridge');

  const [ports, setPorts] = useState<PortEntry[]>([
    { id: '1', hostPort: '8080', containerPort: '80', protocol: 'tcp' },
  ]);

  const [volumes, setVolumes] = useState<VolumeEntry[]>([]);
  const [envVars, setEnvVars] = useState<EnvEntry[]>([]);

  // Port Checking
  const checkPortAvailability = async (index: number, portStr: string) => {
    const portNum = parseInt(portStr, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      toast.error(t('wizard.invalid_port', 'Porta inválida (deve estar entre 1 e 65535)'));
      return;
    }

    setPorts((prev) =>
      prev.map((p, i) => (i === index ? { ...p, checking: true } : p))
    );

    try {
      const token = localStorage.getItem('saturn_token');
      const res = await fetch(`/api/system/settings/check-port?port=${portNum}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ port: portNum }),
      });

      if (res.ok) {
        const data = await res.json();
        const isFree = data.available !== false && !data.in_use;
        setPorts((prev) =>
          prev.map((p, i) =>
            i === index ? { ...p, isAvailable: isFree, checking: false } : p
          )
        );
        if (isFree) {
          toast.success(t('wizard.port_available', `Porta ${portNum} está livre!`));
        } else {
          toast.error(t('wizard.port_busy', `Porta ${portNum} já está em uso!`));
        }
      } else {
        setPorts((prev) =>
          prev.map((p, i) => (i === index ? { ...p, checking: false } : p))
        );
      }
    } catch {
      setPorts((prev) =>
        prev.map((p, i) => (i === index ? { ...p, checking: false } : p))
      );
    }
  };

  const generateYaml = () =>
    buildComposeYaml({
      serviceName,
      image,
      restartPolicy,
      networkMode,
      ports,
      volumes,
      envVars,
    });

  const handleTransfer = () => {
    if (!image.trim()) {
      toast.error(t('wizard.image_required', 'Informe a imagem do contêiner'));
      return;
    }
    const { yaml, name } = generateYaml();
    onTransferToEditor(yaml, name);
  };

  const handleDeploy = async () => {
    if (!image.trim()) {
      toast.error(t('wizard.image_required', 'Informe a imagem do contêiner'));
      return;
    }
    const { yaml, name } = generateYaml();
    await onDeployDirect(yaml, name);
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Intro Banner */}
      <div className="flex items-center gap-3 p-4 rounded-2xl border border-saturn-500/20 bg-saturn-500/5 text-xs text-secondary">
        <Sparkles className="w-5 h-5 text-saturn-400 shrink-0" />
        <p>
          {t(
            'wizard.intro',
            'Preencha os dados do contêiner abaixo. O assistente gerará a especificação Compose e validará portas automaticamente.'
          )}
        </p>
      </div>

      {/* 1. Identification */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-primary flex items-center gap-2">
          <Server className="w-4 h-4 text-saturn-500" />
          {t('wizard.section_general', 'Identificação & Imagem')}
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-secondary">
              {t('wizard.service_name', 'Nome do Contêiner / Stack')}
            </label>
            <input
              type="text"
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              placeholder="ex: meu-site-web"
              className="w-full px-3.5 py-2 rounded-xl bg-background border border-border text-xs text-primary focus:outline-none focus:border-saturn-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-secondary">
              {t('wizard.image_name', 'Imagem Docker (com tag)')}
            </label>
            <input
              type="text"
              value={image}
              onChange={(e) => setImage(e.target.value)}
              placeholder="ex: nginx:alpine, redis:7"
              className="w-full px-3.5 py-2 rounded-xl bg-background border border-border text-xs text-primary font-mono focus:outline-none focus:border-saturn-500"
            />
          </div>
        </div>

        {/* Popular image chips */}
        <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
          <span className="text-secondary font-medium mr-1">{t('wizard.popular_suggestions', 'Sugestões:')}</span>
          {POPULAR_IMAGES.map((img) => (
            <button
              key={img}
              type="button"
              onClick={() => {
                setImage(img);
                if (!serviceName) {
                  setServiceName(img.split(':')[0]);
                }
              }}
              className="px-2 py-0.5 rounded-lg border border-border bg-muted/40 hover:bg-saturn-500/10 hover:border-saturn-500/30 text-secondary hover:text-primary transition-all font-mono"
            >
              {img}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Ports */}
      <div className="space-y-3 pt-4 border-t border-border/60">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-primary flex items-center gap-2">
            <Sliders className="w-4 h-4 text-saturn-500" />
            {t('wizard.section_ports', 'Mapeamento de Portas')}
          </h3>
          <button
            type="button"
            onClick={() =>
              setPorts((prev) => [
                ...prev,
                { id: Date.now().toString(), hostPort: '', containerPort: '', protocol: 'tcp' },
              ])
            }
            className="flex items-center gap-1 text-xs text-saturn-500 hover:text-saturn-600 font-semibold"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('wizard.add_port', 'Adicionar Porta')}</span>
          </button>
        </div>

        {ports.length === 0 ? (
          <p className="text-xs text-secondary/70 italic">{t('wizard.no_ports', 'Nenhuma porta mapeada.')}</p>
        ) : (
          <div className="space-y-2">
            {ports.map((p, idx) => (
              <div key={p.id} className="flex items-center gap-2">
                <input
                  type="text"
                  value={p.hostPort}
                  onChange={(e) =>
                    setPorts((prev) =>
                      prev.map((item, i) => (i === idx ? { ...item, hostPort: e.target.value, isAvailable: null } : item))
                    )
                  }
                  placeholder="Porta Host (ex: 8080)"
                  className="w-36 px-3 py-1.5 rounded-xl bg-background border border-border text-xs text-primary font-mono focus:outline-none focus:border-saturn-500"
                />
                <span className="text-secondary">:</span>
                <input
                  type="text"
                  value={p.containerPort}
                  onChange={(e) =>
                    setPorts((prev) =>
                      prev.map((item, i) => (i === idx ? { ...item, containerPort: e.target.value } : item))
                    )
                  }
                  placeholder="Porta Container (ex: 80)"
                  className="w-36 px-3 py-1.5 rounded-xl bg-background border border-border text-xs text-primary font-mono focus:outline-none focus:border-saturn-500"
                />

                <select
                  value={p.protocol}
                  onChange={(e) =>
                    setPorts((prev) =>
                      prev.map((item, i) => (i === idx ? { ...item, protocol: e.target.value as any } : item))
                    )
                  }
                  className="px-2 py-1.5 rounded-xl bg-background border border-border text-xs text-secondary focus:outline-none"
                >
                  <option value="tcp">TCP</option>
                  <option value="udp">UDP</option>
                </select>

                <button
                  type="button"
                  onClick={() => checkPortAvailability(idx, p.hostPort)}
                  disabled={!p.hostPort || p.checking}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-border text-xs hover:bg-muted font-medium text-secondary hover:text-primary transition-all disabled:opacity-40"
                  title="Testar se porta está livre no host"
                >
                  {p.checking ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : p.isAvailable === true ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : p.isAvailable === false ? (
                    <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                  ) : (
                    <ShieldCheck className="w-3.5 h-3.5" />
                  )}
                  <span>{t('wizard.test_port', 'Testar')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPorts((prev) => prev.filter((_, i) => i !== idx))}
                  className="p-1.5 text-secondary hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. Volumes */}
      <div className="space-y-3 pt-4 border-t border-border/60">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-primary flex items-center gap-2">
            <Folder className="w-4 h-4 text-saturn-500" />
            {t('wizard.section_volumes', 'Volumes & Armazenamento')}
          </h3>
          <button
            type="button"
            onClick={() =>
              setVolumes((prev) => [
                ...prev,
                { id: Date.now().toString(), hostPath: '', containerPath: '', mode: 'rw' },
              ])
            }
            className="flex items-center gap-1 text-xs text-saturn-500 hover:text-saturn-600 font-semibold"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('wizard.add_volume', 'Adicionar Volume')}</span>
          </button>
        </div>

        {volumes.length === 0 ? (
          <p className="text-xs text-secondary/70 italic">{t('wizard.no_volumes', 'Nenhum volume persistente configurado.')}</p>
        ) : (
          <div className="space-y-2">
            {volumes.map((v, idx) => (
              <div key={v.id} className="flex items-center gap-2">
                <input
                  type="text"
                  value={v.hostPath}
                  onChange={(e) =>
                    setVolumes((prev) =>
                      prev.map((item, i) => (i === idx ? { ...item, hostPath: e.target.value } : item))
                    )
                  }
                  placeholder="Caminho no Host (ex: /DATA/meu-app/data)"
                  className="flex-1 px-3 py-1.5 rounded-xl bg-background border border-border text-xs text-primary font-mono focus:outline-none focus:border-saturn-500"
                />
                <span className="text-secondary">:</span>
                <input
                  type="text"
                  value={v.containerPath}
                  onChange={(e) =>
                    setVolumes((prev) =>
                      prev.map((item, i) => (i === idx ? { ...item, containerPath: e.target.value } : item))
                    )
                  }
                  placeholder="No Contêiner (ex: /var/lib/data)"
                  className="flex-1 px-3 py-1.5 rounded-xl bg-background border border-border text-xs text-primary font-mono focus:outline-none focus:border-saturn-500"
                />

                <select
                  value={v.mode}
                  onChange={(e) =>
                    setVolumes((prev) =>
                      prev.map((item, i) => (i === idx ? { ...item, mode: e.target.value as any } : item))
                    )
                  }
                  className="px-2 py-1.5 rounded-xl bg-background border border-border text-xs text-secondary focus:outline-none"
                >
                  <option value="rw">RW (Leitura/Escrita)</option>
                  <option value="ro">RO (Somente Leitura)</option>
                </select>

                <button
                  type="button"
                  onClick={() => setVolumes((prev) => prev.filter((_, i) => i !== idx))}
                  className="p-1.5 text-secondary hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. Environment Variables */}
      <div className="space-y-3 pt-4 border-t border-border/60">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-primary flex items-center gap-2">
            <Sliders className="w-4 h-4 text-saturn-500" />
            {t('wizard.section_env', 'Variáveis de Ambiente')}
          </h3>
          <button
            type="button"
            onClick={() =>
              setEnvVars((prev) => [
                ...prev,
                { id: Date.now().toString(), key: '', value: '' },
              ])
            }
            className="flex items-center gap-1 text-xs text-saturn-500 hover:text-saturn-600 font-semibold"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('wizard.add_env', 'Adicionar Variável')}</span>
          </button>
        </div>

        {envVars.length === 0 ? (
          <p className="text-xs text-secondary/70 italic">{t('wizard.no_env', 'Nenhuma variável configurada.')}</p>
        ) : (
          <div className="space-y-2">
            {envVars.map((e, idx) => (
              <div key={e.id} className="flex items-center gap-2">
                <input
                  type="text"
                  value={e.key}
                  onChange={(ev) =>
                    setEnvVars((prev) =>
                      prev.map((item, i) => (i === idx ? { ...item, key: ev.target.value } : item))
                    )
                  }
                  placeholder="CHAVE (ex: DB_PASSWORD)"
                  className="w-1/2 px-3 py-1.5 rounded-xl bg-background border border-border text-xs text-primary font-mono focus:outline-none focus:border-saturn-500"
                />
                <span className="text-secondary">=</span>
                <input
                  type="text"
                  value={e.value}
                  onChange={(ev) =>
                    setEnvVars((prev) =>
                      prev.map((item, i) => (i === idx ? { ...item, value: ev.target.value } : item))
                    )
                  }
                  placeholder="VALOR"
                  className="w-1/2 px-3 py-1.5 rounded-xl bg-background border border-border text-xs text-primary font-mono focus:outline-none focus:border-saturn-500"
                />
                <button
                  type="button"
                  onClick={() => setEnvVars((prev) => prev.filter((_, i) => i !== idx))}
                  className="p-1.5 text-secondary hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. Policy & Network */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-border/60">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-secondary">{t('wizard.restart_policy', 'Política de Reinicialização')}</label>
          <select
            value={restartPolicy}
            onChange={(e) => setRestartPolicy(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs text-primary focus:outline-none focus:border-saturn-500"
          >
            <option value="unless-stopped">Unless Stopped (Recomendado)</option>
            <option value="always">Always</option>
            <option value="on-failure">On Failure</option>
            <option value="no">No</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-secondary">{t('wizard.network_mode', 'Modo de Rede')}</label>
          <select
            value={networkMode}
            onChange={(e) => setNetworkMode(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs text-primary focus:outline-none focus:border-saturn-500"
          >
            <option value="bridge">Bridge (Padrão)</option>
            <option value="host">Host</option>
          </select>
        </div>
      </div>

      {/* Action Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-6 border-t border-border">
        <button
          type="button"
          onClick={handleTransfer}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border hover:bg-accent text-secondary hover:text-primary text-xs font-semibold transition-all active:scale-95"
        >
          <FileCode className="w-4 h-4 text-saturn-500" />
          <span>{t('wizard.open_in_editor', 'Gerar Compose & Abrir Editor')}</span>
        </button>

        <button
          type="button"
          onClick={handleDeploy}
          disabled={isDeploying || !image.trim()}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-saturn-500 hover:bg-saturn-600 active:scale-95 text-white text-xs font-semibold shadow-md shadow-saturn-500/25 transition-all disabled:opacity-50"
        >
          {isDeploying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
          <span>{t('wizard.deploy_now', 'Criar e Executar Contêiner')}</span>
        </button>
      </div>
    </div>
  );
};
