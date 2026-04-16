# CLAUDE.md — OPC-UA Industrial HMI

> **For controls engineers:** This file is a reference for AI-assisted development (used by tools like Claude Code). It provides a concise map of the entire codebase. You don't need to read it to use the HMI — see the [User Guide](docs/user-guide.md) for that. But it's useful if you want to understand where things live in the code.

## Project Rules

**Git.** Never commit directly to `main`. Work on feature branches with descriptive names (e.g., `fix/alarm-ack-race`, `feat/zpl-templates`). When the harness assigns a session-specific branch, that assignment takes precedence over any branch suggestion here.

**Bug fix workflow.** fix → test → commit → push → *offer* to open a PR. Don't open a PR unless the user confirms.

**Debugging.** Consider both backend and frontend unless the user explicitly narrows the scope.

**UI iteration.** In interactive sessions where the user is driving visual changes, confirm each change before moving on — don't batch. In automated or non-interactive runs, group related visual changes and verify via type check / build rather than per-change confirmation.

**Testing expectations.**
- Run `./dev.sh check` (build + lint) before every commit.
- Run `./dev.sh test` for changes touching services, hooks, widgets, or API logic.
- Type checking and tests verify code correctness, not feature correctness — for UI changes, also exercise the feature in a browser when possible.
- CI should use `install` (auto-uses `backend/wheels/` if present) + `check` + `test`.
- Don't commit `.venv/`, `backend/wheels/` (unless intentionally shipping offline bundles), or `hmi.db`.

**Platform (Pi/ARM).** Avoid `--disable-gpu` (can crash Pi). Test both Wayland and X11. Chromium is typically pre-installed on ARM — don't reinstall.

## Project Overview

Full-stack industrial HMI (Human-Machine Interface) for monitoring and controlling industrial equipment via OPC-UA, Modbus, EtherNet/IP, and MQTT. The **backend** (Python/FastAPI) handles PLC communication, alarm processing, trend logging, and data storage. The **frontend** (React/TypeScript) is the browser-based operator interface with a drag-and-drop screen designer.

## Architecture

```
backend/               Python FastAPI application
  app/
    api/               Route handlers (alarms, auth, screens, tags, reporting, reason_codes, production_settings, service_config, zpl_preview, websocket, etc.)
    core/              Config (pydantic-settings), database (async SQLAlchemy), security (JWT)
    drivers/           Protocol drivers (opcua, modbus, ethernet_ip, mqtt) + base.py + driver_manager.py
    integrations/      Plugin system for external equipment (base.py, manager.py, zebra_printer/, cognex_dataman/, ftp_hot_folder/)
    models/            SQLAlchemy 2.0 models (user, tag, alarm, screen, job, trend, audit, downtime_annotation, reason_code, datasource, integration)
    services/          Business logic (tag_engine, alarm_service, trend_service, reporting_service, script_engine, audit_service, zpl_renderer)
    main.py            FastAPI app with lifespan, CORS, static file serving
    seed.py            Database seeder with default users and demo tags
  run.py               Entry point (uvicorn on port 8080)
  hmi.db               SQLite database
  requirements.txt
frontend/              React SPA (Vite + TypeScript)
  src/
    components/
      designer/        Screen designer (DesignCanvas, PropertyPanel, WidgetPalette, EditorToolbar)
      widgets/         Runtime widgets (StatusIndicator, Gauge, Toggle, CommandButton, TrendWidget, ZplPreviewWidget, etc.)
      reports/         Report components (TimeBreakdownBar, DowntimePeriodsTable, MachineStateChart, OEETrendChart, ProductionTrendChart, DowntimePareto)
      settings/        Settings tab components (ReasonCodesSettings, ProductionSettings)
      layout/          AppShell (sidebar nav, header)
    hooks/             useDesignMode, useWebSocket, useAuth
    lib/               api.ts (fetch wrapper), textStyle.ts
    pages/             Dashboard, Alarms, Trends, Jobs, Reports, Settings, Service, Login
    types/index.ts     All TypeScript interfaces
  vite.config.ts       Vite config with /api and /ws proxy to backend
```

## Tech Stack

**Backend:** FastAPI, SQLAlchemy 2.0 (async), SQLite (aiosqlite), Alembic, Pydantic v2, python-jose (JWT/HS256), passlib+bcrypt, asyncua, pycomm3, pymodbus, aiomqtt, Pillow, python-barcode, qrcode

**Frontend:** React 19, TypeScript 5.9, Vite 7, Shadcn/ui, Tailwind CSS 4, React Router 7, Recharts, Lucide icons, clsx

## Prerequisites

| Tool | Minimum | Install |
|------|---------|---------|
| **Python** | 3.10+ | [python.org](https://www.python.org/downloads/) or `winget install Python.Python.3.12` / `brew install python@3.12` |
| **Node.js** | 18+ LTS | [nodejs.org](https://nodejs.org/) or `winget install OpenJS.NodeJS.LTS` / `brew install node@22` |

`pip` and `npm` come bundled with Python and Node.js respectively. No C compiler or native build tools are needed — all Python dependencies ship prebuilt wheels. The dev scripts automatically create a Python virtual environment at `.venv/` on first run.

**No admin rights on Windows?** Run `dev.bat install-prereqs` (or `.\dev.ps1 install-prereqs`) to install Python and Node.js entirely under your user profile at `%USERPROFILE%\.universal-hmi\tools\`. The per-user Python installer (`InstallAllUsers=0`) and Node.js ZIP don't trigger UAC, and the user PATH is updated via `HKCU\Environment` so new terminals pick it up automatically.

**Offline install:** If a `backend/wheels/` directory exists, `install` uses `pip install --no-index --find-links=wheels` for fully offline Python dependency installation. To bundle wheels for offline use, run `pip download -r backend/requirements.txt -d backend/wheels` on a machine with internet access.

Run `doctor` to verify your setup:

```bash
./dev.sh doctor        # Linux / macOS
dev.bat doctor         # Windows CMD
.\dev.ps1 doctor       # Windows PowerShell
```

> **Windows note:** If PowerShell blocks script execution, run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` first.

## Commands

The `dev.sh` / `dev.bat` / `dev.ps1` wrappers expose the common dev tasks (`install`, `dev`, `stop`, `build`, `lint`, `check`, `test`, `test:backend`, `test:frontend`, `seed`, `doctor`). See [README.md → Dev Script Commands](README.md#dev-script-commands) for the full matrix across platforms.

Most AI-relevant shortcuts:
- `./dev.sh check` — build + lint (run before committing)
- `./dev.sh test` — run all tests
- `./dev.sh dev` — start backend (:8080) + frontend (:5173)

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
- `HMI_AUTO_LOGOUT_MINUTES` — 30 (inactivity auto-logout)
- `HMI_WS_UPDATE_INTERVAL_MS` — 500 (tag update frequency)
- `HMI_TREND_RETENTION_DAYS` — 90
- `HMI_SCRIPT_TIMEOUT_SECONDS` — 5
- `HMI_PROJECTS_DIR` — override projects directory (point at a cloned git repo for sharing)
- `HMI_HOST`, `HMI_PORT`, `HMI_DEBUG`

## API Endpoints

The full endpoint catalog lives in [DEVELOPER.md → API Reference](DEVELOPER.md#api-reference), grouped by resource (Auth, Tags, Screens, Alarms, Trends, Data Sources, Jobs, Reporting, Reason Codes, Users, Service Config, Media, ZPL Preview, System Update, WebSocket). Route handlers live in `backend/app/api/` — one file per resource.

**WebSocket (`/ws`) messages:** `snapshot` (initial), `tag_update` (deltas), `alarm` (state changes), `alarms_snapshot` (full list on reconnect), `keepalive` (30s).

## Key Backend Services

- **TagEngine** (`services/tag_engine.py`): In-memory tag store, simulation engine (sine/ramp/random/toggle/enum_cycle), 500ms update cycle, publishes to WebSocket subscribers. Internal tags (no data source, no simulation) are nonvolatile — values are persisted to the database via `persisted_value` column and restored on startup
- **AlarmService** (`services/alarm_service.py`): Boolean alarm evaluation — each alarm-enabled tag is compared against its `trigger_on` value (default `true`). Analog threshold alarming is handled on the PLC side and reported to the HMI as boolean fault flags. State machine with four states: `active_unacked`, `active_acked`, `inactive_unacked` (alarm clears before acknowledgment), `inactive` (cleared). History recording. Supports external callbacks (e.g., ProductionService) via `add_alarm_callback()`. Includes a `_help_cache` for fault help dialog data (image/text) broadcast via WebSocket.
- **ReportingService** (`services/reporting_service.py`): Stateless on-demand report computation from trend data and alarm history. Computes OEE, rate, count, uptime (machine cycling), downtime (machine faulted), and idle time (neither) for arbitrary timeframes. Supports downtime exception faults with 5-minute cap — time beyond 5 minutes counts as idle. No background loops; all metrics computed at query time from existing trend_data and alarm_history tables. Production settings (tag bindings, cycling tag, exception tags, target rate, top bar controls) stored in `app_settings` table.
- **TrendService** (`services/trend_service.py`): Time-series sampling, 90-day retention
- **ScriptEngine** (`services/script_engine.py`): Sandboxed Python execution for button actions (5s timeout, restricted builtins)
- **ZplRenderer** (`services/zpl_renderer.py`): Offline ZPL-to-PNG rendering using Pillow. Supports text, barcodes (Code 128, Code 39), QR codes, graphics, rotation, reverse fields, and compressed graphic fields

## Key Frontend Patterns

- **API client:** `lib/api.ts` — centralized fetch wrapper with JWT Bearer headers
- **WebSocket:** `useWebSocket` hook — auto-reconnect, maintains `tagValues` and `alarms` state
- **Screen designer:** `useDesignMode` hook — full editor state machine (widgets, selection, undo/redo with useState for reactivity, clipboard, z-order, alignment/distribute, locking, zoom 0.5x-2x)
- **Widget system:** `WidgetRenderer` dispatches by `widget.type`. Types: `status_indicator`, `gauge`, `counter`, `toggle`, `command_button`, `parameter_input`, `text_label`, `text_value`, `alarm_summary`, `multi_value`, `dropdown_select`, `oee`, `trend`, `zpl_preview`
- **Tag binding:** Widgets bind to tags by name. `TagPicker` component provides searchable dropdown
- **Visibility/Enabled:** Widgets support `visible`, `visibleTag`, `visibleRoles`, `enabled`, `enabledTag`, `enabledRoles` for conditional runtime rendering. Conditions can be combined — tag-based and role-based conditions on the same property are AND-ed.
- **Screen management:** Create/delete screens via modal dialog, screen tabs for navigation
- **Top bar controls:** When no alarms are active, the header shows a configurable machine status indicator, Cycle Start button, and Reset button. Tags configured in Production Settings (`machine_status_tag`, `cycle_start_tag`, `reset_tag`). Controls hide when alarms are active (alarm marquee takes priority).

## Adding a New Widget Type

1. Create component in `frontend/src/components/widgets/NewWidget.tsx`
2. Add case in `WidgetRenderer.tsx` switch statement
3. Register in `WidgetPalette.tsx` `WIDGET_TYPES` array with icon, category, default size/props
4. Add property panel sections in `PropertyPanel.tsx` (if type-specific props needed)

## Adding a Plugin Integration

1. Create package `backend/app/integrations/your_integration/` with `__init__.py` exporting `integration_class`
2. Subclass `IntegrationBase` — set `type_name`, `display_name`, `description`, `default_config`
3. Implement `start()` and `stop()` (required). Optionally implement `get_tag_definitions()` and `get_router()`
4. Use `self._set_tag(name, value)` to push values into TagEngine for WebSocket broadcast
5. No registration step — the `IntegrationManager` auto-discovers all subpackages at startup

See `DEVELOPER.md` → "Creating a Plugin Integration" for a full walkthrough with examples.

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
- `backend/app/services/reporting_service.py` — On-demand report computation from trend + alarm data
- `backend/app/api/reporting.py` — Reporting API (summary, time-series, downtime periods, annotations)
- `backend/app/models/downtime_annotation.py` — Downtime period reason code annotations
- `backend/app/api/production_settings.py` — Production/reporting configuration API (includes top bar control tag bindings)
- `backend/app/api/reason_codes.py` — Downtime reason codes CRUD API
- `backend/app/services/zpl_renderer.py` — Offline ZPL-to-PNG rendering engine
- `backend/app/api/service_config.py` — Service page configuration API
- `backend/app/api/zpl_preview.py` — ZPL preview rendering API
- `backend/app/api/media.py` — Fault help image upload/serve/delete API
- `backend/app/api/system_update.py` — In-app software update (supports source and compiled packages)
- `backend/app/core/paths.py` — Frozen-aware path helpers for PyInstaller compatibility
- `backend/app/services/git_service.py` — Async git CLI wrapper for project sharing
- `backend/app/api/project_git.py` — Git operations API (status, commit, push, pull, branches)
- `frontend/src/components/GitPanel.tsx` — Version control panel for Projects page
- `backend/app/integrations/base.py` — Integration plugin base class
- `backend/app/integrations/manager.py` — Plugin discovery and lifecycle management
- `backend/hmi-server.spec` — PyInstaller spec file for compiling backend into native executable
- `deploy.sh` — Deployment packager (`--compile` flag for PyInstaller build)
- `frontend/src/components/FaultHelpDialog.tsx` — Auto-popup dialog for fault troubleshooting with image/GIF
- `backend/tests/conftest.py` — Shared test fixtures (in-memory DB, auth tokens, test client)
- `backend/tests/unit/` — Backend unit tests (147 tests covering services + auth + ZPL)
- `backend/tests/integration/` — Backend integration tests (25 tests covering API endpoints)
- `frontend/vitest.config.ts` — Vitest test configuration
- `frontend/src/hooks/__tests__/` — Frontend hook tests (useDesignMode, useWebSocket, useAuth)
- `frontend/src/components/widgets/__tests__/` — Widget tests (Gauge, StatusIndicator, WidgetRenderer)

## Database Tables

users, tags, tag_templates, data_sources, alarms, alarm_history, trends, screens, screen_versions, screen_templates, jobs, downtime_annotations, reason_codes, app_settings, audit_logs, integrations

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
