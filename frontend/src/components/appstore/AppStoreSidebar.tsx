import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Search,
  SlidersHorizontal,
  ChevronRight,
  Compass,
  Sparkles,
  LayoutGrid,
  Film,
  Briefcase,
  Home,
  Globe,
  Cpu,
  Coins,
  MessageSquare,
  Terminal,
  Layers,
  X,
  Filter,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AppStoreItem } from '../../queries/useStoreAppsQuery';

export const defaultGetCategoryIcon = (category: string): LucideIcon => {
  const c = category.toLowerCase();
  if (c === 'all' || c === 'todas') return LayoutGrid;
  if (c === 'discover' || c === 'descobrir') return Compass;
  if (c.includes('media') || c.includes('multim') || c.includes('video') || c.includes('music') || c.includes('audio')) return Film;
  if (c.includes('prod') || c.includes('office') || c.includes('document')) return Briefcase;
  if (c.includes('home') || c.includes('casa') || c.includes('iot') || c.includes('automa')) return Home;
  if (c.includes('net') || c.includes('rede') || c.includes('dns') || c.includes('vpn') || c.includes('proxy')) return Globe;
  if (c.includes('ai') || c.includes('ia') || c.includes('llm') || c.includes('gpt') || c.includes('intel')) return Cpu;
  if (c.includes('finan') || c.includes('money') || c.includes('crypto')) return Coins;
  if (c.includes('social') || c.includes('chat') || c.includes('comun') || c.includes('mensag')) return MessageSquare;
  if (c.includes('dev') || c.includes('code') || c.includes('prog') || c.includes('util') || c.includes('ferram')) return Terminal;
  return Layers;
};

interface AppStoreSidebarProps {
  stores: string[];
  selectedStore: string;
  onSelectStore: (store: string) => void;
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  apps: AppStoreItem[];
  dynamicCategories: string[];
  getCategoryIcon?: (category: string) => LucideIcon;
  search: string;
  onSearchChange: (q: string) => void;
  onClearSearch: () => void;
  isCategoryMenuOpen: boolean;
  onToggleCategoryMenu: () => void;
  onCloseCategoryMenu: () => void;
}

export function AppStoreSidebar({
  stores,
  selectedStore,
  onSelectStore,
  selectedCategory,
  onSelectCategory,
  apps,
  dynamicCategories,
  getCategoryIcon = defaultGetCategoryIcon,
  search,
  onSearchChange,
  onClearSearch,
  isCategoryMenuOpen,
  onToggleCategoryMenu,
  onCloseCategoryMenu,
}: AppStoreSidebarProps) {
  const { t } = useTranslation();
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showCategoryFilter, setShowCategoryFilter] = useState(false);

  // Filter categories dynamically if search filter is active
  const filteredCategories = useMemo(() => {
    if (!categoryFilter.trim()) return dynamicCategories;
    const q = categoryFilter.toLowerCase().trim();
    return dynamicCategories.filter((cat) => cat.toLowerCase().includes(q));
  }, [dynamicCategories, categoryFilter]);

  return (
    <aside className="bg-card border border-border/70 rounded-2xl p-3.5 space-y-3.5 shadow-sm lg:sticky lg:top-6 lg:max-h-[calc(100vh-3.5rem)] flex flex-col">
      {/* Instant Search Bar */}
      <div className="relative shrink-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary/70" />
        <input
          type="text"
          placeholder={t('store.search_placeholder')}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-9 pr-3 py-2 bg-accent/50 border border-border rounded-xl text-base sm:text-xs text-primary placeholder:text-secondary/60 focus:outline-none focus:border-saturn-500/80 transition-all shadow-sm"
        />
        {search && (
          <button
            type="button"
            onClick={onClearSearch}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-secondary hover:text-primary p-0.5"
            title="Limpar busca"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Category Mobile / Small screen toggle button */}
      <div className="lg:hidden shrink-0">
        <button
          onClick={onToggleCategoryMenu}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-accent/60 border border-border text-xs font-semibold text-primary transition-all hover:bg-accent"
        >
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-saturn-500" />
            <span>{t('store.categories', 'Categorias')} ({selectedCategory === 'All' ? t('common.all', 'Todas') : selectedCategory})</span>
          </div>
          <ChevronRight
            className={`w-4 h-4 transition-transform duration-200 ${
              isCategoryMenuOpen ? 'rotate-90 text-primary' : 'text-secondary'
            }`}
          />
        </button>
      </div>

      {/* Collapsible content wrapper for small screens, scrollable flex on large screens */}
      <div className={`space-y-3.5 flex-1 min-h-0 flex flex-col ${isCategoryMenuOpen ? 'block' : 'hidden lg:flex'}`}>
        {/* Catalog Store Selector */}
        <div className="space-y-1.5 shrink-0">
          <div className="flex items-center justify-between px-1">
            <label className="text-[10px] font-bold text-secondary uppercase tracking-wider">
              {t('store.catalog_source', 'Origem do Catálogo')}
            </label>
            <SlidersHorizontal className="w-3 h-3 text-secondary/70" />
          </div>
          <select
            value={selectedStore}
            onChange={(e) => onSelectStore(e.target.value)}
            className="w-full px-3 py-1.5 bg-accent/50 border border-border rounded-xl text-xs text-primary focus:outline-none focus:border-saturn-500/80 transition-all shadow-sm cursor-pointer"
          >
            {stores.map((store) => (
              <option key={store} value={store}>
                {store === 'All' ? t('store.all_stores') : store}
              </option>
            ))}
          </select>
        </div>

        <div className="h-px bg-border/50 shrink-0" />

        {/* Primary Pinned Views: Descobrir & Todas */}
        <div className="space-y-1 shrink-0">
          <button
            onClick={() => {
              onSelectCategory('Discover');
              onClearSearch();
              onCloseCategoryMenu();
            }}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
              selectedCategory === 'Discover' && !search
                ? 'bg-saturn-500 text-white shadow-sm shadow-saturn-500/25 font-semibold'
                : 'text-secondary hover:text-primary hover:bg-accent/70'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Compass className="w-4 h-4" />
              <span>Descobrir</span>
            </div>
            <Sparkles
              className={`w-3.5 h-3.5 ${
                selectedCategory === 'Discover' && !search
                  ? 'text-white'
                  : 'text-saturn-400 opacity-60'
              }`}
            />
          </button>

          <button
            onClick={() => {
              onSelectCategory('All');
              onCloseCategoryMenu();
            }}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
              selectedCategory === 'All'
                ? 'bg-saturn-500 text-white shadow-sm shadow-saturn-500/25 font-semibold'
                : 'text-secondary hover:text-primary hover:bg-accent/70'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <LayoutGrid className="w-4 h-4" />
              <span>Todas</span>
            </div>
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md ${
                selectedCategory === 'All'
                  ? 'bg-white/20 text-white'
                  : 'bg-accent/80 text-secondary border border-border/50 font-medium'
              }`}
            >
              {apps.length}
            </span>
          </button>
        </div>

        {/* Categories Section with Header, Mini Filter and Dedicated Internal Scroll */}
        <div className="flex-1 min-h-0 flex flex-col space-y-1.5 pt-1">
          <div className="flex items-center justify-between px-1.5 pb-0.5 shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-secondary uppercase tracking-wider">
                Categorias
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-accent text-secondary">
                {dynamicCategories.length}
              </span>
            </div>
            {dynamicCategories.length > 6 && (
              <button
                type="button"
                onClick={() => {
                  setShowCategoryFilter(!showCategoryFilter);
                  if (showCategoryFilter) setCategoryFilter('');
                }}
                className={`p-1 rounded-lg text-secondary hover:text-primary hover:bg-accent transition-colors ${
                  showCategoryFilter || categoryFilter ? 'text-saturn-500 bg-saturn-500/10' : ''
                }`}
                title="Filtrar categorias"
              >
                <Filter className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Inline Quick Filter for categories */}
          {(showCategoryFilter || categoryFilter) && (
            <div className="relative px-1 pb-1 shrink-0 animate-in fade-in duration-200">
              <input
                type="text"
                placeholder="Filtrar lista..."
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full pl-6 pr-6 py-1 bg-accent/40 border border-border rounded-lg text-[11px] text-primary placeholder:text-secondary/50 focus:outline-none focus:border-saturn-500/80 transition-all"
                autoFocus
              />
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 -mt-0.5 w-2.5 h-2.5 text-secondary/50" />
              {categoryFilter && (
                <button
                  type="button"
                  onClick={() => setCategoryFilter('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 -mt-0.5 text-secondary/70 hover:text-primary p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          {/* Internal Scrollable Categories List */}
          <div className="relative flex-1 min-h-0">
            <div className="overflow-y-auto pr-1 space-y-0.5 custom-scrollbar max-h-[340px] lg:max-h-[calc(100vh-21rem)]">
              {filteredCategories.map((category) => {
                const Icon = getCategoryIcon(category);
                const count = apps.filter((a) => a.category === category).length;
                const isSelected = selectedCategory === category;

                return (
                  <button
                    key={category}
                    onClick={() => {
                      onSelectCategory(category);
                      onCloseCategoryMenu();
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all group ${
                      isSelected
                        ? 'bg-saturn-500 text-white shadow-sm shadow-saturn-500/25 font-semibold'
                        : 'text-secondary hover:text-primary hover:bg-accent/70'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate pr-2">
                      <Icon className={`w-3.5 h-3.5 shrink-0 transition-transform group-hover:scale-110 ${isSelected ? 'text-white' : 'text-secondary/80'}`} />
                      <span className="truncate">{category}</span>
                    </div>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md shrink-0 ${
                        isSelected
                          ? 'bg-white/20 text-white'
                          : 'bg-accent/80 text-secondary border border-border/50 group-hover:border-border'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}

              {filteredCategories.length === 0 && (
                <div className="py-4 text-center text-xs text-secondary/60">
                  Nenhuma categoria encontrada
                </div>
              )}
            </div>

            {/* Subtle bottom fade gradient hint when scrollable */}
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-3 bg-gradient-to-t from-card to-transparent rounded-b-xl opacity-60" />
          </div>
        </div>
      </div>
    </aside>
  );
}
