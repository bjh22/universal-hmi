import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { WidgetRenderer } from '../components/widgets/WidgetRenderer';
import type { ScreenData, Widget, TagValue } from '../types';

interface Props {
  tagValues: Record<string, TagValue>;
}

export function DashboardPage({ tagValues }: Props) {
  const { slug } = useParams<{ slug?: string }>();
  const [screens, setScreens] = useState<ScreenData[]>([]);
  const [activeScreen, setActiveScreen] = useState<ScreenData | null>(null);
  const [widgets, setWidgets] = useState<Widget[]>([]);

  useEffect(() => {
    api.getScreens().then(setScreens).catch(() => {});
  }, []);

  useEffect(() => {
    const target = slug || 'dashboard';
    api.getScreenBySlug(target)
      .then((s) => {
        setActiveScreen(s);
        setWidgets(JSON.parse(s.layout || '[]'));
      })
      .catch(() => {
        // If no screen found, show empty
        setActiveScreen(null);
        setWidgets([]);
      });
  }, [slug]);

  return (
    <div>
      {/* Screen tabs */}
      {screens.length > 1 && (
        <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
          {screens.map((s) => (
            <a
              key={s.id}
              href={`/screen/${s.slug}`}
              className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                activeScreen?.id === s.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {s.name}
            </a>
          ))}
        </div>
      )}

      {/* Widget grid */}
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: 'repeat(12, 1fr)', gridAutoRows: '80px' }}
      >
        {widgets.map((w) => (
          <div
            key={w.id}
            style={{
              gridColumn: `${w.x + 1} / span ${w.w}`,
              gridRow: `${w.y + 1} / span ${w.h}`,
            }}
          >
            <WidgetRenderer widget={w} tagValues={tagValues} />
          </div>
        ))}
      </div>

      {widgets.length === 0 && (
        <div className="text-center text-slate-500 mt-20">
          <p className="text-lg">No widgets configured</p>
          <p className="text-sm mt-1">Add widgets using the screen designer</p>
        </div>
      )}
    </div>
  );
}
