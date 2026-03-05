# Industrial HMI

A web-based Human-Machine Interface (HMI) for industrial automation. Connects to PLCs via OPC UA, Modbus TCP, EtherNet/IP, and MQTT, and provides real-time dashboards, alarming, trending, job management, and a built-in screen designer.

## Architecture

- **Backend** — Python / FastAPI with async SQLite (aiosqlite + SQLAlchemy). Handles PLC communication, tag engine, alarm service, trend logging, scripting, and a WebSocket endpoint for real-time tag updates.
- **Frontend** — React 19 + TypeScript + Tailwind CSS 4, built with Vite. Single-page app with live-updating widgets, a screen designer, and role-based access.

## Features

- Real-time value display via WebSocket (500 ms update cycle)
- Drag-and-drop screen designer with widget palette, property panel, undo/redo, copy/paste, z-order, and grid snapping
- Widget types: status indicators, gauges, counters, toggles, command buttons, parameter inputs, text labels
- Per-widget font/style customization (font family, size, weight, color, italic)
- Alarm management with threshold-based triggers, acknowledgment, and history
- Trend charting with configurable sample rates and retention
- Job/recipe management with setpoint download
- OEE/production reporting
- Python scripting engine for button actions
- Role-based access control (Operator, Supervisor, Engineer, Designer)
- Audit trail for all configuration changes
- Multi-protocol PLC drivers (OPC UA, Modbus, EtherNet/IP, MQTT, simulation)

## Prerequisites

- Python 3.11+
- Node.js 18+
- npm or yarn

## Installation

```bash
# Clone the repository
git clone <repo-url>
cd opcua-hmi

# Backend
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Frontend
cd ../frontend
npm install
```

## Running (Development)

Start the backend and frontend in separate terminals:

```bash
# Terminal 1 — Backend (starts on port 8080)
cd backend
source venv/bin/activate
python run.py

# Terminal 2 — Frontend (starts on port 5173, proxies API to 8080)
cd frontend
npm run dev
```

On first run, seed the database with example tags, users, and screens:

```bash
cd backend
source venv/bin/activate
python -m app.seed
```

Default users created by the seed script:

| Username   | Password   | Role       |
|------------|------------|------------|
| admin      | admin      | Designer   |
| engineer   | engineer   | Engineer   |
| supervisor | 1234       | Supervisor |
| operator   | 0000       | Operator   |

## Building for Production

```bash
# Build the frontend
cd frontend
npm run build

# The built files go to frontend/dist/
# Serve them with the FastAPI backend or a reverse proxy
```

## Running Tests

```bash
# Frontend lint
cd frontend
npm run lint

# Frontend type-check
cd frontend
npx tsc --noEmit

# Backend (if pytest is installed)
cd backend
python -m pytest
```

## Project Structure

```
opcua-hmi/
├── backend/
│   ├── app/
│   │   ├── api/           # FastAPI route handlers
│   │   ├── core/          # Config, database, security
│   │   ├── drivers/       # PLC protocol drivers
│   │   ├── models/        # SQLAlchemy models
│   │   ├── services/      # Tag engine, alarm service, trend service
│   │   ├── main.py        # FastAPI app entry point
│   │   └── seed.py        # Database seed script
│   ├── requirements.txt
│   └── run.py             # Dev server entry point
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── designer/  # Screen editor UI (palette, canvas, toolbar, property panel)
│   │   │   ├── layout/    # App shell, navigation
│   │   │   └── widgets/   # Runtime widget components
│   │   ├── hooks/         # useAuth, useWebSocket, useDesignMode
│   │   ├── lib/           # API client, utilities
│   │   ├── pages/         # Route-level page components
│   │   └── types/         # TypeScript interfaces
│   ├── package.json
│   └── vite.config.ts
└── REQUIREMENTS.md         # Functional & non-functional requirements
```

## Configuration

The backend is configured via environment variables (prefixed with `HMI_`) or a `.env` file in the backend directory:

| Variable                      | Default                          | Description                    |
|-------------------------------|----------------------------------|--------------------------------|
| `HMI_DATABASE_URL`           | `sqlite+aiosqlite:///./hmi.db`   | Database connection string     |
| `HMI_SECRET_KEY`             | `change-me-in-production`        | JWT signing key                |
| `HMI_ACCESS_TOKEN_EXPIRE_MINUTES` | `480`                       | Token expiry                   |
| `HMI_WS_UPDATE_INTERVAL_MS` | `500`                            | WebSocket push interval        |
| `HMI_HOST`                   | `0.0.0.0`                        | Server bind address            |
| `HMI_PORT`                   | `8080`                           | Server port                    |
| `HMI_DEBUG`                  | `false`                          | Enable debug logging & reload  |
| `HMI_TREND_RETENTION_DAYS`  | `90`                             | Trend data retention           |
| `HMI_SCRIPT_TIMEOUT_SECONDS`| `5`                              | Script execution timeout       |

## Screen Designer

Users with the **Designer** role can enter edit mode on any screen:

- **Ctrl+E** or click the Edit button to toggle design mode
- **Widget Palette** (left) — click to add widgets to the canvas
- **Canvas** (center) — drag to move, corner handle to resize, click to select
- **Property Panel** (right) — configure tag binding, thresholds, colors, font styles
- **Toolbar** (top) — undo/redo, save, grid settings, zoom
- **Keyboard shortcuts** — Ctrl+Z/Shift+Z (undo/redo), Ctrl+C/X/V/D (clipboard), Delete, Ctrl+]/[ (z-order)

Live PLC data continues flowing into widgets while editing.
