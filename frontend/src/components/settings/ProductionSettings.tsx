import { useEffect, useState, useCallback } from 'react';
import { Save } from 'lucide-react';
import { api } from '../../lib/api';
import type { Tag, ProductionSettings as ProductionSettingsType } from '../../types';

const inputCls = 'w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500';

export function ProductionSettingsTab() {
  const [settings, setSettings] = useState<ProductionSettingsType>({
    good_count_tag: null,
    reject_fault_tags: [],
    downtime_alarm_tags: [],
    cycling_tag: null,
    downtime_exception_tags: [],
    target_rate: null,
  });
  const [tags, setTags] = useState<Tag[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.getProductionSettings().then(setSettings).catch(() => {});
    api.getTags().then(setTags).catch(() => {});
  }, []);

  const intTags = tags.filter(t => t.data_type === 'int' || t.data_type === 'float');
  const boolTags = tags.filter(t => t.data_type === 'bool');
  const alarmTags = tags.filter(t => t.alarm_enabled);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setMsg('');
    try {
      const result = await api.updateProductionSettings(settings);
      setSettings(result);
      setMsg('Settings saved');
    } catch {
      setMsg('Failed to save');
    }
    setSaving(false);
  }, [settings]);

  const toggleTag = useCallback((list: string[], tag: string): string[] => {
    return list.includes(tag) ? list.filter(t => t !== tag) : [...list, tag];
  }, []);

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h2 className="text-base font-semibold text-slate-100">Production Tracking</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Configure machine state detection, count tracking, reject detection, and downtime monitoring.
        </p>
      </div>

      {/* Cycling Tag */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-200 mb-1">Cycling Tag</label>
        <p className="text-xs text-slate-400 mb-2">
          A boolean tag that indicates the machine is actively cycling. When true, the machine is counted as running (uptime).
        </p>
        <select
          value={settings.cycling_tag || ''}
          onChange={e => setSettings({ ...settings, cycling_tag: e.target.value || null })}
          className={inputCls}
        >
          <option value="">None (uptime = total - downtime)</option>
          {boolTags.map(t => (
            <option key={t.id} value={t.name}>{t.name}{t.display_name ? ` — ${t.display_name}` : ''}</option>
          ))}
        </select>
      </div>

      {/* Good Count Tag */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-200 mb-1">Good Count Tag</label>
        <p className="text-xs text-slate-400 mb-2">
          A counter tag from the PLC. The system computes the delta over the reporting timeframe to determine production count.
        </p>
        <select
          value={settings.good_count_tag || ''}
          onChange={e => setSettings({ ...settings, good_count_tag: e.target.value || null })}
          className={inputCls}
        >
          <option value="">None</option>
          {intTags.map(t => (
            <option key={t.id} value={t.name}>{t.name}{t.display_name ? ` — ${t.display_name}` : ''}</option>
          ))}
        </select>
      </div>

      {/* Target Rate */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-200 mb-1">Target Rate (bags/hr)</label>
        <p className="text-xs text-slate-400 mb-2">
          Target production rate used for OEE performance calculation. Performance = actual rate / target rate.
        </p>
        <input
          type="number"
          value={settings.target_rate ?? ''}
          onChange={e => setSettings({ ...settings, target_rate: e.target.value ? parseFloat(e.target.value) : null })}
          placeholder="e.g. 100"
          className={inputCls + ' max-w-xs'}
          min="0"
          step="1"
        />
      </div>

      {/* Reject Fault Tags */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-200 mb-1">Reject Fault Tags</label>
        <p className="text-xs text-slate-400 mb-2">
          Alarm-enabled tags that indicate a rejected product. Each alarm activation within the reporting timeframe increments the reject count.
        </p>
        {alarmTags.length === 0 ? (
          <div className="text-xs text-slate-500 py-3 bg-slate-800 rounded-lg px-3 border border-slate-700">
            No alarm-enabled tags found. Configure tags with alarms in the Tags settings first.
          </div>
        ) : (
          <div className="bg-slate-800 rounded-lg border border-slate-700 max-h-48 overflow-y-auto">
            {alarmTags.map(t => (
              <label key={t.id} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-700/50 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={settings.reject_fault_tags.includes(t.name)}
                  onChange={() => setSettings({
                    ...settings,
                    reject_fault_tags: toggleTag(settings.reject_fault_tags, t.name),
                  })}
                  className="rounded border-slate-600"
                />
                <span className="text-slate-200 font-mono text-xs">{t.name}</span>
                {t.display_name && <span className="text-slate-400 text-xs">— {t.display_name}</span>}
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Downtime Alarm Tags */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-200 mb-1">Downtime Alarm Tags</label>
        <p className="text-xs text-slate-400 mb-2">
          Alarm-enabled tags that indicate machine downtime. Downtime periods are derived from alarm history (when the alarm fires and clears).
        </p>
        {alarmTags.length === 0 ? (
          <div className="text-xs text-slate-500 py-3 bg-slate-800 rounded-lg px-3 border border-slate-700">
            No alarm-enabled tags found.
          </div>
        ) : (
          <div className="bg-slate-800 rounded-lg border border-slate-700 max-h-48 overflow-y-auto">
            {alarmTags.map(t => (
              <label key={t.id} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-700/50 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={settings.downtime_alarm_tags.includes(t.name)}
                  onChange={() => setSettings({
                    ...settings,
                    downtime_alarm_tags: toggleTag(settings.downtime_alarm_tags, t.name),
                  })}
                  className="rounded border-slate-600"
                />
                <span className="text-slate-200 font-mono text-xs">{t.name}</span>
                {t.display_name && <span className="text-slate-400 text-xs">— {t.display_name}</span>}
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Downtime Exception Tags */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-200 mb-1">Downtime Exception Tags</label>
        <p className="text-xs text-slate-400 mb-2">
          Fault tags in this list cap their downtime contribution at 5 minutes per occurrence. Time beyond 5 minutes counts as idle instead of downtime.
        </p>
        {alarmTags.length === 0 ? (
          <div className="text-xs text-slate-500 py-3 bg-slate-800 rounded-lg px-3 border border-slate-700">
            No alarm-enabled tags found.
          </div>
        ) : (
          <div className="bg-slate-800 rounded-lg border border-slate-700 max-h-48 overflow-y-auto">
            {alarmTags.map(t => (
              <label key={t.id} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-700/50 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={settings.downtime_exception_tags.includes(t.name)}
                  onChange={() => setSettings({
                    ...settings,
                    downtime_exception_tags: toggleTag(settings.downtime_exception_tags, t.name),
                  })}
                  className="rounded border-slate-600"
                />
                <span className="text-slate-200 font-mono text-xs">{t.name}</span>
                {t.display_name && <span className="text-slate-400 text-xs">— {t.display_name}</span>}
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 bg-[var(--hmi-accent)] hover:opacity-90 text-white rounded-lg text-sm font-medium disabled:opacity-50"
        >
          <Save size={16} /> {saving ? 'Saving...' : 'Save Settings'}
        </button>
        {msg && <span className={`text-sm ${msg.includes('Failed') ? 'text-red-400' : 'text-green-400'}`}>{msg}</span>}
      </div>
    </div>
  );
}
