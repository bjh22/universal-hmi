import type { TextStyle } from '../../types';

export interface TextStyleEditorProps {
  label: string;
  value?: TextStyle;
  onChange: (style: TextStyle) => void;
}

export function TextStyleEditor({ label, value, onChange }: TextStyleEditorProps) {
  const s = value || {};
  const update = (patch: Partial<TextStyle>) => onChange({ ...s, ...patch });

  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-semibold text-slate-500 uppercase">{label}</div>
      <div className="grid grid-cols-2 gap-1.5">
        <div>
          <label className="text-[10px] text-slate-500">Font</label>
          <select
            value={s.fontFamily || ''}
            onChange={e => update({ fontFamily: e.target.value || undefined })}
            className="w-full bg-slate-700 border border-slate-600 rounded px-1.5 py-1 text-xs text-white"
          >
            <option value="">Default</option>
            <option value="Arial, sans-serif">Arial</option>
            <option value="'Courier New', monospace">Courier</option>
            <option value="Georgia, serif">Georgia</option>
            <option value="'Segoe UI', sans-serif">Segoe UI</option>
            <option value="Verdana, sans-serif">Verdana</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] text-slate-500">Size (px)</label>
          <input
            type="number"
            value={s.fontSize ?? ''}
            onChange={e => update({ fontSize: e.target.value ? Number(e.target.value) : undefined })}
            className="w-full bg-slate-700 border border-slate-600 rounded px-1.5 py-1 text-xs text-white"
            min={8} max={72}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={s.fontWeight === 'bold'}
            onChange={e => update({ fontWeight: e.target.checked ? 'bold' : 'normal' })}
            className="rounded bg-slate-700 border-slate-600"
          />
          Bold
        </label>
        <label className="flex items-center gap-1 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={!!s.italic}
            onChange={e => update({ italic: e.target.checked })}
            className="rounded bg-slate-700 border-slate-600"
          />
          Italic
        </label>
        <div className="flex items-center gap-1 ml-auto">
          <label className="text-[10px] text-slate-500">Color</label>
          <input
            type="color"
            value={s.color || '#ffffff'}
            onChange={e => update({ color: e.target.value })}
            className="w-6 h-6 rounded border border-slate-600 bg-transparent cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
}
