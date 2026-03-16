import { useState, useCallback, useRef } from 'react';
import { api } from '../../lib/api';
import { THEME_PRESETS, ACCENT_SWATCHES, applyTheme, DEFAULT_ACCENT, DEFAULT_PRESET } from '../../lib/theme';
import { RESOLUTION_PRESETS } from '../designer/resolutionPresets';
import { inputCls } from './shared';

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

  return (
    <div className="space-y-10">
      {/* ═══ Branding ═══ */}
      <div className="max-w-lg space-y-6">
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
                className="px-3 py-1.5 bg-[var(--hmi-bg-input)] hover:bg-[var(--hmi-border-subtle)] text-sm text-white rounded-lg"
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
                style={{ backgroundColor: s.hex, borderColor: brandAccent === s.hex ? '#ffffff' : 'transparent' }}
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
              className="w-24 bg-[var(--hmi-bg-input)] border border-[var(--hmi-border-subtle)] rounded-lg px-2 py-1.5 text-sm text-white outline-none focus:border-blue-500 font-mono"
            />
          </div>
          <p className="text-xs text-[var(--hmi-text-muted)] mt-1">Used for active navigation, buttons, and highlights.</p>
        </div>

        {/* ── Theme: Background Preset ── */}
        <div>
          <label className="text-xs text-[var(--hmi-text-secondary)] mb-1.5 block">Background Preset</label>
          <div className="flex items-center gap-3 flex-wrap">
            {Object.entries(THEME_PRESETS).map(([key, preset]) => (
              <button
                key={key}
                onClick={() => { setBrandPreset(key); applyTheme(brandAccent, key); setBrandMsg(''); }}
                className={`flex flex-col items-center gap-1.5 p-2 rounded-lg border-2 transition-colors ${
                  brandPreset === key ? 'border-white' : 'border-transparent hover:border-[var(--hmi-border-subtle)]'
                }`}
              >
                {/* Mini preview */}
                <div className="flex w-16 h-10 rounded overflow-hidden border border-[var(--hmi-border-subtle)]">
                  <div className="w-4" style={{ backgroundColor: preset.bgSurface }} />
                  <div className="flex-1 flex flex-col">
                    <div className="h-2" style={{ backgroundColor: preset.bgSurface }} />
                    <div className="flex-1" style={{ backgroundColor: preset.bgBody }} />
                  </div>
                </div>
                <span className="text-xs text-[var(--hmi-text-secondary)]">{preset.label}</span>
              </button>
            ))}
          </div>
        </div>

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

      {/* ═══ Preferences ═══ */}
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
              className="w-full bg-[var(--hmi-bg-input)] border border-[var(--hmi-border-subtle)] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
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
