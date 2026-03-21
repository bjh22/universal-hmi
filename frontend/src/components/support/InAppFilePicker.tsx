/**
 * InAppFilePicker — a touch-friendly file browser that replaces the OS file
 * dialog. Browses the server filesystem via /api/system/files/browse, showing
 * directories and .tar.gz/.zip update packages.
 *
 * Designed to fit within 1024×600 (5" Raspberry Pi displays) where the native
 * Raspberry Pi OS file dialog cannot fit.
 */
import { useState, useCallback, useEffect } from 'react';
import { Folder, FileArchive, ChevronUp, RefreshCw, HardDrive, X } from 'lucide-react';
import { api } from '../../lib/api';

interface BrowseEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
}

interface Props {
  /** Called when user selects a file. Receives the server-side absolute path. */
  onSelect: (path: string, name: string, sizeMb: number) => void;
  /** Called when user cancels / closes the picker. */
  onClose: () => void;
}

export function InAppFilePicker({ onSelect, onClose }: Props) {
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<BrowseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const browse = useCallback(async (path?: string) => {
    setLoading(true);
    setError('');
    try {
      const result = await api.browseFiles(path);
      setCurrentPath(result.current);
      setParentPath(result.parent);
      setEntries(result.entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to browse');
    } finally {
      setLoading(false);
    }
  }, []);

  // Browse home directory on mount
  useEffect(() => {
    browse();
  }, [browse]);

  const handleEntryClick = useCallback((entry: BrowseEntry) => {
    if (entry.is_dir) {
      browse(entry.path);
    } else {
      onSelect(entry.path, entry.name, entry.size / (1024 * 1024));
    }
  }, [browse, onSelect]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Quick-nav locations
  const quickNavs = [
    { label: 'Home', path: undefined },
    { label: '/media', path: '/media' },
    { label: '/mnt', path: '/mnt' },
    { label: '/tmp', path: '/tmp' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-[var(--hmi-bg-surface)] border border-[var(--hmi-border)] rounded-xl w-[90vw] max-w-2xl flex flex-col" style={{ maxHeight: '85vh' }}>
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--hmi-border)] shrink-0">
          <HardDrive size={18} className="text-[var(--hmi-accent-text)]" />
          <span className="text-sm font-semibold text-[var(--hmi-text-primary)]">Select Update Package</span>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="p-2 rounded hover:bg-[var(--hmi-bg-elevated)] text-[var(--hmi-text-muted)]"
          >
            <X size={18} />
          </button>
        </div>

        {/* Quick-nav bar */}
        <div className="flex items-center gap-1 px-3 py-2 border-b border-[var(--hmi-border)] shrink-0 overflow-x-auto">
          {quickNavs.map(nav => (
            <button
              key={nav.label}
              onClick={() => browse(nav.path)}
              className="px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap bg-[var(--hmi-bg-elevated)] text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)] hover:bg-[var(--hmi-border)]"
            >
              {nav.label}
            </button>
          ))}
        </div>

        {/* Current path + up button */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--hmi-border)] shrink-0">
          <button
            onClick={() => parentPath && browse(parentPath)}
            disabled={!parentPath}
            className="p-1.5 rounded hover:bg-[var(--hmi-bg-elevated)] text-[var(--hmi-text-secondary)] disabled:opacity-30"
            title="Go up"
          >
            <ChevronUp size={18} />
          </button>
          <span className="text-xs font-mono text-[var(--hmi-text-muted)] truncate flex-1" title={currentPath || ''}>
            {currentPath || '...'}
          </span>
          <button
            onClick={() => browse(currentPath || undefined)}
            className="p-1.5 rounded hover:bg-[var(--hmi-bg-elevated)] text-[var(--hmi-text-secondary)]"
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-sm text-[var(--hmi-text-muted)]">
              <RefreshCw size={16} className="animate-spin mr-2" /> Loading...
            </div>
          ) : error ? (
            <div className="px-4 py-4 text-sm text-red-400">{error}</div>
          ) : entries.length === 0 ? (
            <div className="px-4 py-8 text-sm text-[var(--hmi-text-muted)] text-center">
              No folders or update packages found here
            </div>
          ) : (
            <div className="divide-y divide-[var(--hmi-border)]/50">
              {entries.map(entry => (
                <button
                  key={entry.path}
                  onClick={() => handleEntryClick(entry)}
                  className="w-full flex items-center gap-3 px-4 py-3 min-h-[48px] text-left hover:bg-[var(--hmi-bg-elevated)] transition-colors"
                >
                  {entry.is_dir ? (
                    <Folder size={20} className="text-amber-400 shrink-0" />
                  ) : (
                    <FileArchive size={20} className="text-[var(--hmi-accent-text)] shrink-0" />
                  )}
                  <span className={`text-sm truncate flex-1 ${
                    entry.is_dir ? 'text-[var(--hmi-text-primary)]' : 'text-[var(--hmi-accent-text)] font-medium'
                  }`}>
                    {entry.name}
                  </span>
                  {!entry.is_dir && (
                    <span className="text-xs text-[var(--hmi-text-muted)] shrink-0">
                      {formatSize(entry.size)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-[var(--hmi-border)] shrink-0">
          <p className="text-xs text-[var(--hmi-text-muted)]">
            Tap a folder to open it. Tap a .tar.gz or .zip package to select it.
          </p>
        </div>
      </div>
    </div>
  );
}
