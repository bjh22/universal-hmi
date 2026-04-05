import { useEffect, useState, useCallback } from 'react';
import {
  FolderOpen, Plus, Trash2, Download, Upload, X,
  Package, Tag as TagIcon, Monitor, Database, ClipboardList, PlayCircle, FileText,
  Save, Copy, RotateCcw,
} from 'lucide-react';
import { api } from '../lib/api';
import { Dialog } from '../components/Dialog';
import { GitPanel } from '../components/GitPanel';
import { ImportWizard } from '../components/ImportWizard';
import { SaveAsDialog } from '../components/layout/SaveAsDialog';
import type { ProjectData, ProjectFile, UserData } from '../types';

interface Props {
  user: UserData | null;
  onProjectChanged?: () => void;
}

const inputCls = 'w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-sm text-white outline-none focus:border-blue-500';
const btnPrimary = 'bg-[var(--hmi-accent)] hover:bg-[var(--hmi-accent-dark)] text-white px-4 py-2 rounded-md text-sm font-medium transition-colors';
const btnSecondary = 'bg-slate-700 hover:bg-slate-600 text-slate-200 px-4 py-2 rounded-md text-sm font-medium transition-colors';
const btnDanger = 'bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors';

type CreateTemplate = 'blank' | 'demo';

export function ProjectsPage({ user, onProjectChanged }: Props) {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Active project info (for dirty-check on open)
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);

  // Dialog state
  const [showCreate, setShowCreate] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showOpenConfirm, setShowOpenConfirm] = useState(false);
  const [dirtyChanges, setDirtyChanges] = useState<{ section: string; added: string[]; removed: string[]; modified: { name: string; fields: string[] }[] }[]>([]);

  // Active project actions
  const [showSaveAs, setShowSaveAs] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // For ImportWizard (needs DB project list)
  const [dbProjects, setDbProjects] = useState<ProjectData[]>([]);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formVersion, setFormVersion] = useState('1.0.0');
  const [formTemplate, setFormTemplate] = useState<CreateTemplate>('blank');

  const canEdit = user && (user.role === 'engineer' || user.role === 'designer');

  const loadFiles = useCallback(async () => {
    try {
      setLoading(true);
      const result = await api.listProjectFiles();
      setFiles(result.files);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load project files');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadActiveProject = useCallback(async () => {
    try {
      const p = await api.getActiveProject();
      setActiveProjectId(p.id);
    } catch { /* no active project */ }
  }, []);

  useEffect(() => { loadFiles(); loadActiveProject(); }, [loadFiles, loadActiveProject]);

  // Poll dirty state for active project
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

  const showSuccessMsg = useCallback((msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  }, []);

  const selected = files.find(f => f.filename === selectedFile) || null;
  const activeFile = files.find(f => f.is_active) || null;

  const handleCreate = useCallback(async () => {
    try {
      setBusy(true);
      const data = { name: formName, description: formDesc || undefined, version: formVersion };
      if (formTemplate === 'demo') {
        await api.createDemoProject(data);
      } else {
        await api.createBlankProject(data);
      }
      setShowCreate(false);
      setFormName(''); setFormDesc(''); setFormVersion('1.0.0'); setFormTemplate('blank');
      await loadFiles();
      await loadActiveProject();
      onProjectChanged?.();
      showSuccessMsg(`Project "${formName}" created`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  }, [formName, formDesc, formVersion, formTemplate, loadFiles, loadActiveProject, onProjectChanged, showSuccessMsg]);

  const handleOpen = useCallback(async (filename: string) => {
    try {
      setBusy(true);
      await api.openProjectFile(filename);
      await loadFiles();
      await loadActiveProject();
      setShowOpenConfirm(false);
      onProjectChanged?.();
      showSuccessMsg('Project opened');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Open failed');
    } finally {
      setBusy(false);
    }
  }, [loadFiles, loadActiveProject, onProjectChanged, showSuccessMsg]);

  const handleSaveAndOpen = useCallback(async (filename: string) => {
    try {
      setBusy(true);
      if (activeProjectId) {
        await api.saveProject(activeProjectId);
      }
      await api.openProjectFile(filename);
      await loadFiles();
      await loadActiveProject();
      setShowOpenConfirm(false);
      onProjectChanged?.();
      showSuccessMsg('Saved current project and opened new one');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save & Open failed');
    } finally {
      setBusy(false);
    }
  }, [activeProjectId, loadFiles, loadActiveProject, onProjectChanged, showSuccessMsg]);

  const handleDelete = useCallback(async () => {
    if (!selectedFile) return;
    try {
      await api.deleteProjectFile(selectedFile);
      setShowDelete(false);
      setSelectedFile(null);
      await loadFiles();
      showSuccessMsg('Project file deleted');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }, [selectedFile, loadFiles, showSuccessMsg]);

  const handleDownload = useCallback(async (filename: string) => {
    try {
      const data = await api.downloadProjectFile(filename);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed');
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!activeProjectId || saving) return;
    setSaving(true);
    try {
      await api.saveProject(activeProjectId);
      setDirty(false);
      showSuccessMsg('Project saved');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [activeProjectId, saving, showSuccessMsg]);

  const handleDiscard = useCallback(async () => {
    if (!activeProjectId) return;
    setBusy(true);
    try {
      await api.loadProject(activeProjectId);
      setDirty(false);
      setShowDiscardConfirm(false);
      await loadFiles();
      onProjectChanged?.();
      showSuccessMsg('Changes discarded — project reloaded from last save');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Discard failed');
    } finally {
      setBusy(false);
    }
  }, [activeProjectId, loadFiles, onProjectChanged, showSuccessMsg]);

  const handleExport = useCallback(async () => {
    if (!activeProjectId) return;
    try {
      const data = await api.exportProject(activeProjectId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeFile?.project_name || 'project'}.hmi.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    }
  }, [activeProjectId, activeFile?.project_name]);

  const initiateOpen = useCallback(async (filename: string) => {
    // If the file is already active, nothing to do
    const target = files.find(f => f.filename === filename);
    if (target?.is_active) return;

    // Check for unsaved changes on current project
    if (activeProjectId) {
      try {
        const result = await api.getActiveProjectDirty();
        if (result.dirty) {
          setDirtyChanges(result.changes);
          setShowOpenConfirm(true);
          return;
        }
      } catch {
        // Can't check dirty state — proceed with confirmation anyway
        setDirtyChanges([]);
        setShowOpenConfirm(true);
        return;
      }
    }
    handleOpen(filename);
  }, [files, activeProjectId, handleOpen]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderOpen size={24} className="text-blue-400" />
          <h1 className="text-xl font-bold text-white">Projects</h1>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <button onClick={async () => {
              try { setDbProjects(await api.getProjects()); } catch { setDbProjects([]); }
              setShowImport(true);
            }} className={btnSecondary}>
              <span className="flex items-center gap-1.5"><Upload size={16} /> Import</span>
            </button>
            <button onClick={() => { setFormName(''); setFormDesc(''); setFormVersion('1.0.0'); setFormTemplate('blank'); setShowCreate(true); }} className={btnPrimary}>
              <span className="flex items-center gap-1.5"><Plus size={16} /> New Project</span>
            </button>
          </div>
        )}
      </div>

      {/* Success banner */}
      {success && (
        <div className="bg-green-500/20 border border-green-500/30 rounded-md px-4 py-2 flex justify-between items-center">
          <span className="text-green-300 text-sm">{success}</span>
          <button onClick={() => setSuccess(null)} className="text-green-300 hover:text-white"><X size={16} /></button>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="bg-red-500/20 border border-red-500/30 rounded-md px-4 py-2 flex justify-between items-center">
          <span className="text-red-300 text-sm">{error}</span>
          <button onClick={() => setError(null)} className="text-red-300 hover:text-white"><X size={16} /></button>
        </div>
      )}

      {loading ? (
        <div className="text-slate-400 text-center py-12">Loading project files...</div>
      ) : files.length === 0 ? (
        <div className="text-center py-12">
          <Package size={48} className="mx-auto text-slate-600 mb-3" />
          <p className="text-slate-400">No project files</p>
          <p className="text-slate-500 text-sm mt-1">Create a project to get started</p>
        </div>
      ) : (
        <>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* File list */}
          <div className="lg:col-span-1 space-y-2">
            {files.map(f => (
              <button
                key={f.filename}
                onClick={() => setSelectedFile(f.filename)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  selectedFile === f.filename
                    ? 'bg-[var(--hmi-accent-bg)] border-[var(--hmi-accent)]/50'
                    : 'bg-slate-800 border-slate-700 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-white text-sm flex items-center gap-1.5">
                    {f.project_name}
                    {f.is_active && (
                      <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded font-normal">Active</span>
                    )}
                  </span>
                  <span className="text-xs text-slate-400">v{f.version}</span>
                </div>
                {f.description && (
                  <p className="text-xs text-slate-400 mt-1 truncate">{f.description}</p>
                )}
              </button>
            ))}
          </div>

          {/* Detail panel */}
          <div className="lg:col-span-2">
            {selected ? (
              <div className="bg-slate-800 rounded-lg border border-slate-700 p-5 space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    {selected.project_name}
                    {selected.is_active && dirty && (
                      <span className="text-xs bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded font-normal">Unsaved changes</span>
                    )}
                  </h2>
                  {selected.description && <p className="text-sm text-slate-400 mt-1">{selected.description}</p>}
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <span className="text-xs text-slate-500">Version {selected.version}</span>
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <FileText size={12} /> {selected.filename}
                    </span>
                    <span className="text-xs text-slate-500">{formatFileSize(selected.size_bytes)}</span>
                    <span className="text-xs text-slate-500">Modified {new Date(selected.modified_at).toLocaleString()}</span>
                  </div>
                </div>

                {/* Resource counts */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-slate-900 rounded-lg p-3 text-center">
                    <TagIcon size={20} className="mx-auto text-blue-400 mb-1" />
                    <div className="text-lg font-bold text-white">{selected.tag_count}</div>
                    <div className="text-xs text-slate-400">Tags</div>
                  </div>
                  <div className="bg-slate-900 rounded-lg p-3 text-center">
                    <Monitor size={20} className="mx-auto text-purple-400 mb-1" />
                    <div className="text-lg font-bold text-white">{selected.screen_count}</div>
                    <div className="text-xs text-slate-400">Screens</div>
                  </div>
                  <div className="bg-slate-900 rounded-lg p-3 text-center">
                    <Database size={20} className="mx-auto text-amber-400 mb-1" />
                    <div className="text-lg font-bold text-white">{selected.data_source_count}</div>
                    <div className="text-xs text-slate-400">Data Sources</div>
                  </div>
                  <div className="bg-slate-900 rounded-lg p-3 text-center">
                    <ClipboardList size={20} className="mx-auto text-green-400 mb-1" />
                    <div className="text-lg font-bold text-white">{selected.job_count}</div>
                    <div className="text-xs text-slate-400">Jobs</div>
                  </div>
                </div>

                {/* Actions */}
                {canEdit && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-700">
                    {selected.is_active ? (
                      <>
                        <button
                          onClick={handleSave}
                          disabled={!dirty || saving}
                          className={dirty ? btnPrimary : btnSecondary}
                        >
                          <span className="flex items-center gap-1.5">
                            <Save size={16} /> {saving ? 'Saving...' : 'Save'}
                          </span>
                        </button>
                        <button
                          onClick={() => setShowSaveAs(true)}
                          className={btnSecondary}
                        >
                          <span className="flex items-center gap-1.5"><Copy size={16} /> Save As</span>
                        </button>
                        <button
                          onClick={() => setShowDiscardConfirm(true)}
                          disabled={!dirty || busy}
                          className={btnSecondary}
                        >
                          <span className="flex items-center gap-1.5"><RotateCcw size={16} /> Discard Changes</span>
                        </button>
                        <button onClick={handleExport} className={btnSecondary}>
                          <span className="flex items-center gap-1.5"><Download size={16} /> Export</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => initiateOpen(selected.filename)}
                          disabled={busy}
                          className={btnPrimary}
                        >
                          <span className="flex items-center gap-1.5"><PlayCircle size={16} /> Open</span>
                        </button>
                        <button onClick={() => handleDownload(selected.filename)} className={btnSecondary}>
                          <span className="flex items-center gap-1.5"><Download size={16} /> Download</span>
                        </button>
                        <button onClick={() => setShowDelete(true)} className={btnDanger}>
                          <span className="flex items-center gap-1.5"><Trash2 size={16} /> Delete</span>
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-slate-800 rounded-lg border border-slate-700 p-8 text-center">
                <FolderOpen size={40} className="mx-auto text-slate-600 mb-2" />
                <p className="text-slate-400">Select a project to view details</p>
              </div>
            )}
          </div>
        </div>

        {/* Version Control */}
        {canEdit && (
          <GitPanel
            onSaveFirst={async () => { if (activeProjectId) await api.saveProject(activeProjectId); }}
            disabled={busy}
          />
        )}
        </>
      )}

      {/* Create Dialog */}
      {showCreate && (
        <Dialog title="New Project" onClose={() => setShowCreate(false)}>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Name</label>
              <input value={formName} onChange={e => setFormName(e.target.value)} className={inputCls} placeholder="My HMI Project" autoFocus />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Description</label>
              <input value={formDesc} onChange={e => setFormDesc(e.target.value)} className={inputCls} placeholder="Optional description" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Version</label>
              <input value={formVersion} onChange={e => setFormVersion(e.target.value)} className={inputCls} placeholder="1.0.0" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-2 block">Template</label>
              <div className="space-y-2">
                {([
                  { value: 'blank' as const, label: 'Blank', desc: 'Start fresh with an empty project' },
                  { value: 'demo' as const, label: 'Demo', desc: 'Load demo packaging machine with tags, screens, and alarms' },
                ]).map(opt => (
                  <label
                    key={opt.value}
                    className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                      formTemplate === opt.value
                        ? 'bg-[var(--hmi-accent-bg)] border-[var(--hmi-accent)]/50'
                        : 'bg-slate-800 border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="template"
                      checked={formTemplate === opt.value}
                      onChange={() => setFormTemplate(opt.value)}
                      className="mt-0.5 accent-blue-500"
                    />
                    <div>
                      <div className="text-sm text-white font-medium">{opt.label}</div>
                      <div className="text-xs text-slate-400">{opt.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowCreate(false)} className={btnSecondary}>Cancel</button>
              <button onClick={handleCreate} disabled={!formName.trim() || busy} className={btnPrimary}>
                {busy ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Delete Confirm */}
      {showDelete && selected && (
        <Dialog title="Delete Project File" onClose={() => setShowDelete(false)}>
          <p className="text-sm text-slate-300 mb-4">
            Delete <strong>{selected.project_name}</strong> ({selected.filename})? This permanently removes the file from disk.
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowDelete(false)} className={btnSecondary}>Cancel</button>
            <button onClick={handleDelete} className={btnDanger}>Delete</button>
          </div>
        </Dialog>
      )}

      {/* Open Confirm (unsaved changes) */}
      {showOpenConfirm && selected && activeFile && (
        <Dialog title="Switch Project" onClose={() => setShowOpenConfirm(false)}>
          <p className="text-sm text-slate-300 mb-4">
            Switch from <strong>{activeFile.project_name}</strong> to <strong>{selected.project_name}</strong>? There are unsaved changes:
          </p>
          {dirtyChanges.length > 0 && (
            <div className="bg-slate-900 rounded-md border border-slate-700 p-3 mb-4 max-h-64 overflow-y-auto space-y-1">
              {dirtyChanges.map(c => (
                <details key={c.section} className="group">
                  <summary className="flex items-center justify-between cursor-pointer py-1 hover:bg-slate-800/50 rounded px-1 -mx-1">
                    <span className="text-xs font-medium text-slate-300">{c.section}</span>
                    <span className="text-xs text-slate-400 space-x-2">
                      {c.added.length > 0 && (
                        <span className="text-green-400">+{c.added.length}</span>
                      )}
                      {c.removed.length > 0 && (
                        <span className="text-red-400">-{c.removed.length}</span>
                      )}
                      {c.modified.length > 0 && (
                        <span className="text-amber-400">~{c.modified.length}</span>
                      )}
                    </span>
                  </summary>
                  <div className="pl-3 pb-1 space-y-1">
                    {c.added.map(name => (
                      <div key={`a-${name}`} className="text-xs text-green-400">+ {name}</div>
                    ))}
                    {c.removed.map(name => (
                      <div key={`r-${name}`} className="text-xs text-red-400">- {name}</div>
                    ))}
                    {c.modified.map(m => (
                      <div key={`m-${m.name}`}>
                        <div className="text-xs text-amber-400">~ {m.name}</div>
                        {m.fields.map((f, i) => (
                          <div key={i} className="text-xs text-slate-500 pl-3 font-mono">{f}</div>
                        ))}
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowOpenConfirm(false)} className={btnSecondary} disabled={busy}>Cancel</button>
            <button
              onClick={() => handleOpen(selected.filename)}
              disabled={busy}
              className={btnSecondary}
            >
              {busy ? 'Working...' : 'Switch without saving'}
            </button>
            <button
              onClick={() => handleSaveAndOpen(selected.filename)}
              disabled={busy}
              className={btnPrimary}
            >
              {busy ? 'Working...' : 'Save & Switch'}
            </button>
          </div>
        </Dialog>
      )}

      {/* Discard Confirm */}
      {showDiscardConfirm && (
        <Dialog title="Discard Changes" onClose={() => setShowDiscardConfirm(false)}>
          <p className="text-sm text-slate-300 mb-4">
            Discard all unsaved changes and reload from the last save? This cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowDiscardConfirm(false)} className={btnSecondary} disabled={busy}>Cancel</button>
            <button onClick={handleDiscard} disabled={busy} className={btnDanger}>
              {busy ? 'Discarding...' : 'Discard Changes'}
            </button>
          </div>
        </Dialog>
      )}

      {/* Save As Dialog */}
      {showSaveAs && activeProjectId && (
        <SaveAsDialog
          activeProjectId={activeProjectId}
          currentName={activeFile?.project_name || ''}
          onClose={() => setShowSaveAs(false)}
          onSaved={() => {
            setShowSaveAs(false);
            setDirty(false);
            loadFiles();
            loadActiveProject();
            onProjectChanged?.();
          }}
        />
      )}

      {/* Import Wizard */}
      {showImport && (
        <ImportWizard
          projects={dbProjects}
          onClose={() => setShowImport(false)}
          onComplete={() => { setShowImport(false); loadFiles(); }}
        />
      )}
    </div>
  );
}
