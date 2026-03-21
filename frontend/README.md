# Frontend — Browser-Based User Interface

This folder contains the browser-based user interface (the "frontend") — the screens, widgets, navigation, and screen designer that operators, supervisors, and engineers interact with.

## What's in here

| Folder | Purpose |
|--------|---------|
| `src/components/widgets/` | Widget components (gauges, status indicators, toggles, command buttons, etc.) |
| `src/components/designer/` | The drag-and-drop screen editor (widget palette, canvas, property panel, toolbar) |
| `src/components/layout/` | Navigation sidebar, header bar, and application shell |
| `src/components/reports/` | OEE charts, downtime Pareto, production trend charts |
| `src/hooks/` | Shared logic modules — login state (`useAuth`), live data connection (`useWebSocket`), screen editor state (`useDesignMode`) |
| `src/pages/` | Full-page views — Dashboard, Alarms, Trends, Jobs, Reports, Settings, Service, etc. |
| `src/lib/api.ts` | HTTP client that calls the backend API (handles authentication automatically) |
| `src/types/index.ts` | Data structure definitions used throughout the frontend |

## Quick reference

```bash
# Start development server (hot-reloading — changes appear instantly in the browser)
npm run dev

# Build for production (output goes to dist/)
npm run build

# Check code for errors without building
npx tsc --noEmit

# Run code quality checks
npm run lint

# Run automated tests
npx vitest run
```

## Technology

- **React** — UI framework that builds the interface from reusable components
- **TypeScript** — JavaScript with type checking (catches errors before runtime, like a PLC compiler)
- **Vite** — Build tool that compiles the code for production and provides hot-reload during development
- **Tailwind CSS** — Utility-based styling system (dark industrial theme)
- **Recharts** — Charting library used for trends, OEE, and production reports

## How it connects to the backend

- **HTTP API calls** (`src/lib/api.ts`) — for reading/writing configuration (tags, screens, users, settings)
- **WebSocket** (`src/hooks/useWebSocket.ts`) — for receiving live tag values and alarm updates in real time (500ms push cycle)

During development, the Vite dev server (port 5173) proxies API and WebSocket requests to the backend (port 8080). In production, the backend serves the compiled frontend files directly.

For more details on extending the frontend, see the [Developer Guide](../DEVELOPER.md).
