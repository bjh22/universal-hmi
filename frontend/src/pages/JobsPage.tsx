import { useEffect, useState } from 'react';
import { ClipboardList, Download, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import type { JobData } from '../types';

export function JobsPage() {
  const [jobs, setJobs] = useState<JobData[]>([]);
  const [selectedJob, setSelectedJob] = useState<JobData | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    loadJobs();
  }, []);

  const loadJobs = () => {
    api.getJobs().then(setJobs).catch(() => {});
  };

  const handleDownload = async (id: number) => {
    if (!window.confirm('Download this job to the machine?')) return;
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
    await api.createJob({ name: newName, setpoints: {} });
    setNewName('');
    setShowCreate(false);
    loadJobs();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-slate-100">Jobs</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
        >
          <Plus size={16} /> New Job
        </button>
      </div>

      {showCreate && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-4">
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Job name"
              className="flex-1 bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              autoFocus
            />
            <button onClick={handleCreate} className="px-4 py-2 bg-blue-600 rounded-md text-sm text-white">Create</button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 bg-slate-700 rounded-md text-sm text-slate-300">Cancel</button>
          </div>
        </div>
      )}

      <div className="flex gap-4">
        {/* Job list */}
        <div className="w-80 space-y-2">
          {jobs.map((job) => (
            <div
              key={job.id}
              onClick={() => setSelectedJob(job)}
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
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(job.id); }}
                  className="flex items-center gap-1 px-2 py-1 bg-red-600/20 text-red-400 rounded text-xs hover:bg-red-600/30"
                >
                  <Trash2 size={12} /> Delete
                </button>
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
            <h2 className="text-lg font-bold text-slate-100 mb-1">{selectedJob.name}</h2>
            <div className="text-xs text-slate-400 mb-4">
              Version {selectedJob.version} • Created by {selectedJob.created_by || 'unknown'} • {new Date(selectedJob.created_at).toLocaleString()}
            </div>
            <h3 className="text-sm font-medium text-slate-300 mb-2">Setpoints</h3>
            <div className="bg-slate-900 rounded-lg p-3">
              <pre className="text-xs text-slate-300 whitespace-pre-wrap">
                {JSON.stringify(JSON.parse(selectedJob.setpoints || '{}'), null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
