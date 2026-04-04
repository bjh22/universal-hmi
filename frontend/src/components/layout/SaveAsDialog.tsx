/**
 * SaveAsDialog — simple dialog for saving the current project under a new name.
 * Creates a copy of the active project with a new .hmi.json file.
 */
import { useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { api } from '../../lib/api';

interface SaveAsDialogProps {
  activeProjectId: number;
  currentName: string;
  onClose: () => void;
  onSaved: () => void;
}

export function SaveAsDialog({ activeProjectId, currentName, onClose, onSaved }: SaveAsDialogProps) {
  const [name, setName] = useState(currentName ? `${currentName} (copy)` : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await api.saveProjectAs(activeProjectId, name.trim());
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save project');
      setSaving(false);
    }
  }, [activeProjectId, name, saving, onSaved]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-[var(--hmi-bg-elevated)] border border-[var(--hmi-border)] rounded-lg shadow-xl p-5 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-[var(--hmi-text-primary)]">Save As</h3>
          <button onClick={onClose} className="p-2.5 -m-1 rounded-md min-w-[44px] min-h-[44px] flex items-center justify-center text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)] hover:bg-[var(--hmi-bg-base)]">
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="mb-3 px-3 py-2 rounded bg-red-500/10 border border-red-500/30 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-[var(--hmi-text-secondary)] mb-1">New Project Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="My Project"
              autoFocus
              className="w-full px-3 py-2 bg-[var(--hmi-bg-input)] border border-[var(--hmi-border)] rounded text-[var(--hmi-text-primary)] text-sm focus:outline-none focus:border-[var(--hmi-accent)]"
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />
            <p className="text-xs text-[var(--hmi-text-muted)] mt-1">
              This creates a new project file. The current project is unchanged.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)] rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!name.trim() || saving}
              className="px-4 py-2 text-sm font-medium bg-[var(--hmi-accent)] text-white rounded hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {saving ? 'Saving...' : 'Save As'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
