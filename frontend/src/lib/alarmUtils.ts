/**
 * alarmUtils — shared constants and helpers for alarm severity display.
 *
 * In industrial systems, alarms are categorized by severity (critical, warning, info).
 * Each severity maps to specific colors used for text, borders, and icons throughout
 * the HMI. These constants are centralized here to avoid duplication across components
 * like FaultHelpDialog and AppShell.
 */

/** Tailwind text color classes per alarm severity level */
export const severityColors: Record<string, string> = {
  critical: 'text-red-400',
  warning: 'text-yellow-400',
  info: 'text-blue-400',
};

/** Tailwind border color classes per alarm severity level */
export const severityBorders: Record<string, string> = {
  critical: 'border-red-500/40',
  warning: 'border-yellow-500/40',
  info: 'border-blue-500/40',
};
