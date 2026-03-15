import { useState } from 'react';
import { AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { Dialog } from './Dialog';
import type { AlarmData } from '../types';

interface FaultHelpDialogProps {
  alarm: AlarmData;
  onAcknowledge: () => Promise<void>;
  onDismiss: () => void;
}

const severityColors: Record<string, string> = {
  critical: 'text-red-400',
  warning: 'text-yellow-400',
  info: 'text-blue-400',
};

const severityBorders: Record<string, string> = {
  critical: 'border-red-500/40',
  warning: 'border-yellow-500/40',
  info: 'border-blue-500/40',
};

function SeverityIcon({ severity }: { severity: AlarmData['severity'] }) {
  switch (severity) {
    case 'critical':
      return <AlertCircle size={20} className="text-red-400 shrink-0" />;
    case 'warning':
      return <AlertTriangle size={20} className="text-yellow-400 shrink-0" />;
    default:
      return <Info size={20} className="text-blue-400 shrink-0" />;
  }
}

export function FaultHelpDialog({ alarm, onAcknowledge, onDismiss }: FaultHelpDialogProps) {
  const [acking, setAcking] = useState(false);

  const handleAcknowledge = async () => {
    setAcking(true);
    try {
      await onAcknowledge();
    } finally {
      setAcking(false);
    }
  };

  return (
    <Dialog title="Fault Help" onClose={onDismiss} wide>
      {/* Severity header */}
      <div className={`flex items-center gap-2 p-3 mb-4 rounded-lg border ${severityBorders[alarm.severity] || severityBorders.info} bg-[var(--hmi-bg-base)]`}>
        <SeverityIcon severity={alarm.severity} />
        <div className="flex-1 min-w-0">
          <div className={`font-semibold ${severityColors[alarm.severity] || severityColors.info}`}>
            {alarm.severity.charAt(0).toUpperCase() + alarm.severity.slice(1)} — {alarm.tag_display_name || alarm.tag_name}
          </div>
          <div className="text-sm text-[var(--hmi-text-secondary)]">{alarm.message}</div>
        </div>
      </div>

      {/* Help image */}
      {alarm.help_image && (
        <div className="flex justify-center mb-4 bg-[var(--hmi-bg-base)] rounded-lg p-2 border border-[var(--hmi-border)]">
          <img
            src={`/api/media/${alarm.help_image}`}
            alt="Fault help"
            className="max-w-full max-h-[400px] object-contain rounded"
          />
        </div>
      )}

      {/* Help text */}
      {alarm.help_text && (
        <div className="mb-4 p-3 bg-[var(--hmi-bg-base)] rounded-lg border border-[var(--hmi-border)]">
          <div className="text-xs font-medium text-[var(--hmi-text-secondary)] mb-1">Troubleshooting Steps</div>
          <div className="text-sm text-[var(--hmi-text-primary)] whitespace-pre-wrap">{alarm.help_text}</div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3 mt-2">
        <button
          onClick={onDismiss}
          className="px-4 py-2 text-sm rounded-lg border border-[var(--hmi-border)] text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)] hover:bg-[var(--hmi-bg-base)]"
        >
          Dismiss
        </button>
        {(alarm.state === 'active_unacked' || alarm.state === 'inactive_unacked') && (
          <button
            onClick={handleAcknowledge}
            disabled={acking}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {acking ? 'Acknowledging...' : 'Acknowledge'}
          </button>
        )}
      </div>
    </Dialog>
  );
}
