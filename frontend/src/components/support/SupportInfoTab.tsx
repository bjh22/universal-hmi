import { useState, useEffect, useCallback } from 'react';
import { Network, HardDrive, Usb, Monitor, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { api } from '../../lib/api';

interface NetworkAdapter {
  name: string;
  ip_addresses: string[];
  mac_address: string | null;
  is_up: boolean;
}

interface DiskInfo {
  path: string;
  label: string | null;
  total_gb: number;
  used_gb: number;
  free_gb: number;
  percent_used: number;
}

interface RemovableDrive {
  path: string;
  label: string | null;
  total_gb: number;
  free_gb: number;
}

interface TeamViewerInfo {
  installed: boolean;
  id: string | null;
  version: string | null;
  is_running: boolean;
}

interface SupportInfo {
  hostname: string;
  network_adapters: NetworkAdapter[];
  disks: DiskInfo[];
  removable_drives: RemovableDrive[];
  teamviewer: TeamViewerInfo;
}

export function SupportInfoTab() {
  const [info, setInfo] = useState<SupportInfo | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchInfo = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getSupportInfo();
      setInfo(data);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load support info');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchInfo(); }, [fetchInfo]);

  if (error) {
    return (
      <div className="max-w-3xl">
        <div className="bg-red-500/5 border border-red-500/30 rounded-xl p-4 text-sm text-red-400">{error}</div>
      </div>
    );
  }

  if (loading || !info) {
    return <div className="text-sm text-[var(--hmi-text-muted)] py-4">Loading system information...</div>;
  }

  return (
    <div className="max-w-3xl space-y-5">
      {/* Refresh button */}
      <div className="flex justify-end">
        <button
          onClick={fetchInfo}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--hmi-bg-elevated)] text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)] border border-[var(--hmi-border-subtle)] transition-colors"
        >
          <RefreshCw size={13} />
          Refresh
        </button>
      </div>

      {/* Hostname */}
      <div className="bg-[var(--hmi-bg-elevated)] rounded-xl border border-[var(--hmi-border)] p-5">
        <div className="flex items-center gap-2 mb-3">
          <Monitor size={16} className="text-[var(--hmi-text-muted)]" />
          <h2 className="text-sm font-semibold text-[var(--hmi-text-primary)]">Hostname</h2>
        </div>
        <span className="text-sm text-[var(--hmi-text-primary)] font-mono">{info.hostname}</span>
      </div>

      {/* Network Adapters */}
      <div className="bg-[var(--hmi-bg-elevated)] rounded-xl border border-[var(--hmi-border)] p-5">
        <div className="flex items-center gap-2 mb-3">
          <Network size={16} className="text-[var(--hmi-text-muted)]" />
          <h2 className="text-sm font-semibold text-[var(--hmi-text-primary)]">Network Adapters</h2>
        </div>
        {info.network_adapters.length === 0 ? (
          <p className="text-sm text-[var(--hmi-text-muted)]">No network adapters detected</p>
        ) : (
          <div className="space-y-3">
            {info.network_adapters.map((adapter, i) => (
              <div key={i} className="flex items-start gap-3 py-2 border-b border-[var(--hmi-border)]/50 last:border-0 last:pb-0">
                <div className="mt-0.5">
                  {adapter.is_up ? (
                    <Wifi size={14} className="text-green-400" />
                  ) : (
                    <WifiOff size={14} className="text-[var(--hmi-text-muted)]" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--hmi-text-primary)]">{adapter.name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      adapter.is_up
                        ? 'bg-green-500/10 text-green-400'
                        : 'bg-[var(--hmi-bg-base)] text-[var(--hmi-text-muted)]'
                    }`}>
                      {adapter.is_up ? 'Up' : 'Down'}
                    </span>
                  </div>
                  {adapter.ip_addresses.length > 0 ? (
                    <div className="mt-1 space-y-0.5">
                      {adapter.ip_addresses.map((ip, j) => (
                        <div key={j} className="text-sm font-mono text-[var(--hmi-text-secondary)]">{ip}</div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-[var(--hmi-text-muted)] mt-0.5">No IP address</div>
                  )}
                  {adapter.mac_address && (
                    <div className="text-xs text-[var(--hmi-text-muted)] mt-0.5 font-mono">{adapter.mac_address}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Disk Space */}
      <div className="bg-[var(--hmi-bg-elevated)] rounded-xl border border-[var(--hmi-border)] p-5">
        <div className="flex items-center gap-2 mb-3">
          <HardDrive size={16} className="text-[var(--hmi-text-muted)]" />
          <h2 className="text-sm font-semibold text-[var(--hmi-text-primary)]">Disk Space</h2>
        </div>
        {info.disks.length === 0 ? (
          <p className="text-sm text-[var(--hmi-text-muted)]">No disk information available</p>
        ) : (
          <div className="space-y-4">
            {info.disks.map((disk, i) => (
              <div key={i}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--hmi-text-primary)]">
                      {disk.label || disk.path}
                    </span>
                    <span className="text-xs text-[var(--hmi-text-muted)] font-mono">{disk.path}</span>
                  </div>
                  <span className="text-xs text-[var(--hmi-text-secondary)]">
                    {disk.free_gb} GB free of {disk.total_gb} GB
                  </span>
                </div>
                <div className="w-full h-2.5 bg-[var(--hmi-bg-base)] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      disk.percent_used > 90 ? 'bg-red-500' :
                      disk.percent_used > 75 ? 'bg-amber-500' :
                      'bg-[var(--hmi-accent)]'
                    }`}
                    style={{ width: `${Math.min(disk.percent_used, 100)}%` }}
                  />
                </div>
                <div className="text-xs text-[var(--hmi-text-muted)] mt-1">
                  {disk.used_gb} GB used ({disk.percent_used}%)
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Removable Drives */}
      <div className="bg-[var(--hmi-bg-elevated)] rounded-xl border border-[var(--hmi-border)] p-5">
        <div className="flex items-center gap-2 mb-3">
          <Usb size={16} className="text-[var(--hmi-text-muted)]" />
          <h2 className="text-sm font-semibold text-[var(--hmi-text-primary)]">Removable Drives</h2>
        </div>
        {info.removable_drives.length === 0 ? (
          <p className="text-sm text-[var(--hmi-text-muted)]">No removable drives detected</p>
        ) : (
          <div className="space-y-2">
            {info.removable_drives.map((drive, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-[var(--hmi-border)]/50 last:border-0 last:pb-0">
                <div className="flex items-center gap-2">
                  <Usb size={14} className="text-green-400" />
                  <span className="text-sm font-medium text-[var(--hmi-text-primary)]">{drive.label || drive.path}</span>
                  {drive.label && (
                    <span className="text-xs text-[var(--hmi-text-muted)] font-mono">{drive.path}</span>
                  )}
                </div>
                <span className="text-xs text-[var(--hmi-text-secondary)]">
                  {drive.free_gb} GB free of {drive.total_gb} GB
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* TeamViewer */}
      <div className="bg-[var(--hmi-bg-elevated)] rounded-xl border border-[var(--hmi-border)] p-5">
        <div className="flex items-center gap-2 mb-3">
          <Monitor size={16} className="text-[var(--hmi-text-muted)]" />
          <h2 className="text-sm font-semibold text-[var(--hmi-text-primary)]">TeamViewer</h2>
        </div>
        {!info.teamviewer.installed ? (
          <p className="text-sm text-[var(--hmi-text-muted)]">TeamViewer is not installed</p>
        ) : (
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div>
              <span className="text-[var(--hmi-text-muted)]">Status</span>
              <span className={`ml-2 inline-flex items-center gap-1.5 ${info.teamviewer.is_running ? 'text-green-400' : 'text-amber-400'}`}>
                <span className={`w-2 h-2 rounded-full ${info.teamviewer.is_running ? 'bg-green-400' : 'bg-amber-400'}`} />
                {info.teamviewer.is_running ? 'Running' : 'Not Running'}
              </span>
            </div>
            {info.teamviewer.id && (
              <div>
                <span className="text-[var(--hmi-text-muted)]">ID</span>
                <span className="ml-2 text-[var(--hmi-text-primary)] font-mono font-medium">{info.teamviewer.id}</span>
              </div>
            )}
            {info.teamviewer.version && (
              <div>
                <span className="text-[var(--hmi-text-muted)]">Version</span>
                <span className="ml-2 text-[var(--hmi-text-primary)] font-mono">{info.teamviewer.version}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
