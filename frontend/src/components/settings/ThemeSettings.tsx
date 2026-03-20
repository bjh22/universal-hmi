import { useState, useCallback, useRef } from 'react';
import { Plus, Trash2, Edit3, Check, X } from 'lucide-react';
import { api } from '../../lib/api';
import {
  THEME_PRESETS, ACCENT_SWATCHES, applyTheme,
  DEFAULT_ACCENT, DEFAULT_PRESET,
  getCustomThemes, saveCustomThemes, addCustomTheme, deleteCustomTheme,
  type ThemePreset,
} from '../../lib/theme';
import { RESOLUTION_PRESETS } from '../designer/resolutionPresets';
import { inputCls } from './shared';

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-7 h-7 rounded border border-[var(--hmi-border-subtle)] cursor-pointer bg-transparent p-0"
      />
      <input
        type="text"
        value={value}
        onChange={e => {
          const v = e.target.value;
          onChange(v);
        }}
        className="w-20 bg-[var(--hmi-bg-input)] border border-[var(--hmi-border-subtle)] rounded px-2 py-1 text-xs text-[var(--hmi-text-primary)] font-mono outline-none focus:border-[var(--hmi-accent)]"
      />
      <span className="text-xs text-[var(--hmi-text-muted)] min-w-[70px]">{label}</span>
    </div>
  );
}

function ThemePreview({ preset, isSelected, onClick, label, onDelete, onEdit }: {
  preset: ThemePreset;
  isSelected: boolean;
  onClick: () => void;
  label: string;
  onDelete?: () => void;
  onEdit?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-center gap-1.5 p-2 rounded-lg border-2 transition-colors ${
        isSelected ? 'border-[var(--hmi-accent)]' : 'border-transparent hover:border-[var(--hmi-border-subtle)]'
      }`}
    >
      {/* Mini preview */}
      <div className="flex w-16 h-10 rounded overflow-hidden border border-[var(--hmi-border-subtle)]">
        <div className="w-4" style={{ backgroundColor: preset.bgSurface }} />
        <div className="flex-1 flex flex-col">
          <div className="h-2" style={{ backgroundColor: preset.bgSurface }} />
          <div className="flex-1" style={{ backgroundColor: preset.bgBody }}>
            <div className="m-0.5 h-1 rounded-sm" style={{ backgroundColor: preset.textPrimary, opacity: 0.3 }} />
            <div className="m-0.5 h-1 w-2/3 rounded-sm" style={{ backgroundColor: preset.textSecondary, opacity: 0.3 }} />
          </div>
        </div>
      </div>
      <span className="text-xs text-[var(--hmi-text-secondary)]">{label}</span>
      {(onDelete || onEdit) && (
        <div className="absolute -top-1 -right-1 flex gap-0.5">
          {onEdit && (
            <span
              onClick={e => { e.stopPropagation(); onEdit(); }}
              className="w-4 h-4 rounded-full bg-[var(--hmi-bg-elevated)] border border-[var(--hmi-border)] flex items-center justify-center cursor-pointer hover:text-[var(--hmi-accent)]"
            >
              <Edit3 size={8} />
            </span>
          )}
          {onDelete && (
            <span
              onClick={e => { e.stopPropagation(); onDelete(); }}
              className="w-4 h-4 rounded-full bg-[var(--hmi-bg-elevated)] border border-[var(--hmi-border)] flex items-center justify-center cursor-pointer hover:text-red-400"
            >
              <Trash2 size={8} />
            </span>
          )}
        </div>
      )}
    </button>
  );
}

const BLANK_CUSTOM_THEME: ThemePreset = {
  label: '',
  group: 'light',
  bgBody: '#f8fafc',
  bgSurface: '#ffffff',
  bgElevated: '#f1f5f9',
  bgInput: '#e2e8f0',
  border: '#cbd5e1',
  borderSubtle: '#94a3b8',
  textPrimary: '#0f172a',
  textSecondary: '#475569',
  textMuted: '#94a3b8',
};

function CustomThemeEditor({ initial, onSave, onCancel }: {
  initial?: { key: string; preset: ThemePreset } | null;
  onSave: (key: string, preset: ThemePreset) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.preset.label || '');
  const [group, setGroup] = useState<'dark' | 'light'>(initial?.preset.group === 'dark' ? 'dark' : 'light');
  const [colors, setColors] = useState<ThemePreset>(initial?.preset || { ...BLANK_CUSTOM_THEME });

  const setColor = useCallback((field: keyof ThemePreset, value: string) => {
    setColors(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleSave = useCallback(() => {
    if (!name.trim()) return;
    const key = initial?.key || `custom_${Date.now()}`;
    const preset: ThemePreset = { ...colors, label: name.trim(), group };
    onSave(key, preset);
  }, [name, group, colors, initial, onSave]);

  // Live preview as colors change
  const previewPreset: ThemePreset = { ...colors, label: name || 'Preview', group };

  return (
    <div className="border border-[var(--hmi-border)] rounded-lg p-4 bg-[var(--hmi-bg-elevated)] space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-[var(--hmi-text-primary)]">
          {initial ? 'Edit Custom Theme' : 'New Custom Theme'}
        </h3>
        <div className="flex gap-1">
          <button onClick={handleSave} disabled={!name.trim()} className="p-1.5 rounded hover:bg-[var(--hmi-bg-input)] text-green-500 disabled:opacity-30">
            <Check size={16} />
          </button>
          <button onClick={onCancel} className="p-1.5 rounded hover:bg-[var(--hmi-bg-input)] text-[var(--hmi-text-muted)]">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 space-y-3">
          <div>
            <label className="text-xs text-[var(--hmi-text-secondary)] mb-1 block">Theme Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="My Custom Theme"
              className="w-full bg-[var(--hmi-bg-input)] border border-[var(--hmi-border-subtle)] rounded-md px-3 py-1.5 text-sm text-[var(--hmi-text-primary)] outline-none focus:border-[var(--hmi-accent)]"
            />
          </div>

          <div>
            <label className="text-xs text-[var(--hmi-text-secondary)] mb-1.5 block">Mode</label>
            <div className="flex gap-2">
              <button
                onClick={() => setGroup('light')}
                className={`flex-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  group === 'light' ? 'bg-[var(--hmi-accent)] text-white' : 'bg-[var(--hmi-bg-input)] text-[var(--hmi-text-secondary)]'
                }`}
              >
                Light
              </button>
              <button
                onClick={() => setGroup('dark')}
                className={`flex-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  group === 'dark' ? 'bg-[var(--hmi-accent)] text-white' : 'bg-[var(--hmi-bg-input)] text-[var(--hmi-text-secondary)]'
                }`}
              >
                Dark
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs text-[var(--hmi-text-secondary)] mb-1.5 block">Backgrounds</label>
            <div className="space-y-1.5">
              <ColorField label="Body" value={colors.bgBody} onChange={v => setColor('bgBody', v)} />
              <ColorField label="Surface" value={colors.bgSurface} onChange={v => setColor('bgSurface', v)} />
              <ColorField label="Elevated" value={colors.bgElevated} onChange={v => setColor('bgElevated', v)} />
              <ColorField label="Input" value={colors.bgInput} onChange={v => setColor('bgInput', v)} />
            </div>
          </div>

          <div>
            <label className="text-xs text-[var(--hmi-text-secondary)] mb-1.5 block">Borders</label>
            <div className="space-y-1.5">
              <ColorField label="Border" value={colors.border} onChange={v => setColor('border', v)} />
              <ColorField label="Subtle" value={colors.borderSubtle} onChange={v => setColor('borderSubtle', v)} />
            </div>
          </div>

          <div>
            <label className="text-xs text-[var(--hmi-text-secondary)] mb-1.5 block">Text</label>
            <div className="space-y-1.5">
              <ColorField label="Primary" value={colors.textPrimary} onChange={v => setColor('textPrimary', v)} />
              <ColorField label="Secondary" value={colors.textSecondary} onChange={v => setColor('textSecondary', v)} />
              <ColorField label="Muted" value={colors.textMuted} onChange={v => setColor('textMuted', v)} />
            </div>
          </div>
        </div>

        {/* Live preview pane */}
        <div className="w-48 flex-shrink-0">
          <label className="text-xs text-[var(--hmi-text-secondary)] mb-1.5 block">Preview</label>
          <div className="rounded-lg overflow-hidden border border-[var(--hmi-border-subtle)]" style={{ backgroundColor: previewPreset.bgBody }}>
            {/* Header bar */}
            <div className="h-6 flex items-center px-2 gap-1" style={{ backgroundColor: previewPreset.bgSurface, borderBottom: `1px solid ${previewPreset.border}` }}>
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: previewPreset.textMuted }} />
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: previewPreset.textMuted }} />
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: previewPreset.textMuted }} />
              <span className="ml-2 text-[7px] font-medium" style={{ color: previewPreset.textPrimary }}>HMI</span>
            </div>
            {/* Content area */}
            <div className="p-2 space-y-1.5">
              <div className="h-2 w-3/4 rounded-sm" style={{ backgroundColor: previewPreset.textPrimary, opacity: 0.8 }} />
              <div className="h-1.5 w-full rounded-sm" style={{ backgroundColor: previewPreset.textSecondary, opacity: 0.5 }} />
              <div className="h-1.5 w-2/3 rounded-sm" style={{ backgroundColor: previewPreset.textMuted, opacity: 0.5 }} />
              {/* Card */}
              <div className="rounded p-1.5 mt-1" style={{ backgroundColor: previewPreset.bgElevated, border: `1px solid ${previewPreset.border}` }}>
                <div className="h-1.5 w-1/2 rounded-sm" style={{ backgroundColor: previewPreset.textPrimary, opacity: 0.6 }} />
                <div className="h-4 rounded mt-1" style={{ backgroundColor: previewPreset.bgInput }} />
              </div>
              {/* Button */}
              <div className="h-4 w-16 rounded mt-1" style={{ backgroundColor: 'var(--hmi-accent)', opacity: 0.9 }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ThemeSettings() {
  // Branding state
  const [brandTitle, setBrandTitle] = useState('Industrial HMI');
  const [brandNavTitle, setBrandNavTitle] = useState('HMI');
  const [brandFaviconPreview, setBrandFaviconPreview] = useState<string | null>(null);
  const [brandFaviconData, setBrandFaviconData] = useState<string | null>(null);
  const [brandSaving, setBrandSaving] = useState(false);
  const [brandMsg, setBrandMsg] = useState('');
  const brandFileRef = useRef<HTMLInputElement>(null);
  // Theme state
  const [brandAccent, setBrandAccent] = useState(DEFAULT_ACCENT);
  const [brandPreset, setBrandPreset] = useState(DEFAULT_PRESET);
  const [savedAccent, setSavedAccent] = useState(DEFAULT_ACCENT);
  const [savedPreset, setSavedPreset] = useState(DEFAULT_PRESET);

  // Custom themes
  const [customThemes, setCustomThemes] = useState<Record<string, ThemePreset>>({});
  const [showCustomEditor, setShowCustomEditor] = useState(false);
  const [editingCustom, setEditingCustom] = useState<{ key: string; preset: ThemePreset } | null>(null);

  // Preferences state
  const [prefLayout, setPrefLayout] = useState('grid');
  const [prefResolution, setPrefResolution] = useState('1920x1080');
  const [prefSaving, setPrefSaving] = useState(false);
  const [prefMsg, setPrefMsg] = useState('');

  const [loaded, setLoaded] = useState(false);

  const loadBranding = useCallback(() => {
    api.getBranding().then((b) => {
      setBrandTitle(b.site_title);
      setBrandNavTitle(b.nav_title);
      if (b.has_favicon) setBrandFaviconPreview('/api/branding/favicon');
      else setBrandFaviconPreview(null);
      setBrandFaviconData(null);
      setBrandAccent(b.theme_accent);
      setBrandPreset(b.theme_preset);
      setSavedAccent(b.theme_accent);
      setSavedPreset(b.theme_preset);
    }).catch(() => {});
    api.getCustomThemes().then((ct) => {
      const themes = ct.themes as Record<string, ThemePreset>;
      setCustomThemes(themes);
      saveCustomThemes(themes);
    }).catch(() => {});
  }, []);

  const loadPreferences = useCallback(() => {
    api.getPreferences().then((p) => {
      setPrefLayout(p.default_screen_layout);
      setPrefResolution(p.default_screen_resolution);
      setPrefMsg('');
    }).catch(() => {});
  }, []);

  // Load on first render
  if (!loaded) {
    setLoaded(true);
    loadBranding();
    loadPreferences();
  }

  const handleSelectPreset = useCallback((key: string) => {
    setBrandPreset(key);
    applyTheme(brandAccent, key);
    setBrandMsg('');
  }, [brandAccent]);

  const handleSaveCustomTheme = useCallback(async (key: string, preset: ThemePreset) => {
    addCustomTheme(key, preset);
    const updated = getCustomThemes();
    setCustomThemes(updated);
    setShowCustomEditor(false);
    setEditingCustom(null);
    // Persist to backend
    try {
      await api.updateCustomThemes(updated);
    } catch { /* ignore */ }
  }, []);

  const handleDeleteCustomTheme = useCallback(async (key: string) => {
    deleteCustomTheme(key);
    const updated = getCustomThemes();
    setCustomThemes(updated);
    // If this was the active preset, switch to default
    if (brandPreset === key) {
      setBrandPreset(DEFAULT_PRESET);
      applyTheme(brandAccent, DEFAULT_PRESET);
    }
    // Persist to backend
    try {
      await api.updateCustomThemes(updated);
    } catch { /* ignore */ }
  }, [brandPreset, brandAccent]);

  const darkPresets = Object.entries(THEME_PRESETS).filter(([, p]) => p.group === 'dark');
  const lightPresets = Object.entries(THEME_PRESETS).filter(([, p]) => p.group === 'light');
  const customDark = Object.entries(customThemes).filter(([, p]) => p.group === 'dark');
  const customLight = Object.entries(customThemes).filter(([, p]) => p.group === 'light');

  return (
    <div className="space-y-10">
      {/* Branding */}
      <div className="max-w-2xl space-y-6">
        <h2 className="text-sm font-semibold text-[var(--hmi-text-secondary)]">Branding</h2>
        <div>
          <label className="text-xs text-[var(--hmi-text-secondary)] mb-1 block">Site Title</label>
          <input
            type="text"
            value={brandTitle}
            onChange={e => { setBrandTitle(e.target.value); setBrandMsg(''); }}
            placeholder="Industrial HMI"
            className={inputCls}
          />
          <p className="text-xs text-[var(--hmi-text-muted)] mt-1">Shown in the browser tab and login page.</p>
        </div>

        <div>
          <label className="text-xs text-[var(--hmi-text-secondary)] mb-1 block">Navigation Title</label>
          <input
            type="text"
            value={brandNavTitle}
            onChange={e => { setBrandNavTitle(e.target.value); setBrandMsg(''); }}
            placeholder="HMI"
            className={inputCls}
          />
          <p className="text-xs text-[var(--hmi-text-muted)] mt-1">Shown in the sidebar navigation rail.</p>
        </div>

        <div>
          <label className="text-xs text-[var(--hmi-text-secondary)] mb-1 block">Favicon</label>
          <div className="flex items-center gap-4">
            {brandFaviconPreview ? (
              <img src={brandFaviconPreview} alt="Favicon" className="w-10 h-10 rounded bg-[var(--hmi-bg-input)] p-1 object-contain" />
            ) : (
              <div className="w-10 h-10 rounded bg-[var(--hmi-bg-input)] flex items-center justify-center text-[var(--hmi-text-muted)] text-xs">None</div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => brandFileRef.current?.click()}
                className="px-3 py-1.5 bg-[var(--hmi-bg-input)] hover:bg-[var(--hmi-border-subtle)] text-sm text-[var(--hmi-text-primary)] rounded-lg"
              >
                Choose Image
              </button>
              {(brandFaviconPreview || brandFaviconData) && (
                <button
                  onClick={() => { setBrandFaviconPreview(null); setBrandFaviconData(''); setBrandMsg(''); }}
                  className="px-3 py-1.5 bg-[var(--hmi-bg-input)] hover:bg-[var(--hmi-border-subtle)] text-sm text-red-400 rounded-lg"
                >
                  Remove
                </button>
              )}
            </div>
            <input
              ref={brandFileRef}
              type="file"
              accept=".ico,.png,.svg,.jpg,.jpeg"
              className="hidden"
              onChange={e => {
                const file = e.currentTarget.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  const dataUri = reader.result as string;
                  setBrandFaviconData(dataUri);
                  setBrandFaviconPreview(dataUri);
                  setBrandMsg('');
                };
                reader.readAsDataURL(file);
                e.currentTarget.value = '';
              }}
            />
          </div>
          <p className="text-xs text-[var(--hmi-text-muted)] mt-1">Recommended: 32x32 or 64x64 PNG, ICO, or SVG.</p>
        </div>

        {/* ── Theme: Accent Color ── */}
        <div>
          <label className="text-xs text-[var(--hmi-text-secondary)] mb-1.5 block">Accent Color</label>
          <div className="flex items-center gap-2 flex-wrap">
            {ACCENT_SWATCHES.map((s) => (
              <button
                key={s.hex}
                title={s.label}
                onClick={() => { setBrandAccent(s.hex); applyTheme(s.hex, brandPreset); setBrandMsg(''); }}
                className="w-8 h-8 rounded-full border-2 transition-transform hover:scale-110"
                style={{ backgroundColor: s.hex, borderColor: brandAccent === s.hex ? 'var(--hmi-text-primary)' : 'transparent' }}
              />
            ))}
            <input
              type="text"
              value={brandAccent}
              onChange={e => {
                const v = e.target.value;
                setBrandAccent(v);
                if (/^#[0-9a-fA-F]{6}$/.test(v)) { applyTheme(v, brandPreset); }
                setBrandMsg('');
              }}
              placeholder="#2563eb"
              className="w-24 bg-[var(--hmi-bg-input)] border border-[var(--hmi-border-subtle)] rounded-lg px-2 py-1.5 text-sm text-[var(--hmi-text-primary)] outline-none focus:border-[var(--hmi-accent)] font-mono"
            />
          </div>
          <p className="text-xs text-[var(--hmi-text-muted)] mt-1">Used for active navigation, buttons, and highlights.</p>
        </div>

        {/* ── Theme: Light Presets ── */}
        <div>
          <label className="text-xs text-[var(--hmi-text-secondary)] mb-1.5 block">Light Themes</label>
          <div className="flex items-center gap-3 flex-wrap">
            {lightPresets.map(([key, preset]) => (
              <ThemePreview
                key={key}
                preset={preset}
                isSelected={brandPreset === key}
                onClick={() => handleSelectPreset(key)}
                label={preset.label}
              />
            ))}
            {customLight.map(([key, preset]) => (
              <ThemePreview
                key={key}
                preset={preset}
                isSelected={brandPreset === key}
                onClick={() => handleSelectPreset(key)}
                label={preset.label}
                onEdit={() => { setEditingCustom({ key, preset }); setShowCustomEditor(true); }}
                onDelete={() => handleDeleteCustomTheme(key)}
              />
            ))}
          </div>
        </div>

        {/* ── Theme: Dark Presets ── */}
        <div>
          <label className="text-xs text-[var(--hmi-text-secondary)] mb-1.5 block">Dark Themes</label>
          <div className="flex items-center gap-3 flex-wrap">
            {darkPresets.map(([key, preset]) => (
              <ThemePreview
                key={key}
                preset={preset}
                isSelected={brandPreset === key}
                onClick={() => handleSelectPreset(key)}
                label={preset.label}
              />
            ))}
            {customDark.map(([key, preset]) => (
              <ThemePreview
                key={key}
                preset={preset}
                isSelected={brandPreset === key}
                onClick={() => handleSelectPreset(key)}
                label={preset.label}
                onEdit={() => { setEditingCustom({ key, preset }); setShowCustomEditor(true); }}
                onDelete={() => handleDeleteCustomTheme(key)}
              />
            ))}
          </div>
        </div>

        {/* ── Custom Theme Editor ── */}
        {showCustomEditor ? (
          <CustomThemeEditor
            initial={editingCustom}
            onSave={handleSaveCustomTheme}
            onCancel={() => { setShowCustomEditor(false); setEditingCustom(null); }}
          />
        ) : (
          <button
            onClick={() => { setEditingCustom(null); setShowCustomEditor(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-[var(--hmi-border-subtle)] text-xs text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)] hover:border-[var(--hmi-accent)] transition-colors"
          >
            <Plus size={14} />
            Create Custom Theme
          </button>
        )}

        <div className="flex items-center gap-3">
          <button
            disabled={brandSaving}
            onClick={async () => {
              setBrandSaving(true);
              setBrandMsg('');
              try {
                const payload: Record<string, string> = {
                  site_title: brandTitle,
                  nav_title: brandNavTitle,
                  theme_accent: brandAccent,
                  theme_preset: brandPreset,
                };
                if (brandFaviconData !== null) payload.favicon = brandFaviconData;
                const res = await api.updateBranding(payload);
                setBrandFaviconData(null);
                if (res.has_favicon) setBrandFaviconPreview('/api/branding/favicon?' + Date.now());
                else setBrandFaviconPreview(null);
                document.title = res.site_title;
                const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
                if (link) link.href = res.has_favicon ? '/api/branding/favicon?' + Date.now() : '/vite.svg';
                setSavedAccent(res.theme_accent);
                setSavedPreset(res.theme_preset);
                applyTheme(res.theme_accent, res.theme_preset);
                setBrandMsg('Saved');
              } catch (err) {
                applyTheme(savedAccent, savedPreset);
                setBrandAccent(savedAccent);
                setBrandPreset(savedPreset);
                setBrandMsg(err instanceof Error ? err.message : 'Save failed');
              } finally {
                setBrandSaving(false);
              }
            }}
            className="px-4 py-2 bg-[var(--hmi-accent)] hover:bg-[var(--hmi-accent-dark)] disabled:opacity-50 text-white text-sm rounded-lg font-medium"
          >
            {brandSaving ? 'Saving...' : 'Save'}
          </button>
          {brandMsg && (
            <span className={`text-sm ${brandMsg === 'Saved' ? 'text-green-400' : 'text-red-400'}`}>{brandMsg}</span>
          )}
        </div>
      </div>

      <hr className="border-[var(--hmi-border)]" />

      {/* Preferences */}
      <div className="max-w-lg space-y-6">
        <h2 className="text-sm font-semibold text-[var(--hmi-text-secondary)]">Preferences</h2>
        <div>
          <label className="text-xs text-[var(--hmi-text-secondary)] mb-1.5 block">Default Screen Layout</label>
          <div className="flex gap-2">
            <button
              onClick={() => { setPrefLayout('grid'); setPrefMsg(''); }}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                prefLayout === 'grid' ? 'bg-[var(--hmi-accent)] text-white' : 'bg-[var(--hmi-bg-input)] text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)]'
              }`}
            >
              Grid
            </button>
            <button
              onClick={() => { setPrefLayout('absolute'); setPrefMsg(''); }}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                prefLayout === 'absolute' ? 'bg-[var(--hmi-accent)] text-white' : 'bg-[var(--hmi-bg-input)] text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)]'
              }`}
            >
              Absolute
            </button>
          </div>
          <p className="text-xs text-[var(--hmi-text-muted)] mt-1">
            {prefLayout === 'grid' ? 'Responsive 12-column grid layout' : 'Fixed pixel positioning for panel PCs'}
          </p>
        </div>

        {prefLayout === 'absolute' && (
          <div>
            <label className="text-xs text-[var(--hmi-text-secondary)] mb-1.5 block">Default Target Resolution</label>
            <select
              value={prefResolution}
              onChange={e => { setPrefResolution(e.target.value); setPrefMsg(''); }}
              className="w-full bg-[var(--hmi-bg-input)] border border-[var(--hmi-border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--hmi-text-primary)] outline-none focus:border-[var(--hmi-accent)]"
            >
              {RESOLUTION_PRESETS.map(p => (
                <option key={p.key} value={p.key}>{p.label} — canvas {p.canvasWidth}×{p.canvasHeight}</option>
              ))}
            </select>
            <p className="text-xs text-[var(--hmi-text-muted)] mt-1">Default resolution for new absolute-layout screens. Canvas size accounts for header and sidebar.</p>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            disabled={prefSaving}
            onClick={async () => {
              setPrefSaving(true);
              setPrefMsg('');
              try {
                await api.updatePreferences({
                  default_screen_layout: prefLayout,
                  default_screen_resolution: prefResolution,
                });
                setPrefMsg('Saved');
              } catch (err) {
                setPrefMsg(err instanceof Error ? err.message : 'Save failed');
              } finally {
                setPrefSaving(false);
              }
            }}
            className="px-4 py-2 bg-[var(--hmi-accent)] hover:bg-[var(--hmi-accent-dark)] disabled:opacity-50 text-white text-sm rounded-lg font-medium"
          >
            {prefSaving ? 'Saving...' : 'Save'}
          </button>
          {prefMsg && (
            <span className={`text-sm ${prefMsg === 'Saved' ? 'text-green-400' : 'text-red-400'}`}>{prefMsg}</span>
          )}
        </div>
      </div>
    </div>
  );
}
