/**
 * SeverityIcon — renders an icon (critical/warning/info) for alarm severity.
 *
 * In industrial HMIs, alarms have a severity level that determines how urgently
 * operators need to respond. This component maps those severity levels to
 * color-coded Lucide icons used throughout the alarm UI.
 */
import { AlertCircle, AlertTriangle, Info } from 'lucide-react';
import type { AlarmData } from '../../types';

interface SeverityIconProps {
  severity: AlarmData['severity'];
  size?: number;
}

export function SeverityIcon({ severity, size = 16 }: SeverityIconProps) {
  switch (severity) {
    case 'critical':
      return <AlertCircle size={size} className="text-red-400 shrink-0" />;
    case 'warning':
      return <AlertTriangle size={size} className="text-yellow-400 shrink-0" />;
    default:
      return <Info size={size} className="text-blue-400 shrink-0" />;
  }
}
