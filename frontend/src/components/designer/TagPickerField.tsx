// TagPicker — a searchable dropdown for binding a widget to a backend tag.
// Displays tags in a collapsible tree grouped by dot-notation in tag names.
// Wrapped in memo() to avoid re-fetching and re-rendering when unrelated
// properties change. Caps visible items at 50 to avoid DOM performance issues
// in systems with thousands of tags.
import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import type { Tag } from '../../types';
import { api } from '../../lib/api';
import { buildTagTree, getMatchingPaths } from '../../lib/tagTree';
import type { TagTreeNode } from '../../lib/tagTree';

export interface TagPickerProps {
  value: string;
  onChange: (tag: string) => void;
}

export const TagPicker = memo(function TagPicker({ value, onChange }: TagPickerProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
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

  const tree = useMemo(() => buildTagTree(filtered), [filtered]);

  const autoExpandPaths = useMemo(() => {
    if (!lowerSearch) return null;
    return getMatchingPaths(tree, lowerSearch);
  }, [tree, lowerSearch]);

  const isExpanded = useCallback((path: string) => {
    if (autoExpandPaths) return autoExpandPaths.has(path);
    return expandedPaths.has(path);
  }, [autoExpandPaths, expandedPaths]);

  const togglePath = useCallback((path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }, []);

  // Cap visible leaf items to avoid rendering 1000+ DOM nodes
  const MAX_VISIBLE = 50;
  let leafCount = 0;

  function renderNode(node: TagTreeNode, depth: number): React.ReactNode[] {
    if (leafCount >= MAX_VISIBLE) return [];
    const expanded = isExpanded(node.path);
    const items: React.ReactNode[] = [];

    // Group header
    items.push(
      <div
        key={`group-${node.path}`}
        className="flex items-center gap-1 px-2 py-1 text-[10px] text-slate-400 cursor-pointer hover:bg-slate-700/50 select-none"
        style={{ paddingLeft: depth * 12 + 8 }}
        onMouseDown={e => { e.preventDefault(); togglePath(node.path); }}
      >
        {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        <span className="font-medium">{node.segment}</span>
      </div>
    );

    if (expanded) {
      // Child groups
      for (const child of node.children) {
        if (leafCount >= MAX_VISIBLE) break;
        items.push(...renderNode(child, depth + 1));
      }
      // Leaf tags
      for (const t of node.tags) {
        if (leafCount >= MAX_VISIBLE) break;
        leafCount++;
        const leafSegment = t.name.split('.').pop() || t.name;
        items.push(
          <button
            key={t.id}
            className={`w-full text-left px-2 py-1.5 text-xs hover:bg-slate-700 ${t.name === value ? 'bg-slate-700 text-blue-400' : 'text-slate-300'}`}
            style={{ paddingLeft: (depth + 1) * 12 + 8 }}
            onMouseDown={e => { e.preventDefault(); onChange(t.name); setOpen(false); }}
          >
            <div className="font-medium flex items-center gap-1">
              {t.is_system && <span className="text-amber-400 text-[10px]" title="System tag">SYS</span>}
              {t.display_name || leafSegment}
            </div>
            {t.display_name && <div className="text-[10px] text-slate-500 font-mono truncate">{leafSegment}</div>}
          </button>
        );
      }
    }

    return items;
  }

  function renderTree(): React.ReactNode[] {
    leafCount = 0;
    const items: React.ReactNode[] = [];

    // Root-level groups
    for (const child of tree.children) {
      if (leafCount >= MAX_VISIBLE) break;
      items.push(...renderNode(child, 0));
    }

    // Root-level leaf tags (no dots)
    for (const t of tree.tags) {
      if (leafCount >= MAX_VISIBLE) break;
      leafCount++;
      items.push(
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
      );
    }

    return items;
  }

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
          {filtered.length > 0 && renderTree()}
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
