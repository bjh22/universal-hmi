# CLAUDE.md — OPC-UA Industrial HMI

## Project Overview

Full-stack industrial HMI (Human-Machine Interface) for monitoring and controlling industrial equipment via OPC-UA, Modbus, EtherNet/IP, and MQTT. Python/FastAPI backend with React/TypeScript frontend and a drag-and-drop screen designer.

## Architecture

```
backend/               Python FastAPI application
  app/
    api/               Route handlers (alarms, auth, screens, tags, websocket, etc.)
    core/              Config (pydantic-settings), database (async SQLAlchemy), security (JWT)
    drivers/           Protocol drivers (opcua, modbus, ethernet_ip, mqtt) + base.py + driver_manager.py
    models/            SQLAlchemy 2.0 models (user, tag, alarm, screen, job, trend, audit, production, datasource)
    services/          Business logic (tag_engine, alarm_service, trend_service, script_engine, audit_service)
    main.py            FastAPI app with lifespan, CORS, static file serving
    seed.py            Database seeder with default users and demo tags
  run.py               Entry point (uvicorn on port 8080)
  hmi.db               SQLite database
  requirements.txt
frontend/              React SPA (Vite + TypeScript)
  src/
    components/
      designer/        Screen designer (DesignCanvas, PropertyPanel, WidgetPalette, EditorToolbar)
      widgets/         Runtime widgets (StatusIndicator, Gauge, Toggle, CommandButton, etc.)
      layout/          AppShell (sidebar nav, header)
    hooks/             useDesignMode, useWebSocket, useAuth
    lib/               api.ts (fetch wrapper), textStyle.ts
    pages/             Dashboard, Alarms, Trends, Jobs, Reports, Settings, Login
    types/index.ts     All TypeScript interfaces
  vite.config.ts       Vite config with /api and /ws proxy to backend
```

## Tech Stack

**Backend:** FastAPI, SQLAlchemy 2.0 (async), SQLite (aiosqlite), Alembic, Pydantic v2, python-jose (JWT/HS256), passlib+bcrypt, asyncua, pycomm3, pymodbus, aiomqtt

**Frontend:** React 19, TypeScript 5.9, Vite 7, Shadcn/ui, Tailwind CSS 4, React Router 7, Recharts, Lucide icons, clsx

## Commands

**Linux / macOS:**
```bash
./dev.sh install    # Install all dependencies (pip + npm)
./dev.sh dev        # Start backend (:8080) + frontend (:5173) dev servers
./dev.sh build      # TypeScript check + Vite build
./dev.sh lint       # ESLint
./dev.sh check      # Build + lint
./dev.sh seed       # Seed database with default users/tags
```

**Windows (CMD):**
```cmd
dev.bat install     # Install all dependencies (pip + npm)
dev.bat dev         # Start backend (:8080) + frontend (:5173) dev servers
dev.bat build       # TypeScript check + Vite build
dev.bat lint        # ESLint
dev.bat check       # Build + lint
dev.bat seed        # Seed database with default users/tags
```

**Windows (PowerShell):**
```powershell
.\dev.ps1 install   # Install all dependencies (pip + npm)
.\dev.ps1 dev       # Start backend (:8080) + frontend (:5173) dev servers
.\dev.ps1 build     # TypeScript check + Vite build
.\dev.ps1 lint      # ESLint
.\dev.ps1 check     # Build + lint
.\dev.ps1 seed      # Seed database with default users/tags
```

**Frontend only:**
```bash
cd frontend
npm run dev          # Vite dev server on :5173
npm run build        # tsc -b && vite build
npm run lint         # eslint .
npx tsc --noEmit     # Type check only
```

**Backend only:**
```bash
cd backend
python run.py        # Start on :8080
python -m app.seed   # Seed database
```

## Authentication & Roles

JWT tokens stored in localStorage (`hmi_token`). Two login modes: password and PIN.

**Roles (ascending privilege):** `unauthenticated` < `operator` < `supervisor` < `engineer` < `designer`

Only `designer` role can edit screens. Role checks via `require_role()` dependency.

**Default seed users:**
| Username   | Credential | Login mode | Role       |
|------------|------------|------------|------------|
| admin      | admin      | password   | designer   |
| engineer   | engineer   | password   | engineer   |
| supervisor | 1234       | PIN        | supervisor |
| operator   | 0000       | PIN        | operator   |

## Backend Configuration

Environment variables prefixed with `HMI_` (or `.env` file):
- `HMI_DATABASE_URL` — default: `sqlite+aiosqlite:///./hmi.db`
- `HMI_SECRET_KEY` — JWT signing key
- `HMI_ACCESS_TOKEN_EXPIRE_MINUTES` — 480 (8 hours)
- `HMI_WS_UPDATE_INTERVAL_MS` — 500 (tag update frequency)
- `HMI_TREND_RETENTION_DAYS` — 90
- `HMI_SCRIPT_TIMEOUT_SECONDS` — 5
- `HMI_HOST`, `HMI_PORT`, `HMI_DEBUG`

## Key API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Password login |
| POST | `/api/auth/pin-login` | PIN login |
| GET | `/api/tags/` | List tags |
| GET | `/api/tags/values` | Current tag values |
| POST | `/api/tags/values/{name}/write` | Write tag value |
| GET | `/api/screens/` | List screens |
| GET | `/api/screens/by-slug/{slug}` | Get screen by slug |
| POST | `/api/screens/` | Create screen |
| PUT | `/api/screens/{id}` | Update screen layout |
| DELETE | `/api/screens/{id}` | Delete screen |
| GET | `/api/alarms/active` | Active alarms |
| POST | `/api/alarms/{id}/acknowledge` | Acknowledge alarm |
| GET | `/api/trends/data/{tag_id}` | Trend data |
| WS | `/ws` | Real-time tag values + alarms |

**WebSocket messages:** `snapshot` (initial), `tag_update` (deltas), `alarm` (state changes), `keepalive` (30s)

## Key Backend Services

- **TagEngine** (`services/tag_engine.py`): In-memory tag store, simulation engine (sine/ramp/random/toggle/enum_cycle), 500ms update cycle, publishes to WebSocket subscribers
- **AlarmService** (`services/alarm_service.py`): Two alarm modes — **threshold** (hi/hi_hi/lo/lo_lo for analog tags) and **boolean** (discrete tag true/false triggers alarm). State machine with four states: `active_unacked`, `active_acked`, `inactive_unacked` (alarm clears before acknowledgment), `inactive` (cleared). History recording.
- **TrendService** (`services/trend_service.py`): Time-series sampling, 90-day retention
- **ScriptEngine** (`services/script_engine.py`): Sandboxed Python execution for button actions (5s timeout, restricted builtins)

## Key Frontend Patterns

- **API client:** `lib/api.ts` — centralized fetch wrapper with JWT Bearer headers
- **WebSocket:** `useWebSocket` hook — auto-reconnect, maintains `tagValues` and `alarms` state
- **Screen designer:** `useDesignMode` hook — full editor state machine (widgets, selection, undo/redo with useState for reactivity, clipboard, z-order, alignment/distribute, locking, zoom 0.5x-2x)
- **Widget system:** `WidgetRenderer` dispatches by `widget.type`. Types: `status_indicator`, `gauge`, `counter`, `toggle`, `command_button`, `parameter_input`, `text_label`, `text_value`, `alarm_summary`, `multi_value`, `dropdown_select`, `oee`
- **Tag binding:** Widgets bind to tags by name. `TagPicker` component provides searchable dropdown
- **Visibility/Enabled:** Widgets support `visible`, `visibleTag`, `visibleRoles`, `enabled`, `enabledTag`, `enabledRoles` for conditional runtime rendering. Conditions can be combined — tag-based and role-based conditions on the same property are AND-ed.
- **Screen management:** Create/delete screens via modal dialog, screen tabs for navigation

## Adding a New Widget Type

1. Create component in `frontend/src/components/widgets/NewWidget.tsx`
2. Add case in `WidgetRenderer.tsx` switch statement
3. Register in `WidgetPalette.tsx` `WIDGET_TYPES` array with icon, category, default size/props
4. Add property panel sections in `PropertyPanel.tsx` (if type-specific props needed)

## Code Conventions

- **Frontend:** Functional components + hooks only. Tailwind dark theme (slate-800/900). `useCallback` for all prop handlers. No Redux — hooks + localStorage. Relative imports (no `@/` alias).
- **Backend:** Async everywhere. SQLAlchemy 2.0 with `Mapped`/`mapped_column`. Pydantic v2 models with `from_attributes = True`. One model file per table. One router file per resource. JSON fields for complex config (alarm_config, simulation_config, layout). UTC timestamps.
- **File naming:** Backend snake_case (`tag_engine.py`). Frontend PascalCase components (`StatusIndicator.tsx`), camelCase hooks (`useAuth.ts`).

## Important Files

- `frontend/src/hooks/useDesignMode.ts` — Editor state machine (undo/redo, clipboard, alignment, z-order)
- `frontend/src/components/designer/DesignCanvas.tsx` — Canvas with drag/resize, marquee selection, context menu
- `frontend/src/components/designer/PropertyPanel.tsx` — Widget property editor with TagPicker
- `frontend/src/components/widgets/WidgetRenderer.tsx` — Widget type dispatch
- `frontend/src/components/designer/WidgetPalette.tsx` — `WIDGET_TYPES` registry
- `frontend/src/pages/DashboardPage.tsx` — Runtime view + design mode toggle
- `frontend/src/types/index.ts` — All TypeScript interfaces
- `frontend/src/lib/api.ts` — HTTP client with all endpoints
- `frontend/src/hooks/useWebSocket.ts` — Real-time data connection
- `backend/app/main.py` — FastAPI app setup and lifespan
- `backend/app/services/tag_engine.py` — Tag polling, simulation, value store
- `backend/app/core/config.py` — Settings (env vars with `HMI_` prefix)
- `backend/app/api/deps.py` — Auth dependencies (`require_role`)

## Database Tables

users, tags, tag_templates, data_sources, alarms, alarm_history, trends, screens, screen_versions, screen_templates, jobs, production_runs, audit_logs

## Keyboard Shortcuts (Design Mode)

- `Ctrl+E` — Toggle design mode
- `Ctrl+S` — Save
- `Ctrl+Z` / `Ctrl+Shift+Z` — Undo / Redo
- `Ctrl+C/X/V/D` — Copy / Cut / Paste / Duplicate
- `Ctrl+A` — Select all
- `Ctrl+]` / `Ctrl+[` — Bring forward / Send backward
- `Ctrl+Shift+]` / `Ctrl+Shift+[` — Bring to front / Send to back
- `Delete` — Delete selected (Shift+Delete skips confirm)
- `Escape` — Clear selection
