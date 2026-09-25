import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { TerminalSession } from './TerminalSession';
import { ShieldCheck, ShieldAlert, Plus, X, ArrowLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface TabData {
  id: string;
  title: string;
}

export function Terminal() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [tabs, setTabs] = useState<TabData[]>([{ id: '1', title: 'Terminal 1' }]);
  const [activeTab, setActiveTab] = useState<string>('1');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [nextId, setNextId] = useState(2);

  const addTab = () => {
    const id = nextId.toString();
    setTabs([...tabs, { id, title: `Terminal ${id}` }]);
    setActiveTab(id);
    setNextId(nextId + 1);
  };

  const closeTab = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (tabs.length === 1) return; // don't close the last tab
    const newTabs = tabs.filter(t => t.id !== id);
    setTabs(newTabs);
    if (activeTab === id) {
      setActiveTab(newTabs[newTabs.length - 1].id);
    }
  };

  const updateTabTitle = (id: string, title: string) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, title } : t));
  };

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center animate-in fade-in duration-300">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 mb-4 shadow-lg shadow-rose-500/5">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-primary mb-2">{t('terminal.restricted_title', 'Acesso Restrito')}</h2>
        <p className="text-secondary max-w-md text-sm mb-6 leading-relaxed">
          {t('terminal.restricted_desc', 'O Terminal Web e a linha de comando do host são de uso exclusivo de Administradores do Saturn.')}
        </p>
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-saturn-500 hover:bg-saturn-600 text-white text-sm font-semibold shadow-md shadow-saturn-500/25 transition-all active:scale-95"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('common.back_to_dashboard', 'Voltar ao Dashboard')}</span>
        </button>
      </div>
    );
  }

  return (
    <div className={`flex flex-col animate-in fade-in zoom-in-95 duration-300 ${
      isFullscreen 
        ? 'fixed inset-0 z-50 bg-background p-3 sm:p-5 w-screen h-screen' 
        : 'h-[calc(100dvh-8rem)] sm:h-[calc(100vh-8.5rem)] w-full'
    }`}>
      {/* Top Header (only when not in fullscreen) */}
      {!isFullscreen && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 shrink-0">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl sm:text-2xl font-bold text-primary tracking-tight">{t('sidebar.terminal', 'Terminal Web')}</h2>
              <span className="px-2 py-0.5 rounded-full bg-saturn-500/15 border border-saturn-500/30 text-saturn-400 text-xs font-semibold flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-saturn-400" />
                {t('terminal.secure_ssh', 'SSH Seguro')}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-secondary mt-0.5">{t('terminal.subtitle', 'Acesso direto à linha de comando do host e containers')}</p>
          </div>
        </div>
      )}

      {/* Main Terminal Frame with Tab Bar */}
      <div className={`flex-1 w-full bg-card border border-border/80 rounded-xl overflow-hidden shadow-2xl flex flex-col relative ${
        isFullscreen ? 'h-full border-saturn-500/40' : ''
      }`}>
        
        {/* Browser-style Tab Bar */}
        <div className="flex items-end bg-muted/60 border-b border-border/70 select-none overflow-x-auto overflow-y-hidden shrink-0 scrollbar-hide px-2 pt-2 h-11">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`group flex items-center gap-2 px-4 py-1.5 min-w-[140px] max-w-[200px] rounded-t-lg border-t border-x cursor-pointer transition-colors h-full ${
                activeTab === tab.id
                  ? 'bg-card border-border/80 border-b-transparent text-primary font-semibold z-10 relative top-[1px] shadow-sm'
                  : 'bg-muted/40 border-transparent text-secondary hover:bg-accent hover:text-primary mb-[1px]'
              }`}
            >
              <div className={`w-2 h-2 rounded-full shrink-0 ${activeTab === tab.id ? 'bg-saturn-500' : 'bg-muted-foreground/50 group-hover:bg-muted-foreground'}`} />
              <span className="text-xs font-medium truncate flex-1">{tab.title}</span>
              {tabs.length > 1 && (
                <button
                  onClick={(e) => closeTab(e, tab.id)}
                  className={`p-1 rounded-md shrink-0 transition-opacity ${
                    activeTab === tab.id ? 'hover:bg-accent hover:text-primary' : 'opacity-0 group-hover:opacity-100 hover:bg-accent hover:text-primary'
                  }`}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
          
          <button
            onClick={addTab}
            className="ml-2 mb-1 p-1.5 text-secondary hover:text-primary hover:bg-accent rounded-lg transition-colors flex shrink-0"
            title={t('terminal.new_tab', 'Nova Aba')}
            aria-label={t('terminal.new_tab', 'Nova Aba')}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Sessions Container */}
        <div className="flex-1 w-full relative overflow-hidden bg-card">
          {tabs.map((tab) => (
            <TerminalSession
              key={tab.id}
              id={tab.id}
              isActive={activeTab === tab.id}
              isFullscreen={isFullscreen}
              onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
              onTitleChange={updateTabTitle}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
