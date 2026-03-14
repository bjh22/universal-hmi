import { useEffect, useState, useCallback } from 'react';
import { Save, Plus, X, Clock } from 'lucide-react';
import { api } from '../../lib/api';
import type { Tag, ProductionSettings as ProductionSettingsType, ShiftDefinition } from '../../types';

const inputCls = 'w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500';
const smallInputCls = 'bg-slate-700 border border-slate-600 rounded-md px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-blue-500';

const SHIFT_PRESETS: Record<string, ShiftDefinition[]> = {
  '1-Shift': [
    { name: 'Day', start_time: '06:00', end_time: '18:00', target_count: null },
  ],
  '2-Shift': [
    { name: 'Day', start_time: '06:00', end_time: '18:00', target_count: null },
    { name: 'Night', start_time: '18:00', end_time: '06:00', target_count: null },
  ],
  '3-Shift': [
    { name: 'Day', start_time: '06:00', end_time: '14:00', target_count: null },
    { name: 'Swing', start_time: '14:00', end_time: '22:00', target_count: null },
    { name: 'Night', start_time: '22:00', end_time: '06:00', target_count: null },
  ],
};

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function ShiftTimeline({ shifts }: { shifts: ShiftDefinition[] }) {
  if (shifts.length === 0) return null;
  const total = 24 * 60;

  const segments: { left: number; width: number; color: string; name: string }[] = [];
  shifts.forEach((s, i) => {
    const start = timeToMinutes(s.start_time);
    const end = timeToMinutes(s.end_time);
    const color = COLORS[i % COLORS.length];
    if (start < end) {
      segments.push({ left: (start / total) * 100, width: ((end - start) / total) * 100, color, name: s.name });
    } else {
      // Overnight: two segments
      segments.push({ left: (start / total) * 100, width: ((total - start) / total) * 100, color, name: s.name });
      segments.push({ left: 0, width: (end / total) * 100, color, name: s.name });
    }
  });

  return (
    <div className="mt-3 mb-1">
      <div className="flex justify-between text-[10px] text-slate-500 mb-0.5 px-0.5">
        <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span>
      </div>
      <div className="relative h-6 bg-slate-800 rounded border border-slate-700 overflow-hidden">
        {segments.map((seg, i) => (
          <div
            key={i}
            className="absolute top-0 h-full flex items-center justify-center text-[10px] font-medium text-white/90 overflow-hidden"
            style={{ left: `${seg.left}%`, width: `${seg.width}%`, backgroundColor: seg.color }}
          >
            {seg.width > 8 && seg.name}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProductionSettingsTab() {
  const [settings, setSettings] = useState<ProductionSettingsType>({
    good_count_tag: null,
    reject_fault_tags: [],
    downtime_alarm_tags: [],
    shift_mode: 'manual',
    shifts: [],
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
    } catch (e: unknown) {
      const detail = e && typeof e === 'object' && 'message' in e ? (e as { message: string }).message : 'Failed to save';
      setMsg(detail.includes('shift') || detail.includes('Shift') ? detail : 'Failed to save');
    }
    setSaving(false);
  }, [settings]);

  const toggleTag = useCallback((list: string[], tag: string): string[] => {
    return list.includes(tag) ? list.filter(t => t !== tag) : [...list, tag];
  }, []);

  const updateShift = useCallback((index: number, field: keyof ShiftDefinition, value: string | number | null) => {
    setSettings(prev => {
      const shifts = [...prev.shifts];
      shifts[index] = { ...shifts[index], [field]: value };
      return { ...prev, shifts };
    });
  }, []);

  const addShift = useCallback(() => {
    setSettings(prev => ({
      ...prev,
      shifts: [...prev.shifts, { name: '', start_time: '06:00', end_time: '14:00', target_count: null }],
    }));
  }, []);

  const removeShift = useCallback((index: number) => {
    setSettings(prev => ({
      ...prev,
      shifts: prev.shifts.filter((_, i) => i !== index),
    }));
  }, []);

  const applyPreset = useCallback((key: string) => {
    setSettings(prev => ({ ...prev, shifts: [...SHIFT_PRESETS[key]] }));
  }, []);

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h2 className="text-base font-semibold text-slate-100">Production Tracking</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Configure shift schedules, count tracking, reject detection, and downtime monitoring.
        </p>
      </div>

      {/* Shift Mode */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-200 mb-1">Shift Mode</label>
        <p className="text-xs text-slate-400 mb-2">
          Manual mode requires starting and stopping production runs by hand. Automatic mode starts and stops runs at shift boundaries.
        </p>
        <div className="flex gap-2">
          {(['manual', 'automatic'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setSettings({ ...settings, shift_mode: mode })}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                settings.shift_mode === mode
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {mode === 'manual' ? 'Manual' : 'Automatic Shifts'}
            </button>
          ))}
        </div>
      </div>

      {/* Shift Schedule (only in automatic mode) */}
      {settings.shift_mode === 'automatic' && (
        <div className="mb-6 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={16} className="text-blue-400" />
            <label className="text-sm font-medium text-slate-200">Shift Schedule</label>
          </div>

          {/* Presets */}
          <div className="flex gap-2 mb-3">
            <span className="text-xs text-slate-400 self-center">Presets:</span>
            {Object.keys(SHIFT_PRESETS).map(key => (
              <button
                key={key}
                onClick={() => applyPreset(key)}
                className="px-2.5 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded border border-slate-600 transition-colors"
              >
                {key}
              </button>
            ))}
          </div>

          {/* Shift rows */}
          {settings.shifts.length > 0 && (
            <div className="space-y-2 mb-3">
              <div className="grid grid-cols-[1fr_100px_100px_100px_32px] gap-2 text-xs text-slate-400 px-1">
                <span>Name</span><span>Start</span><span>End</span><span>Target</span><span />
              </div>
              {settings.shifts.map((shift, i) => (
                <div key={i} className="grid grid-cols-[1fr_100px_100px_100px_32px] gap-2 items-center">
                  <input
                    type="text"
                    value={shift.name}
                    onChange={e => updateShift(i, 'name', e.target.value)}
                    placeholder="Shift name"
                    className={smallInputCls}
                  />
                  <input
                    type="time"
                    value={shift.start_time}
                    onChange={e => updateShift(i, 'start_time', e.target.value)}
                    className={smallInputCls}
                  />
                  <input
                    type="time"
                    value={shift.end_time}
                    onChange={e => updateShift(i, 'end_time', e.target.value)}
                    className={smallInputCls}
                  />
                  <input
                    type="number"
                    value={shift.target_count ?? ''}
                    onChange={e => updateShift(i, 'target_count', e.target.value ? parseInt(e.target.value) : null)}
                    placeholder="--"
                    className={smallInputCls}
                  />
                  <button
                    onClick={() => removeShift(i)}
                    className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-colors"
                    title="Remove shift"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={addShift}
            className="flex items-center gap-1 px-3 py-1.5 text-xs text-blue-400 hover:text-blue-300 hover:bg-slate-700 rounded border border-slate-600 transition-colors"
          >
            <Plus size={12} /> Add Shift
          </button>

          <ShiftTimeline shifts={settings.shifts} />
        </div>
      )}

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
