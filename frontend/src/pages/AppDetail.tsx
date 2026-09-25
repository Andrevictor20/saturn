import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Download, ArrowLeft, Settings, ChevronDown, Package, Lock } from 'lucide-react';
import { CustomInstallModal } from '../components/docker/CustomInstallModal';
import { AppArchitectureBadge } from '../components/appstore/AppArchitectureBadge';
import { AppIcon } from '../components/appstore/AppIcon';
import { useSystemVersionQuery } from '../queries/useSystemVersionQuery';
import { PortConflictDialog, type PortConflictItem } from '../components/docker/PortConflictDialog';
import { useInstall } from '../contexts/InstallContext';
import { useAuth } from '../contexts/AuthContext';

interface AppStoreItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  store: string;
  compose_file: string;
  architectures?: string[];
}

export function AppDetail() {
  const { data: systemVersion } = useSystemVersionQuery();
  const hostArch = systemVersion?.arch;
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [app, setApp] = useState<AppStoreItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [portConflictData, setPortConflictData] = useState<{
    isOpen: boolean;
    conflicts: PortConflictItem[];
    rawInspection: any;
  } | null>(null);
  const { startInstall } = useInstall();

  useEffect(() => {
    const fetchApp = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/store/apps');
        if (!res.ok) throw new Error('Failed to fetch apps');
        const data: AppStoreItem[] = await res.json();
        const found = data.find(a => a.id === id);
        if (found) {
          setApp(found);
        } else {
          setError('App not found');
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchApp();
  }, [id]);

  const handleInstall = async (custom: boolean, payload?: any) => {
    if (custom && !payload) {
      setShowCustomModal(true);
      return;
    }
    
    try {
      setInstalling(true);
      setError(null);
      const token = localStorage.getItem('saturn_token');

      // Intercept port conflicts before 1-click install
      if (!custom) {
        try {
          const configRes = await fetch(`/api/store/apps/${app?.id}/config`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
          });
          if (configRes.ok) {
            const configData = await configRes.json();
            const hostPorts = (configData.ports || [])
              .map((p: any) => p.host)
              .filter((p: any) => typeof p === 'number' && p > 0);

            if (hostPorts.length > 0) {
              const checkRes = await fetch('/api/docker/ports/check', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ ports: hostPorts })
              });

              if (checkRes.ok) {
                const checkData = await checkRes.json();
                const conflicts: PortConflictItem[] = checkData.conflicts || [];
                if (conflicts.some(c => c.in_use)) {
                  setPortConflictData({
                    isOpen: true,
                    conflicts,
                    rawInspection: configData,
                  });
                  setInstalling(false);
                  return;
                }
              }
            }
          }
        } catch (checkErr) {
          console.warn('Pre-install port check skipped:', checkErr);
        }
      }
      
      const endpoint = custom ? `/api/store/install/custom/${app?.id}` : `/api/store/install/${app?.id}`;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (custom) headers['Content-Type'] = 'application/json';

      const options: RequestInit = {
        method: 'POST',
        headers,
        ...(custom && payload ? { body: JSON.stringify(payload) } : {}),
      };

      const res = await fetch(endpoint, options);
      
      if (!res.ok) throw new Error(await res.text() || 'Installation failed');
      
      if (res.status === 202) {
        // Backend task started for tracking
        const data = await res.json();
        startInstall(data.task_id, app!.name);
      } else {
        // Sync installation (fallback)
        setTimeout(() => navigate('/containers'), 2000);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setInstalling(false);
    }
  };

  const handleAcceptSuggestedPorts = async () => {
    if (!portConflictData || !app) return;
    const { conflicts, rawInspection } = portConflictData;
    setPortConflictData(null);

    const conflictMap = new Map<number, number>();
    conflicts.forEach(c => {
      if (c.in_use) {
        conflictMap.set(c.host_port, c.suggested_port);
      }
    });

    const adjustedPorts = (rawInspection?.ports || []).map((p: any) => ({
      host: conflictMap.get(p.host) ?? p.host,
      container: p.container,
      protocol: p.protocol || 'tcp',
    }));

    const payload = {
      ports: adjustedPorts,
      volumes: rawInspection?.volumes,
      env: rawInspection?.env,
    };

    await handleInstall(true, payload);
  };

  const handleOpenCustomFromConflict = () => {
    setPortConflictData(null);
    setShowCustomModal(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error || !app) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-md text-red-500">
        {error || 'App not found'}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <button 
        onClick={() => navigate('/store')}
        className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('common.back', 'Voltar')}
      </button>

      <div className="bg-background border shad-border rounded-xl p-8 flex flex-col md:flex-row gap-8 items-start">
        <div className="w-32 h-32 bg-accent rounded-2xl flex items-center justify-center p-4 shrink-0 shadow-lg">
          <AppIcon
            src={app.icon}
            name={app.name}
            id={app.id}
            className="w-full h-full object-contain"
            fallbackTextClassName="text-2xl font-bold"
          />
        </div>

        <div className="flex-1 space-y-4">
          <div>
            <h1 className="text-3xl font-bold">{app.name}</h1>
            <p className="text-gray-400 mt-2 text-base leading-relaxed">{app.description}</p>
          </div>

          <div className="flex gap-6 py-2 border-y border-gray-800">
            <div>
              <div className="text-xs text-gray-500 uppercase font-semibold">{t('store.category', 'Categoria')}</div>
              <div className="mt-1 flex items-center gap-2">
                <Package className="w-4 h-4 text-gray-400" />
                <span>{app.category}</span>
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase font-semibold">{t('store.store_repo', 'Loja / Repositório')}</div>
              <div className="mt-1 font-medium">{app.store}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase font-semibold">{t('store.architectures', 'Arquitetura')}</div>
              <div className="mt-1">
                <AppArchitectureBadge architectures={app.architectures} hostArch={hostArch} mode="compact" />
              </div>
            </div>
          </div>

          <div className="pt-1">
            <AppArchitectureBadge architectures={app.architectures} hostArch={hostArch} mode="detailed" />
          </div>

          <div className="flex gap-4 pt-2">
            {!isAdmin ? (
              <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-accent/60 border border-border text-xs text-secondary shadow-sm">
                <Lock className="w-3.5 h-3.5 text-secondary" />
                <span>{t('store.admin_required_install', 'Apenas administradores podem instalar aplicativos.')}</span>
              </div>
            ) : (
              <div className="relative">
                <div className="flex">
                  <button 
                    onClick={() => handleInstall(false)}
                    disabled={installing}
                    className="px-6 py-3 bg-blue-600 text-white rounded-l-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {installing ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    ) : (
                      <Download className="w-5 h-5" />
                    )}
                    {t('store.install_app', 'Instalar')}
                  </button>
                  <button
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    disabled={installing}
                    className="px-3 py-3 bg-blue-700 text-white rounded-r-lg hover:bg-blue-800 transition-colors border-l border-blue-500 disabled:opacity-50"
                  >
                    <ChevronDown className="w-5 h-5" />
                  </button>
                </div>

                {isDropdownOpen && (
                  <div className="absolute top-full left-0 mt-2 w-56 bg-gray-900 border border-gray-800 rounded-lg shadow-xl overflow-hidden z-10">
                    <button 
                      onClick={() => { setIsDropdownOpen(false); handleInstall(true); }}
                      className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-gray-800 hover:text-white flex items-center gap-2"
                    >
                      <Settings className="w-4 h-4" />
                      {t('store.install_custom', 'Instalação Personalizada')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      
      {showCustomModal && (
        <CustomInstallModal 
          appId={app.id} 
          appName={app.name}
          onClose={() => setShowCustomModal(false)}
          onInstall={(payload) => {
            setShowCustomModal(false);
            handleInstall(true, payload);
          }}
        />
      )}

      {portConflictData && app && (
        <PortConflictDialog
          isOpen={portConflictData.isOpen}
          onClose={() => setPortConflictData(null)}
          appName={app.name}
          conflicts={portConflictData.conflicts}
          onAcceptSuggested={handleAcceptSuggestedPorts}
          onOpenCustom={handleOpenCustomFromConflict}
          installing={installing}
        />
      )}
    </div>
  );
}
