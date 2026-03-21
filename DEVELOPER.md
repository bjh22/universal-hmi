# Developer Guide

This guide covers common tasks you'll encounter when extending the HMI application — adding new widgets, creating plugin integrations for third-party equipment, adding backend features, and running tests.

**Who this is for:** Controls engineers who need to customize or extend the HMI. You don't need to be a web developer — this guide explains the web-specific concepts as they come up. If you're familiar with PLC programming, structured text, or any scripting language, you'll be able to follow along.

> **Key concept — how the code is organized:** The project has two halves. The **backend** (`backend/` folder) is a Python server that handles PLC communication, alarm processing, trend logging, and data storage — think of it as the "runtime" like a FactoryTalk or WinCC runtime. The **frontend** (`frontend/` folder) is the browser-based UI that operators see — screens, widgets, navigation. They communicate over HTTP (for configuration) and WebSocket (for live tag values).

## Table of Contents

- [Adding a Page to the Sidebar](#adding-a-page-to-the-sidebar)
- [Creating a New Widget](#creating-a-new-widget)
- [Adding a Backend API Endpoint](#adding-a-backend-api-endpoint)
- [Adding a Database Model](#adding-a-database-model)
- [Creating a Plugin Integration](#creating-a-plugin-integration)
- [Production & Reporting System](#production--reporting-system)
- [Internal Nonvolatile Tags](#internal-nonvolatile-tags)
- [Service Page](#service-page)
- [Fault Help Dialog](#fault-help-dialog)
- [ZPL Label Preview](#zpl-label-preview)
- [Testing](#testing)
- [Frontend Patterns](#frontend-patterns)
- [Backend Patterns](#backend-patterns)
- [API Reference](#api-reference)

---

## Adding a Page to the Sidebar

Adding a new page to the HMI navigation requires changes in three files. Here's a step-by-step walkthrough using a hypothetical "Diagnostics" page.

### Step 1: Create the page file

Create a new file at `frontend/src/pages/DiagnosticsPage.tsx`:

```tsx
import { useState, useCallback } from 'react';
import type { TagValue, AlarmData } from '../types';

// "Props" defines what data this page receives from the application.
// Think of these like input parameters to a function block.
interface Props {
  tagValues: Record<string, TagValue>;  // All current tag values (like a global variable list)
  alarms: AlarmData[];                  // All active alarms
  userRole: string;                     // The logged-in user's role (operator, engineer, etc.)
}

export function DiagnosticsPage({ tagValues, alarms, userRole }: Props) {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-slate-100">Diagnostics</h1>
      {/* Page content goes here */}
    </div>
  );
}
```

> **What's a `.tsx` file?** It's a TypeScript file that can contain HTML-like markup (called JSX). TypeScript is JavaScript with type checking — it catches errors before the code runs, similar to how a PLC compiler checks your structured text before downloading. The HTML-like markup describes what the page looks like.

### Step 2: Register the page route in App.tsx

In `frontend/src/App.tsx`, add two lines — one to import your page (near line 24) and one to define its URL path (near line 140):

```tsx
// Add with the other lazy imports (around line 24)
// "lazy" means the page's code is only loaded when the user navigates to it
const DiagnosticsPage = lazy(() =>
  import('./pages/DiagnosticsPage').then(m => ({ default: m.DiagnosticsPage }))
);

// Add inside the <Routes> block (around line 140)
// This maps the URL "/diagnostics" to your page
<Route path="/diagnostics" element={
  <Suspense fallback={<PageLoader />}>
    <DiagnosticsPage tagValues={tagValues} alarms={alarms} userRole={userRole} />
  </Suspense>
} />
```

> **What are Routes?** Routes are URL-to-page mappings. When a user navigates to `http://yourpanel:5173/diagnostics`, the router displays `DiagnosticsPage`. This is how the single-page application knows which page to show — similar to how a traditional HMI navigates between screens.

### Step 3: Add the sidebar navigation link in AppShell.tsx

In `frontend/src/components/layout/AppShell.tsx`, add an entry to the `NAV_ITEMS` array (around line 42). This is the list that controls what appears in the sidebar:

```tsx
// Import an icon for your page (browse options at https://lucide.dev/icons)
import { Stethoscope } from 'lucide-react';

// Add to the NAV_ITEMS array
const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', roles: null },
  // ... existing items ...
  { to: '/diagnostics', icon: Stethoscope, label: 'Diagnostics', roles: ['engineer', 'designer'] as string[] },
];
```

The `NAV_ITEMS` array controls the entire sidebar. Each entry has:

| Field   | Type                  | Description |
|---------|-----------------------|-------------|
| `to`    | `string`              | URL path (must match what you added in App.tsx) |
| `icon`  | Lucide icon           | The sidebar icon (browse all icons at lucide.dev/icons) |
| `label` | `string`              | Text label shown next to the icon |
| `roles` | `string[] \| null`    | `null` = visible to all users. Array = only visible to listed roles |

Role values are: `operator`, `supervisor`, `engineer`, `designer`. Higher roles inherit lower roles — an engineer can see everything a supervisor can see.

---

## Creating a New Widget

Widgets are the building blocks of HMI screens — status indicators, gauges, buttons, trend charts, etc. Adding a new widget type requires changes in four places. Here's a walkthrough using a "Speedometer" widget as an example.

### Step 1: Create the widget file

Create a new file at `frontend/src/components/widgets/Speedometer.tsx`:

```tsx
import type { TagValue, TextStyle } from '../../types';
import { getContainerClasses, shouldShowTitle, getTitleClasses, shouldShowExtras } from './chromeUtils';
import { buildTextStyle } from '../../lib/textStyle';

interface Props {
  title: string;
  tag: string;
  tagValues: Record<string, TagValue>;
  min?: number;
  max?: number;
  units?: string;
  titleStyle?: TextStyle;
  valueStyle?: TextStyle;
  chrome?: 'full' | 'compact' | 'none';
}

export function Speedometer({
  title, tag, tagValues, min = 0, max = 100, units = '',
  titleStyle, valueStyle, chrome = 'full',
}: Props) {
  // Look up the current tag value by name
  const tv = tagValues[tag];
  const value = typeof tv?.value === 'number' ? tv.value : 0;
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className={`${getContainerClasses(chrome)} h-full flex flex-col justify-center items-center`}>
      {shouldShowTitle(chrome) && (
        <div className={getTitleClasses(chrome)} style={buildTextStyle(titleStyle)}>
          {title}
        </div>
      )}
      <div className="text-3xl font-bold text-slate-100" style={buildTextStyle(valueStyle)}>
        {value.toFixed(1)}{units && <span className="text-lg ml-1 text-slate-400">{units}</span>}
      </div>
      {/* Progress bar */}
      <div className="w-full h-2 bg-slate-700 rounded mt-2">
        <div
          className="h-full bg-blue-500 rounded transition-all"
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
      {shouldShowExtras(chrome) && tv && (
        <div className="text-sm text-slate-500 mt-2">{tv.display_name || tag}</div>
      )}
    </div>
  );
}
```

**Key conventions:**

- The widget receives `tagValues` (a dictionary of all current tag values, updated live via WebSocket) and looks up its bound tag by name — just like reading a PLC variable by its symbolic name
- Support the `chrome` prop (`'full' | 'compact' | 'none'`) to control how much decoration (title bar, borders) the widget shows
- Support `titleStyle` and `valueStyle` for text customization via `buildTextStyle()`
- Use the `chromeUtils` helpers for consistent look and feel across all widgets

### Step 2: Register in the widget type catalog

In `frontend/src/components/designer/widgetTypes.ts`, add an entry to the `WIDGET_TYPES` array. This is the master list that tells the screen designer what widget types are available:

```tsx
import { Gauge } from 'lucide-react'; // or another appropriate icon

// Add to the WIDGET_TYPES array:
{
  type: 'speedometer',
  label: 'Speedometer',
  icon: Gauge,
  category: 'display',           // 'display', 'input', or 'layout'
  defaultW: 4,                    // default grid columns
  defaultH: 3,                    // default grid rows
  defaultAbsW: 280,               // default pixel width (absolute layout mode)
  defaultAbsH: 200,               // default pixel height (absolute layout mode)
  defaultProps: {                  // initial property values
    title: 'Speed',
    tag: '',
    min: 0,
    max: 100,
    units: 'RPM',
  },
},
```

The `WidgetTypeInfo` fields:

| Field           | Description |
|-----------------|-------------|
| `type`          | Unique string ID (stored in the database with each screen layout) |
| `label`         | Human-readable name shown in the widget palette |
| `icon`          | Icon shown in the palette (browse options at lucide.dev/icons) |
| `category`      | Which palette section: `display` (read-only), `input` (operator interaction), or `layout` |
| `defaultW/H`    | Default size in grid cells (for responsive grid layout mode) |
| `defaultAbsW/H` | Default size in pixels (for pixel-perfect absolute layout mode) |
| `defaultProps`   | Starting property values when a designer first drops this widget onto a screen |

### Step 3: Add the rendering logic

In `frontend/src/components/widgets/WidgetRenderer.tsx`, import your widget and add a `case` to the switch statement. The `WidgetRenderer` is a dispatcher — it looks at each widget's `type` and renders the correct component (similar to a CASE statement in structured text):

```tsx
import { Speedometer } from './Speedometer';

// Inside the switch (widget.type) block:
case 'speedometer':
  return (
    <Speedometer
      title={p.title as string}
      tag={p.tag as string}
      tagValues={tagValues}
      min={p.min as number}
      max={p.max as number}
      units={p.units as string}
      titleStyle={p.titleStyle as TextStyle | undefined}
      valueStyle={p.valueStyle as TextStyle | undefined}
      chrome={chrome}
    />
  );
```

Properties are read from the widget's saved configuration (`widget.props`, aliased as `p`). The `chrome` prop is already extracted at the top of the file.

### Step 4: Add property panel fields (if needed)

If your widget has custom settings that the designer needs to configure (like min/max range, units, etc.), add them in `frontend/src/components/designer/PropertyPanel.tsx`. Search for `widget.type ===` to see examples of how other widgets add their type-specific property fields:

```tsx
{/* Speedometer range settings */}
{widget.type === 'speedometer' && (
  <div className="space-y-3">
    <h4 className="text-xs font-medium text-slate-400 uppercase">Range</h4>
    <div className="grid grid-cols-2 gap-2">
      <label className="text-xs text-slate-400">
        Min
        <input
          type="number"
          value={widget.props.min as number ?? 0}
          onChange={e => onUpdateProps({ min: Number(e.target.value) })}
          className="mt-1 w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200"
        />
      </label>
      <label className="text-xs text-slate-400">
        Max
        <input
          type="number"
          value={widget.props.max as number ?? 100}
          onChange={e => onUpdateProps({ max: Number(e.target.value) })}
          className="mt-1 w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200"
        />
      </label>
    </div>
  </div>
)}
```

All widgets automatically get the standard property sections (title, tag binding, chrome level, visibility/enabled conditions, text styling) for free. You only need to add fields for properties unique to your widget type.

### Performance note

The system is optimized so that a widget only re-renders when its specific bound tag(s) change — not when any tag changes. If your widget reads multiple tags (beyond just the primary `tag` property), add them to the `getWidgetTagNames()` function in `WidgetRenderer.tsx` so this optimization works correctly.

---

## Adding a Backend API Endpoint

API endpoints are the communication interface between the browser UI and the backend server. When the browser needs data (tag values, alarm lists, settings) or needs to perform an action (write a tag, acknowledge an alarm), it calls an API endpoint. Each endpoint has a URL path (like `/api/tags/`) and an HTTP method (GET = read, POST = create, PUT = update, DELETE = remove).

### Adding to an existing endpoint file

Each feature area has its own file in `backend/app/api/` (e.g., `tags.py` for tag operations, `alarms.py` for alarm operations). To add a new endpoint to an existing area, edit that file:

```python
# In backend/app/api/tags.py

@router.get("/summary")
async def get_tag_summary(
    user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    """Return aggregate statistics about tags."""
    result = await session.execute(select(func.count()).select_from(Tag))
    count = result.scalar()
    return {"total_tags": count}
```

### Creating a new endpoint file

For an entirely new feature area, create a new file in `backend/app/api/`:

**1. Create the endpoint file** (`backend/app/api/diagnostics.py`):

```python
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_user, require_role
from app.models.user import User, UserRole

router = APIRouter(prefix="/api/diagnostics", tags=["diagnostics"])


@router.get("/")
async def list_diagnostics(
    user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
    session: AsyncSession = Depends(get_db),
):
    """List diagnostic entries. Only engineers and designers can access this."""
    return []
```

**2. Register it** in `backend/app/main.py` so the server knows about it:

```python
from app.api import diagnostics

# Add with the other include_router calls (around line 119)
app.include_router(diagnostics.router)
```

### Authentication patterns

Every endpoint can require a specific user role, similar to how PLC HMI systems restrict access by user level:

```python
# No login required (public endpoint — like an HMI screen visible to anyone)
@router.get("/health")
async def health():
    return {"status": "ok"}

# Any logged-in user (operator, supervisor, engineer, or designer)
@router.get("/me")
async def get_me(user: User = Depends(get_current_user)):
    return user

# Only engineers and designers (returns HTTP 403 Forbidden for other roles)
@router.post("/configure")
async def configure(
    user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    ...

# Optional — works for both anonymous and logged-in users
@router.get("/public-data")
async def public_data(user: User | None = Depends(get_current_user)):
    if user:
        # Return full data for logged-in users
        ...
    else:
        # Return limited data for anonymous users
        ...
```

### Accessing background services from endpoints

The HMI runs several background services (tag engine, alarm service, trend service) — similar to how a PLC has background tasks. You can call these from your API endpoints:

```python
from fastapi import Request

@router.post("/trigger-alarm-eval")
async def trigger_alarm_eval(request: Request):
    alarm_service = request.app.state.alarm_service
    await alarm_service.evaluate()
    return {"status": "ok"}
```

Available services:
- `request.app.state.alarm_service` — alarm processing and state machine
- `request.app.state.trend_service` — historical data logging
- `request.app.state.integration_manager` — third-party equipment plugins
- `from app.services.tag_engine import tag_engine` — the tag engine (imported directly as a global singleton)

### Calling your endpoint from the browser UI

After creating a backend endpoint, add a corresponding function in `frontend/src/lib/api.ts` so the frontend can call it:

```typescript
// Add to the api object
getDiagnostics: () => request<DiagnosticEntry[]>('/api/diagnostics/'),
createDiagnostic: (data: CreateDiagnosticPayload) =>
  request<DiagnosticEntry>('/api/diagnostics/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
```

The `request<T>()` helper automatically attaches the login token and handles error responses. You can then call `api.getDiagnostics()` from any page.

---

## Creating a Plugin Integration

The plugin system lets you add support for external equipment (label printers, barcode readers, scales, file watchers, etc.) without modifying any core HMI code. Each integration is a self-contained Python package that is automatically discovered when the server starts — similar to how a PLC function block library can be dropped into a project and used immediately.

### Architecture Overview

```
backend/app/integrations/
├── __init__.py
├── base.py                  # IntegrationBase abstract class
├── manager.py               # IntegrationManager (discovery, lifecycle)
├── zebra_printer/           # Example: Zebra label printer
│   ├── __init__.py          # Exports integration_class
│   ├── integration.py       # ZebraPrinterIntegration(IntegrationBase)
│   └── router.py            # Custom API endpoints
├── cognex_dataman/          # Example: Cognex barcode reader
│   ├── __init__.py
│   ├── integration.py
│   └── router.py
└── ftp_hot_folder/          # Example: FTP file watcher
    ├── __init__.py
    └── integration.py
```

**How it works:**

1. **Auto-discovery** — When the server starts, it scans all folders under `backend/app/integrations/` and finds any new integration packages automatically. No manual registration needed.
2. **Configuration** — Engineers add and configure integration instances through the Settings > Integrations page in the browser UI. Settings are stored in the database.
3. **Virtual tags** — Each integration creates "virtual tags" (e.g., `zebra.status`, `scale.weight`) that appear alongside PLC tags everywhere in the HMI — on dashboards, in alarms, in trends.
4. **Custom endpoints** — Integrations can optionally add their own API endpoints (e.g., a `/api/integrations/scale/tare` endpoint to zero a scale).
5. **Lifecycle** — The system handles starting, stopping, enable/disable, and connection status. Your integration just needs to implement `start()` and `stop()`.

### Step 1: Create the integration folder

Create a new folder under `backend/app/integrations/`. For this example, we'll build a "Scale Reader" integration that reads weight from an industrial scale over TCP (a common setup for checkweighers and platform scales).

Create `backend/app/integrations/scale_reader/__init__.py`:

```python
from app.integrations.scale_reader.integration import ScaleReaderIntegration

integration_class = ScaleReaderIntegration
```

This file is required — it tells the auto-discovery system which class implements your integration.

### Step 2: Implement the integration class

Create `backend/app/integrations/scale_reader/integration.py`:

```python
import asyncio
import logging

from app.integrations.base import IntegrationBase
from app.services.tag_engine import TagEngine

logger = logging.getLogger(__name__)


class ScaleReaderIntegration(IntegrationBase):
    # --- Class-level metadata (required) ---
    type_name = "scale_reader"           # Unique identifier stored in DB
    display_name = "Scale Reader"        # Shown in the UI
    description = "TCP integration for industrial scales. Reads weight values."
    default_config = {                   # Initial config when a user adds this type
        "host": "192.168.1.50",
        "port": 4001,
        "poll_interval_seconds": 1,
        "tag_prefix": "scale",
    }

    # Define the virtual tags this integration provides
    TAG_DEFINITIONS = [
        {"suffix": "status", "data_type": "string", "description": "Connection status"},
        {"suffix": "weight", "data_type": "float", "description": "Current weight (kg)"},
        {"suffix": "stable", "data_type": "bool", "description": "Weight is stable"},
    ]

    def __init__(self, name: str, config: dict, tag_engine: TagEngine):
        super().__init__(name, config, tag_engine)
        self._poll_task: asyncio.Task | None = None
        self._reader: asyncio.StreamReader | None = None
        self._writer: asyncio.StreamWriter | None = None

    @property
    def _prefix(self) -> str:
        return self.config.get("tag_prefix", "scale")

    def get_tag_definitions(self) -> list[dict]:
        """Return virtual tag definitions with the configured prefix."""
        prefix = self._prefix
        return [
            {
                "name": f"{prefix}.{td['suffix']}",
                "data_type": td["data_type"],
                "description": td["description"],
                "access_mode": "read",
            }
            for td in self.TAG_DEFINITIONS
        ]

    async def start(self):
        """Connect to the scale and begin polling."""
        host = self.config.get("host", "192.168.1.50")
        port = self.config.get("port", 4001)
        try:
            self._reader, self._writer = await asyncio.wait_for(
                asyncio.open_connection(host, port), timeout=5.0
            )
            self.connected = True
            self.status_message = None
            self._set_tag(f"{self._prefix}.status", "Connected")
            self._poll_task = asyncio.create_task(self._poll_loop())
        except Exception as e:
            self.connected = False
            self.status_message = str(e)
            self._set_tag(f"{self._prefix}.status", f"Error: {e}")
            # Start reconnect loop
            self._poll_task = asyncio.create_task(self._reconnect_loop())

    async def stop(self):
        """Disconnect and cancel background tasks."""
        if self._poll_task:
            self._poll_task.cancel()
            try:
                await self._poll_task
            except asyncio.CancelledError:
                pass
            self._poll_task = None
        if self._writer:
            self._writer.close()
            self._writer = None
            self._reader = None
        self.connected = False
        self._set_tag(f"{self._prefix}.status", "Stopped")

    async def _poll_loop(self):
        interval = self.config.get("poll_interval_seconds", 1)
        while True:
            try:
                await self._read_weight()
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.warning(f"Scale poll error: {e}")
                self.connected = False
                self._set_tag(f"{self._prefix}.status", f"Error: {e}")
                # Switch to reconnect
                self._poll_task = asyncio.create_task(self._reconnect_loop())
                return
            await asyncio.sleep(interval)

    async def _reconnect_loop(self):
        delay = 2
        host = self.config.get("host", "192.168.1.50")
        port = self.config.get("port", 4001)
        while True:
            await asyncio.sleep(delay)
            try:
                self._reader, self._writer = await asyncio.wait_for(
                    asyncio.open_connection(host, port), timeout=5.0
                )
                self.connected = True
                self._set_tag(f"{self._prefix}.status", "Connected")
                self._poll_task = asyncio.create_task(self._poll_loop())
                return
            except asyncio.CancelledError:
                raise
            except Exception:
                delay = min(delay * 2, 60)

    async def _read_weight(self):
        """Read weight from the scale (protocol-specific)."""
        # Example: send query command and parse response
        prefix = self._prefix
        self._writer.write(b"W\r\n")
        await self._writer.drain()
        data = await asyncio.wait_for(self._reader.readline(), timeout=5.0)
        response = data.decode(errors="replace").strip()
        # Parse: "ST,GS,  12.345,kg" -> weight=12.345, stable=True
        parts = response.split(",")
        stable = parts[0].strip() == "ST" if len(parts) > 0 else False
        weight = float(parts[2].strip()) if len(parts) > 2 else 0.0
        self._set_tag(f"{prefix}.weight", weight)
        self._set_tag(f"{prefix}.stable", stable)
```

**Key patterns:**

- Inherit from `IntegrationBase` and set four class-level attributes: `type_name`, `display_name`, `description`, `default_config`
- Implement `start()` and `stop()` — these are required (similar to implementing an interface/abstract class)
- Use `self._set_tag(name, value)` to publish values — they immediately appear in the HMI's tag engine and are broadcast to all connected browsers
- Handle reconnection with exponential backoff (2s, 4s, 8s... up to 60s) — the example above shows the pattern
- `self.connected` and `self.status_message` are tracked by the system and displayed on the Settings > Integrations page

### Step 3: Add custom API endpoints (optional)

If your integration needs more than just reading tag values — for example, sending a tare command to a scale, or triggering a print job on a label printer — you can add custom API endpoints.

Create `backend/app/integrations/scale_reader/router.py`:

```python
from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.deps import require_role
from app.models.user import User, UserRole

if TYPE_CHECKING:
    from app.integrations.scale_reader.integration import ScaleReaderIntegration


class TareBody(BaseModel):
    value: float = 0.0


def create_router(integration: "ScaleReaderIntegration") -> APIRouter:
    """Factory: create a router bound to a specific integration instance."""
    router = APIRouter(
        prefix="/api/integrations/scale",
        tags=["integrations-scale"],
    )

    @router.get("/status")
    async def get_status():
        return {
            "connected": integration.connected,
            "status_message": integration.status_message,
        }

    @router.post("/tare")
    async def tare(
        body: TareBody,
        _user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
    ):
        if not integration.connected:
            raise HTTPException(503, "Scale not connected")
        # Send tare command (device-specific)
        await integration.send_tare(body.value)
        return {"ok": True}

    return router
```

Then wire it up in the integration class:

```python
from app.integrations.scale_reader.router import create_router

class ScaleReaderIntegration(IntegrationBase):
    # ...

    def get_router(self):
        return create_router(self)
```

The `create_router()` function receives the live integration instance, so your endpoint handlers can call methods directly on it (like `integration.send_tare()`). The system automatically mounts the router when the integration starts.

### Step 4: That's it — no registration needed

The integration is automatically discovered because the system scans all subfolders of `backend/app/integrations/` at startup. There is no central registry to update. Just restart the server and your new integration type appears in Settings > Integrations.

**What happens at startup:**

1. The system finds all folders under `backend/app/integrations/`
2. For each folder, it looks for the `integration_class` attribute in `__init__.py`
3. The class is registered as an available integration type
4. Any instances that were previously added and enabled via the Settings page are instantiated, their virtual tags are registered, and `start()` is called

### IntegrationBase reference

| Method / Attribute | Required | Description |
|---|---|---|
| `type_name` | Yes | Unique string identifier (e.g., `"zebra_printer"`) |
| `display_name` | Yes | Human-readable name for the UI |
| `description` | Yes | One-line description shown in the integration picker |
| `default_config` | Yes | Default config dict for new instances |
| `start()` | Yes | Connect to the device, begin polling |
| `stop()` | Yes | Disconnect, cancel tasks, release resources |
| `configure(config)` | No | Runtime reconfiguration (default: stop + update config + start) |
| `get_router()` | No | Return a FastAPI `APIRouter` or `None` |
| `get_tag_definitions()` | No | Return list of virtual tag dicts |
| `_set_tag(name, value)` | — | Helper: push a value into TagEngine for broadcast |

### Database model

Integration configurations are stored in the `integrations` table (`backend/app/models/integration.py`):

| Column | Type | Description |
|--------|------|-------------|
| `id` | int | Primary key |
| `type_name` | string(100) | Matches `IntegrationBase.type_name` |
| `name` | string(200) | User-given instance name (unique) |
| `enabled` | bool | Whether to start on boot |
| `config` | text (JSON) | Instance configuration |
| `status` | string(20) | `stopped`, `running`, or `error` |
| `status_message` | text | Error message or null |
| `created_at` | datetime | Creation timestamp (UTC) |
| `updated_at` | datetime | Last modification timestamp (UTC) |

### Existing integrations

| Integration | Type Name | Protocol | Tags Provided |
|-------------|-----------|----------|---------------|
| **Zebra Printer** | `zebra_printer` | TCP/9100, ZPL | status, labels_in_queue, print_speed, darkness, head_open, paper_out, ribbon_out, paused |
| **Cognex DataMan** | `cognex_dataman` | TCP, DMCC | status, last_result, last_result_time, total_reads, device_type, firmware |
| **FTP Hot Folder** | `ftp_hot_folder` | FTP/filesystem | (file monitoring) |

---

## Adding a Database Table

The database stores all HMI configuration and historical data — tags, screens, alarms, trend history, users, audit logs, etc. If you need to store a new type of data, you add a "model" (a Python class that maps to a database table).

### Step 1: Create the model file

Create `backend/app/models/diagnostic.py`:

```python
from datetime import datetime, timezone
from enum import Enum as PyEnum
from sqlalchemy import ForeignKey, String, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class DiagnosticSeverity(PyEnum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"


class Diagnostic(Base):
    __tablename__ = "diagnostics"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    severity: Mapped[str] = mapped_column(String(20), default=DiagnosticSeverity.INFO.value)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc)
    )
    # Foreign key to another table
    tag_id: Mapped[int | None] = mapped_column(ForeignKey("tags.id"), nullable=True)
    tag: Mapped["Tag | None"] = relationship(lazy="selectin")
```

**Conventions:**

- One model per file in `backend/app/models/`
- Use `Mapped[type]` and `mapped_column()` — this is the modern SQLAlchemy 2.0 syntax for defining columns
- Enums (like severity levels) use Python's `enum.Enum` and are stored as strings in the database
- All timestamps use UTC: `datetime.now(timezone.utc)`
- Use `JSON` type for flexible/nested configuration (stored as a JSON string in the database)
- Relationships between tables use `lazy="selectin"` to load related data efficiently

### Step 2: Import the model

Add the import in `backend/app/models/__init__.py` so the system creates the table at startup:

```python
from app.models.diagnostic import Diagnostic
```

### Step 3: Define data validation schemas

When accepting data from the browser or sending data back, you need "schemas" that define the expected structure and types — similar to defining a struct or UDT in a PLC:

```python
from pydantic import BaseModel

class DiagnosticCreate(BaseModel):
    name: str
    severity: str = "info"
    message: str | None = None

class DiagnosticOut(BaseModel):
    id: int
    name: str
    severity: str
    message: str | None
    created_at: datetime

    class Config:
        from_attributes = True  # Enables creating from SQLAlchemy model instances
```

The database table is automatically created the next time the server starts. No migration step or SQL commands are needed for new tables.

---

## Production & Reporting System

The reporting system computes OEE (Overall Equipment Effectiveness) and machine metrics from historical trend data and alarm history. It works on-demand — there are no background processes running continuously. When a user opens the Reports page or requests a summary, the system queries the database and computes the numbers in real time.

### How it's structured

- **ReportingService** (`backend/app/services/reporting_service.py`) — The calculation engine. Queries trend_data and alarm_history tables, computes time intervals, and returns OEE, uptime, downtime, idle time, and production counts.
- **Reporting API** (`backend/app/api/reporting.py`) — HTTP endpoints that the browser calls to get report data (summary, time-series charts, downtime periods, Pareto analysis).
- **Reports Page** (`frontend/src/pages/ReportsPage.tsx`) — The browser UI with summary cards, OEE trend charts, downtime Pareto, and production volume charts.

### How metrics are computed

1. **Good count**: Delta of a PLC counter tag (configured in Settings > Reporting) over the reporting timeframe, computed from trend data.

2. **Reject count**: Count of alarm activations for configured "reject fault tags" in the timeframe, derived from alarm_history.

3. **Machine states** (uptime, downtime, idle):
   - **Uptime**: Time the cycling tag is true AND no downtime alarm is active.
   - **Downtime**: Time any configured downtime alarm tag is active. Derived from alarm_history (triggered_at to cleared_at).
   - **Idle**: Time the machine is neither cycling nor in downtime.

4. **Downtime exception faults**: Configured fault tags that cap their downtime at 5 minutes per occurrence. Time beyond 5 minutes counts as idle.

5. **OEE**: Availability (uptime / (uptime + downtime)) × Performance (rate / target_rate) × Quality (count / (count + rejects)).

### Production settings storage

Configuration is stored in the `app_settings` table as key-value pairs:

| Key | Value |
|-----|-------|
| `production.good_count_tag` | Tag name string (e.g., `"Line1.GoodCount"`) |
| `production.reject_fault_tags` | JSON array of tag names |
| `production.downtime_alarm_tags` | JSON array of tag names |
| `production.cycling_tag` | Tag name string (boolean cycling indicator) |
| `production.downtime_exception_tags` | JSON array of tag names (5-min downtime cap) |
| `production.target_rate` | Target bags/hr for OEE performance calculation |
| `production.machine_status_tag` | Tag name for top bar machine status indicator |
| `production.cycle_start_tag` | Boolean tag written to true by top bar Cycle Start button |
| `production.reset_tag` | Boolean tag written to true by top bar Reset button |

### Downtime annotations

Users can tag downtime periods with reason codes via the `downtime_annotations` table. This is separate from alarm_history to preserve the alarm audit trail. Annotations are linked by `alarm_history_id`.

### Reason codes

Downtime reason codes are managed via a dedicated model (`ReasonCode`) and CRUD API at `/api/reason-codes/`. Codes use soft-delete (`is_active=false`) to preserve historical Pareto analysis.

### Frontend chart components

Report charts are in `frontend/src/components/reports/`:

| Component | Description |
|-----------|-------------|
| `OEETrendChart` | Recharts LineChart — OEE, Availability, Performance, Quality over time |
| `ProductionTrendChart` | Recharts stacked BarChart — good/reject counts per period |
| `DowntimePareto` | Recharts ComposedChart — bars (duration) + cumulative % line |
| `TimeBreakdownBar` | Horizontal stacked bar — uptime (green) / downtime (red) / idle (gray) |
| `MachineStateChart` | Recharts stacked AreaChart — uptime/downtime/idle over time |
| `DowntimePeriodsTable` | Table of downtime periods with inline reason code tagging |

---

## Internal Nonvolatile Tags

Tags without a data source and without simulation enabled are classified as **internal** tags. Unlike simulation tags (which are volatile), internal tags persist their values across application restarts.

### How persistence works

- The `Tag` model has a `persisted_value` column (JSON-serialized string) that stores the last written value.
- On startup, the `TagEngine` reads `persisted_value` from the database for all internal tags and restores them into memory.
- On every write to an internal tag, the new value is asynchronously persisted to the database.
- Serialization supports `bool`, `int`, `float`, and `string` types.

### Frontend display

Internal tags display as **"Internal"** in the Settings > Tags source column and source filter dropdown, distinguishing them from "Simulation" and data-source-bound tags.

### Use cases

- Operator-settable flags and configuration parameters that survive restarts
- Persistent counters not tied to PLC hardware
- Recipe or state values managed entirely within the HMI

---

## Service Page

The Service page (`frontend/src/pages/ServicePage.tsx`) provides manual I/O monitoring and equipment actuation for commissioning and maintenance. It requires the Engineer or Designer role.

### Architecture

The page has two sections:

**I/O Monitor** — Live read-only display of all tags with the "Input" or "Output" label. Tags are split into separate Input and Output columns with real-time value updates via WebSocket. Displays engineering units and enum mappings.

**Service Controls** — All tags with the "Service" label, grouped by their additional labels. Each tag is presented as an interactive control with one of three modes:

| Mode | Behavior | Use case |
|------|----------|----------|
| `momentary` (default) | Press to send `true`, release to send `false` | Solenoids, valves, cylinders |
| `toggle` | Click to alternate between `true` and `false` | Pumps, motors |
| `numeric` / `string` / `enum` | Text input, numeric keypad, or dropdown | Setpoints, parameters |

### Configuration API

Service page settings (per-tag mode overrides and group ordering) are stored in the `app_settings` table under the key `service.config`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/service/config/` | Get current service page configuration |
| PUT | `/api/service/config/` | Update configuration (mode overrides, ordering) |

### Adding tags to the Service page

Tags appear on the Service page based on their labels:
- **"Input"** label → I/O Monitor (Input column)
- **"Output"** label → I/O Monitor (Output column)
- **"Service"** label → Service Controls (grouped by additional labels)

Assign labels in Settings > Tags (bulk operations supported).

---

## Fault Help Dialog

The fault help dialog provides contextual troubleshooting guidance when alarms trigger. Engineers can attach images or animated GIFs (e.g., wiring diagrams, adjustment procedures) and text instructions to individual alarm tags. When the alarm fires, operators see an auto-popup dialog with the visual guide and steps to resolve the fault.

### Architecture

The feature spans the full stack:

**Backend:**
- **Media API** (`backend/app/api/media.py`) — File upload/serve/delete endpoints at `/api/media`. Images are stored on disk in `backend/media/fault_help/` with UUID filenames. Supports PNG, JPG, GIF (including animated), and WEBP up to 10 MB. Upload/delete requires Engineer or Designer role; serving is unauthenticated so operators can view images.
- **AlarmService** (`backend/app/services/alarm_service.py`) — Maintains a `_help_cache` (tag_id → help config) populated during `load_alarm_configs()`. The `_broadcast_alarm()` and `broadcast_alarms_snapshot()` methods include `help_image`, `help_text`, and `help_enabled` fields in WebSocket alarm messages.

**Frontend:**
- **FaultHelpDialog** (`frontend/src/components/FaultHelpDialog.tsx`) — Dialog component displaying the alarm severity/message, help image, troubleshooting text, and Acknowledge/Dismiss buttons. Uses the existing `Dialog` component in wide mode.
- **Auto-popup logic** (`frontend/src/App.tsx`) — A `useEffect` watches the `alarms` array from `useWebSocket`. When a new `active_unacked` alarm appears with `help_enabled=true` and `help_image` set, the dialog auto-opens. Tracks shown alarm IDs to prevent re-popping the same alarm. Shows highest-severity alarm first when multiple trigger simultaneously.
- **Configuration UI** (`frontend/src/pages/SettingsPage.tsx`) — The `FaultHelpConfig` component appears in the alarm section of the tag editor when alarms are enabled. Provides a checkbox to enable the help dialog, a file upload button with image preview, and a textarea for help instructions.

### Configuration data flow

The help configuration is stored in the tag's `alarm_config` JSON field (no database migration required):

```json
{
  "type": "boolean",
  "trigger_on": true,
  "severity": "warning",
  "message": "Motor 1 Overtemp",
  "help_image": "a1b2c3d4e5f6.gif",
  "help_text": "1. Check coolant level\n2. Verify fan is running\n3. Reset overtemp relay",
  "help_enabled": true
}
```

- `help_image` — The `media_id` returned from the upload API (filename on disk). The frontend constructs the full URL as `/api/media/{media_id}`.
- `help_text` — Plain text instructions displayed below the image. Supports newlines for multi-step formatting.
- `help_enabled` — Boolean flag to enable/disable the auto-popup without removing the image/text configuration.

### Adding fault help to an alarm tag

1. Go to **Settings** > **Tags** and click a boolean tag with alarms enabled.
2. Check **Show help dialog on fault**.
3. Click **Upload Image** and select a GIF, PNG, JPG, or WEBP file (max 10 MB).
4. Enter troubleshooting instructions in the **Help Instructions** textarea.
5. Save the tag.

### Key files

| File | Purpose |
|------|---------|
| `backend/app/api/media.py` | Media upload/serve/list/delete API |
| `backend/media/fault_help/` | On-disk image storage directory |
| `backend/app/services/alarm_service.py` | Help cache + WebSocket broadcast of help fields |
| `frontend/src/components/FaultHelpDialog.tsx` | Dialog UI component |
| `frontend/src/App.tsx` | Auto-popup detection logic |
| `frontend/src/pages/SettingsPage.tsx` | `FaultHelpConfig` component in tag editor |

---

## ZPL Label Preview

The ZPL preview system renders Zebra Programming Language (ZPL) label templates as PNG images entirely offline using Pillow. It includes both a standalone preview page and a designer widget.

### Backend renderer

The renderer (`backend/app/services/zpl_renderer.py`) parses ZPL commands and draws them onto a Pillow `Image`:

| Feature | ZPL Commands |
|---------|-------------|
| Text | `^FD`, `^A` (fonts), `^CF` (default font), `^FB` (field blocks), `^FH` (hex escapes) |
| Barcodes | `^BC` (Code 128), `^B3` (Code 39) with rotation support |
| QR Codes | `^BQ` |
| Graphics | `^GB` (boxes), `^GC` (circles), `^GD` (diagonals), `^GF` (graphic fields) |
| Positioning | `^FO` (field origin), `^FT` (field typeset), `^FW` (rotation) |
| Effects | `^FR` (field reverse), `^LR` (label reverse with XOR compositing) |
| Compressed graphics | `:Z64:` and `:B64:` encoded graphic fields (base64+zlib) |

The renderer uses the **CG Triumvirate Condensed Bold** font (bundled as a 45KB TTF) to match real Zebra printers, with Liberation Sans as a cross-platform fallback.

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/zpl-preview/render` | Render ZPL text to PNG (JSON body: `{ zpl, dpi }`) |
| POST | `/api/zpl-preview/render-file` | Render uploaded ZPL file to PNG (multipart form + DPI) |

Both endpoints return a PNG blob. Supported DPI values: 152, 203, 300, 600.

### Standalone page

`ZplPreviewPage.tsx` is accessible via Support > ZPL Preview. It provides a text editor and file upload (with drag-and-drop) for entering ZPL, a DPI selector, a live preview pane, and a download button for the rendered PNG.

### Designer widget

The `zpl_preview` widget type allows embedding a live ZPL preview in any dashboard screen:

| Property | Type | Description |
|----------|------|-------------|
| `tag` | string | Tag name for dynamic ZPL content |
| `staticZpl` | string | Fallback ZPL if no tag is bound |
| `dpi` | number | Label density (default: 203) |
| `refreshOnTagChange` | boolean | Auto-refresh when the bound tag value changes |

### Dependencies

The ZPL renderer requires three additional Python packages: `Pillow`, `python-barcode`, and `qrcode` (all listed in `requirements.txt`).

---

## Testing

Automated tests verify that the application works correctly after code changes — like running a self-diagnostic on a PLC after modifying the program. The project has 252 tests that check alarm state transitions, OEE calculations, tag simulation, authentication, API endpoints, and widget rendering.

The backend uses **pytest** (the standard Python testing tool) and the frontend uses **Vitest** (a JavaScript testing tool).

### Running Tests

```bash
# All tests (backend + frontend)
./dev.sh test

# Backend only
./dev.sh test:backend
# or manually:
cd backend && python -m pytest tests/ -v

# Frontend only
./dev.sh test:frontend
# or manually:
cd frontend && npx vitest run

# Backend with coverage report
cd backend && python -m pytest --cov=app tests/

# Run a single backend test file
cd backend && python -m pytest tests/unit/test_alarm_state_machine.py -v

# Run a single frontend test file
cd frontend && npx vitest run src/hooks/__tests__/useDesignMode.test.ts
```

### Test Dependencies

Backend test libraries are listed in `backend/requirements-dev.txt` (kept separate from production dependencies so they don't ship to panel PCs):

```
pytest>=8.0
pytest-asyncio>=0.24
pytest-cov>=5.0
httpx>=0.27
freezegun>=1.4
```

Install with: `cd backend && pip install -r requirements-dev.txt`

Frontend test libraries are listed in `frontend/package.json` and are installed automatically with `npm install` (they're marked as development-only and don't ship in production builds).

### Test Directory Structure

```
backend/tests/
├── conftest.py                     # Shared fixtures (DB sessions, auth tokens, test client)
├── unit/
│   ├── test_reporting_intervals.py # Interval arithmetic (_clamp, _subtract, _build)
│   ├── test_reporting_oee.py       # OEE formula, bucket generation, exception capping
│   ├── test_alarm_state_machine.py # Alarm state transitions (all 6 paths)
│   ├── test_alarm_conditions.py    # Boolean coercion edge cases
│   ├── test_tag_simulation.py      # Simulation modes (sine, ramp, random, toggle, enum)
│   ├── test_tag_coercion.py        # Value type coercion and serialization
│   ├── test_auth_jwt.py            # JWT creation/decode/expiry, password hashing
│   └── test_zpl_renderer.py        # ZPL-to-PNG rendering
└── integration/
    ├── test_auth_api.py            # Password/PIN login, role enforcement
    ├── test_tags_api.py            # Tag CRUD, value reads and writes
    └── test_reporting_api.py       # Summary, time-series, downtime, screens

frontend/src/
├── hooks/__tests__/
│   ├── useDesignMode.test.ts       # Editor state machine (30 tests)
│   ├── useWebSocket.test.ts        # Reconnect backoff, message handling
│   └── useAuth.test.ts             # Login/logout, localStorage persistence
├── lib/__tests__/
│   └── api.test.ts                 # Auth headers, error handling, URL encoding
├── components/widgets/__tests__/
│   ├── GaugeWidget.test.tsx        # Display modes, color thresholds
│   ├── StatusIndicator.test.tsx    # Value-to-label mapping, color application
│   └── WidgetRenderer.test.tsx     # Widget type dispatch, unknown type handling
├── test-setup.ts                   # Test environment setup (@testing-library/jest-dom)
└── (root) vitest.config.ts         # Vitest configuration (jsdom, globals, setup)
```

### Backend Test Configuration

**`backend/pytest.ini`** tells pytest where to find tests and how to run them:

```ini
[pytest]
asyncio_mode = auto
testpaths = tests
python_files = test_*.py
python_functions = test_*
```

The `asyncio_mode = auto` setting means async test functions (those using `async def`) are handled automatically.

### Backend Test Fixtures

"Fixtures" are pre-configured test environments — think of them like test jigs or setup procedures that run before each test. They're defined in `backend/tests/conftest.py`:

| Fixture | What it provides |
|---------|-----------------|
| `db_engine` | A temporary in-memory database (created fresh for each test session, not your real database) |
| `db_session` | A database connection that gets rolled back after each test (so tests don't interfere with each other) |
| `seeded_db` | A database pre-loaded with the 4 default users and some test tags |
| `admin_token` | A valid login token for the `admin` user (designer role) — for testing authenticated endpoints |
| `operator_token` | A valid login token for the `operator` user — for testing role restrictions |
| `test_client` | An HTTP client that calls the API directly in memory (no real server needed) |

Tests run entirely in memory — they don't touch your real `hmi.db` database or require a running server.

### Frontend Test Configuration

**`frontend/vitest.config.ts`** configures the test environment. Frontend tests run in a simulated browser environment (jsdom) so they can test UI components without opening a real browser.

### Writing Backend Unit Tests

Unit tests check individual functions in isolation — no database, no HTTP server, no PLC connection. They import the function directly and verify its output for known inputs:

```python
from app.services.reporting_service import ReportingService

def test_clamp_interval_within_range():
    result = ReportingService._clamp_interval(
        (100, 200), 50, 250
    )
    assert result == (100, 200)

def test_clamp_interval_partial_overlap():
    result = ReportingService._clamp_interval(
        (100, 200), 150, 250
    )
    assert result == (150, 200)
```

**Key patterns:**
- Test the internal helper functions directly — they contain the core math and logic
- Group related tests in `class TestXxx:` blocks for organization
- Use descriptive names: `test_<function>_<scenario>` (e.g., `test_clamp_interval_partial_overlap`)

### Writing Backend Integration Tests

Integration tests verify the full request flow — from HTTP request through authentication, business logic, database, and back. They simulate what happens when the browser calls an API endpoint:

```python
import pytest

@pytest.mark.asyncio
async def test_login_valid_credentials(test_client, seeded_db):
    resp = await test_client.post('/api/auth/login', json={
        'username': 'admin', 'password': 'admin'
    })
    assert resp.status_code == 200
    data = resp.json()
    assert 'access_token' in data
    assert data['role'] == 'designer'
```

**Key patterns:**
- Use `seeded_db` fixture when tests need pre-existing users/tags
- Use `admin_token` or `operator_token` for authenticated requests
- Pass auth via headers: `headers={'Authorization': f'Bearer {admin_token}'}`
- Use unique names (e.g., timestamps) to avoid UNIQUE constraint conflicts

### Writing Frontend Tests

Frontend tests render UI components in a simulated browser and check that they display the right content:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusIndicator } from '../StatusIndicator'

it('shows mapped label for known value', () => {
  const mapping = {
    'Running': { label: 'RUNNING', color: '#22c55e' },
  }
  render(
    <StatusIndicator
      title="Machine"
      tag="status_tag"
      tagValues={makeTagValues('Running')}
      mapping={mapping}
    />
  )
  expect(screen.getByText('RUNNING')).toBeInTheDocument()
})
```

For testing shared logic modules ("hooks" — reusable behavior like login state or WebSocket connection), use `renderHook`:

```ts
import { renderHook, act } from '@testing-library/react'
import { useDesignMode } from '../useDesignMode'

it('toggles design mode', () => {
  const { result } = renderHook(() => useDesignMode())
  expect(result.current.designMode).toBe(false)
  act(() => { result.current.toggleDesignMode() })
  expect(result.current.designMode).toBe(true)
})
```

**Key patterns:**
- Use `screen.getByText()` / `screen.getByRole()` to find rendered text and elements
- The simulated browser converts hex colors like `#3b82f6` to `rgb()` format — use `toContain('59, 130, 246')` when checking colors
- Wrap state-changing operations in `act()` so the test framework processes updates
- Use `vi.spyOn(globalThis, 'fetch')` to intercept and fake HTTP requests during tests

### Adding Tests for a New Widget

When creating a new widget (see [Creating a New Widget](#creating-a-new-widget)), add a test file alongside:

1. Create `frontend/src/components/widgets/__tests__/NewWidget.test.tsx`
2. Write a `makeTagValues()` helper to create test tag data
3. Test: renders with valid data, handles missing tag gracefully, applies expected styles
4. Run: `cd frontend && npx vitest run src/components/widgets/__tests__/NewWidget.test.tsx`

### Adding Tests for a New API Endpoint

When adding a backend endpoint (see [Adding a Backend API Endpoint](#adding-a-backend-api-endpoint)):

1. Create or extend a test file in `backend/tests/integration/`
2. Use the `test_client` and `seeded_db` fixtures
3. Test: successful response, authentication required (401), role enforcement (403), validation errors (422)
4. Run: `cd backend && python -m pytest tests/integration/test_your_api.py -v`

### Test Coverage

| Category | Tests | What's Covered |
|----------|-------|----------------|
| Backend unit | 147 | ReportingService (intervals, OEE, buckets), AlarmService (state machine, conditions), TagEngine (simulation, coercion), auth (JWT, passwords), ZPL renderer |
| Backend integration | 25 | Auth API (login, PIN, roles), Tags API (CRUD, write), Reporting API (summary, time-series, downtime), Screens API |
| Frontend unit | 80 | useDesignMode (30), useWebSocket (11), useAuth (4), API client (5), GaugeWidget (11), StatusIndicator (8), WidgetRenderer (5) |
| **Total** | **252** | |

### What's Not Covered

- **E2E tests** — No Playwright/Cypress browser automation (recommended as a future addition)
- **Protocol drivers** — OPC-UA, Modbus, EtherNet/IP, MQTT drivers require hardware or protocol simulators
- **Visual regression** — No screenshot comparison for widgets
- **Load testing** — Not typical for industrial HMI applications

---

## Frontend Patterns

> **What's a "hook"?** In React, a "hook" is a reusable module of behavior — like a function block in PLC programming. For example, `useWebSocket` encapsulates all the logic for connecting to the server, receiving live tag updates, and handling reconnection. Pages use hooks by calling them, and the hook provides data and functions back.

### How data flows through the application

```
App.tsx (the root of the application)
├── useAuthState()     → Manages login: who is logged in, their role, login/logout functions
├── useWebSocket()     → Manages the live connection: current tag values, active alarms
└── Pages receive data → Each page gets tagValues, alarms, userRole as inputs
    └── useDesignMode() → Only used by the Dashboard for the screen editor
```

### How live tag values get to the screen

1. The backend `TagEngine` reads tag values from PLCs every 500ms
2. Only changed values are sent to connected browsers via WebSocket (similar to change-of-state updates)
3. The `useWebSocket` hook merges these updates into the in-memory tag value store
4. Widgets automatically re-render when their bound tag value changes

### Adding a custom hook (reusable logic module)

Place hooks in `frontend/src/hooks/` with the `use` prefix (e.g., `usePolling.ts`). Here's an example that polls an API endpoint at a regular interval — useful for data that doesn't come through the WebSocket:

```tsx
import { useState, useEffect, useCallback } from 'react';

export function usePolling<T>(fetcher: () => Promise<T>, intervalMs: number) {
  const [data, setData] = useState<T | null>(null);

  const refresh = useCallback(() => {
    fetcher().then(setData).catch(() => {});
  }, [fetcher]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, intervalMs);
    return () => clearInterval(id);
  }, [refresh, intervalMs]);

  return { data, refresh };
}
```

**Conventions (you'll see these patterns throughout the codebase):**

- `useCallback` — wraps functions so they aren't recreated unnecessarily on every render cycle
- `useMemo` — caches expensive calculations (sorting, filtering) so they only recompute when inputs change
- `useRef` — holds values that persist between renders without causing a screen update (like a static variable in a PLC function block)
- `useState` — declares a variable that, when changed, causes the component to re-render with the new value

### Loading data when a page opens

```tsx
const [data, setData] = useState<MyType[]>([]);

useEffect(() => {
  api.getMyData().then(setData).catch(() => {});
}, []);
```

`useEffect` with an empty `[]` runs once when the page loads — it calls the API and stores the result. The `.catch(() => {})` silently ignores errors for non-critical data.

### Styling

The application uses a dark industrial theme (dark gray backgrounds, light text) via Tailwind CSS — a utility-based styling system where you apply small CSS classes directly in the markup (e.g., `className="text-slate-100 bg-slate-800"` means light text on a dark background). The accent color is customizable at runtime via Settings > Branding.

---

## Backend Patterns

> **What does "async" mean?** Python's `async`/`await` lets the server handle many operations concurrently without threads — similar to how a PLC scan cycle processes multiple tasks cooperatively. When the server waits for a database query or PLC response, it can serve other requests instead of blocking. You'll see `async def` instead of `def` and `await` before operations that involve waiting.

### Async everywhere

All database operations and service calls use async:

```python
# Database query
result = await session.execute(select(Tag).where(Tag.name == name))
tag = result.scalars().first()

# Creating records
session.add(Diagnostic(name="test"))
await session.commit()
```

### Background services

Long-running tasks (like the tag engine's 500ms polling loop or the trend service's data sampling) follow this pattern — similar to a cyclic task in a PLC:

```python
class MyService:
    def __init__(self):
        self._task: asyncio.Task | None = None

    async def start(self):
        self._task = asyncio.create_task(self._loop())

    async def stop(self):
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def _loop(self):
        while True:
            await self._do_work()
            await asyncio.sleep(1.0)
```

Register start/stop calls in the `lifespan` function in `main.py` — this is the server's initialization and shutdown sequence.

### Error handling in endpoints

```python
from fastapi import HTTPException, status

@router.get("/{id}")
async def get_item(id: int, session: AsyncSession = Depends(get_db)):
    item = await session.get(MyModel, id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    return item
```

### Database session management

The `get_db()` function provides a database connection to each endpoint. It automatically saves changes on success and rolls back on error — no manual commit/rollback needed in most cases:

```python
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        yield session
        await session.commit()
```

For background services that need database access outside of an HTTP request (e.g., the trend service logging data), create sessions directly:

```python
from app.core.database import async_session

async with async_session() as session:
    # ... use session ...
    await session.commit()
```

---

## API Reference

This is the complete list of HTTP endpoints the backend provides. The browser UI calls these to read and write data. They can also be called from external systems (e.g., a SCADA system, an MES, or a custom script) using standard HTTP requests with a JWT authentication token.

### Authentication

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Password login — returns JWT token |
| POST | `/api/auth/pin-login` | PIN login — returns JWT token |

### Tags

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/tags/` | List all tags |
| GET | `/api/tags/values` | Current tag values (snapshot) |
| POST | `/api/tags/values/{name}/write` | Write a value to a tag |
| POST | `/api/tags/import/csv` | Import tags from HMI CSV |
| POST | `/api/tags/import/codesys` | Import tags from CODESYS XML |
| POST | `/api/tags/import/codesys/preview` | Preview CODESYS import |
| POST | `/api/tags/import/rslogix500` | Import tags from RSLogix 500 CSV |
| POST | `/api/tags/import/rslogix500/preview` | Preview RSLogix 500 import |
| POST | `/api/tags/bulk/delete` | Bulk delete tags |
| POST | `/api/tags/bulk/update` | Bulk update tag fields |

### Screens

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/screens/` | List all screens |
| GET | `/api/screens/by-slug/{slug}` | Get screen by URL slug |
| POST | `/api/screens/` | Create a new screen |
| PUT | `/api/screens/{id}` | Update screen layout (auto-versions) |
| DELETE | `/api/screens/{id}` | Delete a screen |
| GET | `/api/screens/{id}/versions` | Screen version history |
| GET | `/api/screens/templates/list` | List screen templates |

### Alarms

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/alarms/active` | Active alarms |
| GET | `/api/alarms/history` | Alarm history (with pagination) |
| POST | `/api/alarms/{id}/acknowledge` | Acknowledge an alarm |

### Trends

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/trends/data/{tag_id}` | Historical trend data for a tag |

### Data Sources

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/datasources` | List data sources with connection status |
| POST | `/api/datasources` | Create a data source |
| PUT | `/api/datasources/{id}` | Update a data source |
| DELETE | `/api/datasources/{id}` | Delete a data source |
| POST | `/api/datasources/{id}/connect` | Test connection (auto-detects OPC-UA address prefix) |
| POST | `/api/datasources/{id}/browse` | Full recursive tag browse |
| POST | `/api/datasources/{id}/browse-level` | Lazy single-level browse (body: `{ parent_node_id }`) |
| POST | `/api/datasources/{id}/browse-cache-clear` | Clear cached browse results |

### Jobs

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/jobs/` | List all jobs |
| POST | `/api/jobs/` | Create a job |
| PUT | `/api/jobs/{id}` | Update a job (auto-versions) |
| DELETE | `/api/jobs/{id}` | Delete a job |
| POST | `/api/jobs/{id}/download` | Download job setpoints to machine |
| POST | `/api/jobs/upload-from-machine` | Capture current values as a new job |

### Reporting

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/reporting/summary` | Compute report metrics for a timeframe |
| GET | `/api/reporting/time-series` | Bucketed metrics for charts (day/week/month) |
| GET | `/api/reporting/downtime-periods` | List downtime periods in timeframe |
| PUT | `/api/reporting/downtime-periods/{id}/annotate` | Tag a downtime period with reason code |
| GET | `/api/reporting/downtime-summary` | Downtime Pareto analysis by reason code |
| GET | `/api/production/settings/` | Get production/reporting settings |
| PUT | `/api/production/settings/` | Update production/reporting settings |

### Reason Codes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/reason-codes/` | List downtime reason codes |
| POST | `/api/reason-codes/` | Create a reason code |
| PUT | `/api/reason-codes/{id}` | Update a reason code |
| DELETE | `/api/reason-codes/{id}` | Soft-delete a reason code |

### Users

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/users/` | List users |
| POST | `/api/users/` | Create a user |
| PUT | `/api/users/{id}` | Update a user |
| DELETE | `/api/users/{id}` | Delete a user |

### Service Config

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/service/config/` | Get service page configuration (control modes, ordering) |
| PUT | `/api/service/config/` | Update service page configuration |

### Media (Fault Help Images)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/media/upload` | Upload a fault help image (multipart form, max 10 MB) |
| GET | `/api/media/` | List all uploaded fault help images |
| GET | `/api/media/{media_id}` | Serve a fault help image (no auth required) |
| DELETE | `/api/media/{media_id}` | Delete a fault help image |

### ZPL Preview

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/zpl-preview/render` | Render ZPL text to PNG (JSON body: `{ zpl, dpi }`) |
| POST | `/api/zpl-preview/render-file` | Render uploaded ZPL file to PNG (multipart form + DPI) |

### System Update

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/system/info` | System info (version, platform, python version, install type, uptime) |
| POST | `/api/system/update/validate` | Validate an update package without applying (multipart upload) |
| POST | `/api/system/update/apply` | Apply an update package and schedule restart (multipart upload) |

The system supports both **source-mode** and **compiled-mode** (PyInstaller) update packages. Source packages contain `backend/app/` with Python source; compiled packages contain `hmi-server/` with the native binary and `_internal/` directory. The package type must match the running installation type — mismatched packages are rejected with a clear error message. The `GET /api/system/info` response includes `is_compiled: true/false` to indicate the current install type.

### WebSocket

| Path | Description |
|------|-------------|
| `/ws` | Real-time tag values and alarm updates |

**Message types:** `snapshot` (initial state), `tag_update` (value deltas), `alarm` (state changes), `alarms_snapshot` (full alarm list on reconnect/reload), `keepalive` (every 30s)

Alarm messages include optional fault help fields: `help_image` (media ID), `help_text` (instructions), `help_enabled` (boolean). These are populated from the tag's `alarm_config` JSON and used by the frontend to auto-show the fault help dialog.
