import { useEffect, useState, useCallback } from 'react';
import {
  FolderOpen, Plus, Trash2, Edit, Download, Upload, Save, PlayCircle, X,
  Package, Tag as TagIcon, Monitor, Database, ClipboardList,
} from 'lucide-react';
import { api } from '../lib/api';
import { Dialog } from '../components/Dialog';
import { GitPanel } from '../components/GitPanel';
import { ImportWizard } from '../components/ImportWizard';
import type { ProjectData, ProjectDetail, UserData } from '../types';

interface Props {
  user: UserData | null;
}

const inputCls = 'w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-sm text-white outline-none focus:border-blue-500';
const btnPrimary = 'bg-[var(--hmi-accent)] hover:bg-[var(--hmi-accent-dark)] text-white px-4 py-2 rounded-md text-sm font-medium transition-colors';
const btnSecondary = 'bg-slate-700 hover:bg-slate-600 text-slate-200 px-4 py-2 rounded-md text-sm font-medium transition-colors';
const btnDanger = 'bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors';
const btnSuccess = 'bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors';

type CreateTemplate = 'empty' | 'blank' | 'demo';

export function ProjectsPage({ user }: Props) {
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Dialog state
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showLoadConfirm, setShowLoadConfirm] = useState(false);
  const [dirtyChanges, setDirtyChanges] = useState<{ section: string; added: string[]; removed: string[]; modified: { name: string; fields: string[] }[] }[]>([]);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formVersion, setFormVersion] = useState('1.0.0');
  const [formTemplate, setFormTemplate] = useState<CreateTemplate>('empty');

  const canEdit = user && (user.role === 'engineer' || user.role === 'designer');

  const loadProjects = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getProjects();
      setProjects(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: number) => {
    try {
      const d = await api.getProject(id);
      setDetail(d);
    } catch {
      setDetail(null);
    }
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  useEffect(() => {
    if (selectedId) {
      loadDetail(selectedId);
    } else {
      setDetail(null);
    }
  }, [selectedId, loadDetail]);

  const showSuccessMsg = useCallback((msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  }, []);

  const handleCreate = useCallback(async () => {
    try {
      setBusy(true);
      const data = { name: formName, description: formDesc || undefined, version: formVersion };
      let created: ProjectData;
      if (formTemplate === 'blank') {
        created = await api.createBlankProject(data);
      } else if (formTemplate === 'demo') {
        created = await api.createDemoProject(data);
      } else {
        created = await api.createProject(data);
      }
      setShowCreate(false);
      setFormName(''); setFormDesc(''); setFormVersion('1.0.0'); setFormTemplate('empty');
      await loadProjects();
      setSelectedId(created.id);
      if (formTemplate !== 'empty') {
        showSuccessMsg(`Project "${created.name}" created and loaded`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  }, [formName, formDesc, formVersion, formTemplate, loadProjects, showSuccessMsg]);

  const handleUpdate = useCallback(async () => {
    if (!selectedId) return;
    try {
      await api.updateProject(selectedId, { name: formName, description: formDesc, version: formVersion });
      setShowEdit(false);
      await loadProjects();
      await loadDetail(selectedId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    }
  }, [selectedId, formName, formDesc, formVersion, loadProjects, loadDetail]);

  const handleDelete = useCallback(async () => {
    if (!selectedId) return;
    try {
      await api.deleteProject(selectedId);
      setShowDelete(false);
      setSelectedId(null);
      setDetail(null);
      await loadProjects();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }, [selectedId, loadProjects]);

  const handleSave = useCallback(async (id: number) => {
    try {
      setBusy(true);
      await api.saveProject(id);
      await loadProjects();
      await loadDetail(id);
      showSuccessMsg('Project saved');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }, [loadProjects, loadDetail, showSuccessMsg]);

  const handleLoad = useCallback(async (id: number) => {
    try {
      setBusy(true);
      await api.loadProject(id);
      await loadProjects();
      await loadDetail(id);
      setShowLoadConfirm(false);
      showSuccessMsg('Project loaded');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setBusy(false);
    }
  }, [loadProjects, loadDetail, showSuccessMsg]);

  const handleSaveAndLoad = useCallback(async (saveId: number, loadId: number) => {
    try {
      setBusy(true);
      await api.saveProject(saveId);
      await api.loadProject(loadId);
      await loadProjects();
      await loadDetail(loadId);
      setShowLoadConfirm(false);
      showSuccessMsg('Saved current state and loaded project');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save & Load failed');
    } finally {
      setBusy(false);
    }
  }, [loadProjects, loadDetail, showSuccessMsg]);

  const handleExport = useCallback(async (id: number) => {
    try {
      const data = await api.exportProject(id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const proj = projects.find(p => p.id === id);
      a.href = url;
      a.download = `${proj?.name || 'project'}.hmi.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    }
  }, [projects]);

  const openEdit = useCallback((p: ProjectData) => {
    setFormName(p.name);
    setFormDesc(p.description || '');
    setFormVersion(p.version);
    setShowEdit(true);
  }, []);

  // Find which project currently has the most recent snapshot_saved_at (the "active" one)
  const activeProject = projects.find(p => p.is_active) || null;

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
            <button onClick={() => setShowImport(true)} className={btnSecondary}>
              <span className="flex items-center gap-1.5"><Upload size={16} /> Import</span>
            </button>
            <button onClick={() => { setFormName(''); setFormDesc(''); setFormVersion('1.0.0'); setFormTemplate('empty'); setShowCreate(true); }} className={btnPrimary}>
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
        <div className="text-slate-400 text-center py-12">Loading projects...</div>
      ) : projects.length === 0 ? (
        <div className="text-center py-12">
          <Package size={48} className="mx-auto text-slate-600 mb-3" />
          <p className="text-slate-400">No projects yet</p>
          <p className="text-slate-500 text-sm mt-1">Create a project to save your HMI configuration</p>
        </div>
      ) : (
        <>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Project list */}
          <div className="lg:col-span-1 space-y-2">
            {projects.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  selectedId === p.id
                    ? 'bg-[var(--hmi-accent-bg)] border-[var(--hmi-accent)]/50'
                    : 'bg-slate-800 border-slate-700 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-white text-sm flex items-center gap-1.5">
                    {p.name}
                    {p.is_active && (
                      <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded font-normal">Active</span>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">v{p.version}</span>
                    {p.has_snapshot && (
                      <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">Saved</span>
                    )}
                  </div>
                </div>
                {p.description && (
                  <p className="text-xs text-slate-400 mt-1 truncate">{p.description}</p>
                )}
              </button>
            ))}
          </div>

          {/* Detail panel */}
          <div className="lg:col-span-2">
            {detail ? (
              <div className="bg-slate-800 rounded-lg border border-slate-700 p-5 space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-white">{detail.name}</h2>
                  {detail.description && <p className="text-sm text-slate-400 mt-1">{detail.description}</p>}
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs text-slate-500">Version {detail.version}</span>
                    <span className="text-xs text-slate-500">Created {new Date(detail.created_at).toLocaleDateString()}</span>
                    {detail.snapshot_saved_at && (
                      <span className="text-xs text-slate-500">Last saved {new Date(detail.snapshot_saved_at).toLocaleString()}</span>
                    )}
                  </div>
                </div>

                {/* Resource counts */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-slate-900 rounded-lg p-3 text-center">
                    <TagIcon size={20} className="mx-auto text-blue-400 mb-1" />
                    <div className="text-lg font-bold text-white">{detail.tag_count}</div>
                    <div className="text-xs text-slate-400">Tags</div>
                  </div>
                  <div className="bg-slate-900 rounded-lg p-3 text-center">
                    <Monitor size={20} className="mx-auto text-purple-400 mb-1" />
                    <div className="text-lg font-bold text-white">{detail.screen_count}</div>
                    <div className="text-xs text-slate-400">Screens</div>
                  </div>
                  <div className="bg-slate-900 rounded-lg p-3 text-center">
                    <Database size={20} className="mx-auto text-amber-400 mb-1" />
                    <div className="text-lg font-bold text-white">{detail.data_source_count}</div>
                    <div className="text-xs text-slate-400">Data Sources</div>
                  </div>
                  <div className="bg-slate-900 rounded-lg p-3 text-center">
                    <ClipboardList size={20} className="mx-auto text-green-400 mb-1" />
                    <div className="text-lg font-bold text-white">{detail.job_count}</div>
                    <div className="text-xs text-slate-400">Jobs</div>
                  </div>
                </div>

                {/* Actions */}
                {canEdit && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-700">
                    <button onClick={() => handleSave(detail.id)} disabled={busy} className={btnSuccess}>
                      <span className="flex items-center gap-1.5"><Save size={16} /> Save</span>
                    </button>
                    <button
                      onClick={async () => {
                        if (activeProject && activeProject.id !== detail.id) {
                          try {
                            const result = await api.getActiveProjectDirty();
                            if (result.dirty) {
                              setDirtyChanges(result.changes);
                              setShowLoadConfirm(true);
                              return;
                            }
                          } catch {
                            setDirtyChanges([]);
                            setShowLoadConfirm(true);
                            return;
                          }
                        }
                        handleLoad(detail.id);
                      }}
                      disabled={busy || !detail.has_snapshot}
                      className={btnPrimary}
                      title={!detail.has_snapshot ? 'No saved snapshot to load' : undefined}
                    >
                      <span className="flex items-center gap-1.5"><PlayCircle size={16} /> Load</span>
                    </button>
                    <button onClick={() => handleExport(detail.id)} className={btnSecondary}>
                      <span className="flex items-center gap-1.5"><Download size={16} /> Export</span>
                    </button>
                    <button onClick={() => openEdit(detail)} className={btnSecondary}>
                      <span className="flex items-center gap-1.5"><Edit size={16} /> Edit</span>
                    </button>
                    <button onClick={() => setShowDelete(true)} className={btnDanger}>
                      <span className="flex items-center gap-1.5"><Trash2 size={16} /> Delete</span>
                    </button>
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
            onSaveFirst={async () => { if (activeProject) await api.saveProject(activeProject.id); }}
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
                  { value: 'empty' as const, label: 'Empty', desc: 'Just create the project label (no changes to current HMI)' },
                  { value: 'blank' as const, label: 'Blank', desc: 'Wipe all current tags, screens, and resources' },
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

      {/* Edit Dialog */}
      {showEdit && (
        <Dialog title="Edit Project" onClose={() => setShowEdit(false)}>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Name</label>
              <input value={formName} onChange={e => setFormName(e.target.value)} className={inputCls} autoFocus />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Description</label>
              <input value={formDesc} onChange={e => setFormDesc(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Version</label>
              <input value={formVersion} onChange={e => setFormVersion(e.target.value)} className={inputCls} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowEdit(false)} className={btnSecondary}>Cancel</button>
              <button onClick={handleUpdate} disabled={!formName.trim()} className={btnPrimary}>Save</button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Delete Confirm */}
      {showDelete && detail && (
        <Dialog title="Delete Project" onClose={() => setShowDelete(false)}>
          <p className="text-sm text-slate-300 mb-4">
            Delete <strong>{detail.name}</strong>? This removes the project and its saved snapshot. Current tags, screens, and resources are not affected.
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowDelete(false)} className={btnSecondary}>Cancel</button>
            <button onClick={handleDelete} className={btnDanger}>Delete</button>
          </div>
        </Dialog>
      )}

      {/* Load Confirm */}
      {showLoadConfirm && detail && activeProject && (
        <Dialog title="Switch Project" onClose={() => setShowLoadConfirm(false)}>
          <p className="text-sm text-slate-300 mb-4">
            Switch from <strong>{activeProject.name}</strong> to <strong>{detail.name}</strong>? There are unsaved changes:
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
            <button onClick={() => setShowLoadConfirm(false)} className={btnSecondary} disabled={busy}>Cancel</button>
            <button
              onClick={() => handleLoad(detail.id)}
              disabled={busy}
              className={btnSecondary}
            >
              {busy ? 'Working...' : 'Switch without saving'}
            </button>
            <button
              onClick={() => handleSaveAndLoad(activeProject.id, detail.id)}
              disabled={busy}
              className={btnPrimary}
            >
              {busy ? 'Working...' : 'Save & Switch'}
            </button>
          </div>
        </Dialog>
      )}

      {/* Import Wizard */}
      {showImport && (
        <ImportWizard
          projects={projects}
          onClose={() => setShowImport(false)}
          onComplete={() => { setShowImport(false); loadProjects(); }}
        />
      )}
    </div>
  );
}
