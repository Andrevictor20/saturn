import React, { useState } from 'react';
import type { Container } from './types';

export interface CloudflareRouteItem {
  hostname: string;
  service: string;
  public_url: string;
  matched_container_id?: string;
  matched_container_name?: string;
}

export function useContainerCustomLinks(
  containers: Container[],
  customLinks: Record<string, string>,
  cloudflareRoutes: CloudflareRouteItem[],
  onLinksChanged: () => void
) {
  const [linkModal, setLinkModal] = useState<{
    isOpen: boolean;
    containerId: string | null;
    containerName?: string;
    detectedCloudflareUrl?: string;
  }>({ isOpen: false, containerId: null });

  const [linkInput, setLinkInput] = useState('');
  const [linkMode, setLinkMode] = useState<'builder' | 'raw'>('builder');
  const [linkSubdomain, setLinkSubdomain] = useState('');
  const [linkDomain, setLinkDomain] = useState('rasppi.cloud');

  const handleSetCustomLink = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const container = containers.find(c => c.id === id || c.id.startsWith(id) || id.startsWith(c.id));
    const cleanName = container ? container.name.replace(/^\//, '') : '';
    const composeService = container?.labels?.['com.docker.compose.service'] || container?.labels?.['io.saturn.app.name'] || '';

    const currentLink = customLinks[id] ||
      (cleanName ? customLinks[cleanName] || customLinks[cleanName.toLowerCase()] : '') ||
      (composeService ? customLinks[composeService] : '') ||
      '';

    let matchedRoute = cloudflareRoutes.find(r =>
      (r.matched_container_id && (r.matched_container_id === id || id.startsWith(r.matched_container_id) || r.matched_container_id.startsWith(id))) ||
      (r.matched_container_name && cleanName && (r.matched_container_name === cleanName || r.matched_container_name.toLowerCase() === cleanName.toLowerCase()))
    );

    if (!matchedRoute && (cleanName || composeService)) {
      const normClean = cleanName.toLowerCase().replace(/[-_]/g, '');
      const normService = composeService.toLowerCase().replace(/[-_]/g, '');
      matchedRoute = cloudflareRoutes.find(r => {
        const sub = (r.hostname || '').split('.')[0].toLowerCase().replace(/[-_]/g, '');
        return (normClean && (sub === normClean || sub.includes(normClean) || normClean.includes(sub))) ||
               (normService && (sub === normService || sub.includes(normService) || normService.includes(sub)));
      });
    }

    const detectedCloudflareUrl = matchedRoute?.public_url || (matchedRoute?.hostname ? `https://${matchedRoute.hostname}` : undefined);
    const targetLink = currentLink || detectedCloudflareUrl || '';
    setLinkInput(targetLink);

    let savedDomain = localStorage.getItem('saturn_base_domain') || localStorage.getItem('saturn_base_domain') || '';
    if (!savedDomain && matchedRoute?.hostname && matchedRoute.hostname.includes('.')) {
      savedDomain = matchedRoute.hostname.split('.').slice(1).join('.');
      localStorage.setItem('saturn_base_domain', savedDomain);
      localStorage.setItem('saturn_base_domain', savedDomain);
    }
    if (!savedDomain) {
      savedDomain = 'rasppi.cloud';
    }
    setLinkDomain(savedDomain);

    if (targetLink && targetLink.startsWith('https://') && savedDomain && targetLink.endsWith(`.${savedDomain}`)) {
      const sub = targetLink.replace('https://', '').replace(`.${savedDomain}`, '');
      if (!sub.includes('/')) {
        setLinkSubdomain(sub);
        setLinkMode('builder');
      } else {
        setLinkMode('raw');
      }
    } else if (matchedRoute?.hostname && matchedRoute.hostname.includes('.')) {
      const parts = matchedRoute.hostname.split('.');
      setLinkSubdomain(parts[0]);
      setLinkDomain(parts.slice(1).join('.'));
      setLinkMode('builder');
    } else {
      const suggestedSub = cleanName.toLowerCase().replace(/[^a-z0-9-]/g, '-') || composeService.toLowerCase() || '';
      setLinkSubdomain(suggestedSub);
      setLinkMode(targetLink ? 'raw' : 'builder');
    }

    setLinkModal({
      isOpen: true,
      containerId: id,
      containerName: cleanName || undefined,
      detectedCloudflareUrl,
    });
  };

  const handleSaveLink = async () => {
    if (!linkModal.containerId) return;
    const id = linkModal.containerId;

    let newLink = '';
    if (linkMode === 'builder') {
      if (linkSubdomain && linkDomain) {
        newLink = `https://${linkSubdomain.trim()}.${linkDomain.trim()}`;
        localStorage.setItem('saturn_base_domain', linkDomain.trim());
        localStorage.setItem('saturn_base_domain', linkDomain.trim());
      }
    } else {
      newLink = linkInput.trim();
    }

    setLinkModal({ isOpen: false, containerId: null });

    try {
      const res = await fetch(`/api/docker/links/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: newLink })
      });
      if (!res.ok) {
        alert(`Erro ao salvar link: ${res.status} ${res.statusText}`);
      }
      onLinksChanged();
    } catch (err) {
      console.error('Failed to set link', err);
      alert(`Erro na rede ao tentar salvar link: ${err}`);
    }
  };

  return {
    linkModal,
    setLinkModal,
    linkInput,
    setLinkInput,
    linkMode,
    setLinkMode,
    linkSubdomain,
    setLinkSubdomain,
    linkDomain,
    setLinkDomain,
    handleSetCustomLink,
    handleSaveLink,
  };
}
