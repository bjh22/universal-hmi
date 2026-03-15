import { useState, useCallback, useEffect, useRef } from 'react';
import { HardDriveUpload, CheckCircle2, AlertTriangle, RefreshCw, Upload, X } from 'lucide-react';
import { api } from '../../lib/api';

interface SystemInfo {
  app_version: string;
  platform: string;
  python_version: string;
  install_path: string;
  database_path: string;
  is_compiled: boolean;
  uptime_seconds: number | null;
}

interface ValidationResult {
  valid: boolean;
  is_compiled: boolean;
  has_backend: boolean;
  has_frontend: boolean;
  has_wheels: boolean;
  has_windows_wheels: boolean;
  file_count: number;
  package_size_mb: number;
  error: string | null;
}

interface UpdateResult {
  success: boolean;
  message: string;
  updated_backend: boolean;
  updated_frontend: boolean;
  updated_dependencies: boolean;
  restart_scheduled: boolean;
}

export function SystemUpdateTab({ canManage }: { canManage: boolean }) {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [infoError, setInfoError] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [validating, setValidating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [updateResult, setUpdateResult] = useState<UpdateResult | null>(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load system info on mount
  useEffect(() => {
    api.getSystemInfo()
      .then(setSystemInfo)
      .catch(e => setInfoError(e.message));
  }, []);

  const formatUptime = useCallback((seconds: number | null) => {
    if (seconds == null) return 'Unknown';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }, []);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setValidation(null);
    setUpdateResult(null);
    setError('');

    // Auto-validate
    setValidating(true);
    try {
      const result = await api.validateUpdatePackage(file);
      setValidation(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation failed');
    } finally {
      setValidating(false);
    }
  }, []);

  const handleApply = useCallback(async () => {
    if (!selectedFile || !validation?.valid) return;
    if (!confirm('Apply this update? The system will restart automatically after the update is applied.\n\nYour database (trends, jobs, screens, alarms) will be preserved.')) return;

    setApplying(true);
    setError('');
    setUpdateResult(null);
    try {
      const result = await api.applyUpdatePackage(selectedFile);
      setUpdateResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setApplying(false);
    }
  }, [selectedFile, validation]);

  const handleClear = useCallback(() => {
    setSelectedFile(null);
    setValidation(null);
    setUpdateResult(null);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  return (
    <div className="max-w-2xl space-y-6">
      {/* System Information */}
      <div className="bg-[var(--hmi-bg-elevated)] rounded-xl border border-[var(--hmi-border)] p-5">
        <h2 className="text-sm font-semibold text-[var(--hmi-text-primary)] mb-3">System Information</h2>
        {infoError ? (
          <p className="text-sm text-red-400">{infoError}</p>
        ) : systemInfo ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div>
              <span className="text-[var(--hmi-text-muted)]">Version</span>
              <span className="ml-2 text-[var(--hmi-text-primary)] font-mono">{systemInfo.app_version}</span>
            </div>
            <div>
              <span className="text-[var(--hmi-text-muted)]">Uptime</span>
              <span className="ml-2 text-[var(--hmi-text-primary)]">{formatUptime(systemInfo.uptime_seconds)}</span>
            </div>
            <div>
              <span className="text-[var(--hmi-text-muted)]">Platform</span>
              <span className="ml-2 text-[var(--hmi-text-primary)]">{systemInfo.platform}</span>
            </div>
            <div>
              <span className="text-[var(--hmi-text-muted)]">Python</span>
              <span className="ml-2 text-[var(--hmi-text-primary)] font-mono">{systemInfo.python_version}</span>
            </div>
            <div>
              <span className="text-[var(--hmi-text-muted)]">Install Type</span>
              <span className="ml-2 text-[var(--hmi-text-primary)]">{systemInfo.is_compiled ? 'Compiled' : 'Source'}</span>
            </div>
            <div className="col-span-2">
              <span className="text-[var(--hmi-text-muted)]">Install Path</span>
              <span className="ml-2 text-[var(--hmi-text-primary)] font-mono text-xs">{systemInfo.install_path}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[var(--hmi-text-muted)]">Loading...</p>
        )}
      </div>

      {/* Update Package Upload */}
      {canManage && (
        <div className="bg-[var(--hmi-bg-elevated)] rounded-xl border border-[var(--hmi-border)] p-5">
          <h2 className="text-sm font-semibold text-[var(--hmi-text-primary)] mb-1">Apply Software Update</h2>
          <p className="text-xs text-[var(--hmi-text-muted)] mb-4">
            Upload a deployment package (.tar.gz or .zip) from a USB drive or local folder.
            Your database, configuration, trends, jobs, and screens are preserved.
          </p>

          {/* File picker */}
          <div className="mb-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".tar.gz,.zip,.gz"
              onChange={handleFileSelect}
              className="hidden"
              id="update-file-input"
            />
            <div className="flex gap-2 items-center">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={applying}
                className="flex items-center gap-2 px-4 py-2.5 bg-[var(--hmi-bg-input)] hover:bg-[var(--hmi-border-subtle)] disabled:opacity-50 text-[var(--hmi-text-primary)] rounded-lg text-sm font-medium border border-[var(--hmi-border-subtle)]"
              >
                <HardDriveUpload size={16} />
                {selectedFile ? 'Choose Different Package' : 'Select Update Package'}
              </button>
              {selectedFile && (
                <>
                  <span className="text-sm text-[var(--hmi-text-secondary)] font-mono truncate max-w-xs">{selectedFile.name}</span>
                  <span className="text-xs text-[var(--hmi-text-muted)]">({(selectedFile.size / (1024 * 1024)).toFixed(1)} MB)</span>
                  <button onClick={handleClear} className="text-[var(--hmi-text-muted)] hover:text-[var(--hmi-text-secondary)] ml-1" title="Clear">
                    <X size={16} />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Validating spinner */}
          {validating && (
            <div className="flex items-center gap-2 text-sm text-[var(--hmi-text-secondary)] mb-4">
              <RefreshCw size={14} className="animate-spin" /> Validating package...
            </div>
          )}

          {/* Validation results */}
          {validation && !validating && (
            <div className={`rounded-lg border p-4 mb-4 ${
              validation.valid
                ? 'bg-green-500/5 border-green-500/30'
                : 'bg-red-500/5 border-red-500/30'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                {validation.valid ? (
                  <CheckCircle2 size={16} className="text-green-400" />
                ) : (
                  <AlertTriangle size={16} className="text-red-400" />
                )}
                <span className={`text-sm font-medium ${validation.valid ? 'text-green-400' : 'text-red-400'}`}>
                  {validation.valid ? 'Package is valid' : 'Package validation failed'}
                </span>
              </div>
              {validation.valid ? (
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs ml-6">
                  <div className="text-[var(--hmi-text-secondary)]">
                    Package type: <span className="text-[var(--hmi-text-primary)]">{validation.is_compiled ? 'Compiled' : 'Source'}</span>
                  </div>
                  <div className="text-[var(--hmi-text-secondary)]">
                    Backend code: <span className={validation.has_backend ? 'text-green-400' : 'text-[var(--hmi-text-muted)]'}>{validation.has_backend ? 'Included' : 'Not included'}</span>
                  </div>
                  <div className="text-[var(--hmi-text-secondary)]">
                    Frontend build: <span className={validation.has_frontend ? 'text-green-400' : 'text-[var(--hmi-text-muted)]'}>{validation.has_frontend ? 'Included' : 'Not included'}</span>
                  </div>
                  {!validation.is_compiled && (
                    <div className="text-[var(--hmi-text-secondary)]">
                      Python wheels: <span className={validation.has_wheels ? 'text-green-400' : 'text-[var(--hmi-text-muted)]'}>{validation.has_wheels ? 'Included' : 'Not included'}</span>
                    </div>
                  )}
                  <div className="text-[var(--hmi-text-secondary)]">
                    Files: <span className="text-[var(--hmi-text-secondary)]">{validation.file_count}</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-red-300 ml-6">{validation.error}</p>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-lg border bg-red-500/5 border-red-500/30 p-3 mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-red-400 flex-shrink-0" />
                <p className="text-sm text-red-300">{error}</p>
              </div>
            </div>
          )}

          {/* Apply button */}
          {validation?.valid && !updateResult && (
            <button
              onClick={handleApply}
              disabled={applying}
              className="flex items-center gap-2 px-5 py-2.5 bg-[var(--hmi-accent)] hover:bg-[var(--hmi-accent-dark)] disabled:opacity-50 text-white rounded-lg text-sm font-medium"
            >
              {applying ? (
                <>
                  <RefreshCw size={16} className="animate-spin" /> Applying Update...
                </>
              ) : (
                <>
                  <Upload size={16} /> Apply Update
                </>
              )}
            </button>
          )}

          {/* Update result */}
          {updateResult && (
            <div className={`rounded-lg border p-4 ${
              updateResult.success
                ? 'bg-green-500/5 border-green-500/30'
                : 'bg-red-500/5 border-red-500/30'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                {updateResult.success ? (
                  <CheckCircle2 size={16} className="text-green-400" />
                ) : (
                  <AlertTriangle size={16} className="text-red-400" />
                )}
                <span className={`text-sm font-medium ${updateResult.success ? 'text-green-400' : 'text-red-400'}`}>
                  {updateResult.message}
                </span>
              </div>
              <div className="text-xs text-[var(--hmi-text-secondary)] ml-6 space-y-0.5">
                {updateResult.updated_backend && <div>Backend code updated</div>}
                {updateResult.updated_frontend && <div>Frontend assets updated</div>}
                {updateResult.updated_dependencies && <div>Python dependencies updated</div>}
                {updateResult.restart_scheduled && (
                  <div className="text-amber-400 mt-2 font-medium">
                    The system is restarting. This page will reload automatically when the server is back online.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Data preservation notice */}
      <div className="bg-[var(--hmi-bg-elevated)]/50 rounded-xl border border-[var(--hmi-border)]/50 p-5">
        <h3 className="text-xs font-semibold text-[var(--hmi-text-secondary)] uppercase tracking-wider mb-3">What happens during an update</h3>
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <div className="text-green-400 font-medium mb-1.5">Preserved (never overwritten)</div>
            <ul className="text-[var(--hmi-text-secondary)] space-y-1">
              <li>Database (trends, jobs, screens, alarms, users, audit trail)</li>
              <li>Configuration (.env file)</li>
              <li>Service registration (systemd / NSSM)</li>
            </ul>
          </div>
          <div>
            <div className="text-amber-400 font-medium mb-1.5">Replaced (updated)</div>
            <ul className="text-[var(--hmi-text-secondary)] space-y-1">
              {systemInfo?.is_compiled ? (
                <>
                  <li>Application binary and runtime</li>
                  <li>Frontend UI assets (bundled)</li>
                </>
              ) : (
                <>
                  <li>Backend application code</li>
                  <li>Frontend UI assets</li>
                  <li>Python dependencies (if new wheels included)</li>
                </>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
