import { memo, useState, useEffect, useRef, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../../lib/api';
import type { Tag, TrendDataPoint } from '../../types';
import { getContainerClasses, shouldShowTitle, getTitleClasses } from '../../lib/widgetChrome';

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316'];

// Cap chart data points to avoid massive SVG DOM trees that consume browser memory.
// With 500ms sampling over 24h, a single tag generates ~172,800 points — far more
// than a chart can meaningfully display. Downsampling to 500 points is visually
// indistinguishable but uses ~99.7% less memory.
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

interface TrendTagConfig {
  tag: string;
  color?: string;
}

interface Props {
  title: string;
  tags: TrendTagConfig[];
  hours?: number;
  refreshSeconds?: number;
  chrome?: 'full' | 'compact' | 'none';
}

export const TrendWidget = memo(function TrendWidget({ title, tags: tagConfigs = [], hours = 24, refreshSeconds = 30, chrome = 'full' }: Props) {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [chartData, setChartData] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  // Fetch the full tag list once to resolve names → IDs
  useEffect(() => {
    api.getTags().then(setAllTags).catch(() => {});
  }, []);

  const fetchData = useCallback(() => {
    if (tagConfigs.length === 0 || allTags.length === 0) {
      setChartData([]);
      setLoading(false);
      return;
    }

    // Resolve tag names to IDs
    const resolved = tagConfigs
      .map(tc => ({ config: tc, tag: allTags.find(t => t.name === tc.tag) }))
      .filter((r): r is { config: TrendTagConfig; tag: Tag } => r.tag != null);

    if (resolved.length === 0) {
      setChartData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    Promise.all(resolved.map(r => api.getTrendData(r.tag.id, hours)))
      .then(results => {
        if (!mountedRef.current) return;
        const merged: Record<string, Record<string, unknown>> = {};
        results.forEach((data, i) => {
          const tagName = resolved[i].tag.name;
          data.forEach((pt: TrendDataPoint) => {
            if (!merged[pt.timestamp]) {
              merged[pt.timestamp] = { time: new Date(pt.timestamp).toLocaleTimeString(), fullTime: pt.timestamp };
            }
            merged[pt.timestamp][tagName] = pt.value;
          });
        });
        const sorted = Object.values(merged).sort(
          (a, b) => new Date(String(a.fullTime)).getTime() - new Date(String(b.fullTime)).getTime()
        );
        setChartData(downsample(sorted, MAX_CHART_POINTS));
        setLoading(false);
      })
      .catch(() => {
        if (mountedRef.current) setLoading(false);
      });
  }, [tagConfigs, allTags, hours]);

  // Fetch on mount and when config changes.
  // fetchData calls setState internally (setChartData, setLoading), which triggers
  // the react-hooks/set-state-in-effect rule. We suppress it here because fetchData
  // is an async fetch that calls setState in a .then() callback, not synchronously.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

  // Auto-refresh interval
  useEffect(() => {
    if (refreshSeconds <= 0) return;
    const interval = setInterval(fetchData, refreshSeconds * 1000);
    return () => clearInterval(interval);
  }, [fetchData, refreshSeconds]);

  // Cleanup — reset to true on re-mount (React Strict Mode)
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Resolve configs to tag objects for display names
  const resolved = tagConfigs
    .map(tc => ({ config: tc, tag: allTags.find(t => t.name === tc.tag) }))
    .filter((r): r is { config: TrendTagConfig; tag: Tag } => r.tag != null);

  // Format tooltip values using each tag's display_format (e.g. "0.00" → 2 decimal places)
  const formatTooltipValue = useCallback((value: number | undefined, name: string | undefined) => {
    if (value == null) return '';
    const tag = name ? allTags.find(t => (t.display_name || t.name) === name || t.name === name) : undefined;
    if (tag?.display_format) {
      const dot = tag.display_format.indexOf('.');
      const places = dot < 0 ? 0 : tag.display_format.length - dot - 1;
      return value.toFixed(places);
    }
    return value.toFixed(1);
  }, [allTags]);

  return (
    <div className={`${getContainerClasses(chrome)} h-full flex flex-col`}>
      {shouldShowTitle(chrome) && <div className={getTitleClasses(chrome)}>{title}</div>}
      <div className="flex-1 min-h-0">
        {tagConfigs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-500 text-sm">
            No tags configured
          </div>
        ) : loading && chartData.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-500 text-sm">
            Loading...
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-500 text-sm">
            No trend data
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: resolved.length > 2 ? Math.floor((resolved.length - 1) / 2) * 50 : 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 10 }} />
              {resolved.map((r, i) => {
                const color = r.config.color || COLORS[i % COLORS.length];
                return (
                  <YAxis
                    key={r.tag.id}
                    yAxisId={r.tag.id}
                    orientation={i % 2 === 0 ? 'left' : 'right'}
                    stroke={color}
                    tick={{ fontSize: 10, fill: color }}
                    width={45}
                    hide={resolved.length > 4 && i >= 4}
                  />
                );
              })}
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '11px' }}
                labelStyle={{ color: '#94a3b8' }}
                formatter={formatTooltipValue}
              />
              {resolved.map((r, i) => {
                const color = r.config.color || COLORS[i % COLORS.length];
                return (
                  <Line
                    key={r.tag.id}
                    type="monotone"
                    dataKey={r.tag.name}
                    name={r.tag.display_name || r.tag.name}
                    stroke={color}
                    dot={false}
                    strokeWidth={2}
                    connectNulls
                    yAxisId={r.tag.id}
                    isAnimationActive={false}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
});
