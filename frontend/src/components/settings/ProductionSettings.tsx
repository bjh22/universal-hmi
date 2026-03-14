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
  });
  const [tags, setTags] = useState<Tag[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.getProductionSettings().then(setSettings).catch(() => {});
    api.getTags().then(setTags).catch(() => {});
  }, []);

  const intTags = tags.filter(t => t.data_type === 'int' || t.data_type === 'float');
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
          Configure which tags drive automatic production count tracking, reject detection, and downtime monitoring.
        </p>
      </div>

      {/* Good Count Tag */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-200 mb-1">Good Count Tag</label>
        <p className="text-xs text-slate-400 mb-2">
          A counter tag from the PLC. The system records its value when a run starts and computes the delta when the run stops.
        </p>
        <select
          value={settings.good_count_tag || ''}
          onChange={e => setSettings({ ...settings, good_count_tag: e.target.value || null })}
          className={inputCls}
        >
          <option value="">None (manual entry)</option>
          {intTags.map(t => (
            <option key={t.id} value={t.name}>{t.name}{t.display_name ? ` — ${t.display_name}` : ''}</option>
          ))}
        </select>
      </div>

      {/* Reject Fault Tags */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-200 mb-1">Reject Fault Tags</label>
        <p className="text-xs text-slate-400 mb-2">
          Alarm-enabled tags that indicate a rejected product. Each alarm activation during a run increments the reject count.
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
          Alarm-enabled tags that automatically create downtime events. When an alarm fires, a downtime event starts; when it clears, the event ends.
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
