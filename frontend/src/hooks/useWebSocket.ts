import { useEffect, useState, useRef, useCallback } from 'react';

export interface SystemStats {
  timestamp?: number;
  cpu_usage: number;
  memory_used: number;
  memory_total: number;
  disks: { name: string; mount_point: string; used: number; total: number }[];
  network_tx: number;
  network_rx: number;
  temperature: number;
  docker_cpu: number;
  docker_memory: number;
  docker_tx: number;
  docker_rx: number;
  saturn_cpu: number;
  saturn_memory: number;
  network_interface?: string;
  network_interface_type?: 'ethernet' | 'wifi' | string;
  gpu_usage?: number;
  gpu_memory_used?: number;
  gpu_memory_total?: number;
  gpu_name?: string;
  gpu_temperature?: number;
}

const MAX_RECONNECT_DELAY_MS = 30_000;
const BASE_RECONNECT_DELAY_MS = 1_000;

/**
 * OPT-F6: WebSocket hook with exponential backoff reconnection.
 * Automatically reconnects if the server restarts, with delays:
 * 1s → 2s → 4s → 8s → 16s → 30s (max)
 */
export function useWebSocket(path: string) {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectDelayRef = useRef(BASE_RECONNECT_DELAY_MS);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}${path}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setIsConnected(true);
      reconnectDelayRef.current = BASE_RECONNECT_DELAY_MS; // Reset backoff on success
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const data = JSON.parse(event.data);
        if (data && data.event_type === 'docker_event') {
          window.dispatchEvent(new CustomEvent('saturn:docker-event', { detail: data }));
          return;
        }
        setStats(data);
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setIsConnected(false);
      wsRef.current = null;

      // Exponential backoff reconnection
      const delay = reconnectDelayRef.current;
      reconnectDelayRef.current = Math.min(delay * 2, MAX_RECONNECT_DELAY_MS);
      reconnectTimerRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      // onclose will fire after onerror — reconnect handled there
      ws.close();
    };
  }, [path]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return { stats, isConnected };
}
