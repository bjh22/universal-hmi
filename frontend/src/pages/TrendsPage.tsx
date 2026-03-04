import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { api } from '../lib/api';
import type { Tag, TrendDataPoint } from '../types';

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316'];
const TIME_RANGES = [
  { label: '1h', hours: 1 },
  { label: '8h', hours: 8 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
  { label: '30d', hours: 720 },
];

export function TrendsPage() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTags, setSelectedTags] = useState<number[]>([]);
  const [timeRange, setTimeRange] = useState(1);
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    api.getTags().then((all) => {
      setTags(all.filter((t: Tag) => t.trending_enabled));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedTags.length === 0) {
      setChartData([]);
      return;
    }
    Promise.all(selectedTags.map((id) => api.getTrendData(id, timeRange)))
      .then((results) => {
        // Merge data by timestamp
        const merged: Record<string, any> = {};
        results.forEach((data, i) => {
          const tag = tags.find((t) => t.id === selectedTags[i]);
          data.forEach((pt: TrendDataPoint) => {
            if (!merged[pt.timestamp]) {
              merged[pt.timestamp] = { time: new Date(pt.timestamp).toLocaleTimeString() };
            }
            merged[pt.timestamp][tag?.name || `tag_${i}`] = pt.value;
          });
        });
        setChartData(Object.values(merged).sort((a, b) => a.time.localeCompare(b.time)));
      })
      .catch(() => {});
  }, [selectedTags, timeRange, tags]);

  const toggleTag = (id: number) => {
    setSelectedTags((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : prev.length < 8 ? [...prev, id] : prev
    );
  };

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-100 mb-4">Historical Trends</h1>

      {/* Time range selector */}
      <div className="flex gap-1 mb-4">
        {TIME_RANGES.map((tr) => (
          <button
            key={tr.label}
            onClick={() => setTimeRange(tr.hours)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium ${
              timeRange === tr.hours ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {tr.label}
          </button>
        ))}
      </div>

      <div className="flex gap-4">
        {/* Tag selector */}
        <div className="w-56 shrink-0 bg-slate-800 rounded-xl p-3 border border-slate-700">
          <div className="text-xs text-slate-400 font-medium uppercase mb-2">Tags (max 8)</div>
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {tags.map((tag) => (
              <label
                key={tag.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-700 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedTags.includes(tag.id)}
                  onChange={() => toggleTag(tag.id)}
                  className="rounded"
                />
                <span className="text-sm text-slate-300 truncate">{tag.name}</span>
              </label>
            ))}
            {tags.length === 0 && <p className="text-sm text-slate-500">No trending tags configured</p>}
          </div>
        </div>

        {/* Chart */}
        <div className="flex-1 bg-slate-800 rounded-xl p-4 border border-slate-700 min-h-[400px]">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Legend />
                {selectedTags.map((id, i) => {
                  const tag = tags.find((t) => t.id === id);
                  return (
                    <Line
                      key={id}
                      type="monotone"
                      dataKey={tag?.name || `tag_${i}`}
                      stroke={COLORS[i % COLORS.length]}
                      dot={false}
                      strokeWidth={2}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-96 text-slate-500">
              Select tags to view trends
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
