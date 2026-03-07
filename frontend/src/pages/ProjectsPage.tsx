import { useEffect, useState, useCallback } from 'react';
import {
  FolderOpen, Plus, Trash2, Edit, Download, Upload, Check, X,
  Package, Tag as TagIcon, Monitor, Database, ClipboardList, FolderInput,
} from 'lucide-react';
import { api } from '../lib/api';
import type { ProjectData, ProjectDetail, UserData } from '../types';

interface Props {
  user: UserData | null;
}

const inputCls = 'w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-sm text-white outline-none focus:border-blue-500';
const btnPrimary = 'bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors';
const btnSecondary = 'bg-slate-700 hover:bg-slate-600 text-slate-200 px-4 py-2 rounded-md text-sm font-medium transition-colors';
const btnDanger = 'bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors';

export function ProjectsPage({ user }: Props) {
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog state
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formVersion, setFormVersion] = useState('1.0.0');
  const [importData, setImportData] = useState<Record<string, unknown> | null>(null);
  const [importFileName, setImportFileName] = useState('');

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
    if (selectedId) loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  const handleCreate = useCallback(async () => {
    try {
      await api.createProject({ name: formName, description: formDesc || undefined, version: formVersion });
      setShowCreate(false);
      setFormName(''); setFormDesc(''); setFormVersion('1.0.0');
      await loadProjects();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    }
  }, [formName, formDesc, formVersion, loadProjects]);

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

  const handleActivate = useCallback(async (id: number) => {
    try {
      await api.activateProject(id);
      await loadProjects();
      if (selectedId === id) await loadDetail(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Activate failed');
    }
  }, [selectedId, loadProjects, loadDetail]);

  const handleDeactivate = useCallback(async (id: number) => {
    try {
      await api.deactivateProject(id);
      await loadProjects();
      if (selectedId === id) await loadDetail(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Deactivate failed');
    }
  }, [selectedId, loadProjects, loadDetail]);

  const handleAssignAll = useCallback(async (id: number) => {
    try {
      await api.assignAllToProject(id);
      await loadDetail(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Assign failed');
    }
  }, [loadDetail]);

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

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        setImportData(json);
      } catch {
        setError('Invalid JSON file');
        setImportData(null);
      }
    };
    reader.readAsText(file);
  }, []);

  const handleImport = useCallback(async () => {
    if (!importData) return;
    try {
      await api.importProject(importData);
      setShowImport(false);
      setImportData(null);
      setImportFileName('');
      await loadProjects();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    }
  }, [importData, loadProjects]);

  const openEdit = useCallback((p: ProjectData) => {
    setFormName(p.name);
    setFormDesc(p.description || '');
    setFormVersion(p.version);
    setShowEdit(true);
  }, []);

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
            <button onClick={() => { setFormName(''); setFormDesc(''); setFormVersion('1.0.0'); setShowCreate(true); }} className={btnPrimary}>
              <span className="flex items-center gap-1.5"><Plus size={16} /> New Project</span>
            </button>
          </div>
        )}
      </div>

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
          <p className="text-slate-500 text-sm mt-1">Create a project to organize your HMI configuration</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Project list */}
          <div className="lg:col-span-1 space-y-2">
            {projects.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  selectedId === p.id
                    ? 'bg-blue-600/20 border-blue-500/50'
                    : 'bg-slate-800 border-slate-700 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-white text-sm">{p.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">v{p.version}</span>
                    {p.is_active && (
                      <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">Active</span>
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
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-white">{detail.name}</h2>
                    {detail.description && <p className="text-sm text-slate-400 mt-1">{detail.description}</p>}
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-slate-500">Version {detail.version}</span>
                      <span className="text-xs text-slate-500">Created {new Date(detail.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  {detail.is_active && (
                    <span className="bg-green-500/20 text-green-400 px-2 py-1 rounded text-xs font-medium">Active</span>
                  )}
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
                    {!detail.is_active ? (
                      <button onClick={() => handleActivate(detail.id)} className={btnPrimary}>
                        <span className="flex items-center gap-1.5"><Check size={16} /> Set Active</span>
                      </button>
                    ) : (
                      <button onClick={() => handleDeactivate(detail.id)} className={btnSecondary}>
                        <span className="flex items-center gap-1.5"><X size={16} /> Deactivate</span>
                      </button>
                    )}
                    <button onClick={() => handleAssignAll(detail.id)} className={btnSecondary}>
                      <span className="flex items-center gap-1.5"><FolderInput size={16} /> Assign Unlinked</span>
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
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowCreate(false)} className={btnSecondary}>Cancel</button>
              <button onClick={handleCreate} disabled={!formName.trim()} className={btnPrimary}>Create</button>
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
            Delete <strong>{detail.name}</strong>? Resources (tags, screens, etc.) will be unlinked but not deleted.
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowDelete(false)} className={btnSecondary}>Cancel</button>
            <button onClick={handleDelete} className={btnDanger}>Delete</button>
          </div>
        </Dialog>
      )}

      {/* Import Dialog */}
      {showImport && (
        <Dialog title="Import Project" onClose={() => { setShowImport(false); setImportData(null); setImportFileName(''); }}>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Select .hmi.json file</label>
              <input
                type="file"
                accept=".json,.hmi.json"
                onChange={handleFileSelect}
                className="text-sm text-slate-300 file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-slate-700 file:text-slate-200 hover:file:bg-slate-600"
              />
            </div>
            {importData && (
              <div className="bg-slate-900 rounded-md p-3 text-xs space-y-1">
                <p className="text-slate-400">File: <span className="text-white">{importFileName}</span></p>
                <p className="text-slate-400">Project: <span className="text-white">{(importData.project as Record<string, unknown>)?.name as string || 'Unknown'}</span></p>
                <p className="text-slate-400">Version: <span className="text-white">{(importData.project as Record<string, unknown>)?.version as string || '?'}</span></p>
                <p className="text-slate-400">
                  Contents: {(importData.tags as unknown[])?.length || 0} tags,
                  {' '}{(importData.screens as unknown[])?.length || 0} screens,
                  {' '}{(importData.data_sources as unknown[])?.length || 0} data sources,
                  {' '}{(importData.jobs as unknown[])?.length || 0} jobs
                </p>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => { setShowImport(false); setImportData(null); setImportFileName(''); }} className={btnSecondary}>Cancel</button>
              <button onClick={handleImport} disabled={!importData} className={btnPrimary}>Import</button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-xl p-5 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
