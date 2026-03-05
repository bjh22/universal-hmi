import { useEffect, useState, useCallback } from 'react';
import { ClipboardList, Download, Plus, Trash2, Edit, Copy, Upload, Save, X } from 'lucide-react';
import { api } from '../lib/api';
import type { JobData, UserData } from '../types';

interface Props {
  user: UserData | null;
}

export function JobsPage({ user }: Props) {
  const [jobs, setJobs] = useState<JobData[]>([]);
  const [selectedJob, setSelectedJob] = useState<JobData | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [editSetpoints, setEditSetpoints] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const userRole = user?.role || '';
  const canEdit = ['supervisor', 'engineer', 'designer'].includes(userRole);
  const canDelete = ['engineer', 'designer'].includes(userRole);

  useEffect(() => {
    loadJobs();
  }, []);

  const loadJobs = () => {
    api.getJobs().then(setJobs).catch(() => {});
  };

  const handleDownload = async (id: number) => {
    const job = jobs.find(j => j.id === id);
    if (!job) return;
    const setpoints = JSON.parse(job.setpoints || '{}');
    const params = Object.entries(setpoints).map(([k, v]) => `  ${k}: ${v}`).join('\n');
    if (!window.confirm(`Download job "${job.name}" to machine?\n\nParameters:\n${params || '(none)'}`)) return;
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

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await api.createJob({ name: newName, description: newDescription, setpoints: {} });
    setNewName('');
    setNewDescription('');
    setShowCreate(false);
    loadJobs();
  };

  const handleClone = async (job: JobData) => {
    const name = `${job.name} (copy)`;
    await api.createJob({
      name,
      description: job.description,
      setpoints: JSON.parse(job.setpoints || '{}'),
    });
    loadJobs();
  };

  const startEdit = (job: JobData) => {
    setEditMode(true);
    setEditSetpoints(JSON.stringify(JSON.parse(job.setpoints || '{}'), null, 2));
    setEditDescription(job.description || '');
  };

  const handleSaveEdit = async () => {
    if (!selectedJob) return;
    try {
      JSON.parse(editSetpoints); // validate JSON
    } catch {
      alert('Invalid JSON in setpoints');
      return;
    }
    await api.updateJob(selectedJob.id, {
      description: editDescription,
      setpoints: JSON.parse(editSetpoints),
    });
    setEditMode(false);
    loadJobs();
    // Refresh selected job
    const updated = await api.getJob(selectedJob.id);
    setSelectedJob(updated);
  };

  const handleExportJson = useCallback(() => {
    if (!selectedJob) return;
    const data = {
      name: selectedJob.name,
      description: selectedJob.description,
      version: selectedJob.version,
      setpoints: JSON.parse(selectedJob.setpoints || '{}'),
    };
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
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
          >
            <Plus size={16} /> New Job
          </button>
        )}
      </div>

      {showCreate && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-4">
          <div className="space-y-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Job name"
              className="w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              autoFocus
            />
            <input
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Description (optional)"
              className="w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
            />
            <div className="flex gap-2">
              <button onClick={handleCreate} className="px-4 py-2 bg-blue-600 rounded-md text-sm text-white">Create</button>
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 bg-slate-700 rounded-md text-sm text-slate-300">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-4">
        {/* Job list */}
        <div className="w-80 space-y-2">
          {jobs.map((job) => (
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
                <div className="font-medium text-slate-200 text-sm">{job.name}</div>
                <span className="text-xs text-slate-500">v{job.version}</span>
              </div>
              {job.description && (
                <div className="text-xs text-slate-400 mt-1">{job.description}</div>
              )}
              <div className="flex gap-2 mt-2">
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
          {jobs.length === 0 && (
            <div className="text-center text-slate-500 py-12">
              <ClipboardList size={32} className="mx-auto mb-2 opacity-50" />
              <p>No jobs created</p>
            </div>
          )}
        </div>

        {/* Job detail */}
        {selectedJob && (
          <div className="flex-1 bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-bold text-slate-100">{selectedJob.name}</h2>
              <div className="flex gap-2">
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
              Version {selectedJob.version} {'\u2022'} Created by {selectedJob.created_by || 'unknown'} {'\u2022'} {new Date(selectedJob.created_at).toLocaleString()}
            </div>

            {editMode ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-slate-400 font-medium">Description</label>
                  <input
                    value={editDescription}
                    onChange={e => setEditDescription(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-white outline-none focus:border-blue-500 mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium">Setpoints (JSON)</label>
                  <textarea
                    value={editSetpoints}
                    onChange={e => setEditSetpoints(e.target.value)}
                    rows={12}
                    className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-xs text-slate-300 font-mono outline-none focus:border-blue-500 mt-1"
                  />
                </div>
                <div className="flex gap-2">
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
                <div className="bg-slate-900 rounded-lg p-3">
                  <pre className="text-xs text-slate-300 whitespace-pre-wrap">
                    {JSON.stringify(JSON.parse(selectedJob.setpoints || '{}'), null, 2)}
                  </pre>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
