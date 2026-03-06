import { useEffect, useState, useCallback, useMemo } from 'react';
import { ClipboardList, Download, Plus, Trash2, Edit, Copy, Upload, Save, X, Search, History, Shield, ChevronDown, ChevronRight, Tag as TagIcon } from 'lucide-react';
import { api } from '../lib/api';
import type { JobData, JobHistoryEntry, Tag, UserData } from '../types';

interface Props {
  user: UserData | null;
}

const inputCls = 'w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-sm text-white outline-none focus:border-blue-500';

// ─── Setpoint Editor (structured tag picker) ───
function SetpointEditor({ value, onChange, tags }: {
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  tags: Tag[];
}) {
  const entries = Object.entries(value);

  const addRow = () => {
    onChange({ ...value, '': '' });
  };

  const updateKey = (oldKey: string, newKey: string, idx: number) => {
    const newObj: Record<string, unknown> = {};
    Object.entries(value).forEach(([k, v], i) => {
      newObj[i === idx ? newKey : k] = v;
    });
    onChange(newObj);
  };

  const updateValue = (key: string, val: string) => {
    const num = Number(val);
    onChange({ ...value, [key]: val === 'true' ? true : val === 'false' ? false : !isNaN(num) && val.trim() !== '' ? num : val });
  };

  const removeRow = (key: string) => {
    const copy = { ...value };
    delete copy[key];
    onChange(copy);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs text-slate-400 font-medium">Setpoints</label>
        <button type="button" onClick={addRow} className="text-xs text-blue-400 hover:text-blue-300">+ Add setpoint</button>
      </div>
      {entries.length === 0 && <p className="text-xs text-slate-500 italic">No setpoints defined</p>}
      {entries.map(([key, val], idx) => (
        <div key={idx} className="flex gap-2 items-center">
          <div className="flex-1">
            <input
              list="tag-names"
              value={key}
              onChange={e => updateKey(key, e.target.value, idx)}
              placeholder="Tag name"
              className={inputCls + ' text-xs'}
            />
          </div>
          <div className="w-32">
            <input
              value={String(val ?? '')}
              onChange={e => updateValue(key, e.target.value)}
              placeholder="Value"
              className={inputCls + ' text-xs'}
            />
          </div>
          <button type="button" onClick={() => removeRow(key)} className="p-1 text-slate-500 hover:text-red-400">
            <X size={14} />
          </button>
        </div>
      ))}
      <datalist id="tag-names">
        {tags.map(t => <option key={t.id} value={t.name} />)}
      </datalist>
    </div>
  );
}

// ─── Download Conditions Editor ───
function ConditionsEditor({ value, onChange, tags }: {
  value: { guards: { tag: string; value: unknown }[] };
  onChange: (v: { guards: { tag: string; value: unknown }[] }) => void;
  tags: Tag[];
}) {
  const guards = value.guards || [];

  const addGuard = () => {
    onChange({ guards: [...guards, { tag: '', value: '' }] });
  };

  const updateGuard = (idx: number, field: 'tag' | 'value', val: string) => {
    const updated = guards.map((g, i) => {
      if (i !== idx) return g;
      if (field === 'tag') return { ...g, tag: val };
      const num = Number(val);
      const parsed = val === 'true' ? true : val === 'false' ? false : !isNaN(num) && val.trim() !== '' ? num : val;
      return { ...g, value: parsed };
    });
    onChange({ guards: updated });
  };

  const removeGuard = (idx: number) => {
    onChange({ guards: guards.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs text-slate-400 font-medium">Download Conditions</label>
        <button type="button" onClick={addGuard} className="text-xs text-blue-400 hover:text-blue-300">+ Add guard</button>
      </div>
      <p className="text-[10px] text-slate-500">Tag must equal value before download is allowed</p>
      {guards.length === 0 && <p className="text-xs text-slate-500 italic">No conditions (always allowed)</p>}
      {guards.map((g, idx) => (
        <div key={idx} className="flex gap-2 items-center">
          <div className="flex-1">
            <input
              list="tag-names"
              value={g.tag}
              onChange={e => updateGuard(idx, 'tag', e.target.value)}
              placeholder="Tag name"
              className={inputCls + ' text-xs'}
            />
          </div>
          <span className="text-xs text-slate-500">=</span>
          <div className="w-28">
            <input
              value={String(g.value ?? '')}
              onChange={e => updateGuard(idx, 'value', e.target.value)}
              placeholder="Value"
              className={inputCls + ' text-xs'}
            />
          </div>
          <button type="button" onClick={() => removeGuard(idx)} className="p-1 text-slate-500 hover:text-red-400">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Version History Dialog ───
function HistoryDialog({ jobId, jobName, onRestore, onClose }: {
  jobId: number;
  jobName: string;
  onRestore: (setpoints: string) => void;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<JobHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    api.getJobHistory(jobId)
      .then(h => { setHistory(h); setLoading(false); })
      .catch(() => setLoading(false));
  }, [jobId]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-2xl max-h-[80vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-100">Version History: {jobName}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={20} /></button>
        </div>
        {loading && <p className="text-slate-400 text-sm py-4 text-center">Loading...</p>}
        {!loading && history.length === 0 && (
          <p className="text-slate-500 text-sm py-4 text-center">No previous versions</p>
        )}
        <div className="space-y-2">
          {history.map(h => (
            <div key={h.id} className="bg-slate-900 rounded-lg border border-slate-700">
              <button
                onClick={() => setExpanded(expanded === h.id ? null : h.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left"
              >
                {expanded === h.id ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                <span className="text-sm text-slate-200 font-medium">v{h.version}</span>
                <span className="text-xs text-slate-500">{h.job_name}</span>
                <span className="text-xs text-slate-500 ml-auto">{h.changed_by || 'unknown'} &middot; {new Date(h.changed_at).toLocaleString()}</span>
              </button>
              {expanded === h.id && (
                <div className="px-4 pb-3 border-t border-slate-700 pt-2">
                  <pre className="text-xs text-slate-400 bg-slate-950 rounded p-2 max-h-48 overflow-auto mb-2">
                    {JSON.stringify(JSON.parse(h.setpoints || '{}'), null, 2)}
                  </pre>
                  <button
                    onClick={() => { onRestore(h.setpoints); onClose(); }}
                    className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded"
                  >
                    Restore this version
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 bg-slate-700 rounded-lg text-sm text-slate-300">Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Upload from Machine Dialog ───
function UploadDialog({ tags, onClose, onUploaded }: {
  tags: Tag[];
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [name, setName] = useState('');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [tagSearch, setTagSearch] = useState('');
  const [uploading, setUploading] = useState(false);

  const writableTags = useMemo(() =>
    tags.filter(t => t.access_mode !== 'read' && !t.name.startsWith('$')),
    [tags]
  );

  // Auto-select tags labeled "Job Setpoint" on open
  useEffect(() => {
    const jobSetpointNames = new Set(
      writableTags
        .filter(t => t.labels?.some(l => l.name === 'Job Setpoint'))
        .map(t => t.name)
    );
    if (jobSetpointNames.size > 0) {
      setSelectedTags(jobSetpointNames);
    }
  }, [writableTags]);

  const filteredTags = useMemo(() => {
    if (!tagSearch) return writableTags;
    const q = tagSearch.toLowerCase();
    return writableTags.filter(t => t.name.toLowerCase().includes(q) || (t.group_name || '').toLowerCase().includes(q));
  }, [writableTags, tagSearch]);

  const toggleAll = () => {
    if (selectedTags.size === filteredTags.length) {
      setSelectedTags(new Set());
    } else {
      setSelectedTags(new Set(filteredTags.map(t => t.name)));
    }
  };

  const handleUpload = async () => {
    if (!name.trim() || selectedTags.size === 0) return;
    setUploading(true);
    try {
      await api.uploadJobFromMachine(name, Array.from(selectedTags));
      onUploaded();
      onClose();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-lg max-h-[80vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-100">Capture from Machine</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={20} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400">Job Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} className={inputCls + ' mt-1'} placeholder="e.g. Current Setup" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-slate-400">Select tags to capture ({selectedTags.size} selected)</label>
              <button type="button" onClick={toggleAll} className="text-xs text-blue-400 hover:text-blue-300">
                {selectedTags.size === filteredTags.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            <div className="relative mb-2">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={tagSearch}
                onChange={e => setTagSearch(e.target.value)}
                placeholder="Filter tags..."
                className="w-full bg-slate-700 border border-slate-600 rounded-md pl-7 pr-3 py-1.5 text-xs text-white outline-none"
              />
            </div>
            <div className="max-h-48 overflow-auto bg-slate-900 rounded-lg border border-slate-700 p-2 space-y-0.5">
              {filteredTags.map(t => (
                <label key={t.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-800 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={selectedTags.has(t.name)}
                    onChange={() => {
                      const next = new Set(selectedTags);
                      next.has(t.name) ? next.delete(t.name) : next.add(t.name);
                      setSelectedTags(next);
                    }}
                    className="accent-blue-500"
                  />
                  <span className="text-slate-300">{t.name}</span>
                  {t.labels?.map(l => (
                    <span key={l.id} className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: (l.color || '#6b7280') + '20', color: l.color || '#6b7280' }}>{l.name}</span>
                  ))}
                  {t.engineering_units && <span className="text-slate-600 ml-auto">{t.engineering_units}</span>}
                </label>
              ))}
              {filteredTags.length === 0 && <p className="text-slate-600 text-center py-2">No writable tags found</p>}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="px-4 py-2 bg-slate-700 rounded-lg text-sm text-slate-300">Cancel</button>
            <button
              onClick={handleUpload}
              disabled={uploading || !name.trim() || selectedTags.size === 0}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg text-sm text-white"
            >
              {uploading ? 'Capturing...' : 'Capture'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main JobsPage ───
export function JobsPage({ user }: Props) {
  const [jobs, setJobs] = useState<JobData[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedJob, setSelectedJob] = useState<JobData | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [editSetpoints, setEditSetpoints] = useState<Record<string, unknown>>({});
  const [editDescription, setEditDescription] = useState('');
  const [editConditions, setEditConditions] = useState<{ guards: { tag: string; value: unknown }[] }>({ guards: [] });
  const [jobSearch, setJobSearch] = useState('');

  const userRole = user?.role || '';
  const canEdit = ['supervisor', 'engineer', 'designer'].includes(userRole);
  const canDelete = ['engineer', 'designer'].includes(userRole);

  const loadJobs = useCallback(() => {
    api.getJobs().then(setJobs).catch(() => {});
  }, []);

  useEffect(() => { loadJobs(); }, [loadJobs]);
  useEffect(() => { api.getTags().then(setTags).catch(() => {}); }, []);

  const filteredJobs = useMemo(() => {
    if (!jobSearch) return jobs;
    const q = jobSearch.toLowerCase();
    return jobs.filter(j =>
      j.name.toLowerCase().includes(q) ||
      (j.description || '').toLowerCase().includes(q)
    );
  }, [jobs, jobSearch]);

  const handleDownload = async (id: number) => {
    const job = jobs.find(j => j.id === id);
    if (!job) return;
    const setpoints = JSON.parse(job.setpoints || '{}');
    const params = Object.entries(setpoints).map(([k, v]) => `  ${k}: ${v}`).join('\n');
    const conditions = job.download_conditions ? JSON.parse(job.download_conditions) : null;
    let msg = `Download job "${job.name}" to machine?\n\nSetpoints:\n${params || '(none)'}`;
    if (conditions?.guards?.length) {
      msg += `\n\nPre-conditions:\n${conditions.guards.map((g: any) => `  ${g.tag} = ${g.value}`).join('\n')}`;
    }
    if (!window.confirm(msg)) return;
    try {
      await api.downloadJob(id);
      alert('Job downloaded successfully');
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this job?')) return;
    await api.deleteJob(id);
    loadJobs();
    if (selectedJob?.id === id) setSelectedJob(null);
  };

  // Get default setpoints from tags labeled "Job Setpoint"
  const jobSetpointTags = useMemo(() =>
    tags.filter(t => t.labels?.some(l => l.name === 'Job Setpoint')),
    [tags]
  );

  const handleCreate = async () => {
    if (!newName.trim()) return;
    // Auto-populate setpoints from "Job Setpoint" labeled tags
    const defaultSetpoints: Record<string, unknown> = {};
    for (const t of jobSetpointTags) {
      defaultSetpoints[t.name] = '';
    }
    await api.createJob({ name: newName, description: newDescription, setpoints: defaultSetpoints });
    setNewName('');
    setNewDescription('');
    setShowCreate(false);
    loadJobs();
  };

  const handleClone = async (job: JobData) => {
    const name = `${job.name} (copy)`;
    const conditions = job.download_conditions ? JSON.parse(job.download_conditions) : null;
    await api.createJob({
      name,
      description: job.description,
      setpoints: JSON.parse(job.setpoints || '{}'),
      download_conditions: conditions,
    });
    loadJobs();
  };

  const startEdit = (job: JobData) => {
    setEditMode(true);
    setEditSetpoints(JSON.parse(job.setpoints || '{}'));
    setEditDescription(job.description || '');
    const conditions = job.download_conditions ? JSON.parse(job.download_conditions) : { guards: [] };
    setEditConditions(conditions);
  };

  const handleSaveEdit = async () => {
    if (!selectedJob) return;
    await api.updateJob(selectedJob.id, {
      name: selectedJob.name,
      description: editDescription,
      setpoints: editSetpoints,
      download_conditions: editConditions.guards.length > 0 ? editConditions : null,
    });
    setEditMode(false);
    loadJobs();
    const updated = await api.getJob(selectedJob.id);
    setSelectedJob(updated);
  };

  const handleRestore = async (setpoints: string) => {
    if (!selectedJob) return;
    await api.updateJob(selectedJob.id, {
      name: selectedJob.name,
      description: selectedJob.description,
      setpoints: JSON.parse(setpoints),
    });
    loadJobs();
    const updated = await api.getJob(selectedJob.id);
    setSelectedJob(updated);
  };

  const handleExportJson = useCallback(() => {
    if (!selectedJob) return;
    const data: Record<string, unknown> = {
      name: selectedJob.name,
      description: selectedJob.description,
      version: selectedJob.version,
      setpoints: JSON.parse(selectedJob.setpoints || '{}'),
    };
    if (selectedJob.download_conditions) {
      data.download_conditions = JSON.parse(selectedJob.download_conditions);
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedJob.name.replace(/\s+/g, '_')}_v${selectedJob.version}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [selectedJob]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-slate-100">Jobs</h1>
        {canEdit && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium"
            >
              <Upload size={16} /> Capture from Machine
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
            >
              <Plus size={16} /> New Job
            </button>
          </div>
        )}
      </div>

      {showCreate && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-4">
          <div className="space-y-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Job name"
              className={inputCls}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              autoFocus
            />
            <input
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Description (optional)"
              className={inputCls}
            />
            {jobSetpointTags.length > 0 && (
              <div className="flex items-start gap-1.5 text-xs text-slate-400 bg-slate-900 rounded-md px-3 py-2">
                <TagIcon size={12} className="mt-0.5 text-blue-400 flex-shrink-0" />
                <span>
                  Default setpoints from <span className="text-blue-400 font-medium">Job Setpoint</span> tags:{' '}
                  {jobSetpointTags.map(t => t.name).join(', ')}
                </span>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={handleCreate} className="px-4 py-2 bg-blue-600 rounded-md text-sm text-white">Create</button>
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 bg-slate-700 rounded-md text-sm text-slate-300">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-4">
        {/* Job list */}
        <div className="w-80 flex-shrink-0">
          <div className="relative mb-3">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search jobs..."
              value={jobSearch}
              onChange={e => setJobSearch(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-sm text-white outline-none focus:border-blue-500"
            />
          </div>
          <div className="space-y-2">
            {filteredJobs.map((job) => (
              <div
                key={job.id}
                onClick={() => { setSelectedJob(job); setEditMode(false); }}
                className={`p-3 rounded-xl border cursor-pointer transition-colors ${
                  selectedJob?.id === job.id
                    ? 'bg-blue-600/10 border-blue-500/30'
                    : 'bg-slate-800 border-slate-700 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium text-slate-200 text-sm truncate">{job.name}</div>
                  <span className="text-xs text-slate-500 flex-shrink-0 ml-2">v{job.version}</span>
                </div>
                {job.description && (
                  <div className="text-xs text-slate-400 mt-1 truncate">{job.description}</div>
                )}
                <div className="flex gap-2 mt-2 flex-wrap">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDownload(job.id); }}
                    className="flex items-center gap-1 px-2 py-1 bg-green-600/20 text-green-400 rounded text-xs hover:bg-green-600/30"
                  >
                    <Download size={12} /> Download
                  </button>
                  {canEdit && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleClone(job); }}
                      className="flex items-center gap-1 px-2 py-1 bg-blue-600/20 text-blue-400 rounded text-xs hover:bg-blue-600/30"
                    >
                      <Copy size={12} /> Clone
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(job.id); }}
                      className="flex items-center gap-1 px-2 py-1 bg-red-600/20 text-red-400 rounded text-xs hover:bg-red-600/30"
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
            {filteredJobs.length === 0 && jobs.length > 0 && (
              <p className="text-center text-slate-500 py-4 text-sm">No matching jobs</p>
            )}
            {jobs.length === 0 && (
              <div className="text-center text-slate-500 py-12">
                <ClipboardList size={32} className="mx-auto mb-2 opacity-50" />
                <p>No jobs created</p>
              </div>
            )}
          </div>
        </div>

        {/* Job detail */}
        {selectedJob && (
          <div className="flex-1 bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-bold text-slate-100">{selectedJob.name}</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowHistory(true)}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-md text-xs text-slate-300"
                  title="Version history"
                >
                  <History size={14} /> History
                </button>
                {canEdit && !editMode && (
                  <button
                    onClick={() => startEdit(selectedJob)}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-md text-xs text-slate-300"
                  >
                    <Edit size={14} /> Edit
                  </button>
                )}
                <button
                  onClick={handleExportJson}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-md text-xs text-slate-300"
                >
                  <Upload size={14} /> Export JSON
                </button>
              </div>
            </div>
            <div className="text-xs text-slate-400 mb-4">
              Version {selectedJob.version} &middot; Created by {selectedJob.created_by || 'unknown'} &middot; {new Date(selectedJob.created_at).toLocaleString()}
            </div>

            {editMode ? (
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-slate-400 font-medium">Description</label>
                  <input
                    value={editDescription}
                    onChange={e => setEditDescription(e.target.value)}
                    className={inputCls + ' mt-1'}
                  />
                </div>
                <SetpointEditor value={editSetpoints} onChange={setEditSetpoints} tags={tags} />
                <ConditionsEditor value={editConditions} onChange={setEditConditions} tags={tags} />
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleSaveEdit}
                    className="flex items-center gap-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-sm text-white"
                  >
                    <Save size={14} /> Save
                  </button>
                  <button
                    onClick={() => setEditMode(false)}
                    className="flex items-center gap-1 px-4 py-2 bg-slate-700 rounded-md text-sm text-slate-300"
                  >
                    <X size={14} /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                {selectedJob.description && (
                  <p className="text-sm text-slate-400 mb-3">{selectedJob.description}</p>
                )}

                <h3 className="text-sm font-medium text-slate-300 mb-2">Setpoints</h3>
                {(() => {
                  const sp = JSON.parse(selectedJob.setpoints || '{}');
                  const entries = Object.entries(sp);
                  if (entries.length === 0) return <p className="text-xs text-slate-500 italic mb-3">No setpoints</p>;
                  return (
                    <div className="bg-slate-900 rounded-lg border border-slate-700 mb-3 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-700 text-slate-500">
                            <th className="text-left px-3 py-2 font-medium text-xs">Tag</th>
                            <th className="text-right px-3 py-2 font-medium text-xs">Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {entries.map(([k, v]) => (
                            <tr key={k} className="border-b border-slate-700/50">
                              <td className="px-3 py-1.5 text-slate-300 font-mono text-xs">{k}</td>
                              <td className="px-3 py-1.5 text-slate-200 text-right text-xs">{String(v)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}

                {selectedJob.download_conditions && (() => {
                  const conds = JSON.parse(selectedJob.download_conditions);
                  const guards = conds?.guards || [];
                  if (guards.length === 0) return null;
                  return (
                    <>
                      <h3 className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-1.5">
                        <Shield size={14} className="text-yellow-400" /> Download Conditions
                      </h3>
                      <div className="bg-slate-900 rounded-lg border border-slate-700 mb-3 overflow-hidden">
                        <table className="w-full text-sm">
                          <tbody>
                            {guards.map((g: any, i: number) => (
                              <tr key={i} className="border-b border-slate-700/50">
                                <td className="px-3 py-1.5 text-slate-300 font-mono text-xs">{g.tag}</td>
                                <td className="px-3 py-1.5 text-xs text-slate-500">=</td>
                                <td className="px-3 py-1.5 text-slate-200 text-xs">{String(g.value)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  );
                })()}
              </>
            )}
          </div>
        )}
      </div>

      {/* Dialogs */}
      {showUpload && <UploadDialog tags={tags} onClose={() => setShowUpload(false)} onUploaded={loadJobs} />}
      {showHistory && selectedJob && (
        <HistoryDialog jobId={selectedJob.id} jobName={selectedJob.name} onRestore={handleRestore} onClose={() => setShowHistory(false)} />
      )}
    </div>
  );
}
