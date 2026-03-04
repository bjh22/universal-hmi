import { useCallback, useEffect, useRef, useState } from 'react';
import type { TagValue, AlarmData } from '../types';

interface WSMessage {
  type: 'snapshot' | 'tag_update' | 'alarm' | 'keepalive';
  data?: Record<string, TagValue> | AlarmData;
}

export function useWebSocket() {
  const [tagValues, setTagValues] = useState<Record<string, TagValue>>({});
  const [alarms, setAlarms] = useState<AlarmData[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number | null>(null);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
      setConnected(true);
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
      reconnectTimer.current = window.setTimeout(connect, 2000);
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [connect]);

  return { tagValues, alarms, connected };
}
