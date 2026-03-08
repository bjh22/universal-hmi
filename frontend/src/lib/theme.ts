/** HMI theming — accent color + background preset applied via CSS custom properties. */

export interface ThemePreset {
  label: string;
  bgBody: string;
  bgSurface: string;
  bgElevated: string;
  bgInput: string;
  border: string;
  borderSubtle: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
}

export const THEME_PRESETS: Record<string, ThemePreset> = {
  slate: {
    label: 'Slate',
    bgBody: '#0f172a',
    bgSurface: '#0f172a',
    bgElevated: '#1e293b',
    bgInput: '#334155',
    border: '#334155',
    borderSubtle: '#475569',
    textPrimary: '#e2e8f0',
    textSecondary: '#94a3b8',
    textMuted: '#64748b',
  },
  zinc: {
    label: 'Zinc',
    bgBody: '#18181b',
    bgSurface: '#18181b',
    bgElevated: '#27272a',
    bgInput: '#3f3f46',
    border: '#3f3f46',
    borderSubtle: '#52525b',
    textPrimary: '#e4e4e7',
    textSecondary: '#a1a1aa',
    textMuted: '#71717a',
  },
  neutral: {
    label: 'Neutral',
    bgBody: '#171717',
    bgSurface: '#171717',
    bgElevated: '#262626',
    bgInput: '#404040',
    border: '#404040',
    borderSubtle: '#525252',
    textPrimary: '#e5e5e5',
    textSecondary: '#a3a3a3',
    textMuted: '#737373',
  },
  midnight: {
    label: 'Midnight',
    bgBody: '#020617',
    bgSurface: '#020617',
    bgElevated: '#0f172a',
    bgInput: '#1e293b',
    border: '#1e293b',
    borderSubtle: '#334155',
    textPrimary: '#e2e8f0',
    textSecondary: '#94a3b8',
    textMuted: '#64748b',
  },
  charcoal: {
    label: 'Charcoal',
    bgBody: '#111827',
    bgSurface: '#111827',
    bgElevated: '#1f2937',
    bgInput: '#374151',
    border: '#374151',
    borderSubtle: '#4b5563',
    textPrimary: '#f3f4f6',
    textSecondary: '#9ca3af',
    textMuted: '#6b7280',
  },
};

export const ACCENT_SWATCHES = [
  { label: 'Blue', hex: '#2563eb' },
  { label: 'Teal', hex: '#0d9488' },
  { label: 'Green', hex: '#16a34a' },
  { label: 'Amber', hex: '#d97706' },
  { label: 'Red', hex: '#dc2626' },
  { label: 'Purple', hex: '#7c3aed' },
  { label: 'Orange', hex: '#ea580c' },
  { label: 'Cyan', hex: '#0891b2' },
];

/** Parse hex to [r, g, b]. */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

/** Lighten a hex color by a 0–1 factor toward white. */
function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`;
}

/** Darken a hex color by a 0–1 factor toward black. */
function darken(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const dr = Math.round(r * (1 - amount));
  const dg = Math.round(g * (1 - amount));
  const db = Math.round(b * (1 - amount));
  return `#${dr.toString(16).padStart(2, '0')}${dg.toString(16).padStart(2, '0')}${db.toString(16).padStart(2, '0')}`;
}

/**
 * Apply theme CSS custom properties to document root.
 * Call on app startup and on live preview in settings.
 */
export function applyTheme(accent: string, presetName: string): void {
  const preset = THEME_PRESETS[presetName] || THEME_PRESETS.slate;
  const s = document.documentElement.style;

  // Accent colors
  s.setProperty('--hmi-accent', accent);
  s.setProperty('--hmi-accent-hover', lighten(accent, 0.15));
  s.setProperty('--hmi-accent-text', lighten(accent, 0.3));
  s.setProperty('--hmi-accent-dark', darken(accent, 0.15));
  const [r, g, b] = hexToRgb(accent);
  s.setProperty('--hmi-accent-bg', `rgba(${r},${g},${b},0.2)`);

  // Surface / background
  s.setProperty('--hmi-bg-body', preset.bgBody);
  s.setProperty('--hmi-bg-surface', preset.bgSurface);
  s.setProperty('--hmi-bg-elevated', preset.bgElevated);
  s.setProperty('--hmi-bg-input', preset.bgInput);
  s.setProperty('--hmi-border', preset.border);
  s.setProperty('--hmi-border-subtle', preset.borderSubtle);

  // Text
  s.setProperty('--hmi-text-primary', preset.textPrimary);
  s.setProperty('--hmi-text-secondary', preset.textSecondary);
  s.setProperty('--hmi-text-muted', preset.textMuted);
}

export const DEFAULT_ACCENT = '#2563eb';
export const DEFAULT_PRESET = 'slate';
