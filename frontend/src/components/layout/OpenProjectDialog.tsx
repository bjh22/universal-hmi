/**
 * OpenProjectDialog — modal dialog for opening a project from the projects
 * directory or uploading a .hmi.json file from disk (USB/email transfer).
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { X, FolderOpen, Upload, FileText, AlertTriangle } from 'lucide-react';
import { api } from '../../lib/api';
import type { ProjectFile } from '../../types';

interface OpenProjectDialogProps {
  dirty: boolean;
  activeProjectId: number | null;
  onClose: () => void;
  onProjectChanged: () => void;
  onSaveFirst: () => Promise<void>;
}

export function OpenProjectDialog({ dirty, activeProjectId, onClose, onProjectChanged, onSaveFirst }: OpenProjectDialogProps) {
  const [tab, setTab] = useState<'directory' | 'upload'>('directory');
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [confirmFile, setConfirmFile] = useState<ProjectFile | null>(null);
  const [uploadData, setUploadData] = useState<{ data: Record<string, unknown>; filename: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load file list
  useEffect(() => {
    api.listProjectFiles()
      .then(r => setFiles(r.files))
      .catch(() => setError('Failed to load project files'))
      .finally(() => setLoading(false));
  }, []);

  const doOpen = useCallback(async (filename: string) => {
    setOpening(true);
    setError(null);
    try {
      await api.openProjectFile(filename);
      onProjectChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open project');
      setOpening(false);
    }
  }, [onProjectChanged]);

  const handleFileClick = useCallback((file: ProjectFile) => {
    if (dirty) {
      setConfirmFile(file);
    } else {
      doOpen(file.filename);
    }
  }, [dirty, doOpen]);

  const handleConfirmOpen = useCallback(async (saveFirst: boolean) => {
    if (!confirmFile && !uploadData) return;
    if (saveFirst && activeProjectId) {
      await onSaveFirst();
    }
    const filename = confirmFile?.filename || uploadData?.filename;
    if (filename) {
      setConfirmFile(null);
      doOpen(filename);
    }
  }, [confirmFile, uploadData, activeProjectId, onSaveFirst, doOpen]);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.format_version) {
        setError('Not a valid .hmi.json project file');
        return;
      }
      // Write to projects directory via open-file — but we need to save it first
      // Use the import flow: save the file content, then open it
      const projectName = data.project?.name || file.name.replace(/\.hmi\.json$/, '').replace(/\.json$/, '');

      // For uploaded files, we'll use the open-file endpoint.
      // First we need to write the file to the projects dir via export, then open it.
      // Simpler: use the existing import flow but streamlined.
      // Actually, the cleanest approach: save to projects dir first, then open.
      // We don't have a "write file to projects dir" endpoint, so let's use
      // the import endpoint to create a project, then load it.
      if (dirty) {
        setUploadData({ data, filename: `${projectName}.hmi.json` });
        setConfirmFile({ filename: `${projectName}.hmi.json`, project_name: projectName, version: data.project?.version || '', description: '', size_bytes: 0, modified_at: '' });
      } else {
        setOpening(true);
        // Import as a new project and load it
        await api.importProjectSelective({
          data,
          nameOverride: projectName,
          defaultConflictResolution: 'overwrite',
        });
        // The import creates a project — now we need to load it
        // Re-fetch projects to find the new one and load it
        const projects = await api.getProjects();
        const newProject = projects.find(p => p.name === projectName);
        if (newProject) {
          await api.loadProject(newProject.id);
        }
        onProjectChanged();
      }
    } catch {
      setError('Failed to read file. Ensure it is a valid .hmi.json file.');
    }
  }, [dirty, onProjectChanged]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  };

  // Unsaved changes confirmation overlay
  if (confirmFile) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
        <div className="bg-[var(--hmi-bg-elevated)] border border-[var(--hmi-border)] rounded-lg shadow-xl p-5 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle size={24} className="text-yellow-400 shrink-0" />
            <h3 className="text-lg font-bold text-[var(--hmi-text-primary)]">Unsaved Changes</h3>
          </div>
          <p className="text-sm text-[var(--hmi-text-secondary)] mb-1">
            The current project has unsaved changes. Opening <strong className="text-[var(--hmi-text-primary)]">{confirmFile.project_name}</strong> will replace all current data.
          </p>
          <p className="text-sm text-[var(--hmi-text-muted)] mb-4">
            Would you like to save first?
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setConfirmFile(null)}
              className="px-4 py-2 text-sm text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)] rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => handleConfirmOpen(false)}
              className="px-4 py-2 text-sm font-medium text-red-400 border border-red-500/30 rounded hover:bg-red-500/10 transition-colors"
            >
              Don&apos;t Save
            </button>
            <button
              onClick={() => handleConfirmOpen(true)}
              className="px-4 py-2 text-sm font-medium bg-[var(--hmi-accent)] text-white rounded hover:brightness-110 transition"
            >
              Save & Open
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-[var(--hmi-bg-elevated)] border border-[var(--hmi-border)] rounded-lg shadow-xl w-full max-w-xl mx-4" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--hmi-border)]">
          <h3 className="text-lg font-bold text-[var(--hmi-text-primary)]">Open Project</h3>
          <button onClick={onClose} className="p-2.5 -m-1 rounded-md min-w-[44px] min-h-[44px] flex items-center justify-center text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)] hover:bg-[var(--hmi-bg-base)]">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--hmi-border)]">
          <button
            onClick={() => setTab('directory')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === 'directory'
                ? 'border-[var(--hmi-accent)] text-[var(--hmi-accent)]'
                : 'border-transparent text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)]'
            }`}
          >
            <FolderOpen size={16} />
            Projects Directory
          </button>
          <button
            onClick={() => setTab('upload')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === 'upload'
                ? 'border-[var(--hmi-accent)] text-[var(--hmi-accent)]'
                : 'border-transparent text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)]'
            }`}
          >
            <Upload size={16} />
            Upload File
          </button>
        </div>

        {/* Content */}
        <div className="p-4 min-h-[300px] max-h-[400px] overflow-y-auto">
          {error && (
            <div className="mb-3 px-3 py-2 rounded bg-red-500/10 border border-red-500/30 text-sm text-red-400">
              {error}
            </div>
          )}

          {tab === 'directory' && (
            <>
              {loading ? (
                <div className="flex items-center justify-center h-40 text-[var(--hmi-text-muted)] text-sm">Loading...</div>
              ) : files.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-[var(--hmi-text-muted)] text-sm gap-2">
                  <FolderOpen size={32} className="opacity-40" />
                  <span>No project files found</span>
                  <span className="text-xs">Save a project or upload a .hmi.json file to get started</span>
                </div>
              ) : (
                <div className="space-y-1">
                  {files.map(f => (
                    <button
                      key={f.filename}
                      onClick={() => handleFileClick(f)}
                      disabled={opening}
                      className="flex items-start gap-3 w-full px-3 py-3 rounded text-left hover:bg-[var(--hmi-bg-base)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors group"
                    >
                      <FileText size={20} className="text-[var(--hmi-accent)] mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-[var(--hmi-text-primary)] truncate">{f.project_name}</span>
                          {f.version && <span className="text-xs text-[var(--hmi-text-muted)]">v{f.version}</span>}
                        </div>
                        {f.description && (
                          <div className="text-xs text-[var(--hmi-text-muted)] truncate mt-0.5">{f.description}</div>
                        )}
                        <div className="text-xs text-[var(--hmi-text-muted)] mt-1">
                          {formatSize(f.size_bytes)} &middot; {formatDate(f.modified_at)}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'upload' && (
            <div className="flex flex-col items-center justify-center h-40 gap-4">
              <p className="text-sm text-[var(--hmi-text-secondary)]">
                Select a <code className="px-1.5 py-0.5 bg-[var(--hmi-bg-base)] rounded text-xs">.hmi.json</code> file from your computer
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.hmi.json"
                onChange={handleUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={opening}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-[var(--hmi-accent)] text-white rounded hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                <Upload size={16} />
                {opening ? 'Opening...' : 'Choose File'}
              </button>
              <p className="text-xs text-[var(--hmi-text-muted)]">
                This will replace all current project data
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        {opening && (
          <div className="px-4 py-3 border-t border-[var(--hmi-border)] flex items-center gap-2 text-sm text-[var(--hmi-accent)]">
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            Opening project...
          </div>
        )}
      </div>
    </div>
  );
}
