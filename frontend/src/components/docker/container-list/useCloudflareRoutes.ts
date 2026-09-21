import { useState, useCallback } from 'react';
import { cleanAppName } from '../../../utils/containerGroups';
import type { CloudflareRouteItem } from './useContainerCustomLinks';

export type { CloudflareRouteItem };

export function useCloudflareRoutes(
  isAdmin: boolean,
  setCustomLinks: React.Dispatch<React.SetStateAction<Record<string, string>>>
) {
  const [cloudflareRoutes, setCloudflareRoutes] = useState<CloudflareRouteItem[]>([]);

  const fetchCloudflareRoutes = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch('/api/cloudflare/tunnels', {
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      });
      if (res.ok) {
        const data = await res.json();
        const rules = data.rules || [];
        setCloudflareRoutes(rules);

        if (!localStorage.getItem('saturn_base_domain') && rules.length > 0) {
          for (const r of rules) {
            if (r.hostname && r.hostname.includes('.')) {
              const parts = r.hostname.split('.');
              if (parts.length >= 2) {
                localStorage.setItem('saturn_base_domain', parts.slice(1).join('.'));
                break;
              }
            }
          }
        }

        if (rules.length > 0) {
          setCustomLinks((prev) => {
            const next = { ...prev };
            let changed = false;

            const setLink = (k: string, v: string) => {
              if (k && !next[k]) {
                next[k] = v;
                changed = true;
              }
            };

            for (const r of rules) {
              const url = r.public_url || (r.hostname ? `https://${r.hostname}` : '');
              if (!url) continue;

              if (r.matched_container_id) {
                setLink(r.matched_container_id, url);
                if (r.matched_container_id.length >= 12) {
                  setLink(r.matched_container_id.substring(0, 12), url);
                }
              }

              if (r.matched_container_name) {
                const name = r.matched_container_name.replace(/^\//, '');
                setLink(name, url);
                setLink(name.toLowerCase(), url);

                const cleaned = cleanAppName(name);
                if (cleaned && cleaned.length >= 3) {
                  setLink(cleaned, url);
                }

                const tokens = name.toLowerCase().split(/[-_]+/).filter((t: string) => t.length >= 3);
                for (const t of tokens) {
                  setLink(t, url);
                }
              }

              if (r.hostname && r.hostname.includes('.')) {
                const parts = r.hostname.toLowerCase().split('.');
                const sub = parts[0];
                const genericSubs = ['www', 'app', 'web', 'api', 'dashboard', 'saturn', 'proxy'];
                if (sub && sub.length >= 3 && !genericSubs.includes(sub)) {
                  setLink(sub, url);
                }
              }

              if (r.service && (r.service.startsWith('http://') || r.service.startsWith('https://'))) {
                try {
                  const parsed = new URL(r.service);
                  const host = parsed.hostname;
                  if (host && host !== 'localhost' && !/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) {
                    setLink(host, url);
                    setLink(host.toLowerCase(), url);
                  }
                } catch {
                  // Ignore parse error
                }
              }
            }
            return changed ? next : prev;
          });
        }
      }
    } catch (err) {
      console.warn('Failed to fetch cloudflare tunnels', err);
    }
  }, [isAdmin, setCustomLinks]);

  return { cloudflareRoutes, fetchCloudflareRoutes };
}
