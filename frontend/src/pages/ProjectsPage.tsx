import { useEffect, useState, useCallback } from 'react';
import {
  FolderOpen, Plus, Trash2, Edit, Download, Upload, Check, X,
  Package, Tag as TagIcon, Monitor, Database, ClipboardList, FolderInput,
  Server, ChevronDown, Copy, Search,
} from 'lucide-react';
import { api } from '../lib/api';
import { PROTOCOL_CONFIGS } from '../lib/protocolConfigs';
import type { ProjectData, ProjectDetail, UserData, MachineProfile, Tag, DataSourceData } from '../types';

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

  // Machine Profiles state
  const [profiles, setProfiles] = useState<MachineProfile[]>([]);
  const [profilesExpanded, setProfilesExpanded] = useState(false);
  const [showCreateProfile, setShowCreateProfile] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showCloneProfile, setShowCloneProfile] = useState(false);
  const [showDeleteProfile, setShowDeleteProfile] = useState(false);
  const [editingProfile, setEditingProfile] = useState<MachineProfile | null>(null);
  const [profileFormName, setProfileFormName] = useState('');
  const [profileFormDesc, setProfileFormDesc] = useState('');

  // Profile override editor state
  const [profileTab, setProfileTab] = useState<'datasources' | 'tags'>('datasources');
  const [profileOverrides, setProfileOverrides] = useState<{
    ds: Record<string, { config?: Record<string, unknown> }>;
    tags: Record<string, { address?: string }>;
  }>({ ds: {}, tags: {} });
  const [projectDataSources, setProjectDataSources] = useState<DataSourceData[]>([]);
  const [projectTags, setProjectTags] = useState<Tag[]>([]);
  const [tagFilter, setTagFilter] = useState('');

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

  const loadProfiles = useCallback(async (projectId: number) => {
    try {
      const data = await api.getProfiles(projectId);
      setProfiles(data);
    } catch {
      setProfiles([]);
    }
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  useEffect(() => {
    if (selectedId) {
      loadDetail(selectedId);
      loadProfiles(selectedId);
    } else {
      setDetail(null);
      setProfiles([]);
      setProfilesExpanded(false);
    }
  }, [selectedId, loadDetail, loadProfiles]);

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

  // ─── Machine Profile Handlers ───

  const handleCreateProfile = useCallback(async () => {
    if (!selectedId) return;
    try {
      await api.createProfile(selectedId, { name: profileFormName, description: profileFormDesc || undefined });
      setShowCreateProfile(false);
      setProfileFormName(''); setProfileFormDesc('');
      await loadProfiles(selectedId);
      await loadDetail(selectedId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create profile failed');
    }
  }, [selectedId, profileFormName, profileFormDesc, loadProfiles, loadDetail]);

  const handleUpdateProfile = useCallback(async () => {
    if (!selectedId || !editingProfile) return;
    try {
      await api.updateProfile(selectedId, editingProfile.id, {
        name: profileFormName,
        description: profileFormDesc || undefined,
        data_source_overrides: profileOverrides.ds,
        tag_overrides: profileOverrides.tags,
      });
      setShowEditProfile(false);
      await loadProfiles(selectedId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update profile failed');
    }
  }, [selectedId, editingProfile, profileFormName, profileFormDesc, profileOverrides, loadProfiles]);

  const handleDeleteProfile = useCallback(async () => {
    if (!selectedId || !editingProfile) return;
    try {
      await api.deleteProfile(selectedId, editingProfile.id);
      setShowDeleteProfile(false);
      setEditingProfile(null);
      await loadProfiles(selectedId);
      await loadDetail(selectedId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete profile failed');
    }
  }, [selectedId, editingProfile, loadProfiles, loadDetail]);

  const handleCloneProfile = useCallback(async () => {
    if (!selectedId || !editingProfile) return;
    try {
      await api.cloneProfile(selectedId, editingProfile.id, profileFormName);
      setShowCloneProfile(false);
      setProfileFormName('');
      await loadProfiles(selectedId);
      await loadDetail(selectedId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Clone profile failed');
    }
  }, [selectedId, editingProfile, profileFormName, loadProfiles, loadDetail]);

  const handleExportForMachine = useCallback(async (profile: MachineProfile) => {
    if (!selectedId) return;
    try {
      const data = await api.exportForMachine(selectedId, profile.id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const proj = projects.find(p => p.id === selectedId);
      a.href = url;
      a.download = `${proj?.name || 'project'}-${profile.name}.hmi.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    }
  }, [selectedId, projects]);

  const openEditProfile = useCallback(async (profile: MachineProfile) => {
    if (!selectedId) return;
    setEditingProfile(profile);
    setProfileFormName(profile.name);
    setProfileFormDesc(profile.description || '');
    setProfileOverrides({
      ds: profile.data_source_overrides,
      tags: profile.tag_overrides,
    });
    setProfileTab('datasources');
    setTagFilter('');
    try {
      const [dsList, tagList] = await Promise.all([
        api.getDataSources(selectedId),
        api.getTags(selectedId),
      ]);
      setProjectDataSources(dsList);
      setProjectTags(tagList);
    } catch { /* ignore */ }
    setShowEditProfile(true);
  }, [selectedId]);

  const openCloneProfile = useCallback((profile: MachineProfile) => {
    setEditingProfile(profile);
    setProfileFormName('');
    setShowCloneProfile(true);
  }, []);

  // ─── Override editor helpers ───

  const setDsOverride = useCallback((dsName: string, fieldKey: string, value: string, fieldType: string) => {
    setProfileOverrides(prev => {
      const newDs = { ...prev.ds };
      if (value === '') {
        // Remove this field override
        if (newDs[dsName]?.config) {
          const newConfig = { ...newDs[dsName].config };
          delete newConfig[fieldKey];
          if (Object.keys(newConfig).length === 0) {
            delete newDs[dsName];
          } else {
            newDs[dsName] = { config: newConfig };
          }
        }
      } else {
        const parsed = fieldType === 'number' ? Number(value) : value;
        newDs[dsName] = {
          config: { ...newDs[dsName]?.config, [fieldKey]: parsed },
        };
      }
      return { ...prev, ds: newDs };
    });
  }, []);

  const setTagOverride = useCallback((tagName: string, address: string) => {
    setProfileOverrides(prev => {
      const newTags = { ...prev.tags };
      if (address === '') {
        delete newTags[tagName];
      } else {
        newTags[tagName] = { address };
      }
      return { ...prev, tags: newTags };
    });
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
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
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
                  <div className="bg-slate-900 rounded-lg p-3 text-center">
                    <Server size={20} className="mx-auto text-cyan-400 mb-1" />
                    <div className="text-lg font-bold text-white">{detail.profile_count}</div>
                    <div className="text-xs text-slate-400">Profiles</div>
                  </div>
                </div>

                {/* Machine Profiles */}
                <div className="border border-slate-700 rounded-lg">
                  <button
                    onClick={() => setProfilesExpanded(!profilesExpanded)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-700/50 rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Server size={18} className="text-cyan-400" />
                      <span className="text-sm font-medium text-white">Machine Profiles</span>
                      <span className="text-xs bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">
                        {profiles.length}
                      </span>
                    </div>
                    <ChevronDown size={16} className={`text-slate-400 transition-transform ${profilesExpanded ? 'rotate-180' : ''}`} />
                  </button>

                  {profilesExpanded && (
                    <div className="px-4 pb-4 space-y-2">
                      {profiles.length === 0 ? (
                        <p className="text-xs text-slate-500 py-2">
                          No machine profiles. Create one to configure per-machine overrides for deployment.
                        </p>
                      ) : (
                        profiles.map(p => (
                          <div key={p.id} className="flex items-center justify-between bg-slate-900 rounded-md px-3 py-2">
                            <div className="min-w-0 flex-1">
                              <span className="text-sm text-white">{p.name}</span>
                              {p.description && <span className="text-xs text-slate-500 ml-2">{p.description}</span>}
                              <div className="text-xs text-slate-500 mt-0.5">
                                {Object.keys(p.data_source_overrides).length} data source override{Object.keys(p.data_source_overrides).length !== 1 ? 's' : ''},
                                {' '}{Object.keys(p.tag_overrides).length} tag override{Object.keys(p.tag_overrides).length !== 1 ? 's' : ''}
                              </div>
                            </div>
                            {canEdit && (
                              <div className="flex items-center gap-1 ml-2 shrink-0">
                                <button onClick={() => openEditProfile(p)} title="Edit overrides" className="p-1 hover:bg-slate-700 rounded">
                                  <Edit size={14} className="text-slate-400 hover:text-white" />
                                </button>
                                <button onClick={() => openCloneProfile(p)} title="Clone" className="p-1 hover:bg-slate-700 rounded">
                                  <Copy size={14} className="text-slate-400 hover:text-white" />
                                </button>
                                <button onClick={() => handleExportForMachine(p)} title="Export for machine" className="p-1 hover:bg-slate-700 rounded">
                                  <Download size={14} className="text-cyan-400 hover:text-cyan-300" />
                                </button>
                                <button onClick={() => { setEditingProfile(p); setShowDeleteProfile(true); }} title="Delete" className="p-1 hover:bg-slate-700 rounded">
                                  <Trash2 size={14} className="text-slate-400 hover:text-red-400" />
                                </button>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                      {canEdit && (
                        <button
                          onClick={() => { setProfileFormName(''); setProfileFormDesc(''); setShowCreateProfile(true); }}
                          className="w-full flex items-center justify-center gap-1 py-1.5 text-xs text-slate-400 hover:text-white border border-dashed border-slate-700 rounded-md hover:border-slate-500 transition-colors"
                        >
                          <Plus size={14} /> Add Profile
                        </button>
                      )}
                    </div>
                  )}
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

      {/* Create Profile Dialog */}
      {showCreateProfile && (
        <Dialog title="New Machine Profile" onClose={() => setShowCreateProfile(false)}>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Profile Name</label>
              <input value={profileFormName} onChange={e => setProfileFormName(e.target.value)}
                className={inputCls} placeholder="Machine 01" autoFocus />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Description</label>
              <input value={profileFormDesc} onChange={e => setProfileFormDesc(e.target.value)}
                className={inputCls} placeholder="Line 1, Bay 3" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowCreateProfile(false)} className={btnSecondary}>Cancel</button>
              <button onClick={handleCreateProfile} disabled={!profileFormName.trim()} className={btnPrimary}>Create</button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Edit Profile Dialog */}
      {showEditProfile && editingProfile && (
        <Dialog title={`Edit Profile: ${editingProfile.name}`} onClose={() => setShowEditProfile(false)} wide>
          <div className="space-y-4">
            {/* Name & Description */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Profile Name</label>
                <input value={profileFormName} onChange={e => setProfileFormName(e.target.value)}
                  className={inputCls} />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Description</label>
                <input value={profileFormDesc} onChange={e => setProfileFormDesc(e.target.value)}
                  className={inputCls} placeholder="Optional" />
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-slate-700">
              <button
                onClick={() => setProfileTab('datasources')}
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                  profileTab === 'datasources'
                    ? 'border-cyan-400 text-cyan-400'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                Data Source Overrides
              </button>
              <button
                onClick={() => setProfileTab('tags')}
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                  profileTab === 'tags'
                    ? 'border-cyan-400 text-cyan-400'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                Tag Address Overrides
              </button>
            </div>

            {/* Data Source Overrides Tab */}
            {profileTab === 'datasources' && (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {projectDataSources.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 text-center">No data sources in this project.</p>
                ) : (
                  projectDataSources.map(ds => {
                    const proto = PROTOCOL_CONFIGS[ds.protocol];
                    const fields = proto?.fields || [];
                    if (fields.length === 0) return null;
                    const dsConfig = (ds.config || {}) as Record<string, unknown>;
                    const dsOverride = profileOverrides.ds[ds.name]?.config || {};

                    return (
                      <div key={ds.id} className="bg-slate-900 rounded-md p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-white">{ds.name}</span>
                          <span className="text-xs bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">{proto?.label || ds.protocol}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {fields.map(field => (
                            <div key={field.key}>
                              <label className="text-xs text-slate-500">{field.label}</label>
                              <input
                                className={inputCls}
                                type={field.type === 'password' ? 'text' : field.type}
                                placeholder={String(dsConfig[field.key] ?? field.placeholder ?? '')}
                                value={String(dsOverride[field.key] ?? '')}
                                onChange={e => setDsOverride(ds.name, field.key, e.target.value, field.type)}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Tag Address Overrides Tab */}
            {profileTab === 'tags' && (
              <div className="space-y-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    className="w-full bg-slate-700 border border-slate-600 rounded-md pl-8 pr-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                    placeholder="Filter tags..."
                    value={tagFilter}
                    onChange={e => setTagFilter(e.target.value)}
                  />
                </div>
                <div className="max-h-80 overflow-y-auto space-y-1">
                  {projectTags
                    .filter(t => !tagFilter || t.name.toLowerCase().includes(tagFilter.toLowerCase()))
                    .map(tag => (
                      <div key={tag.id} className="flex items-center gap-2 bg-slate-900 rounded px-3 py-1.5">
                        <span className="text-xs text-white flex-1 truncate" title={tag.name}>{tag.name}</span>
                        <span className="text-xs text-slate-500 w-36 truncate shrink-0" title={tag.address || ''}>
                          {tag.address || '\u2014'}
                        </span>
                        <input
                          className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white w-48 shrink-0 outline-none focus:border-blue-500"
                          placeholder={tag.address || 'No base address'}
                          value={profileOverrides.tags[tag.name]?.address ?? ''}
                          onChange={e => setTagOverride(tag.name, e.target.value)}
                        />
                      </div>
                    ))}
                  {projectTags.length === 0 && (
                    <p className="text-xs text-slate-500 py-4 text-center">No tags in this project.</p>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-700">
              <button onClick={() => setShowEditProfile(false)} className={btnSecondary}>Cancel</button>
              <button onClick={handleUpdateProfile} disabled={!profileFormName.trim()} className={btnPrimary}>Save</button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Clone Profile Dialog */}
      {showCloneProfile && editingProfile && (
        <Dialog title="Clone Profile" onClose={() => setShowCloneProfile(false)}>
          <div className="space-y-3">
            <p className="text-sm text-slate-400">
              Clone <strong className="text-white">{editingProfile.name}</strong> with a new name:
            </p>
            <input value={profileFormName} onChange={e => setProfileFormName(e.target.value)}
              className={inputCls} placeholder="Machine 02" autoFocus />
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowCloneProfile(false)} className={btnSecondary}>Cancel</button>
              <button onClick={handleCloneProfile} disabled={!profileFormName.trim()} className={btnPrimary}>Clone</button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Delete Profile Confirm */}
      {showDeleteProfile && editingProfile && (
        <Dialog title="Delete Profile" onClose={() => setShowDeleteProfile(false)}>
          <p className="text-sm text-slate-300 mb-4">
            Delete machine profile <strong>{editingProfile.name}</strong>? This cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowDeleteProfile(false)} className={btnSecondary}>Cancel</button>
            <button onClick={handleDeleteProfile} className={btnDanger}>Delete</button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function Dialog({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className={`bg-slate-800 border border-slate-700 rounded-lg shadow-xl p-5 w-full mx-4 ${wide ? 'max-w-4xl' : 'max-w-md'}`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
