import { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, FileText, Eye, Download, Loader2 } from 'lucide-react';
import { api } from '../lib/api';

type InputMode = 'paste' | 'upload';

const DPI_OPTIONS = [152, 203, 300, 600];

export function ZplPreviewPage() {
  const [mode, setMode] = useState<InputMode>('paste');
  const [zplText, setZplText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dpi, setDpi] = useState(203);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clean up blob URL on unmount or change
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleRender = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let blob: Blob;
      if (mode === 'upload' && file) {
        blob = await api.zplPreviewRenderFile(file, dpi);
      } else if (mode === 'paste' && zplText.trim()) {
        blob = await api.zplPreviewRender(zplText, dpi);
      } else {
        setError(mode === 'upload' ? 'Please select a file' : 'Please enter ZPL text');
        setLoading(false);
        return;
      }
      setPreviewUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Render failed');
    }
    setLoading(false);
  }, [mode, file, zplText, dpi]);

  const handleDownload = useCallback(() => {
    if (!previewUrl) return;
    const link = document.createElement('a');
    link.href = previewUrl;
    link.download = `zpl_preview_${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [previewUrl]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      setFile(droppedFile);
      setMode('upload');
    }
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) setFile(selected);
  }, []);

  return (
    <div className="flex gap-4 h-full min-h-0">
      {/* Left panel — input */}
      <div className="w-1/2 flex flex-col gap-3 min-h-0">
        {/* Mode tabs */}
        <div className="flex gap-1">
          <button
            onClick={() => setMode('paste')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              mode === 'paste' ? 'bg-[var(--hmi-accent)] text-white' : 'bg-[var(--hmi-bg-elevated)] text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)]'
            }`}
          >
            <FileText size={14} />
            Paste Text
          </button>
          <button
            onClick={() => setMode('upload')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              mode === 'upload' ? 'bg-[var(--hmi-accent)] text-white' : 'bg-[var(--hmi-bg-elevated)] text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)]'
            }`}
          >
            <Upload size={14} />
            Upload File
          </button>
        </div>

        {/* Input area */}
        {mode === 'paste' ? (
          <textarea
            value={zplText}
            onChange={e => setZplText(e.target.value)}
            placeholder="Paste ZPL code here...&#10;&#10;Example:&#10;^XA&#10;^FO50,50^ADN,36,20^FDHello World^FS&#10;^XZ"
            className="flex-1 min-h-0 bg-[var(--hmi-bg-elevated)] border border-slate-600 rounded-lg p-3 text-xs font-mono text-[var(--hmi-text-primary)] placeholder-slate-500 resize-none focus:outline-none focus:ring-1 focus:ring-[var(--hmi-accent)]"
          />
        ) : (
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex-1 min-h-0 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
              dragOver
                ? 'border-[var(--hmi-accent)] bg-[var(--hmi-accent)]/10'
                : 'border-slate-600 bg-[var(--hmi-bg-elevated)] hover:border-slate-500'
            }`}
          >
            <Upload size={24} className="text-slate-400" />
            {file ? (
              <span className="text-sm text-[var(--hmi-text-primary)]">{file.name}</span>
            ) : (
              <>
                <span className="text-sm text-[var(--hmi-text-secondary)]">Drop a .zpl file here or click to browse</span>
                <span className="text-xs text-slate-500">Supports .zpl, .txt, .prn</span>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".zpl,.txt,.prn"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-[var(--hmi-text-secondary)]">DPI:</label>
            <select
              value={dpi}
              onChange={e => setDpi(Number(e.target.value))}
              className="bg-[var(--hmi-bg-elevated)] border border-slate-600 rounded px-2 py-1 text-xs text-[var(--hmi-text-primary)]"
            >
              {DPI_OPTIONS.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleRender}
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-[var(--hmi-accent)] hover:opacity-90 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-opacity"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
            {loading ? 'Rendering...' : 'Render Preview'}
          </button>
        </div>
      </div>

      {/* Right panel — preview */}
      <div className="w-1/2 flex flex-col gap-2 min-h-0">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-[var(--hmi-text-secondary)] uppercase tracking-wide">Preview</span>
          {previewUrl && (
            <button
              onClick={handleDownload}
              className="flex items-center gap-1 text-xs text-[var(--hmi-text-secondary)] hover:text-[var(--hmi-text-primary)] transition-colors"
            >
              <Download size={12} />
              Download PNG
            </button>
          )}
        </div>
        <div className="flex-1 min-h-0 bg-[var(--hmi-bg-elevated)] border border-slate-600 rounded-lg overflow-auto flex items-center justify-center p-4">
          {error ? (
            <span className="text-xs text-red-400 text-center">{error}</span>
          ) : previewUrl ? (
            <img
              src={previewUrl}
              alt="ZPL label preview"
              className="max-w-full max-h-full object-contain"
              style={{ imageRendering: 'pixelated' }}
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-slate-500">
              <Eye size={24} />
              <span className="text-xs">Enter ZPL and click Render Preview</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
