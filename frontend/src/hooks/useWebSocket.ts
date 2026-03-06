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
  // Tracks whether the effect is live. Set to false during StrictMode cleanup
  // and on unmount so stale onclose handlers don't trigger reconnects.
  const activeRef = useRef(false);

  const connect = useCallback(() => {
    if (!activeRef.current) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (wsRef.current !== ws) return; // stale connection
      setConnected(true);
      attemptRef.current = 0;
    };

    ws.onmessage = (event) => {
      if (wsRef.current !== ws) return; // stale connection
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
      if (wsRef.current !== ws) return; // stale — cleanup already replaced this socket
      setConnected(false);
      if (!activeRef.current) return; // unmounted — don't reconnect
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** attemptRef.current, RECONNECT_MAX_MS);
      attemptRef.current += 1;
      reconnectTimer.current = window.setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    activeRef.current = true;
    // Defer to the next event-loop tick. React StrictMode runs
    // mount → cleanup → remount synchronously, so the cleanup
    // clearTimeout cancels this timer before it fires — only the
    // remount's timer survives, creating exactly one WebSocket.
    reconnectTimer.current = window.setTimeout(connect, 0);
    return () => {
      activeRef.current = false;
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      // Null wsRef before closing so the onclose handler sees a stale ref
      // and skips the reconnect logic.
      const ws = wsRef.current;
      wsRef.current = null;
      ws?.close();
    };
  }, [connect]);

  return { tagValues, alarms, connected };
}
