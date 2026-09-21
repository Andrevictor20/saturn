import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Sun, Moon, LogOut, Palette, Menu, X, Maximize, Minimize, Sparkles, Globe, ChevronDown, RefreshCw
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useSystemUpdate } from '../../contexts/SystemUpdateContext';
import { supportedLanguages } from '../../i18n';
import { InstallProgressModal } from '../docker/InstallProgressModal';
import { isNewerVersion } from '../../utils/version';
import { BatchUpdateFloatingBar } from '../docker/BatchUpdateFloatingBar';
import { SystemUpdateFloatingBar } from '../system/SystemUpdateFloatingBar';
import { ProfileModal } from './ProfileModal';
import { UpdateModal, type SystemUpdateInfo } from '../system/UpdateModal';
import { UploadProgressDrawer } from '../files/UploadProgressDrawer';
import { SaturnLogo } from '../ui/SaturnLogo';
import { UserAvatar } from '../ui/UserAvatar';
import { MobilePreferencesDropdown, COLOR_THEMES_LIST } from './MobilePreferencesDropdown';
import { SidebarNav } from './SidebarNav';

function CustomDropdown({ icon: Icon, value, options, onChange, label }: { icon: any; value: string; options: { value: string; label: React.ReactNode }[]; onChange: (val: string) => void; label?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  const selectedOption = options.find(o => o.value === value) || options[0];
  return (
    <div className="relative" ref={dropdownRef}>
      <button onClick={() => setIsOpen(!isOpen)} className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl border border-border/70 bg-card/50 hover:bg-card/85 backdrop-blur-2xl transition-all duration-200 active:scale-[0.98] text-secondary hover:text-primary hover:border-saturn-500/40 shadow-sm focus-visible:ring-2 focus-visible:ring-saturn-500" aria-label={label}>
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="hidden md:inline text-xs font-medium max-w-[80px] sm:max-w-[120px] truncate">{selectedOption.label}</span>
        <ChevronDown className={`w-3.5 h-3.5 opacity-60 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 rounded-2xl border border-border/80 bg-card/90 backdrop-blur-3xl shadow-2xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-200 origin-top-right">
          {options.map((opt) => (
            <button key={opt.value} onClick={() => { onChange(opt.value); setIsOpen(false); }} className={`w-full text-left px-3.5 py-2 text-xs font-medium hover:bg-saturn-500/15 hover:text-saturn-400 transition-colors ${value === opt.value ? 'text-saturn-500 bg-saturn-500/10 font-semibold' : 'text-secondary hover:text-primary'}`}>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { t, i18n } = useTranslation();
  const { logout } = useAuth();
  const { theme, setTheme, color, setColor, wallpaperUrl, wallpaperOpacity, wallpaperBlur } = useTheme();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<SystemUpdateInfo | null>(null);

  const {
    isModalOpen: isSystemUpdateModalOpen,
    openModal: openSystemUpdateModal,
    closeModal: closeSystemUpdateModal,
    isUpdating: isSystemUpdating,
    progress: systemUpdateProgress,
  } = useSystemUpdate();

  const hasUpdate = Boolean(
    updateInfo?.has_update && updateInfo?.latest_version && updateInfo?.current_version &&
    isNewerVersion(updateInfo.latest_version, updateInfo.current_version)
  );

  useEffect(() => { setIsMobileMenuOpen(false); }, [location.pathname]);

  const checkUpdates = (force = false) => {
    const token = localStorage.getItem('saturn_token');
    const url = force ? '/api/system/update/check?force=true' : '/api/system/update/check';
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (data) setUpdateInfo(data); })
      .catch(() => {});
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('updated') === 'true') { checkUpdates(true); window.history.replaceState({}, '', location.pathname); }
    else checkUpdates();
    const interval = setInterval(checkUpdates, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [location.search]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
  }, [location.pathname]);

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="min-h-screen flex bg-background relative overflow-x-hidden">
      {/* Wallpaper */}
      {wallpaperUrl && (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none" aria-hidden="true">
          <img src={wallpaperUrl} alt="" className="w-full h-full object-cover transition-all duration-500 ease-out will-change-transform" style={{ filter: wallpaperBlur > 0 ? `blur(${wallpaperBlur}px)` : 'none', transform: wallpaperBlur > 0 ? 'scale(1.03)' : 'scale(1)' }} />
          <div className="absolute inset-0 bg-background transition-colors duration-300" style={{ opacity: wallpaperOpacity }} />
        </div>
      )}

      {/* Ambient orbs (active only when wallpaper is not present to avoid color bleeding) */}
      {!wallpaperUrl && (
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 transition-opacity duration-500 opacity-80">
          <div className="absolute -top-36 -right-32 w-[650px] h-[650px] rounded-full bg-gradient-to-br from-saturn-500/20 via-purple-600/12 to-transparent blur-[140px] opacity-80 animate-float-slow" />
          <div className="absolute top-1/4 -left-48 w-[720px] h-[720px] rounded-full bg-gradient-to-tr from-saturn-600/16 via-cyan-500/10 to-transparent blur-[150px] opacity-75 animate-float-reverse" />
          <div className="absolute -bottom-40 right-1/4 w-[600px] h-[600px] rounded-full bg-gradient-to-tl from-indigo-500/16 via-pink-500/10 to-transparent blur-[140px] opacity-70 animate-pulse-glow" />
          <div className="absolute bottom-1/4 left-1/3 w-[480px] h-[480px] rounded-full bg-gradient-to-r from-emerald-500/10 via-saturn-500/12 to-transparent blur-[130px] opacity-65 animate-float-slow animation-delay-2000" />
        </div>
      )}

      {/* Mobile Backdrop */}
      {isMobileMenuOpen && <div onClick={() => setIsMobileMenuOpen(false)} className="fixed inset-0 bg-black/60 backdrop-blur-md z-40 md:hidden transition-opacity animate-in fade-in" aria-hidden="true" />}

      {/* Sidebar */}
      <aside className={`border-r border-border/60 flex flex-col fixed inset-y-0 left-0 z-50 bg-card/85 backdrop-blur-2xl shadow-2xl transition-all duration-300 ${isMobileMenuOpen ? 'translate-x-0 w-72 shadow-2xl' : '-translate-x-full'} md:translate-x-0 ${isSidebarOpen ? 'md:w-64' : 'md:w-16'}`}>
        <div className="h-14 border-b border-border/60 flex items-center justify-between px-4 bg-card/70 backdrop-blur-2xl">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <SaturnLogo size={28} className="shrink-0" />
            <div className={`flex flex-col ${(isSidebarOpen || isMobileMenuOpen) ? 'block' : 'hidden md:hidden'}`}>
              <span className="text-sm font-bold tracking-tight text-primary leading-tight truncate">{(!settings.server_name || settings.server_name.toLowerCase().includes('saturn dashboard')) ? 'Saturn' : settings.server_name}</span>
              <span className="text-[10px] text-secondary font-medium leading-tight">Admin</span>
            </div>
          </div>
          <button
            onClick={() => { if (window.innerWidth < 768) setIsMobileMenuOpen(false); else setIsSidebarOpen(!isSidebarOpen); }}
            className="p-2 text-secondary hover:text-primary transition-all duration-200 rounded-xl hover:bg-accent/80 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-saturn-500 focus-visible:outline-none"
            aria-label="Alternar menu lateral"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5 md:hidden" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        <SidebarNav
          isSidebarOpen={isSidebarOpen}
          isMobileMenuOpen={isMobileMenuOpen}
          onClose={() => setIsMobileMenuOpen(false)}
          onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        />

        <div className="p-4 border-t shad-border">
          <button
            onClick={handleLogout}
            title={(!isSidebarOpen && !isMobileMenuOpen) ? t('sidebar.sign_out') : undefined}
            className={`w-full flex items-center ${(!isSidebarOpen && !isMobileMenuOpen) ? 'justify-center px-0' : 'gap-3 px-4'} py-2 rounded-md text-sm font-medium text-secondary hover:text-primary hover:bg-accent hover:text-rose-400 transition-all duration-200 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:outline-none`}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {(isSidebarOpen || isMobileMenuOpen) && <span>{t('sidebar.sign_out')}</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`relative z-10 flex-1 flex flex-col min-h-screen transition-all duration-300 w-full min-w-0 ${isSidebarOpen ? 'md:ml-64' : 'md:ml-16'}`}>
        <header className="h-14 border-b border-border/60 flex items-center justify-between px-3 sm:px-6 sticky top-0 z-30 bg-card/45 backdrop-blur-3xl saturate-[190%] shadow-sm">
          <div className="flex items-center gap-2.5 md:hidden">
            <button onClick={() => setIsMobileMenuOpen(true)} className="w-9 h-9 flex items-center justify-center text-secondary hover:text-primary rounded-xl border border-border/70 bg-card/50 hover:bg-card/85 backdrop-blur-2xl transition-all duration-200 active:scale-95 shadow-sm focus-visible:ring-2 focus-visible:ring-saturn-500" aria-label={t('sidebar.open_navigation_menu', 'Abrir menu de navegação')}>
              <Menu className="w-4.5 h-4.5" />
            </button>
            <div className="flex items-center gap-2">
              <SaturnLogo size={22} />
              <span className="text-sm font-bold tracking-tight text-primary">Saturn</span>
            </div>
          </div>
          <div className="hidden md:block" />

          <div className="flex items-center gap-1.5 sm:gap-2.5 text-sm font-medium">
            <button
              onClick={() => {
                if (isSystemUpdateModalOpen || isUpdateModalOpen) {
                  setIsUpdateModalOpen(false);
                  closeSystemUpdateModal();
                } else {
                  setIsUpdateModalOpen(true);
                  openSystemUpdateModal();
                }
              }}
              className={`relative w-9 h-9 rounded-xl border transition-all duration-200 active:scale-[0.95] focus-visible:ring-2 focus-visible:ring-saturn-500 focus-visible:outline-none shadow-sm ${
                isSystemUpdating
                  ? 'flex items-center justify-center text-saturn-400 bg-saturn-500/20 border-saturn-500/40'
                  : hasUpdate
                  ? 'flex items-center justify-center text-amber-400 bg-amber-500/15 border-amber-500/35 hover:bg-amber-500/25'
                  : 'hidden sm:flex items-center justify-center text-secondary hover:text-primary border-border/70 bg-card/50 hover:bg-card/85 hover:border-saturn-500/40 backdrop-blur-2xl'
              }`}
              title={isSystemUpdating ? `Atualizando Saturn (${systemUpdateProgress}%)...` : hasUpdate ? t('system.update_available', 'Nova versão disponível!') : t('system.check_updates', 'Verificar atualizações')}
              aria-label={t('system.saturn_updates', 'Atualizações do Saturn')}
            >
              {isSystemUpdating ? <RefreshCw className="w-4 h-4 animate-spin text-saturn-400" /> : <Sparkles className="w-4 h-4" />}
              {hasUpdate && !isSystemUpdating && (
                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                </span>
              )}
            </button>

            <MobilePreferencesDropdown
              color={color}
              onColorChange={(val) => setColor(val as any)}
              currentLang={supportedLanguages.some(l => l.code === i18n.language) ? i18n.language : (i18n.language?.split('-')[0] || 'pt')}
              onLangChange={(val) => i18n.changeLanguage(val)}
              languages={supportedLanguages}
            />

            <div className="hidden sm:flex items-center gap-2">
              <CustomDropdown icon={Palette} value={color} onChange={(val) => setColor(val as any)} options={COLOR_THEMES_LIST.map(th => ({ value: th.value, label: th.label }))} label="Selecionar tema de cores" />
              <CustomDropdown icon={Globe} value={supportedLanguages.some(l => l.code === i18n.language) ? i18n.language : (i18n.language?.split('-')[0] || 'pt')} onChange={(val) => i18n.changeLanguage(val)} options={supportedLanguages.map(lang => ({ value: lang.code, label: `${lang.flag} ${lang.nativeName}` }))} label={t('header.switch_language')} />
            </div>

            <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="w-9 h-9 flex items-center justify-center rounded-xl border border-border/70 bg-card/50 hover:bg-card/85 hover:border-saturn-500/40 backdrop-blur-2xl transition-all duration-200 text-secondary hover:text-primary spring-bounce shadow-sm focus-visible:ring-2 focus-visible:ring-saturn-500 focus-visible:outline-none active:scale-95" aria-label={t('header.toggle_theme')}>
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              onClick={() => { if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); else document.exitFullscreen().catch(() => {}); }}
              className="hidden md:flex w-9 h-9 items-center justify-center rounded-xl border border-border/70 bg-card/50 hover:bg-card/85 hover:border-saturn-500/40 backdrop-blur-2xl transition-all duration-200 text-secondary hover:text-primary spring-bounce shadow-sm focus-visible:ring-2 focus-visible:ring-saturn-500 focus-visible:outline-none active:scale-95"
              title="Alternar Tela Cheia"
              aria-label="Alternar tela cheia"
            >
              {typeof document !== 'undefined' && document.fullscreenElement ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>

            <div className="hidden sm:block h-5 sm:h-6 w-px bg-border/80 mx-0.5 sm:mx-1" />

            <button onClick={() => setIsProfileModalOpen(true)} className="w-9 h-9 flex items-center justify-center rounded-xl border border-border/70 bg-card/50 hover:bg-card/85 backdrop-blur-2xl hover:border-saturn-500/50 shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saturn-500 active:scale-95" title={t('header.user_profile', 'Perfil do Usuário')} aria-label={t('header.user_profile', 'Perfil do Usuário')}>
              <UserAvatar size={20} />
            </button>
          </div>
        </header>

        <div key={location.pathname} className={`relative z-10 flex-1 overflow-x-hidden animate-fade-in w-full min-w-0 ${location.pathname === '/files' ? 'p-2 sm:p-3.5 lg:p-4 flex flex-col' : 'p-3.5 sm:p-6 lg:p-8'}`}>
          {children}
        </div>
      </main>

      <InstallProgressModal />
      <BatchUpdateFloatingBar />
      <SystemUpdateFloatingBar />
      <UploadProgressDrawer />
      <ProfileModal isOpen={isProfileModalOpen} onClose={() => setIsProfileModalOpen(false)} />
      <UpdateModal
        isOpen={isSystemUpdateModalOpen || isUpdateModalOpen}
        onClose={() => {
          setIsUpdateModalOpen(false);
          closeSystemUpdateModal();
        }}
        updateInfo={updateInfo}
        onRefreshInfo={() => checkUpdates(true)}
      />
    </div>
  );
}
