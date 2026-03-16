// TagPicker — a searchable dropdown for binding a widget to a backend tag.
// Wrapped in memo() to avoid re-fetching and re-rendering when unrelated
// properties change. Caps visible items at 50 to avoid DOM performance issues
// in systems with thousands of tags.
import { useState, useEffect, useRef, memo } from 'react';
import type { Tag } from '../../types';
import { api } from '../../lib/api';

export interface TagPickerProps {
  value: string;
  onChange: (tag: string) => void;
}

export const TagPicker = memo(function TagPicker({ value, onChange }: TagPickerProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.getTags().then(setTags).catch(() => {});
  }, []);

  const lowerSearch = search.toLowerCase();
  const filtered = tags.filter(t =>
    t.name.toLowerCase().includes(lowerSearch) ||
    (t.display_name || '').toLowerCase().includes(lowerSearch) ||
    (t.labels || []).some(l => l.name.toLowerCase().includes(lowerSearch))
  );
  // Cap visible items to avoid rendering 1000+ DOM nodes
  const MAX_VISIBLE = 50;
  const visibleTags = filtered.slice(0, MAX_VISIBLE);
  const hasMore = filtered.length > MAX_VISIBLE;

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={open ? search : value}
        onChange={e => { setSearch(e.target.value); if (!open) setOpen(true); }}
        onFocus={() => { setSearch(value); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white"
        placeholder="Search tags..."
      />
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-600 rounded shadow-lg max-h-48 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-slate-500">No tags found</div>
          )}
          {visibleTags.map(t => (
            <button
              key={t.id}
              className={`w-full text-left px-2 py-1.5 text-xs hover:bg-slate-700 ${t.name === value ? 'bg-slate-700 text-blue-400' : 'text-slate-300'}`}
              onMouseDown={e => { e.preventDefault(); onChange(t.name); setOpen(false); }}
            >
              <div className="font-medium flex items-center gap-1">
                {t.is_system && <span className="text-amber-400 text-[10px]" title="System tag">SYS</span>}
                {t.display_name || t.name}
              </div>
              {t.display_name && <div className="text-[10px] text-slate-500 font-mono truncate">{t.name}</div>}
            </button>
          ))}
          {hasMore && (
            <div className="px-2 py-1.5 text-[10px] text-slate-500 text-center">
              {filtered.length - MAX_VISIBLE} more — type to narrow results
            </div>
          )}
        </div>
      )}
    </div>
  );
});
