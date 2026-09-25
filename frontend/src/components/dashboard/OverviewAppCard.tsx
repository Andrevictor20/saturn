import { memo } from 'react';
import { ExternalLink, Layers, Cloud } from 'lucide-react';
import { ContainerIcon } from '../ui/ContainerIcon';
import type { GroupedContainerItem, GroupContainerItem } from '../../utils/containerGroups';

interface OverviewContainer {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  ports?: Array<{ private_port: number; public_port?: number; typ: string }>;
  labels?: Record<string, string>;
}

interface AppCardItemProps {
  item: GroupedContainerItem<OverviewContainer>;
  onSelectGroup: (group: GroupContainerItem<OverviewContainer>) => void;
  onOpenApp: (webLink?: string, containerId?: string, isRunning?: boolean) => void;
  t: any;
}

export const AppCardItem = memo(function AppCardItem({
  item,
  onSelectGroup,
  onOpenApp,
  t,
}: AppCardItemProps) {
  if (item.type === 'group') {
    return (
      <div
        onClick={() => onSelectGroup(item)}
        className="group relative bg-card hover:bg-accent/80 border border-border/80 hover:border-saturn-500/50 rounded-2xl p-3 sm:p-3.5 flex flex-col items-center justify-between text-center transition-all duration-150 cursor-pointer shadow-sm hover:shadow-md active:scale-95 min-h-[125px]"
        title={`${item.name} (${t('dashboard.container_count', { count: item.totalCount })})`}
      >
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1">
          <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-saturn-500/15 text-saturn-700 dark:text-saturn-400 border border-saturn-500/30 font-semibold font-mono">
            {item.totalCount}
          </span>
          <span className={`w-2 h-2 rounded-full ${
            item.allRunning ? 'bg-emerald-500 ring-2 ring-emerald-500/20' : item.anyRunning ? 'bg-amber-500 ring-2 ring-amber-500/20' : 'bg-secondary/40'
          }`} />
        </div>

        <div className="w-12 h-12 sm:w-13 sm:h-13 rounded-2xl bg-card border border-border/80 p-1.5 flex items-center justify-center mb-2.5 group-hover:scale-105 transition-transform duration-150 shadow-sm relative">
          <ContainerIcon src={item.iconUrl} name={item.name} size={36} className="w-full h-full" />
          <div className="absolute -bottom-1 -right-1 p-0.5 rounded-md bg-saturn-500 text-white shadow-md">
            <Layers className="w-2.5 h-2.5" />
          </div>
        </div>

        <span className="font-bold text-xs text-primary truncate w-full capitalize group-hover:text-saturn-400 transition-colors" title={item.name}>
          {item.name}
        </span>

        <div className="mt-1 flex items-center gap-1 text-[10px] text-secondary font-mono truncate max-w-full">
          {item.anyRunning ? (
            <span className="text-saturn-600 dark:text-saturn-400 group-hover:underline flex items-center gap-0.5 font-medium">
              {item.runningCount}/{item.totalCount} {item.totalCount > 1 ? t('common.active_plural', 'ativos') : t('common.active', 'ativo').toLowerCase()}
            </span>
          ) : (
            <span className="text-secondary/60">{t('common.stopped', 'Parado')}</span>
          )}
        </div>
      </div>
    );
  }

  const c = item.container;
  const isRunning = item.isRunning;
  const webLink = item.webLink;

  return (
    <div
      onClick={() => onOpenApp(webLink, c.id, isRunning)}
      className="group relative bg-card hover:bg-accent/80 border border-border/80 hover:border-saturn-500/50 rounded-2xl p-3 sm:p-3.5 flex flex-col items-center justify-between text-center transition-all duration-150 cursor-pointer shadow-sm hover:shadow-md active:scale-95 min-h-[125px]"
      title={`${c.name} (${c.state})`}
    >
      <div className="absolute top-2.5 right-2.5 flex items-center gap-1">
        {webLink?.startsWith('https://') && (
          <span title={t('dashboard.tunnel_secure_https', 'Túnel Cloudflare / HTTPS Seguro')}>
            <Cloud className="w-3 h-3 text-amber-500/90" />
          </span>
        )}
        <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-500 ring-2 ring-emerald-500/20' : 'bg-secondary/40'}`} />
      </div>

      <div className="w-12 h-12 sm:w-13 sm:h-13 rounded-2xl bg-card border border-border/80 p-1.5 flex items-center justify-center mb-2.5 group-hover:scale-105 transition-transform duration-150 shadow-sm">
        <ContainerIcon src={item.iconUrl} name={c.name} image={c.image} size={36} className="w-full h-full" />
      </div>

      <span className="font-bold text-xs text-primary truncate w-full capitalize group-hover:text-saturn-400 transition-colors" title={c.name}>
        {c.name}
      </span>

      <div className="mt-1 flex items-center gap-1 text-[10px] text-secondary font-mono truncate max-w-full">
        {isRunning ? (
          webLink ? (
            <span className="text-saturn-600 dark:text-saturn-400 group-hover:underline flex items-center gap-0.5 font-semibold">
              {webLink.startsWith('https://') && <Cloud className="w-2.5 h-2.5 text-amber-500 shrink-0 inline" />}
              {t('common.open', 'Abrir')} <ExternalLink className="w-2.5 h-2.5 inline" />
            </span>
          ) : (
            <span className="text-emerald-700 dark:text-emerald-400 font-semibold">{t('common.active', 'Ativo')}</span>
          )
        ) : (
          <span className="text-secondary/60">{t('common.stopped', 'Parado')}</span>
        )}
      </div>
    </div>
  );
});

export type { OverviewContainer };
