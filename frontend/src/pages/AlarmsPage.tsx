import { useEffect, useState } from 'react';
import { Bell, Check, AlertTriangle, Info } from 'lucide-react';
import { api } from '../lib/api';
import type { AlarmData } from '../types';

interface Props {
  realtimeAlarms: AlarmData[];
}

export function AlarmsPage({ realtimeAlarms }: Props) {
  const [tab, setTab] = useState<'active' | 'history'>('active');
  const [activeAlarms, setActiveAlarms] = useState<AlarmData[]>([]);
  const [historyAlarms, setHistoryAlarms] = useState<AlarmData[]>([]);

  useEffect(() => {
    if (tab === 'active') {
      api.getActiveAlarms().then(setActiveAlarms).catch(() => {});
    } else {
      api.getAlarmHistory().then(setHistoryAlarms).catch(() => {});
    }
  }, [tab]);

  // Merge realtime alarms
  const displayAlarms = tab === 'active'
    ? [...realtimeAlarms.filter(a => a.state !== 'inactive'), ...activeAlarms]
    : historyAlarms;

  const handleAck = async (id: number) => {
    await api.acknowledgeAlarm(id);
    setActiveAlarms(prev => prev.map(a => a.id === id ? { ...a, state: 'active_acked' as const } : a));
  };

  const severityIcon = (sev: string) => {
    switch (sev) {
      case 'critical': return <AlertTriangle size={16} className="text-red-400" />;
      case 'warning': return <AlertTriangle size={16} className="text-yellow-400" />;
      default: return <Info size={16} className="text-blue-400" />;
    }
  };

  const severityBg = (sev: string) => {
    switch (sev) {
      case 'critical': return 'border-l-red-500 bg-red-500/5';
      case 'warning': return 'border-l-yellow-500 bg-yellow-500/5';
      default: return 'border-l-blue-500 bg-blue-500/5';
    }
  };

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-100 mb-4">Alarms</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-4">
        <button
          onClick={() => setTab('active')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'active' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          Active
        </button>
        <button
          onClick={() => setTab('history')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'history' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          History
        </button>
      </div>

      {/* Alarm list */}
      <div className="space-y-2">
        {displayAlarms.map((alarm, i) => (
          <div
            key={alarm.id || i}
            className={`flex items-center gap-3 p-3 rounded-lg border-l-4 ${severityBg(alarm.severity)}`}
          >
            {severityIcon(alarm.severity)}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-slate-200">{alarm.message}</div>
              <div className="text-xs text-slate-400">
                {new Date(alarm.triggered_at).toLocaleString()}
                {alarm.tag_name && ` • ${alarm.tag_name}`}
                {alarm.trigger_value && ` • Value: ${alarm.trigger_value}`}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {alarm.state === 'active_unacked' && (
                <button
                  onClick={() => alarm.id && handleAck(alarm.id)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-md text-xs text-slate-200"
                >
                  <Check size={14} /> Acknowledge
                </button>
              )}
              {alarm.state === 'active_acked' && (
                <span className="text-xs text-green-400">Acknowledged</span>
              )}
              <span className={`text-xs px-2 py-0.5 rounded uppercase font-medium ${
                alarm.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                alarm.severity === 'warning' ? 'bg-yellow-500/20 text-yellow-400' :
                'bg-blue-500/20 text-blue-400'
              }`}>
                {alarm.severity}
              </span>
            </div>
          </div>
        ))}
        {displayAlarms.length === 0 && (
          <div className="text-center text-slate-500 py-12">
            <Bell size={32} className="mx-auto mb-2 opacity-50" />
            <p>No {tab} alarms</p>
          </div>
        )}
      </div>
    </div>
  );
}
