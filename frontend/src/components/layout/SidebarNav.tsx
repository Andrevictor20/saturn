import React from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, Box, Terminal, Activity, HardDrive, Network,
  Package, Home, FileText, FolderOpen, PieChart, Archive, ShieldCheck, Cloud, AlertCircle, CheckCircle2, Loader2
} from 'lucide-react';
import { useInstall } from '../../contexts/InstallContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useAuth } from '../../contexts/AuthContext';
import { preloadRoute } from '../../utils/navigation';

interface SidebarNavProps {
  isSidebarOpen: boolean;
  isMobileMenuOpen: boolean;
  onClose: () => void;
  onToggle: () => void;
}

function SidebarSection({ title, children, isCollapsed }: { title?: string; children: React.ReactNode; isCollapsed?: boolean }) {
  if (isCollapsed) return <div className="mb-6 space-y-1">{children}</div>;
  return (
    <div className="mb-6">
      {title && <h3 className="px-4 text-xs font-semibold text-secondary tracking-wider uppercase mb-2">{title}</h3>}
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function SidebarItem({ icon: Icon, label, to, isCollapsed, onClick }: { icon: React.ElementType; label: string; to: string; isCollapsed?: boolean; onClick?: () => void }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      onMouseEnter={() => preloadRoute(to)}
      onFocus={() => preloadRoute(to)}
      title={isCollapsed ? label : undefined}
      className={({ isActive }) =>
        `w-full flex items-center ${isCollapsed ? 'justify-center px-0' : 'gap-3 px-3.5'} py-2.5 rounded-xl transition-[background-color,color,border-color,transform,box-shadow] duration-200 cubic-bezier(0.16,1,0.3,1) text-sm font-medium active:scale-[0.98] ${
          isActive
            ? 'bg-saturn-500/15 text-saturn-500 dark:text-saturn-400 border border-saturn-500/30 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] font-semibold translate-x-0.5'
            : 'text-secondary hover:text-primary hover:bg-accent/70 hover:translate-x-0.5'
        }`
      }
    >
      <Icon className="w-4 h-4 shrink-0 transition-transform duration-200" />
      {!isCollapsed && <span className="truncate">{label}</span>}
    </NavLink>
  );
}

export function SidebarNav({ isSidebarOpen, isMobileMenuOpen, onClose }: SidebarNavProps) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const { isAdmin } = useAuth();
  const { appName, task, maximize } = useInstall();
  const isCollapsed = !isSidebarOpen && !isMobileMenuOpen;

  return (
    <>
      <div className="flex-1 overflow-y-auto py-6 px-2">
        <div className="mb-6 space-y-1">
          <SidebarItem icon={LayoutDashboard} label={t('sidebar.overview')} to="/" isCollapsed={isCollapsed} onClick={onClose} />
          <SidebarItem icon={Package} label={t('sidebar.store')} to="/store" isCollapsed={isCollapsed} onClick={onClose} />
          <SidebarItem icon={Box} label={t('sidebar.containers')} to="/containers" isCollapsed={isCollapsed} onClick={onClose} />
          <SidebarItem icon={FolderOpen} label={t('sidebar.files')} to="/files" isCollapsed={isCollapsed} onClick={onClose} />
          {isAdmin && <SidebarItem icon={Terminal} label={t('sidebar.terminal')} to="/terminal" isCollapsed={isCollapsed} onClick={onClose} />}
          <SidebarItem icon={Activity} label={t('sidebar.metrics')} to="/metrics" isCollapsed={isCollapsed} onClick={onClose} />
          <SidebarItem icon={PieChart} label={t('sidebar.disk_analyzer')} to="/disk-analyzer" isCollapsed={isCollapsed} onClick={onClose} />
          <SidebarItem icon={FileText} label={t('sidebar.logs')} to="/logs" isCollapsed={isCollapsed} onClick={onClose} />
          {isAdmin && <SidebarItem icon={Archive} label={t('sidebar.backups')} to="/backups" isCollapsed={isCollapsed} onClick={onClose} />}
          {isAdmin && <SidebarItem icon={HardDrive} label={t('sidebar.images')} to="/images" isCollapsed={isCollapsed} onClick={onClose} />}
          {isAdmin && <SidebarItem icon={Network} label={t('sidebar.networks')} to="/networks" isCollapsed={isCollapsed} onClick={onClose} />}
          {isAdmin && <SidebarItem icon={HardDrive} label={t('sidebar.volumes')} to="/volumes" isCollapsed={isCollapsed} onClick={onClose} />}
        </div>

        {isAdmin && (settings?.integrations?.homeassistant || settings?.integrations?.pihole || (settings?.integrations?.cloudflare ?? true)) && (
          <SidebarSection title={t('sidebar.integrations')} isCollapsed={isCollapsed}>
            {settings?.integrations?.homeassistant && <SidebarItem icon={Home} label={t('sidebar.home_assistant')} to="/homeassistant" isCollapsed={isCollapsed} onClick={onClose} />}
            {settings?.integrations?.pihole && <SidebarItem icon={ShieldCheck} label={t('sidebar.pihole')} to="/pihole" isCollapsed={isCollapsed} onClick={onClose} />}
            {(settings?.integrations?.cloudflare ?? true) && <SidebarItem icon={Cloud} label={t('sidebar.cloudflare', 'Cloudflare')} to="/cloudflare" isCollapsed={isCollapsed} onClick={onClose} />}
          </SidebarSection>
        )}
      </div>

      {/* Sidebar Footer: Install Task + Logo */}
      <div className="p-4 border-t shad-border mt-auto flex flex-col gap-2">
        {task && (
          <button
            onClick={() => maximize(task.id)}
            className={`w-full flex items-center ${isCollapsed ? 'justify-center px-0' : 'justify-between px-3'} py-2 rounded-xl text-xs font-medium transition-all duration-200 active:scale-[0.98] border focus-visible:ring-2 focus-visible:ring-saturn-500 focus-visible:outline-none ${
              task.status === 'error'
                ? 'bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/20'
                : task.status === 'done'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                : 'bg-saturn-500/10 text-saturn-400 border-saturn-500/20 hover:bg-saturn-500/20'
            }`}
            title={isCollapsed ? `${task.title || appName} (${task.progress}%)` : undefined}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {task.status === 'error' ? <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                : task.status === 'done' ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                : <Loader2 className="w-4 h-4 shrink-0 animate-spin text-saturn-400" />}
              {!isCollapsed && <span className="truncate max-w-[120px] text-left">{task.title || appName}</span>}
            </div>
            {!isCollapsed && <span className="text-xs font-bold tabular-nums shrink-0 ml-1">{task.progress}%</span>}
          </button>
        )}
      </div>
    </>
  );
}

export type { SidebarNavProps };
