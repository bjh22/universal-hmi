import { useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, X, Tag as TagIcon } from 'lucide-react';
import { api } from '../../lib/api';
import { DeleteConfirmDialog, Field, inputCls, LABEL_COLORS } from './shared';
import type { TagLabel } from '../../types';

export interface LabelsSettingsProps {
  allLabels: TagLabel[];
  canManage: boolean;
  loadLabels: () => void;
  loadTags: () => void;
}

export function LabelsSettings({ allLabels, canManage, loadLabels, loadTags }: LabelsSettingsProps) {
  const [editLabel, setEditLabel] = useState<{ id?: number; name: string; color: string; description: string } | null>(null);
  const [deleteLabelTarget, setDeleteLabelTarget] = useState<TagLabel | null>(null);

  const handleSaveLabel = useCallback(async (data: { id?: number; name: string; color: string; description: string }) => {
    try {
      if (data.id != null) {
        await api.updateTagLabel(data.id, data);
      } else {
        await api.createTagLabel(data);
      }
      setEditLabel(null);
      loadLabels();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }, [loadLabels]);

  const handleDeleteLabel = useCallback(async () => {
    if (!deleteLabelTarget) return;
    try {
      await api.deleteTagLabel(deleteLabelTarget.id);
      setDeleteLabelTarget(null);
      loadLabels();
      loadTags(); // refresh tags to reflect removed labels
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }, [deleteLabelTarget, loadLabels, loadTags]);

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-[var(--hmi-text-secondary)] flex items-center gap-1.5"><TagIcon size={14} /> Labels</h2>
        {canManage && (
          <button
            onClick={() => setEditLabel({ name: '', color: LABEL_COLORS[allLabels.length % LABEL_COLORS.length], description: '' })}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--hmi-bg-input)] hover:bg-[var(--hmi-border-subtle)] text-[var(--hmi-text-secondary)] rounded-lg text-xs font-medium"
          >
            <Plus size={14} /> New Label
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {allLabels.map(l => (
          <div key={l.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs text-white"
            style={{ backgroundColor: l.color || '#3b82f6' }}>
            {l.name}
            {canManage && (
              <>
                <button onClick={() => setEditLabel({ id: l.id, name: l.name, color: l.color || '#3b82f6', description: l.description || '' })}
                  className="hover:text-[var(--hmi-text-primary)] ml-1" title="Edit">
                  <Pencil size={10} />
                </button>
                <button onClick={() => setDeleteLabelTarget(l)}
                  className="hover:text-[var(--hmi-text-primary)]" title="Delete">
                  <Trash2 size={10} />
                </button>
              </>
            )}
          </div>
        ))}
        {allLabels.length === 0 && <span className="text-[var(--hmi-text-muted)] text-xs">No labels defined yet</span>}
      </div>

      {/* Label Edit Dialog */}
      {editLabel && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setEditLabel(null)}>
          <div className="bg-[var(--hmi-bg-elevated)] rounded-xl border border-[var(--hmi-border)] w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[var(--hmi-text-primary)]">{editLabel.id != null ? 'Edit Label' : 'New Label'}</h2>
              <button onClick={() => setEditLabel(null)} className="text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)]"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <Field label="Name *">
                <input value={editLabel.name} onChange={e => setEditLabel(l => l ? { ...l, name: e.target.value } : l)} className={inputCls} placeholder="e.g. Process" />
              </Field>
              <Field label="Color">
                <div className="flex items-center gap-2">
                  <input type="color" value={editLabel.color} onChange={e => setEditLabel(l => l ? { ...l, color: e.target.value } : l)}
                    className="w-8 h-8 rounded border border-[var(--hmi-border-subtle)] cursor-pointer bg-transparent" />
                  <div className="flex gap-1">
                    {LABEL_COLORS.map(c => (
                      <button key={c} type="button" onClick={() => setEditLabel(l => l ? { ...l, color: c } : l)}
                        className={`w-5 h-5 rounded-full border-2 ${editLabel.color === c ? 'border-white' : 'border-transparent'}`}
                        style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </div>
              </Field>
              <Field label="Description">
                <input value={editLabel.description} onChange={e => setEditLabel(l => l ? { ...l, description: e.target.value } : l)} className={inputCls} />
              </Field>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setEditLabel(null)} className="px-4 py-2 bg-[var(--hmi-bg-input)] rounded-lg text-sm text-[var(--hmi-text-secondary)] hover:bg-[var(--hmi-border-subtle)]">Cancel</button>
                <button onClick={() => editLabel.name.trim() && handleSaveLabel(editLabel)} className="px-4 py-2 bg-[var(--hmi-accent)] rounded-lg text-sm text-white hover:bg-[var(--hmi-accent-dark)]">
                  {editLabel.id != null ? 'Save' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {deleteLabelTarget && <DeleteConfirmDialog title="Delete Label" name={deleteLabelTarget.name} onConfirm={handleDeleteLabel} onCancel={() => setDeleteLabelTarget(null)} />}
    </div>
  );
}
