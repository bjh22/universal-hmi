# Developer Guide

This guide covers the common development tasks you'll encounter when extending the HMI application. It assumes you've read `CLAUDE.md` for the project overview.

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

Adding a new page requires changes in three files. Here's the step-by-step process using a hypothetical "Diagnostics" page as an example.

### Step 1: Create the page component

Create `frontend/src/pages/DiagnosticsPage.tsx`:

```tsx
import { useState, useCallback } from 'react';
import type { TagValue, AlarmData } from '../types';

interface Props {
  tagValues: Record<string, TagValue>;
  alarms: AlarmData[];
  userRole: string;
}

export function DiagnosticsPage({ tagValues, alarms, userRole }: Props) {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-slate-100">Diagnostics</h1>
      {/* Page content here */}
    </div>
  );
}
```

Pages receive props from `App.tsx` — the available props depend on what data the page needs. Common props include `tagValues`, `alarms`, and `userRole`.

### Step 2: Register the route in App.tsx

In `frontend/src/App.tsx`, add a lazy import and a `<Route>` entry:

```tsx
// Add with the other lazy imports (around line 24)
const DiagnosticsPage = lazy(() =>
  import('./pages/DiagnosticsPage').then(m => ({ default: m.DiagnosticsPage }))
);

// Add inside the <Routes> block (around line 140)
<Route path="/diagnostics" element={
  <Suspense fallback={<PageLoader />}>
    <DiagnosticsPage tagValues={tagValues} alarms={alarms} userRole={userRole} />
  </Suspense>
} />
```

Pages use `lazy()` with a `.then()` wrapper because they use named exports instead of default exports. This enables code splitting — the page's JavaScript is only downloaded when the user navigates to it.

### Step 3: Add the navigation item in AppShell.tsx

In `frontend/src/components/layout/AppShell.tsx`, add an entry to the `NAV_ITEMS` array (line 42):

```tsx
// Import the icon at the top of the file
import { Stethoscope } from 'lucide-react';

// Add to NAV_ITEMS array
const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', roles: null },
  // ... existing items ...
  { to: '/diagnostics', icon: Stethoscope, label: 'Diagnostics', roles: ['engineer', 'designer'] as string[] },
];
```

The `NAV_ITEMS` array is the single source of truth for sidebar navigation:

| Field   | Type                  | Description |
|---------|-----------------------|-------------|
| `to`    | `string`              | Route path matching the `<Route>` in App.tsx |
| `icon`  | Lucide component      | Icon from `lucide-react` displayed in the sidebar |
| `label` | `string`              | Text label shown when the sidebar is expanded |
| `roles` | `string[] \| null`    | `null` = visible to everyone. Array = only visible to listed roles |

Role values are: `operator`, `supervisor`, `engineer`, `designer`.

---

## Creating a New Widget

The widget system has four touchpoints. Here's a walkthrough for creating a "Speedometer" widget.

### Step 1: Create the widget component

Create `frontend/src/components/widgets/Speedometer.tsx`:

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

- The widget receives `tagValues` (all current values) and looks up its bound tag by name
- Support the `chrome` prop (`'full' | 'compact' | 'none'`) for display level control
- Support `titleStyle` and `valueStyle` for text customization via `buildTextStyle()`
- Use the `chromeUtils` helpers for consistent rendering across widgets

### Step 2: Register in the widget type registry

In `frontend/src/components/designer/widgetTypes.ts`, add an entry to `WIDGET_TYPES`:

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
| `type`          | Unique string identifier. Used in `WidgetRenderer` switch and stored in screen JSON |
| `label`         | Display name shown in the widget palette |
| `icon`          | Lucide icon component shown in the palette |
| `category`      | Groups the widget in the palette: `display`, `input`, or `layout` |
| `defaultW/H`    | Default size in grid units (for grid layout mode) |
| `defaultAbsW/H` | Default size in pixels (for absolute layout mode) |
| `defaultProps`   | Initial values for `widget.props` when a new instance is created |

### Step 3: Add the renderer case

In `frontend/src/components/widgets/WidgetRenderer.tsx`, import your widget and add a case:

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

Props are extracted from `widget.props` (aliased as `p`) and cast to the expected types. The `chrome` prop is already extracted from `widget.chrome` at the top of the component.

### Step 4: Add property panel sections (if needed)

If your widget has type-specific properties, add a section in `frontend/src/components/designer/PropertyPanel.tsx`. Look for existing type-specific blocks (search for `widget.type ===`) and follow the same pattern:

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

All widgets automatically get the common property sections (title, tag binding, chrome, visibility/enabled, text styling) without any extra work. You only need to add sections for properties unique to your widget type.

### Performance note

`WidgetRenderer` is wrapped in `memo()` with a custom comparator that only triggers re-renders when the specific tags used by a widget change. If your widget uses tags from `props` beyond just `tag`, add them to the `getWidgetTagNames()` function in `WidgetRenderer.tsx` so the optimization works correctly.

---

## Adding a Backend API Endpoint

### Adding routes to an existing router

Each resource has its own router file in `backend/app/api/`. To add an endpoint to an existing router (e.g., tags), edit that file directly:

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

### Creating a new router

For a new resource domain, create a new router file:

**1. Create the router file** (`backend/app/api/diagnostics.py`):

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

**2. Register the router** in `backend/app/main.py`:

```python
from app.api import diagnostics

# Add with the other include_router calls (around line 119)
app.include_router(diagnostics.router)
```

### Auth patterns

```python
# No auth required (public endpoint)
@router.get("/health")
async def health():
    return {"status": "ok"}

# Any authenticated user
@router.get("/me")
async def get_me(user: User = Depends(get_current_user)):
    return user

# Specific roles only
@router.post("/configure")
async def configure(
    user: User = Depends(require_role(UserRole.ENGINEER, UserRole.DESIGNER)),
):
    ...

# Optional auth (works for both anonymous and logged-in users)
@router.get("/public-data")
async def public_data(user: User | None = Depends(get_current_user)):
    if user:
        # Return full data for logged-in users
        ...
    else:
        # Return limited data for anonymous users
        ...
```

### Accessing services from routes

Background services are attached to `app.state` during startup:

```python
from fastapi import Request

@router.post("/trigger-alarm-eval")
async def trigger_alarm_eval(request: Request):
    alarm_service = request.app.state.alarm_service
    await alarm_service.evaluate()
    return {"status": "ok"}
```

Available on `app.state`: `alarm_service`, `trend_service`, `integration_manager`.
The `tag_engine` is accessed via `from app.services.tag_engine import tag_engine` (module-level singleton).

### Adding a frontend API method

After creating the backend endpoint, add the corresponding method in `frontend/src/lib/api.ts`:

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

The `request<T>()` helper automatically adds the JWT Authorization header and handles error responses.

---

## Creating a Plugin Integration

The plugin integration system lets you add support for external equipment (printers, barcode readers, file watchers, etc.) without modifying core application code. Each integration is a self-contained Python package that is automatically discovered at startup.

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

1. **Discovery** — On startup, `IntegrationManager.discover()` scans all subpackages under `app/integrations/` using `pkgutil.iter_modules()`. Each package must export an `integration_class` attribute pointing to its `IntegrationBase` subclass.
2. **Configuration** — Integration instances and their configs are stored in the `integrations` database table. Admins can add, enable/disable, and configure instances via the Settings page.
3. **Virtual tags** — Each integration declares tags via `get_tag_definitions()`. These are registered into the `TagEngine` at startup and broadcast via WebSocket like any other tag.
4. **Custom API routes** — Integrations can optionally expose API endpoints via `get_router()`. These are mounted into FastAPI dynamically.
5. **Lifecycle** — The manager handles start, stop, enable/disable, and status tracking. Integrations manage their own reconnection logic.

### Step 1: Create the integration package

Create a new directory under `backend/app/integrations/`. For this example, we'll build a "Scale Reader" integration that reads weight from an industrial scale over TCP.

Create `backend/app/integrations/scale_reader/__init__.py`:

```python
from app.integrations.scale_reader.integration import ScaleReaderIntegration

integration_class = ScaleReaderIntegration
```

The `integration_class` attribute is required — the manager looks for this to discover your integration.

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

- Inherit from `IntegrationBase` and set the four class attributes: `type_name`, `display_name`, `description`, `default_config`
- Implement `start()` and `stop()` (both abstract and required)
- Use `self._set_tag(name, value)` to push values into the TagEngine — they are immediately available via WebSocket
- Handle reconnection with exponential backoff in a separate async task
- `self.connected` and `self.status_message` are tracked by the manager for UI display

### Step 3: Add custom API endpoints (optional)

If your integration needs endpoints beyond tag reads (e.g., sending commands, querying device info), create a router.

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

The router uses a factory pattern: `create_router()` receives the live integration instance, so route handlers can call methods directly on it. The manager mounts the router into FastAPI when the integration starts.

### Step 4: That's it — no registration needed

The integration is automatically discovered because `IntegrationManager.discover()` iterates all subpackages of `app/integrations/`. There is no central registry to update. Just restart the application and the new integration type appears in the available types list.

**The lifecycle at startup:**

1. `IntegrationManager.discover()` finds all packages under `app/integrations/`
2. For each package, it imports the module and reads `integration_class`
3. The class is registered in an in-memory `_registry` dict keyed by `type_name`
4. `load_and_start()` queries the `integrations` table for enabled instances
5. For each enabled instance, it instantiates the class, registers virtual tags, mounts the router, and calls `start()`

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

## Adding a Database Model

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
- Use `Mapped[type]` and `mapped_column()` (SQLAlchemy 2.0 style)
- Enums use Python's `enum.Enum`, stored as strings in the database
- All timestamps use UTC: `datetime.now(timezone.utc)`
- Use `JSON` type for flexible/nested configuration
- Relationships use `lazy="selectin"` to avoid N+1 query problems

### Step 2: Import the model

Add the import in `backend/app/models/__init__.py` (or wherever models are collected) so SQLAlchemy discovers it during `create_all()`:

```python
from app.models.diagnostic import Diagnostic
```

### Step 3: Create Pydantic schemas

Define request/response schemas in the router file or a dedicated schemas file:

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

The table is automatically created on next startup via `Base.metadata.create_all()` in `database.py:init_db()`. No migration step is needed for new tables.

---

## Production & Reporting System

The reporting system computes OEE and machine metrics from historical trend data and alarm history on-demand, without requiring production runs.

### Architecture

The system spans three layers:

- **ReportingService** (`backend/app/services/reporting_service.py`) — Stateless service that computes metrics from existing trend_data and alarm_history tables on-demand. No background loops.
- **Reporting API** (`backend/app/api/reporting.py`) — REST endpoints for summary metrics, time-series bucketing, downtime periods, annotations, and Pareto analysis.
- **Reports Page** (`frontend/src/pages/ReportsPage.tsx`) — Two-tab layout: Live (rolling 8-hour view with auto-refresh) and Historical (arbitrary date range with charts and analytics).

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

The project uses **pytest** for backend tests and **Vitest** for frontend tests. The full suite contains 252 tests (172 backend + 80 frontend) covering services, API endpoints, hooks, and widgets.

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

Backend test dependencies are in `backend/requirements-dev.txt` (separate from production):

```
pytest>=8.0
pytest-asyncio>=0.24
pytest-cov>=5.0
httpx>=0.27
freezegun>=1.4
```

Install with: `cd backend && pip install -r requirements-dev.txt`

Frontend test dependencies are in `frontend/package.json` devDependencies:

- `vitest` — test runner (native Vite integration)
- `@testing-library/react` — React component testing utilities
- `@testing-library/jest-dom` — DOM assertion matchers
- `jsdom` — browser environment simulation

These are installed automatically with `npm install`.

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

**`backend/pytest.ini`** configures pytest for async test discovery:

```ini
[pytest]
asyncio_mode = auto
testpaths = tests
python_files = test_*.py
python_functions = test_*
```

`asyncio_mode = auto` means all `async def test_*` functions are automatically treated as async tests — no `@pytest.mark.asyncio` decorator needed.

### Backend Test Fixtures

The shared fixtures in `backend/tests/conftest.py` provide:

| Fixture | Scope | Purpose |
|---------|-------|---------|
| `db_engine` | session | In-memory SQLite async engine with all tables created |
| `db_session` | function | Fresh async session per test (rolled back after each test) |
| `session_factory` | session | Async session factory for the test client |
| `seeded_db` | function | Session pre-loaded with 4 default users and 4 test tags |
| `admin_token` | function | Valid JWT for the `admin` user (designer role) |
| `operator_token` | function | Valid JWT for the `operator` user |
| `test_client` | function | FastAPI `AsyncClient` with database dependency overridden |

Integration tests use `httpx.AsyncClient` with `ASGITransport` to call the FastAPI app directly — no running server required.

### Frontend Test Configuration

**`frontend/vitest.config.ts`** sets up Vitest with jsdom and React plugin:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
})
```

- `environment: 'jsdom'` provides a browser-like DOM environment
- `globals: true` makes `describe`, `it`, `expect` available without imports
- `setupFiles` loads `@testing-library/jest-dom` matchers (`.toBeInTheDocument()`, etc.)

### Writing Backend Unit Tests

Backend unit tests target pure functions extracted from services. They import the function directly and test without any database or HTTP context:

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
- Test functions at the `_private` level since they contain the core logic
- Use `@staticmethod` functions directly (no instance needed)
- Group related tests in `class TestXxx:` blocks for organization
- Use descriptive names: `test_<function>_<scenario>`

### Writing Backend Integration Tests

Integration tests use the `test_client` fixture to make HTTP requests through the full FastAPI stack:

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

Frontend tests use React Testing Library to render components and assert on the DOM:

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

For hooks, use `renderHook` from `@testing-library/react`:

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
- Use `screen.getByText()` / `screen.getByRole()` for querying rendered output
- jsdom converts hex colors to `rgb()` format — assert with `toContain('59, 130, 246')` instead of `toContain('#3b82f6')`
- Wrap state-changing calls in `act()`
- Use `vi.spyOn(globalThis, 'fetch')` to mock API calls

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

### State management

The app uses React hooks and localStorage instead of Redux:

```
App.tsx (root)
├── useAuthState()     → user, token, login(), logout()
├── useWebSocket()     → tagValues, alarms, wsConnected
└── Props drilling     → Pages receive tagValues, alarms, userRole
    └── useDesignMode() → Used only in DashboardPage for the screen editor
```

### Data flow for real-time values

1. Backend `TagEngine` updates tag values every 500ms
2. WebSocket sends `tag_update` messages with changed values only (deltas)
3. `useWebSocket` hook merges deltas into its `tagValues` state
4. Components re-render with new values via props

### Adding a custom hook

Place hooks in `frontend/src/hooks/` with the `use` prefix (e.g., `usePolling.ts`):

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

**Conventions:**

- `useCallback` for all functions passed as props or used in dependency arrays
- `useMemo` for expensive derived data (filtering, sorting)
- `useRef` for values that shouldn't trigger re-renders (WebSocket refs, timers)
- `useState` initializer functions for reading from localStorage on first render

### Fetching data in pages

```tsx
const [data, setData] = useState<MyType[]>([]);

useEffect(() => {
  api.getMyData().then(setData).catch(() => {});
}, []);
```

Non-critical fetches use `.catch(() => {})` to suppress console errors. Critical fetches should set an error state for display.

### Styling

- Tailwind CSS with dark theme (slate-800/900 backgrounds, slate-100/200 text)
- CSS variables from `lib/theme.ts` for runtime theme customization (e.g., `var(--hmi-accent)`)
- No CSS modules or styled-components

---

## Backend Patterns

### Async everywhere

All database operations and service calls are async:

```python
# Database query
result = await session.execute(select(Tag).where(Tag.name == name))
tag = result.scalars().first()

# Creating records
session.add(Diagnostic(name="test"))
await session.commit()
```

### Background services

Long-running background tasks follow this pattern:

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

Register start/stop calls in the `lifespan` function in `main.py`.

### Error handling in routes

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

The `get_db()` dependency yields a session that auto-commits on success and rolls back on exception:

```python
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        yield session
        await session.commit()
```

For operations outside of request handlers (e.g., in background services), create sessions from the factory:

```python
from app.core.database import async_session

async with async_session() as session:
    # ... use session ...
    await session.commit()
```

---

## API Reference

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
