import { useEffect, useState, useCallback, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Download, Save, FolderOpen } from 'lucide-react';
import { api } from '../lib/api';
import { TouchTextInput } from '../components/widgets/TouchTextInput';
import type { Tag, TrendDataPoint } from '../types';

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316'];

const MAX_CHART_POINTS = 500;

function downsample<T>(data: T[], maxPoints: number): T[] {
  if (data.length <= maxPoints) return data;
  const step = data.length / maxPoints;
  const result: T[] = [data[0]];
  for (let i = 1; i < maxPoints - 1; i++) {
    result.push(data[Math.round(i * step)]);
  }
  result.push(data[data.length - 1]);
  return result;
}
const TIME_RANGES = [
  { label: '1h', hours: 1 },
  { label: '8h', hours: 8 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
  { label: '30d', hours: 720 },
];

interface TrendView {
  id?: number;
  name: string;
  tag_ids: number[];
  hours: number;
}

export function TrendsPage() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTags, setSelectedTags] = useState<number[]>([]);
  const [timeRange, setTimeRange] = useState(1);
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [chartData, setChartData] = useState<Record<string, unknown>[]>([]);
  const [savedViews, setSavedViews] = useState<TrendView[]>([]);
  const [viewName, setViewName] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);

  useEffect(() => {
    api.getTags().then((all) => {
      setTags(all.filter((t: Tag) => t.trending_enabled));
    }).catch(() => {});
    api.getTrendViews().then(views => setSavedViews(views as unknown as TrendView[])).catch(() => {});
  }, []);

  const fetchTrendData = useCallback(() => {
    if (selectedTags.length === 0) {
      return;
    }
    const fetchData = useCustomRange && customStart
      ? (id: number) => api.getTrendData(id, timeRange, customStart, customEnd || undefined)
      : (id: number) => api.getTrendData(id, timeRange);
    Promise.all(selectedTags.map(fetchData))
      .then((results) => {
        const merged: Record<string, Record<string, unknown>> = {};
        results.forEach((data, i) => {
          const tag = tags.find((t) => t.id === selectedTags[i]);
          data.forEach((pt: TrendDataPoint) => {
            if (!merged[pt.timestamp]) {
              merged[pt.timestamp] = { time: new Date(pt.timestamp).toLocaleTimeString(), fullTime: pt.timestamp };
            }
            merged[pt.timestamp][tag?.name || `tag_${i}`] = pt.value;
          });
        });
        const sorted = Object.values(merged).sort((a, b) =>
          new Date(String(a.fullTime)).getTime() - new Date(String(b.fullTime)).getTime()
        );
        setChartData(downsample(sorted, MAX_CHART_POINTS));
      })
      .catch(() => {});
  }, [selectedTags, timeRange, useCustomRange, customStart, customEnd, tags]);

  // Fetch on mount and when config changes
  useEffect(() => {
    fetchTrendData();
  }, [fetchTrendData]);

  // Auto-refresh every 10 seconds for live updating (skip for custom time ranges)
  useEffect(() => {
    if (selectedTags.length === 0 || useCustomRange) return;
    const interval = setInterval(fetchTrendData, 10_000);
    return () => clearInterval(interval);
  }, [fetchTrendData, selectedTags.length, useCustomRange]);

  // Clear chart data when no tags are selected
  const displayChartData = useMemo(
    () => selectedTags.length === 0 ? [] : chartData,
    [selectedTags.length, chartData]
  );

  // Format tooltip values using each tag's display_format (e.g. "0.00" → 2 decimal places)
  const formatTooltipValue = useCallback((value: number | undefined, name: string | undefined) => {
    if (value == null) return '';
    const tag = name ? tags.find(t => (t.display_name || t.name) === name || t.name === name) : undefined;
    if (tag?.display_format) {
      const dot = tag.display_format.indexOf('.');
      const places = dot < 0 ? 0 : tag.display_format.length - dot - 1;
      return value.toFixed(places);
    }
    return value.toFixed(1);
  }, [tags]);

  const toggleTag = (id: number) => {
    setSelectedTags((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : prev.length < 8 ? [...prev, id] : prev
    );
  };

  const exportCsv = useCallback(() => {
    if (displayChartData.length === 0) return;
    const tagKeys = selectedTags.map(id => tags.find(t => t.id === id)?.name || `tag_${id}`);
    const tagDisplayNames = selectedTags.map(id => { const t = tags.find(t => t.id === id); return t?.display_name || t?.name || `tag_${id}`; });
    const header = ['Timestamp', ...tagDisplayNames].join(',');
    const rows = displayChartData.map(row =>
      [row.fullTime, ...tagKeys.map(n => row[n] ?? '')].join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `trends_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [displayChartData, selectedTags, tags]);

  const handleSaveView = useCallback(() => {
    if (!viewName.trim() || selectedTags.length === 0) return;
    const view: TrendView = { name: viewName, tag_ids: selectedTags, hours: timeRange };
    setSavedViews(prev => [...prev, view]);
    setViewName('');
    setShowSaveDialog(false);
  }, [viewName, selectedTags, timeRange]);

  const handleLoadView = useCallback((view: TrendView) => {
    setSelectedTags(view.tag_ids.filter(id => tags.some(t => t.id === id)));
    setTimeRange(view.hours);
    setUseCustomRange(false);
    setShowLoadDialog(false);
  }, [tags]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-slate-100">Historical Trends</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowLoadDialog(true)}
            className="flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm"
          >
            <FolderOpen size={16} /> Load View
          </button>
          <button
            onClick={() => setShowSaveDialog(true)}
            disabled={selectedTags.length === 0}
            className="flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm disabled:opacity-50"
          >
            <Save size={16} /> Save View
          </button>
          <button
            onClick={exportCsv}
            disabled={displayChartData.length === 0}
            className="flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm disabled:opacity-50"
          >
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

      {/* Save dialog */}
      {showSaveDialog && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-4">
          <div className="text-sm font-medium text-slate-300 mb-2">Save Trend View</div>
          <div className="flex gap-2">
            <TouchTextInput
              value={viewName}
              onChange={setViewName}
              placeholder="View name"
              title="Trend View Name"
              className="flex-1 bg-slate-700 border border-slate-600 rounded-md px-3 py-2.5 min-h-[44px] text-sm text-white flex items-center"
            />
            <button onClick={handleSaveView} className="px-4 py-2.5 min-h-[44px] bg-[var(--hmi-accent)] rounded-md text-sm text-white">Save</button>
            <button onClick={() => setShowSaveDialog(false)} className="px-4 py-2.5 min-h-[44px] bg-slate-700 rounded-md text-sm text-slate-300">Cancel</button>
          </div>
        </div>
      )}

      {/* Load dialog */}
      {showLoadDialog && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-4">
          <div className="text-sm font-medium text-slate-300 mb-2">Load Trend View</div>
          {savedViews.length > 0 ? (
            <div className="space-y-1">
              {savedViews.map((v, i) => (
                <button
                  key={i}
                  onClick={() => handleLoadView(v)}
                  className="w-full text-left px-3 py-2.5 min-h-[44px] rounded-md hover:bg-slate-700 text-sm text-slate-300"
                >
                  <span className="font-medium">{v.name}</span>
                  <span className="text-slate-500 ml-2">{v.tag_ids.length} tags, {v.hours}h</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No saved views</p>
          )}
          <button onClick={() => setShowLoadDialog(false)} className="mt-2 px-4 py-2.5 min-h-[44px] bg-slate-700 rounded-md text-sm text-slate-300">Close</button>
        </div>
      )}

      {/* Time range selector */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex gap-1">
          {TIME_RANGES.map((tr) => (
            <button
              key={tr.label}
              onClick={() => { setTimeRange(tr.hours); setUseCustomRange(false); }}
              className={`px-3 py-2.5 min-h-[44px] rounded-md text-sm font-medium ${
                !useCustomRange && timeRange === tr.hours ? 'bg-[var(--hmi-accent)] text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {tr.label}
            </button>
          ))}
        </div>
        <div className="border-l border-slate-700 pl-2 flex items-center gap-2">
          <button
            onClick={() => setUseCustomRange(!useCustomRange)}
            className={`px-3 py-2.5 min-h-[44px] rounded-md text-sm font-medium ${
              useCustomRange ? 'bg-[var(--hmi-accent)] text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Custom
          </button>
          {useCustomRange && (
            <>
              <input
                type="datetime-local"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded px-3 py-2.5 min-h-[44px] text-sm text-white"
              />
              <span className="text-slate-500 text-sm">to</span>
              <input
                type="datetime-local"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded px-3 py-2.5 min-h-[44px] text-sm text-white"
              />
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        {/* Tag selector */}
        <div className="w-full md:w-48 shrink-0 bg-slate-800 rounded-xl p-3 border border-slate-700">
          <div className="text-xs text-slate-400 font-medium uppercase mb-2">Tags (max 8)</div>
          <div className="space-y-1 max-h-48 md:max-h-96 overflow-y-auto">
            {tags.map((tag) => (
              <label
                key={tag.id}
                className="flex items-center gap-2 px-2 py-2.5 min-h-[44px] rounded-md hover:bg-slate-700 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedTags.includes(tag.id)}
                  onChange={() => toggleTag(tag.id)}
                  className="rounded"
                />
                <span className="text-sm text-slate-300 truncate">{tag.display_name || tag.name}</span>
              </label>
            ))}
            {tags.length === 0 && <p className="text-sm text-slate-500">No trending tags configured</p>}
          </div>
        </div>

        {/* Chart */}
        <div className="flex-1 bg-slate-800 rounded-xl p-4 border border-slate-700 min-h-[300px]">
          {displayChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={displayChartData} margin={{ left: selectedTags.length > 2 ? (Math.floor((selectedTags.length - 1) / 2)) * 60 : 0, right: selectedTags.length > 2 ? (Math.floor(selectedTags.length / 2) - 1) * 60 : 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 11 }} />
                {selectedTags.map((id, i) => {
                  const color = COLORS[i % COLORS.length];
                  return (
                    <YAxis
                      key={id}
                      yAxisId={id}
                      orientation={i % 2 === 0 ? 'left' : 'right'}
                      stroke={color}
                      tick={{ fontSize: 11, fill: color }}
                      width={50}
                      hide={selectedTags.length > 4 && i >= 4}
                    />
                  );
                })}
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                  labelStyle={{ color: '#94a3b8' }}
                  formatter={formatTooltipValue}
                />
                <Legend />
                {selectedTags.map((id, i) => {
                  const tag = tags.find((t) => t.id === id);
                  return (
                    <Line
                      key={id}
                      type="monotone"
                      dataKey={tag?.name || `tag_${i}`}
                      name={tag?.display_name || tag?.name || `tag_${i}`}
                      stroke={COLORS[i % COLORS.length]}
                      dot={false}
                      strokeWidth={2}
                      connectNulls
                      yAxisId={id}
                      isAnimationActive={false}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-96 text-slate-500">
              {selectedTags.length > 0 ? 'No trend data available for selected time range' : 'Select tags to view trends'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
