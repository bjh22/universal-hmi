/**
 * FileMenu — dropdown menu in the header bar providing classic
 * File > Save / Save As / Open / New project operations.
 *
 * Displays the active project name with a dirty indicator (yellow dot)
 * when unsaved changes exist. Only visible to engineer/designer roles.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronDown, Save, FolderOpen, FilePlus, Copy,
  Download, Settings2,
} from 'lucide-react';
import { api } from '../../lib/api';
import { OpenProjectDialog } from './OpenProjectDialog';
import { SaveAsDialog } from './SaveAsDialog';

interface FileMenuProps {
  activeProjectId: number | null;
  activeProjectName: string | null;
  userRole: string | null;
  onProjectChanged: () => void;
}

export function FileMenu({ activeProjectId, activeProjectName, userRole, onProjectChanged }: FileMenuProps) {
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showOpen, setShowOpen] = useState(false);
  const [showSaveAs, setShowSaveAs] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newMode, setNewMode] = useState<'blank' | 'demo'>('blank');
  const [creating, setCreating] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Only render for engineer/designer
  if (!userRole || !['engineer', 'designer'].includes(userRole)) return null;

  // Poll dirty state
  useEffect(() => {
    if (!activeProjectId) return;
    let cancelled = false;
    const check = () => {
      api.getActiveProjectDirty().then(r => {
        if (!cancelled) setDirty(r.dirty);
      }).catch(() => {});
    };
    check();
    const interval = setInterval(check, 10_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [activeProjectId]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSave = useCallback(async () => {
    if (!activeProjectId || saving) return;
    setSaving(true);
    setOpen(false);
    try {
      await api.saveProject(activeProjectId);
      setDirty(false);
    } catch {
      // Save errors shown via toast in future
    } finally {
      setSaving(false);
    }
  }, [activeProjectId, saving]);

  const handleExport = useCallback(async () => {
    if (!activeProjectId) return;
    setOpen(false);
    try {
      const data = await api.exportProject(activeProjectId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeProjectName || 'project'}.hmi.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Export error
    }
  }, [activeProjectId, activeProjectName]);

  const handleNewProject = useCallback(async () => {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      const createFn = newMode === 'demo' ? api.createDemoProject : api.createBlankProject;
      await createFn({ name: newName.trim() });
      setShowNew(false);
      setNewName('');
      onProjectChanged();
      navigate('/');
    } catch {
      // Creation error
    } finally {
      setCreating(false);
    }
  }, [newName, newMode, creating, onProjectChanged, navigate]);

  // Global Ctrl+Shift+S handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        handleSave();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handleSave]);

  // beforeunload warning when dirty
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (window.__hmiAutoLogout) return;
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const displayName = activeProjectName || 'No Project';

  const menuItem = (icon: React.ReactNode, label: string, shortcut: string | null, onClick: () => void, disabled = false) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-3 w-full px-3 py-2.5 min-h-[40px] text-sm text-left text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)] hover:bg-[var(--hmi-bg-base)] disabled:opacity-40 disabled:cursor-not-allowed rounded transition-colors"
    >
      {icon}
      <span className="flex-1">{label}</span>
      {shortcut && <span className="text-xs text-[var(--hmi-text-muted)] ml-4">{shortcut}</span>}
    </button>
  );

  return (
    <>
      <div ref={menuRef} className="relative shrink-0">
        {/* Trigger button */}
        <button
          onClick={() => setOpen(!open)}
          className={`flex items-center gap-2 px-3 h-10 rounded text-sm font-medium transition-colors ${
            open
              ? 'bg-[var(--hmi-bg-base)] text-[var(--hmi-text-primary)]'
              : 'text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)] hover:bg-[var(--hmi-bg-base)]'
          }`}
        >
          <FolderOpen size={16} />
          <span className="max-w-[160px] truncate">{displayName}</span>
          {dirty && <span className="w-2 h-2 rounded-full bg-yellow-400 shrink-0" title="Unsaved changes" />}
          {saving && <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" title="Saving..." />}
          <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {/* Dropdown */}
        {open && (
          <div className="absolute top-full left-0 mt-1 w-64 bg-[var(--hmi-bg-elevated)] border border-[var(--hmi-border)] rounded-lg shadow-xl py-1 z-50">
            {menuItem(<FilePlus size={16} />, 'New Project...', null, () => { setOpen(false); setShowNew(true); })}
            {menuItem(<FolderOpen size={16} />, 'Open...', null, () => { setOpen(false); setShowOpen(true); })}
            <div className="h-px bg-[var(--hmi-border)] my-1" />
            {menuItem(<Save size={16} />, 'Save', 'Ctrl+Shift+S', handleSave, !activeProjectId || saving)}
            {menuItem(<Copy size={16} />, 'Save As...', null, () => { setOpen(false); setShowSaveAs(true); }, !activeProjectId)}
            <div className="h-px bg-[var(--hmi-border)] my-1" />
            {menuItem(<Download size={16} />, 'Export .hmi.json', null, handleExport, !activeProjectId)}
            <div className="h-px bg-[var(--hmi-border)] my-1" />
            {menuItem(<Settings2 size={16} />, 'Projects Page', null, () => { setOpen(false); navigate('/projects'); })}
          </div>
        )}
      </div>

      {/* Open Project Dialog */}
      {showOpen && (
        <OpenProjectDialog
          dirty={dirty}
          activeProjectId={activeProjectId}
          onClose={() => setShowOpen(false)}
          onProjectChanged={() => {
            setShowOpen(false);
            setDirty(false);
            onProjectChanged();
            navigate('/');
          }}
          onSaveFirst={handleSave}
        />
      )}

      {/* Save As Dialog */}
      {showSaveAs && activeProjectId && (
        <SaveAsDialog
          activeProjectId={activeProjectId}
          currentName={activeProjectName || ''}
          onClose={() => setShowSaveAs(false)}
          onSaved={() => {
            setShowSaveAs(false);
            setDirty(false);
            onProjectChanged();
          }}
        />
      )}

      {/* New Project Dialog */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowNew(false)}>
          <div className="bg-[var(--hmi-bg-elevated)] border border-[var(--hmi-border)] rounded-lg shadow-xl p-5 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-[var(--hmi-text-primary)] mb-4">New Project</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-[var(--hmi-text-secondary)] mb-1">Project Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="My Project"
                  autoFocus
                  className="w-full px-3 py-2 bg-[var(--hmi-bg-input)] border border-[var(--hmi-border)] rounded text-[var(--hmi-text-primary)] text-sm focus:outline-none focus:border-[var(--hmi-accent)]"
                  onKeyDown={e => e.key === 'Enter' && handleNewProject()}
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--hmi-text-secondary)] mb-2">Template</label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setNewMode('blank')}
                    className={`flex-1 px-3 py-2 rounded border text-sm font-medium transition-colors ${
                      newMode === 'blank'
                        ? 'border-[var(--hmi-accent)] bg-[var(--hmi-accent)]/10 text-[var(--hmi-accent)]'
                        : 'border-[var(--hmi-border)] text-[var(--hmi-text-secondary)] hover:border-[var(--hmi-text-muted)]'
                    }`}
                  >
                    Blank
                  </button>
                  <button
                    onClick={() => setNewMode('demo')}
                    className={`flex-1 px-3 py-2 rounded border text-sm font-medium transition-colors ${
                      newMode === 'demo'
                        ? 'border-[var(--hmi-accent)] bg-[var(--hmi-accent)]/10 text-[var(--hmi-accent)]'
                        : 'border-[var(--hmi-border)] text-[var(--hmi-text-secondary)] hover:border-[var(--hmi-text-muted)]'
                    }`}
                  >
                    Demo (sample tags)
                  </button>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowNew(false)}
                  className="px-4 py-2 text-sm text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)] rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleNewProject}
                  disabled={!newName.trim() || creating}
                  className="px-4 py-2 text-sm font-medium bg-[var(--hmi-accent)] text-white rounded hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
