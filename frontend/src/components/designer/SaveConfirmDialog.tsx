import { useMemo } from 'react';
import { X, Plus, Minus, Pencil, MoveHorizontal } from 'lucide-react';
import type { Widget } from '../../types';

interface Props {
  originalWidgets: Widget[];
  currentWidgets: Widget[];
  onSave: () => void;
  onCancel: () => void;
  saveAndExit?: boolean;
}

interface WidgetChange {
  type: 'added' | 'removed' | 'modified' | 'reordered';
  widget: Widget;
  details?: string[];
}

function getWidgetLabel(w: Widget): string {
  const tag = (w.props?.tag as string) || (w.props?.label as string) || '';
  const suffix = tag ? ` (${tag})` : '';
  return `${w.type}${suffix}`;
}

function describeChanges(original: Widget, current: Widget): string[] {
  const changes: string[] = [];
  if (original.x !== current.x || original.y !== current.y) {
    changes.push('Position');
  }
  if (original.w !== current.w || original.h !== current.h) {
    changes.push('Size');
  }
  // Compare props shallowly
  const origProps = original.props || {};
  const currProps = current.props || {};
  const allKeys = new Set([...Object.keys(origProps), ...Object.keys(currProps)]);
  const changedProps: string[] = [];
  for (const key of allKeys) {
    if (JSON.stringify(origProps[key]) !== JSON.stringify(currProps[key])) {
      changedProps.push(key);
    }
  }
  if (changedProps.length > 0) {
    changes.push(`Properties: ${changedProps.join(', ')}`);
  }
  // Visibility / enabled changes
  const metaFields = ['visible', 'visibleTag', 'visibleRoles', 'enabled', 'enabledTag', 'enabledRoles', 'chrome', 'showInfo'] as const;
  for (const field of metaFields) {
    if (JSON.stringify(original[field]) !== JSON.stringify(current[field])) {
      changes.push(field);
    }
  }
  return changes;
}

function computeChanges(original: Widget[], current: Widget[]): WidgetChange[] {
  const origMap = new Map(original.map(w => [w.id, w]));
  const currMap = new Map(current.map(w => [w.id, w]));
  const changes: WidgetChange[] = [];

  // Added widgets
  for (const w of current) {
    if (!origMap.has(w.id)) {
      changes.push({ type: 'added', widget: w });
    }
  }

  // Removed widgets
  for (const w of original) {
    if (!currMap.has(w.id)) {
      changes.push({ type: 'removed', widget: w });
    }
  }

  // Modified widgets
  for (const w of current) {
    const orig = origMap.get(w.id);
    if (!orig) continue;
    const details = describeChanges(orig, w);
    if (details.length > 0) {
      changes.push({ type: 'modified', widget: w, details });
    }
  }

  // Check for reordering (z-order changes)
  const origOrder = original.filter(w => currMap.has(w.id)).map(w => w.id);
  const currOrder = current.filter(w => origMap.has(w.id)).map(w => w.id);
  if (origOrder.length === currOrder.length && origOrder.some((id, i) => id !== currOrder[i])) {
    // Only report reorder if no other changes cover it
    const modifiedIds = new Set(changes.filter(c => c.type === 'modified').map(c => c.widget.id));
    const reorderedIds = currOrder.filter((id, i) => id !== origOrder[i] && !modifiedIds.has(id));
    for (const id of reorderedIds) {
      const w = currMap.get(id)!;
      changes.push({ type: 'reordered', widget: w });
    }
  }

  return changes;
}

const ICONS = {
  added: Plus,
  removed: Minus,
  modified: Pencil,
  reordered: MoveHorizontal,
};

const COLORS = {
  added: 'text-green-400',
  removed: 'text-red-400',
  modified: 'text-yellow-400',
  reordered: 'text-blue-400',
};

const LABELS = {
  added: 'Added',
  removed: 'Removed',
  modified: 'Modified',
  reordered: 'Reordered',
};

export function SaveConfirmDialog({ originalWidgets, currentWidgets, onSave, onCancel, saveAndExit }: Props) {
  const changes = useMemo(() => computeChanges(originalWidgets, currentWidgets), [originalWidgets, currentWidgets]);

  const summary = useMemo(() => {
    const counts = { added: 0, removed: 0, modified: 0, reordered: 0 };
    for (const c of changes) counts[c.type]++;
    return counts;
  }, [changes]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div className="bg-[var(--hmi-bg-elevated)] border border-[var(--hmi-border)] rounded-lg shadow-xl p-5 w-full mx-4 max-w-lg" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-[var(--hmi-text-primary)]">
            {saveAndExit ? 'Save & Exit' : 'Save Changes'}
          </h3>
          <button onClick={onCancel} className="p-2.5 -m-1 rounded-md min-w-[44px] min-h-[44px] flex items-center justify-center text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)] hover:bg-[var(--hmi-bg-base)]">
            <X size={20} />
          </button>
        </div>

        {/* Summary badges */}
        <div className="flex gap-3 mb-4">
          {(['added', 'removed', 'modified', 'reordered'] as const).map(type => {
            if (summary[type] === 0) return null;
            return (
              <span key={type} className={`text-xs font-medium px-2 py-1 rounded bg-slate-800 ${COLORS[type]}`}>
                {summary[type]} {LABELS[type]}
              </span>
            );
          })}
        </div>

        {/* Changes list */}
        <div className="max-h-64 overflow-y-auto mb-4 border border-[var(--hmi-border)] rounded">
          {changes.length === 0 ? (
            <div className="p-4 text-sm text-[var(--hmi-text-secondary)] text-center">No changes detected</div>
          ) : (
            <ul className="divide-y divide-[var(--hmi-border)]">
              {changes.map((change, i) => {
                const Icon = ICONS[change.type];
                return (
                  <li key={`${change.widget.id}-${change.type}-${i}`} className="flex items-start gap-3 px-3 py-2">
                    <Icon size={14} className={`mt-0.5 shrink-0 ${COLORS[change.type]}`} />
                    <div className="min-w-0">
                      <div className="text-sm text-[var(--hmi-text-primary)]">
                        <span className={`font-medium ${COLORS[change.type]}`}>{LABELS[change.type]}</span>
                        {' '}
                        <span className="text-[var(--hmi-text-secondary)]">{getWidgetLabel(change.widget)}</span>
                      </div>
                      {change.details && change.details.length > 0 && (
                        <div className="text-xs text-[var(--hmi-text-secondary)] mt-0.5">
                          {change.details.join(' · ')}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 min-h-[36px] rounded text-sm text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)] hover:bg-[var(--hmi-bg-base)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            className="px-4 py-2 min-h-[36px] rounded text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            {saveAndExit ? 'Save & Exit' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
