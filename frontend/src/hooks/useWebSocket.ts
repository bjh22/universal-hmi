/**
 * useWebSocket — Manages a persistent WebSocket connection for real-time data.
 *
 * Unlike HTTP (where the client sends a request and waits for a response),
 * WebSocket keeps an open two-way channel between browser and server. The server
 * can push tag value updates and alarm changes instantly without the client polling.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TagValue, AlarmData } from '../types';
import { api } from '../lib/api';

interface WSMessage {
  type: 'snapshot' | 'tag_update' | 'alarm' | 'alarms_snapshot' | 'keepalive';
  data?: Record<string, TagValue> | AlarmData | AlarmData[];
}

// Reconnection with exponential backoff: if the connection drops, we retry with
// increasing delays (1s, 2s, 4s... up to 30s) to avoid flooding the server with
// reconnect attempts when it's under load or temporarily down.
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

export function useWebSocket() {
  // useState vs useRef — a key React distinction:
  //   - useState triggers a re-render when its value changes. We use it for tagValues,
  //     alarms, and connected because the UI needs to update when these change.
  //   - useRef does NOT trigger re-renders. It's for internal bookkeeping like the
  //     WebSocket instance and timers that the UI doesn't directly display.
  const [tagValues, setTagValues] = useState<Record<string, TagValue>>({});
  const [alarms, setAlarms] = useState<AlarmData[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  const attemptRef = useRef(0);
  // Tracks whether the effect is live. Set to false during StrictMode cleanup
  // and on unmount so stale onclose handlers don't trigger reconnects.
  const activeRef = useRef(false);

  const connect = useCallback(function doConnect() {
    // If the component has unmounted (or StrictMode cleaned up), don't connect.
    if (!activeRef.current) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      // Stale connection guard: after a reconnect, the old WebSocket's callbacks
      // may still fire. This check ensures we only process events from the CURRENT
      // connection, preventing old callbacks from corrupting state.
      if (wsRef.current !== ws) return;
      setConnected(true);
      attemptRef.current = 0;
      // Fetch existing active alarms on connect
      api.getActiveAlarms().then((active) => {
        if (wsRef.current === ws) {
          setAlarms((prev) => {
            // Merge API alarms with any already received via WS, deduping by ID
            const merged = new Map<number, AlarmData>();
            for (const a of active) merged.set(a.id, a);
            for (const a of prev) merged.set(a.id, a); // WS alarms take precedence
            return Array.from(merged.values());
          });
        }
      }).catch(() => { /* non-fatal */ });
    };

    ws.onmessage = (event) => {
      if (wsRef.current !== ws) return; // stale connection guard
      const msg: WSMessage = JSON.parse(event.data);

      // Message types from the server:
      //   - snapshot: all current tag values, sent once on initial connect
      //   - tag_update: only the tags that changed since the last message (efficient delta)
      //   - alarms_snapshot: full list of active alarms
      //   - alarm: a single alarm state change (new, acknowledged, cleared)
      //   - keepalive: periodic ping to prevent the connection from timing out
      if (msg.type === 'snapshot' || msg.type === 'tag_update') {
        const data = msg.data as Record<string, TagValue>;
        // Spread into previous state so we merge new values with existing ones
        setTagValues((prev) => ({ ...prev, ...data }));
      } else if (msg.type === 'alarms_snapshot') {
        setAlarms(msg.data as AlarmData[]);
      } else if (msg.type === 'alarm') {
        const alarm = msg.data as AlarmData;
        setAlarms((prev) => {
          // Update existing alarm or prepend new one
          const idx = prev.findIndex((a) => a.id === alarm.id);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = alarm;
            return updated;
          }
          return [alarm, ...prev.slice(0, 99)];
        });
      }
    };

    ws.onclose = () => {
      if (wsRef.current !== ws) return; // stale — cleanup already replaced this socket
      setConnected(false);
      if (!activeRef.current) return; // unmounted — don't reconnect

      // Exponential backoff: delay doubles each attempt (1s, 2s, 4s, 8s...)
      // capped at 30s. This prevents hammering a struggling server.
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** attemptRef.current, RECONNECT_MAX_MS);
      attemptRef.current += 1;
      reconnectTimer.current = window.setTimeout(doConnect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    activeRef.current = true;

    // StrictMode handling: React 18+ StrictMode runs mount -> cleanup -> remount
    // synchronously in development to help catch bugs. By deferring the connection
    // to the next event-loop tick (setTimeout 0), the cleanup's clearTimeout cancels
    // the first mount's timer before it fires. Only the remount's timer survives,
    // creating exactly one WebSocket instead of two.
    reconnectTimer.current = window.setTimeout(connect, 0);

    // Cleanup: runs on unmount (and on StrictMode's intermediate cleanup).
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
