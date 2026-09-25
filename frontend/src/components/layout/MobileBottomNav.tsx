import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, Box, Package, FolderOpen, Menu } from 'lucide-react';
import { preloadRoute } from '../../utils/navigation';

interface MobileBottomNavProps {
  onOpenMenu: () => void;
}

export function MobileBottomNav({ onOpenMenu }: MobileBottomNavProps) {
  const { t } = useTranslation();
  const location = useLocation();

  const navItems = [
    { to: '/', label: t('sidebar.overview', 'Início'), icon: LayoutDashboard },
    { to: '/containers', label: t('sidebar.containers', 'Containers'), icon: Box },
    { to: '/store', label: t('sidebar.app_store', 'Store'), icon: Package },
    { to: '/files', label: t('sidebar.file_manager', 'Arquivos'), icon: FolderOpen },
  ];

  return (
    <nav
      aria-label={t('navigation.mobile_bottom_nav', 'Navegação Móvel')}
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card/90 backdrop-blur-2xl border-t border-border/70 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] px-2 pt-1.5 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]"
    >
      <div className="flex items-center justify-around max-w-lg mx-auto">
        {navItems.map(({ to, label, icon: Icon }) => {
          const isActive = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);
          return (
            <NavLink
              key={to}
              to={to}
              onMouseEnter={() => preloadRoute(to)}
              onTouchStart={() => preloadRoute(to)}
              className={`flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all duration-200 active:scale-90 ${
                isActive
                  ? 'text-saturn-500 font-semibold'
                  : 'text-secondary hover:text-primary'
              }`}
            >
              <div
                className={`relative flex items-center justify-center w-10 h-7 rounded-full transition-all duration-200 ${
                  isActive ? 'bg-saturn-500/15' : 'bg-transparent'
                }`}
              >
                <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
              </div>
              <span className="text-[10px] tracking-tight mt-0.5 truncate max-w-[64px]">
                {label}
              </span>
            </NavLink>
          );
        })}

        <button
          type="button"
          onClick={onOpenMenu}
          className="flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl text-secondary hover:text-primary transition-all duration-200 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saturn-500"
          aria-label={t('sidebar.menu', 'Mais')}
        >
          <div className="flex items-center justify-center w-10 h-7 rounded-full bg-transparent">
            <Menu className="w-5 h-5" />
          </div>
          <span className="text-[10px] tracking-tight mt-0.5 truncate max-w-[64px]">
            {t('sidebar.more', 'Mais')}
          </span>
        </button>
      </div>
    </nav>
  );
}
