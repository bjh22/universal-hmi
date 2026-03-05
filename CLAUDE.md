# CLAUDE.md — OPC-UA Industrial HMI

## Project Overview

This is a full-stack industrial HMI (Human-Machine Interface) application for monitoring and controlling industrial equipment via OPC-UA and other protocols. It consists of a Python/FastAPI backend and a React/TypeScript frontend with a drag-and-drop screen designer.

## Architecture

```
backend/           Python FastAPI application
  app/
    api/           Route handlers (alarms, auth, screens, tags, etc.)
    core/          Config, database, security (JWT auth)
    drivers/       Protocol drivers (OPC-UA, Modbus, EtherNet/IP, MQTT)
    models/        SQLAlchemy models (SQLite via aiosqlite)
    services/      Business logic (alarm_service, tag_engine, trend_service, script_engine)
    main.py        FastAPI app with lifespan, CORS, static file serving
    seed.py        Database seeder (run via `./dev.sh seed`)
frontend/          React SPA (Vite + TypeScript)
  src/
    components/
      designer/    Screen designer UI (DesignCanvas, PropertyPanel, WidgetPalette, EditorToolbar)
      widgets/     Runtime widget components (StatusIndicator, Gauge, Toggle, etc.)
      layout/      AppShell, navigation
    hooks/         Custom hooks (useDesignMode, useWebSocket, useAuth)
    lib/           API client, utilities
    pages/         Page components (Dashboard, Alarms, Trends, Jobs, Reports, Settings, Login)
    types/         TypeScript type definitions
```

## Tech Stack

**Backend:** FastAPI, SQLAlchemy 2.0 (async), SQLite (aiosqlite), Alembic, Pydantic v2, python-jose (JWT), asyncua (OPC-UA), pycomm3 (EtherNet/IP), pymodbus, aiomqtt

**Frontend:** React 19, TypeScript 5.9, Vite 7, Tailwind CSS 4, React Router 7, Recharts, Lucide icons

## Commands

```bash
./dev.sh install    # Install all dependencies (pip + npm)
./dev.sh dev        # Start backend (:8080) + frontend (:5173) dev servers
./dev.sh build      # TypeScript check + Vite build
./dev.sh lint       # ESLint
./dev.sh check      # Build + lint
./dev.sh seed       # Seed database with default data
```

**Frontend only:**
```bash
cd frontend
npm run dev          # Vite dev server
npm run build        # tsc -b && vite build
npm run lint         # eslint .
npx tsc --noEmit     # Type check only
```

**Backend only:**
```bash
cd backend
python run.py        # Start backend server on port 8080
python -m app.seed   # Seed database
```

## Key Patterns

- **API client:** `frontend/src/lib/api.ts` — centralized fetch wrapper with JWT auth headers
- **WebSocket:** Real-time tag values and alarms pushed to frontend via `/ws`
- **Screen designer:** `useDesignMode` hook manages all editor state (widgets, selection, undo/redo, clipboard, z-order, alignment). Widgets are stored as JSON in the screen's `layout` field.
- **Widget system:** `WidgetRenderer` dispatches by `widget.type` to specific components. Each widget receives `tagValues` for live data binding. Widget types: `status_indicator`, `gauge`, `counter`, `toggle`, `command_button`, `parameter_input`, `text_label`, `text_value`, `alarm_summary`, `multi_value`, `dropdown_select`.
- **Tag binding:** Widgets bind to OPC-UA/Modbus/MQTT tags by name. The `TagPicker` component provides searchable dropdown for tag selection.
- **Visibility/Enabled:** Widgets support `visible`, `visibleTag`, `enabled`, `enabledTag` properties for conditional rendering at runtime.
- **Auth:** JWT tokens stored in localStorage. Roles: `operator`, `designer`, `admin`. Only `designer` role can edit screens.

## Code Conventions

- Frontend uses functional components with hooks (no class components)
- Tailwind CSS utility classes (dark theme: slate-800/900 backgrounds)
- `useCallback` for all handler functions passed as props
- Widget props passed explicitly (no spread), typed via `Record<string, unknown>` in Widget interface
- Backend uses async SQLAlchemy sessions, dependency injection via FastAPI `Depends()`
- API routes grouped in `app/api/` modules, one per resource
- Models in `app/models/`, one per table

## Important Files

- `frontend/src/hooks/useDesignMode.ts` — Core editor state machine (undo/redo uses useState for reactivity)
- `frontend/src/components/designer/DesignCanvas.tsx` — Canvas with drag/resize, marquee selection, right-click context menu
- `frontend/src/components/designer/PropertyPanel.tsx` — Widget property editor with TagPicker, text style editors
- `frontend/src/components/widgets/WidgetRenderer.tsx` — Widget type dispatch (add new widget types here)
- `frontend/src/components/designer/WidgetPalette.tsx` — Widget catalog with `WIDGET_TYPES` array (register new types here)
- `frontend/src/pages/DashboardPage.tsx` — Main page combining runtime view and design mode
- `frontend/src/types/index.ts` — All TypeScript interfaces
- `backend/app/main.py` — FastAPI app setup and lifespan
- `backend/app/services/tag_engine.py` — Tag polling and value management
