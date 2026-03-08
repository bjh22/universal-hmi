import { useState, useCallback } from 'react';
import {
  ChevronDown, ChevronRight, AlertTriangle, Check,
  X, Database, Tag as TagIcon, Monitor, ClipboardList,
  Layers, LayoutTemplate, FileText,
} from 'lucide-react';
import { api } from '../lib/api';
import { Dialog } from './Dialog';
import type { ProjectData, ImportPreviewResponse, ImportResultResponse, SectionPreview } from '../types';

interface Props {
  projects: ProjectData[];
  onClose: () => void;
  onComplete: () => void;
}

const btnPrimary = 'bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors';
const btnSecondary = 'bg-slate-700 hover:bg-slate-600 text-slate-200 px-4 py-2 rounded-md text-sm font-medium transition-colors';
const inputCls = 'w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-sm text-white outline-none focus:border-blue-500';

const SECTION_ICONS: Record<string, React.ReactNode> = {
  data_sources: <Database size={16} className="text-amber-400" />,
  tag_labels: <TagIcon size={16} className="text-pink-400" />,
  tags: <TagIcon size={16} className="text-blue-400" />,
  tag_templates: <FileText size={16} className="text-blue-300" />,
  screens: <Monitor size={16} className="text-purple-400" />,
  screen_templates: <LayoutTemplate size={16} className="text-purple-300" />,
  jobs: <ClipboardList size={16} className="text-green-400" />,
};

type Step = 'file' | 'preview' | 'importing' | 'results';

export function ImportWizard({ projects, onClose, onComplete }: Props) {
  const [step, setStep] = useState<Step>('file');
  const [importFile, setImportFile] = useState<Record<string, unknown> | null>(null);
  const [fileName, setFileName] = useState('');
  const [targetMode, setTargetMode] = useState<'new' | 'existing'>('new');
  const [targetProjectId, setTargetProjectId] = useState<number | null>(null);
  const [nameOverride, setNameOverride] = useState('');
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [selectedSections, setSelectedSections] = useState<Set<string>>(new Set());
  const [conflictResolution, setConflictResolution] = useState<Record<string, string>>({});
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<ImportResultResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        if (!json.format_version) {
          setError('Not a valid HMI project file (missing format_version)');
          setImportFile(null);
          return;
        }
        setImportFile(json);
      } catch {
        setError('Invalid JSON file');
        setImportFile(null);
      }
    };
    reader.readAsText(file);
  }, []);

  const handlePreview = useCallback(async () => {
    if (!importFile) return;
    setLoading(true);
    setError(null);
    try {
      const targetId = targetMode === 'existing' ? targetProjectId : null;
      const result = await api.previewImport(importFile, targetId);
      setPreview(result);
      // Auto-select all non-empty sections
      const nonEmpty = new Set(
        result.sections.filter(s => s.count > 0).map(s => s.key)
      );
      setSelectedSections(nonEmpty);
      // Default conflict resolution to "skip" for sections with conflicts
      const cr: Record<string, string> = {};
      for (const s of result.sections) {
        if (s.conflict_count > 0) cr[s.key] = 'skip';
      }
      setConflictResolution(cr);
      setStep('preview');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preview failed');
    } finally {
      setLoading(false);
    }
  }, [importFile, targetMode, targetProjectId]);

  const handleImport = useCallback(async () => {
    if (!importFile || !preview) return;
    setStep('importing');
    setError(null);
    try {
      const sections = Array.from(selectedSections);
      const result = await api.importProjectSelective({
        data: importFile,
        targetProjectId: targetMode === 'existing' ? targetProjectId : undefined,
        nameOverride: targetMode === 'new' && nameOverride ? nameOverride : undefined,
        sections,
        conflictResolution,
      });
      setResults(result);
      setStep('results');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
      setStep('preview');
    }
  }, [importFile, preview, selectedSections, targetMode, targetProjectId, nameOverride, conflictResolution]);

  const toggleSection = useCallback((key: string) => {
    setSelectedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleExpanded = useCallback((key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (!preview) return;
    setSelectedSections(new Set(preview.sections.filter(s => s.count > 0).map(s => s.key)));
  }, [preview]);

  const selectNone = useCallback(() => {
    setSelectedSections(new Set());
  }, []);

  const totalSelected = preview
    ? preview.sections.filter(s => selectedSections.has(s.key)).reduce((a, s) => a + s.count, 0)
    : 0;

  const title = step === 'file' ? 'Import Project'
    : step === 'preview' ? 'Select Sections to Import'
    : step === 'importing' ? 'Importing...'
    : 'Import Complete';

  return (
    <Dialog title={title} onClose={onClose} wide={step === 'preview' || step === 'results'}>
      {error && (
        <div className="bg-red-500/20 border border-red-500/30 rounded-md px-3 py-2 mb-3 flex justify-between items-center">
          <span className="text-red-300 text-sm">{error}</span>
          <button onClick={() => setError(null)} className="text-red-300 hover:text-white"><X size={14} /></button>
        </div>
      )}

      {/* Step 1: File Selection */}
      {step === 'file' && (
        <div className="space-y-4">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Select .hmi.json file</label>
            <input
              type="file"
              accept=".json,.hmi.json"
              onChange={handleFileSelect}
              className="text-sm text-slate-300 file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-slate-700 file:text-slate-200 hover:file:bg-slate-600"
            />
          </div>

          {importFile && (
            <>
              <div className="bg-slate-900 rounded-md p-3 text-xs space-y-1">
                <p className="text-slate-400">File: <span className="text-white">{fileName}</span></p>
                <p className="text-slate-400">Project: <span className="text-white">{(importFile.project as Record<string, unknown>)?.name as string || 'Unknown'}</span></p>
                <p className="text-slate-400">Version: <span className="text-white">{(importFile.project as Record<string, unknown>)?.version as string || '?'}</span></p>
                <p className="text-slate-400">
                  Contents: {(importFile.tags as unknown[])?.length || 0} tags,
                  {' '}{(importFile.screens as unknown[])?.length || 0} screens,
                  {' '}{(importFile.data_sources as unknown[])?.length || 0} data sources,
                  {' '}{(importFile.jobs as unknown[])?.length || 0} jobs
                </p>
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-2 block">Import Target</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="targetMode"
                      checked={targetMode === 'new'}
                      onChange={() => setTargetMode('new')}
                      className="accent-blue-500"
                    />
                    <span className="text-sm text-white">Create new project</span>
                  </label>
                  {targetMode === 'new' && (
                    <div className="ml-6">
                      <input
                        className={inputCls}
                        placeholder="Project name (leave blank to use file name)"
                        value={nameOverride}
                        onChange={e => setNameOverride(e.target.value)}
                      />
                    </div>
                  )}

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="targetMode"
                      checked={targetMode === 'existing'}
                      onChange={() => setTargetMode('existing')}
                      className="accent-blue-500"
                    />
                    <span className="text-sm text-white">Import into existing project</span>
                  </label>
                  {targetMode === 'existing' && (
                    <div className="ml-6">
                      <select
                        className={inputCls}
                        value={targetProjectId ?? ''}
                        onChange={e => setTargetProjectId(e.target.value ? Number(e.target.value) : null)}
                      >
                        <option value="">Select a project...</option>
                        {projects.map(p => (
                          <option key={p.id} value={p.id}>{p.name} (v{p.version})</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className={btnSecondary}>Cancel</button>
            <button
              onClick={handlePreview}
              disabled={!importFile || loading || (targetMode === 'existing' && !targetProjectId)}
              className={btnPrimary}
            >
              {loading ? 'Loading...' : 'Preview'}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Section Selection */}
      {step === 'preview' && preview && (
        <div className="space-y-4">
          {/* Header info */}
          <div className="bg-slate-900 rounded-md p-3 text-xs flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-slate-400">
                Source: <span className="text-white">{preview.project_name}</span>
                <span className="text-slate-500 ml-2">v{preview.project_version}</span>
              </p>
              <p className="text-slate-400">
                Target: <span className="text-white">
                  {preview.target_project_name || nameOverride || preview.project_name}
                </span>
                {!preview.target_project_name && <span className="text-green-400 ml-1">(new)</span>}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={selectAll} className="text-xs text-blue-400 hover:text-blue-300">Select All</button>
              <span className="text-slate-600">|</span>
              <button onClick={selectNone} className="text-xs text-blue-400 hover:text-blue-300">Select None</button>
            </div>
          </div>

          {/* Dependency warnings */}
          {preview.dependency_warnings.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">
              <div className="flex items-center gap-1.5 mb-1">
                <AlertTriangle size={14} className="text-amber-400" />
                <span className="text-xs font-medium text-amber-400">Dependency Warnings</span>
              </div>
              <div className="space-y-0.5 max-h-24 overflow-y-auto">
                {preview.dependency_warnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-300/80">{w}</p>
                ))}
              </div>
            </div>
          )}

          {/* Section list */}
          <div className="space-y-1 max-h-[28rem] overflow-y-auto">
            {preview.sections.map(section => (
              <SectionRow
                key={section.key}
                section={section}
                selected={selectedSections.has(section.key)}
                expanded={expandedSections.has(section.key)}
                conflictMode={conflictResolution[section.key] || 'skip'}
                onToggleSelect={() => toggleSection(section.key)}
                onToggleExpand={() => toggleExpanded(section.key)}
                onConflictChange={(mode) => setConflictResolution(prev => ({ ...prev, [section.key]: mode }))}
              />
            ))}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-700">
            <span className="text-xs text-slate-400">
              {selectedSections.size} section{selectedSections.size !== 1 ? 's' : ''} selected ({totalSelected} items)
            </span>
            <div className="flex gap-2">
              <button onClick={() => setStep('file')} className={btnSecondary}>Back</button>
              <button
                onClick={handleImport}
                disabled={selectedSections.size === 0}
                className={btnPrimary}
              >
                Import Selected
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Importing */}
      {step === 'importing' && (
        <div className="py-8 text-center">
          <Layers size={32} className="mx-auto text-blue-400 mb-3 animate-pulse" />
          <p className="text-sm text-slate-300">Importing selected sections...</p>
        </div>
      )}

      {/* Step 4: Results */}
      {step === 'results' && results && (
        <div className="space-y-4">
          <div className="bg-green-500/10 border border-green-500/30 rounded-md px-3 py-2 flex items-center gap-2">
            <Check size={16} className="text-green-400" />
            <span className="text-sm text-green-300">
              Import complete into project "{results.project_name}"
            </span>
          </div>

          <div className="space-y-1">
            {results.results.map(r => (
              <div key={r.section} className="flex items-center gap-3 bg-slate-900 rounded-md px-3 py-2">
                <div className="shrink-0">{SECTION_ICONS[r.section]}</div>
                <span className="text-sm text-white flex-1 capitalize">{r.section.replace(/_/g, ' ')}</span>
                <div className="flex gap-3 text-xs">
                  {r.created > 0 && <span className="text-green-400">{r.created} created</span>}
                  {r.updated > 0 && <span className="text-blue-400">{r.updated} updated</span>}
                  {r.skipped > 0 && <span className="text-slate-400">{r.skipped} skipped</span>}
                  {r.created === 0 && r.updated === 0 && r.skipped === 0 && (
                    <span className="text-slate-500">empty</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {results.warnings.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">
              {results.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-300">{w}</p>
              ))}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button onClick={onComplete} className={btnPrimary}>Done</button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

// ─── Section Row ───

interface SectionRowProps {
  section: SectionPreview;
  selected: boolean;
  expanded: boolean;
  conflictMode: string;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
  onConflictChange: (mode: string) => void;
}

function SectionRow({
  section, selected, expanded, conflictMode,
  onToggleSelect, onToggleExpand, onConflictChange,
}: SectionRowProps) {
  const isEmpty = section.count === 0;

  return (
    <div className={`border rounded-md transition-colors ${
      selected ? 'border-blue-500/40 bg-blue-500/5' : 'border-slate-700 bg-slate-800/50'
    } ${isEmpty ? 'opacity-50' : ''}`}>
      {/* Main row */}
      <div className="flex items-center gap-2 px-3 py-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          disabled={isEmpty}
          className="accent-blue-500 shrink-0"
        />
        <div className="shrink-0">{SECTION_ICONS[section.key]}</div>
        <span className="text-sm text-white flex-1">{section.label}</span>
        <span className="text-xs text-slate-400">{section.count} item{section.count !== 1 ? 's' : ''}</span>
        {section.conflict_count > 0 && (
          <span className="text-xs bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">
            {section.conflict_count} conflict{section.conflict_count !== 1 ? 's' : ''}
          </span>
        )}
        {section.conflict_count > 0 && selected && (
          <select
            className="bg-slate-700 border border-slate-600 rounded text-xs text-white px-2 py-1 outline-none"
            value={conflictMode}
            onChange={e => onConflictChange(e.target.value)}
            onClick={e => e.stopPropagation()}
          >
            <option value="skip">Skip existing</option>
            <option value="overwrite">Overwrite existing</option>
          </select>
        )}
        {section.count > 0 && (
          <button onClick={onToggleExpand} className="p-0.5 hover:bg-slate-700 rounded">
            {expanded
              ? <ChevronDown size={14} className="text-slate-400" />
              : <ChevronRight size={14} className="text-slate-400" />
            }
          </button>
        )}
      </div>

      {/* Expanded item list */}
      {expanded && section.count > 0 && (
        <div className="border-t border-slate-700 px-3 py-2 space-y-0.5 max-h-40 overflow-y-auto">
          {section.items.map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                item.conflict ? 'bg-amber-400' : 'bg-green-400'
              }`} />
              <span className="text-slate-300 flex-1 truncate">{item.name}</span>
              {item.conflict && (
                <span className="text-amber-400/70 shrink-0">
                  exists{item.conflict_project ? ` in ${item.conflict_project}` : ''}
                </span>
              )}
              {!item.conflict && <span className="text-green-400/70 shrink-0">new</span>}
            </div>
          ))}
        </div>
      )}

      {/* Section warnings */}
      {section.warnings.length > 0 && selected && (
        <div className="border-t border-slate-700 px-3 py-1.5">
          {section.warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-400/70 flex items-start gap-1">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
              {w}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
