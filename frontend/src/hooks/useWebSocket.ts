import { useCallback, useEffect, useRef, useState } from 'react';
import type { TagValue, AlarmData } from '../types';

interface WSMessage {
  type: 'snapshot' | 'tag_update' | 'alarm' | 'keepalive';
  data?: Record<string, TagValue> | AlarmData;
}

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

export function useWebSocket() {
  const [tagValues, setTagValues] = useState<Record<string, TagValue>>({});
  const [alarms, setAlarms] = useState<AlarmData[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  const attemptRef = useRef(0);

  const connect = useCallback(() => {
    // Close any existing connection before opening a new one
    if (wsRef.current && wsRef.current.readyState < WebSocket.CLOSING) {
      wsRef.current.close();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
      setConnected(true);
      attemptRef.current = 0;
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
    };

    ws.onmessage = (event) => {
      const msg: WSMessage = JSON.parse(event.data);
      if (msg.type === 'snapshot' || msg.type === 'tag_update') {
        const data = msg.data as Record<string, TagValue>;
        setTagValues((prev) => ({ ...prev, ...data }));
      } else if (msg.type === 'alarm') {
        const alarm = msg.data as AlarmData;
        setAlarms((prev) => [alarm, ...prev.slice(0, 99)]);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** attemptRef.current, RECONNECT_MAX_MS);
      attemptRef.current += 1;
      reconnectTimer.current = window.setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  return { tagValues, alarms, connected };
}
