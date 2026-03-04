# OPC UA HMI for Packaging Machines — Requirements & Use Cases

## 1. Project Overview

A web-based Human-Machine Interface (HMI) for monitoring and controlling packaging machines via OPC UA, deployed on a **dedicated industrial panel PC** with touchscreen. The HMI is **state-model agnostic** — it does not impose PackML or any other state machine. Instead, it reads and displays whatever tags the PLC exposes and lets operators interact through configurable command buttons and parameter inputs. It provides real-time visualization, alarm management, historical trending, recipe management, and production reporting.

The system is designed to run **fully offline** with no internet dependency — all assets are bundled locally.

### 1.1 Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | React + TypeScript + Vite | Responsive, component-based UI with strong typing |
| UI Library | Shadcn/ui + Tailwind CSS | Clean industrial look, accessible, customizable |
| Real-time Comms | WebSocket (via FastAPI) | Low-latency live data push to browser |
| Backend | Python 3.11+ / FastAPI | Async-native, excellent performance, easy OPC UA integration |
| OPC UA Client | asyncua (opcua-asyncio) | Mature async Python OPC UA client/server library |
| Database | SQLite | Embedded, zero-config, portable — ideal for a dedicated panel PC deployment |
| ORM | SQLAlchemy + Alembic | Database access and migrations |
| Auth | JWT tokens + bcrypt | Stateless auth with role-based access control |
| Simulation | Built-in OPC UA sim server | Simulates a packaging machine for development/demo |

---

## 2. User Roles

| Role | Description |
|------|-------------|
| **Unauthenticated** | Default state — can view dashboards, trends, and alarms. No login required. Can use specific controls explicitly configured for unauthenticated access (e.g., fault reset, resettable counters). |
| **Operator** | Can start/stop/reset machine, acknowledge alarms, select recipes. Logs in via numeric PIN. |
| **Supervisor** | Operator permissions + recipe editing, production reports, user management (can manage Operator accounts only). Logs in via numeric PIN. |
| **Engineer** | Full access including OPC UA tag configuration, system settings, audit logs, and full user management (all roles). Logs in via username/password. |
| **Designer** | All Engineer permissions plus screen design capabilities: create and edit screen layouts, configure widgets, define navigation structure, and manage reusable screen templates. Logs in via username/password. |

---

## 3. Functional Requirements

### 3.1 Machine Overview Dashboard

| ID | Requirement |
|----|-------------|
| FR-DASH-01 | Display machine status using configurable indicator widgets that map OPC UA tag values to colors/labels (e.g., a tag value of 1 = "Running"/green, 2 = "Stopped"/red). No fixed state model assumed. |
| FR-DASH-02 | Show machine speed (current, setpoint, max) with gauge or bar visualization |
| FR-DASH-03 | Display production counters: good count, reject count, total count |
| FR-DASH-04 | Show current recipe/product name and batch/lot ID |
| FR-DASH-05 | Display active alarms count with severity badge (critical/warning/info) |
| FR-DASH-06 | Show OEE (Overall Equipment Effectiveness) — availability, performance, quality |
| FR-DASH-07 | Display key process values (temperatures, pressures, sensor states) as configurable widgets |
| FR-DASH-08 | Auto-refresh all values via WebSocket push (see NFR-01 for latency target) |

### 3.2 Machine Control

| ID | Requirement |
|----|-------------|
| FR-CTRL-01 | Support configurable command buttons — each button writes a predefined value to a specified OPC UA tag (e.g., "Start" writes 1 to `ns=2;s=Machine.Command`) |
| FR-CTRL-02 | Support configurable parameter inputs — numeric entry fields, sliders, or dropdowns that write to OPC UA tags, with optional min/max/step constraints |
| FR-CTRL-03 | Allow buttons and parameter inputs to be grouped into named control panels on the UI |
| FR-CTRL-04 | Optionally require confirmation dialogs on specific buttons (configurable per button) |
| FR-CTRL-05 | Control actions require authenticated Operator role or above by default. Individual buttons/inputs can be configured to allow unauthenticated access (e.g., fault reset, resettable operator counter). |
| FR-CTRL-06 | Log all control actions (button presses and parameter writes) to the audit trail with user (or "unauthenticated" if no login), timestamp, tag, and value |
| FR-CTRL-07 | Support toggle-style buttons that reflect the current tag value (e.g., ON/OFF with visual state) |

### 3.3 Alarm Management

| ID | Requirement |
|----|-------------|
| FR-ALM-01 | Display active alarms in a sortable, filterable table (severity, time, source, message) |
| FR-ALM-02 | Support alarm severities: Critical, Warning, Info |
| FR-ALM-03 | Alarm states: Active/Unacknowledged, Active/Acknowledged, Inactive/Unacknowledged, Inactive (cleared) |
| FR-ALM-04 | Allow operators to acknowledge individual alarms or acknowledge all. Alarm acknowledgment can be configured to allow unauthenticated access (same per-item configuration as controls). |
| FR-ALM-05 | Persist alarm history to database with timestamps for raised, acknowledged, and cleared |
| FR-ALM-06 | Alarm history page with date range filtering and export (CSV) |
| FR-ALM-07 | Visual and optional audible notification on new critical alarms |
| FR-ALM-08 | Alarm banner/ticker visible on all pages showing most recent unacknowledged alarm |

### 3.4 Historical Trending

| ID | Requirement |
|----|-------------|
| FR-TREND-01 | Log configurable OPC UA tags to the database at a configurable sample rate |
| FR-TREND-02 | Interactive time-series chart with zoom, pan, and crosshair (touch: pinch-to-zoom, swipe-to-pan) |
| FR-TREND-03 | Support multiple tags on one chart (up to 8, each with its own Y-axis scaling) |
| FR-TREND-04 | Preset time ranges (1h, 8h, 24h, 7d, 30d) and custom date range picker |
| FR-TREND-05 | Save and recall named trend views (tag selections + time range) |
| FR-TREND-06 | Export trend data to CSV |
| FR-TREND-07 | Down-sample large datasets for responsive chart rendering |

### 3.5 Recipe Management

| ID | Requirement |
|----|-------------|
| FR-RCP-01 | Define recipes as named collections of OPC UA tag setpoints (e.g., speed, temperature, film length) |
| FR-RCP-02 | CRUD operations on recipes (Create, Read, Update, Delete) |
| FR-RCP-03 | Download recipe parameters to machine (write to OPC UA tags) |
| FR-RCP-04 | Upload current machine parameters as a new recipe |
| FR-RCP-05 | Compare two recipes side-by-side with differences highlighted |
| FR-RCP-06 | Recipe versioning — track changes over time |
| FR-RCP-07 | Require Supervisor role or above for recipe edits; Operator can select/download only |
| FR-RCP-08 | Optionally restrict recipe download based on a configurable OPC UA tag condition (e.g., only when a "ReadyForRecipe" tag is true) |

### 3.6 Production Reporting

| ID | Requirement |
|----|-------------|
| FR-RPT-01 | Track production runs (start time, end time, recipe, counts, downtime) |
| FR-RPT-02 | Calculate and display OEE (Availability x Performance x Quality) per run and per shift |
| FR-RPT-03 | Downtime tracking with reason codes (operator-entered or auto-detected from alarms) |
| FR-RPT-04 | Shift-based reporting (configurable shift schedules) |
| FR-RPT-05 | Summary tables and charts for production over time |
| FR-RPT-06 | Export reports to CSV or PDF |

### 3.7 OPC UA Tag Configuration

The system maintains a **tag database** stored in SQLite. Each tag record contains:

| Field | Description |
|-------|-------------|
| **Short name** | Unique, friendly identifier used throughout the UI (e.g., `FilmTemp`, `MachineSpeed`, `GoodCount`) |
| **OPC UA address** | Full OPC UA node ID (e.g., `ns=2;s=Machine.Temperatures.FilmSeal`) |
| **Connection** | Which OPC UA server connection this tag belongs to |
| **Group** | Logical category for organizing tags (e.g., "Temperatures", "Counters", "Film Station") |
| **Options** | Per-tag configuration (see FR-TAG-04 below) |

| ID | Requirement |
|----|-------------|
| FR-TAG-01 | Configure OPC UA server connections (endpoint URL, security policy, credentials) |
| FR-TAG-02 | Browse the OPC UA server address space to discover nodes; select nodes to add as tags with their OPC UA address auto-populated |
| FR-TAG-03 | Each tag must have a unique short name (friendly identifier) and an OPC UA address. Short names are used in widget bindings, recipes, alarms, and audit logs — the raw OPC UA node ID is not exposed to operators. |
| FR-TAG-04 | Each tag has configurable options: engineering units (e.g., "°C", "mm/s"), display format (decimal places, number format), range (min/max for validation and gauge scaling), deadband (minimum change before a value update is pushed), and read/write mode (read-only, read-write, write-only) |
| FR-TAG-05 | Tags can be flagged as trended (logged to history) with a configurable sample rate per tag |
| FR-TAG-06 | Tags can be flagged as alarm sources. Two alarm modes are supported: **threshold** — for analog tags, with high, high-high, low, low-low limits and severity per limit; **boolean** — for discrete tags, where a true value raises an alarm (e.g., `conveyorMotorFault` = true → Critical alarm "Conveyor Motor Fault"). Each alarm source has a configurable severity, message text, and active-on state (true or false, to handle both fault flags and healthy-state flags). |
| FR-TAG-07 | Group tags into logical categories; groups are displayed in the tag editor as a tree or filtered list |
| FR-TAG-08 | Tag editor provides a searchable, sortable table view of all tags with inline editing of short name, group, and options |
| FR-TAG-09 | Tag import/export via JSON or CSV — import validates for duplicate short names and missing OPC UA addresses |
| FR-TAG-10 | Deleting a tag warns if it is referenced by any widget, alarm, recipe, or trend configuration; optionally cascade-remove or block deletion |
| FR-TAG-11 | All tag database changes are logged to the audit trail |

### 3.8 User Management & Authentication

| ID | Requirement |
|----|-------------|
| FR-AUTH-01 | Dashboard accessible without login. Unauthenticated users can view all pages and use controls explicitly marked as unauthenticated-allowed. All other control actions prompt for login via numeric PIN (Operator/Supervisor) or username/password (Engineer). |
| FR-AUTH-02 | JWT-based session management with configurable token expiration |
| FR-AUTH-03 | Role-based access control (Unauthenticated, Operator, Supervisor, Engineer, Designer) |
| FR-AUTH-04 | User CRUD operations — Supervisors can manage Operator accounts; Engineers can manage all roles except Designer; Designers can manage all roles |
| FR-AUTH-05 | Password/PIN complexity requirements and change functionality |
| FR-AUTH-06 | Auto-logout after configurable inactivity timeout (important for shared panel PC) |
| FR-AUTH-07 | Quick user switching — lock screen returns to PIN entry without full app reload |
| FR-AUTH-08 | Audit log of login/logout events |

### 3.9 Audit Trail

| ID | Requirement |
|----|-------------|
| FR-AUDIT-01 | Log all control actions, recipe changes, alarm acknowledgments, and login events |
| FR-AUDIT-02 | Each entry: timestamp, user, action type, details, source IP |
| FR-AUDIT-03 | Searchable/filterable audit log page (Engineer role only) |
| FR-AUDIT-04 | Audit log retention policy (see NFR-13) |
| FR-AUDIT-05 | Export audit log to CSV |

### 3.10 Screen Design

| ID | Requirement |
|----|-------------|
| FR-SCRN-01 | Provide a screen editor accessible to users with the Designer role for creating and editing HMI screens. Designer can toggle between live (runtime) mode and edit mode on any screen via an edit button or keyboard shortcut (e.g., Ctrl+E). The edit button is only visible when logged in as Designer. |
| FR-SCRN-02 | Support drag-and-drop placement of widgets onto a grid-based canvas with snap-to-grid alignment |
| FR-SCRN-03 | Widget palette includes: value displays, gauges, bar charts, trend charts, status indicators, buttons, parameter inputs, alarm tables, images/shapes, and text labels |
| FR-SCRN-04 | Each widget exposes a property panel for configuration: tag binding (by short name from the tag database), label, units, colors, thresholds, size, and position |
| FR-SCRN-05 | Support widget resize and move with visual guides (alignment lines, equal spacing indicators) |
| FR-SCRN-06 | Define the navigation structure: pages, tabs, and menu hierarchy; each page is a separate screen |
| FR-SCRN-07 | Support navigation links between screens (e.g., tap a machine area to drill into its detail screen) |
| FR-SCRN-08 | Provide reusable screen templates — save a screen layout as a template that can be instantiated for new machines or areas |
| FR-SCRN-09 | Provide reusable widget groups — group multiple widgets into a composite that can be placed as a single unit and reused across screens |
| FR-SCRN-10 | Template and widget group instances inherit updates from the source unless explicitly overridden (linked instances) |
| FR-SCRN-11 | Screen designs are saved to the database and versioned; previous versions can be viewed and restored |
| FR-SCRN-12 | In edit mode, live OPC UA data continues to flow into widgets so the designer sees real values while editing. Toggling back to live mode exits the editor and returns to normal runtime operation. |
| FR-SCRN-13 | Screen editor includes undo/redo (minimum 50 levels) |
| FR-SCRN-14 | Import/export screen designs as JSON for backup or transfer between systems |
| FR-SCRN-15 | All screen design changes are logged to the audit trail (who changed what screen, when) |

---

## 4. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-01 | **Latency**: Dashboard values update within 500ms of OPC UA value change |
| NFR-02 | **Concurrency**: Support at least 5 simultaneous browser clients (panel PC primary + maintenance laptops) |
| NFR-03 | **Uptime**: Backend should auto-reconnect to OPC UA server on connection loss |
| NFR-04 | **Browser**: Chromium-based (panel PC runs Chromium in kiosk mode); also support Chrome and Edge for maintenance laptops |
| NFR-05 | **Display**: Designed for the panel PC's native resolution (configurable, default 1920x1080); touch-first with minimum 44px touch targets |
| NFR-06 | **Security**: All OPC UA credentials and passwords/PINs stored encrypted at rest. HTTPS/TLS for browser-to-backend communication is supported but optional — HTTP is acceptable on isolated factory networks. |
| NFR-07 | **Deployment**: Runs as a systemd service (or equivalent); auto-starts on boot; watchdog restarts on crash. No Docker required. |
| NFR-08 | **Kiosk mode**: Browser launches fullscreen on boot with no browser chrome; on-screen keyboard available for text input |
| NFR-09 | **Offline**: Fully self-contained — no CDN, external fonts, or internet-dependent resources. All assets bundled locally. |
| NFR-10 | **Configuration**: Server endpoint, database, and basic settings via environment variables or config file |
| NFR-11 | **Logging**: Structured application logging (JSON) with configurable log levels |
| NFR-12 | **Testability**: Backend API unit tests, OPC UA integration tests using the sim server, and frontend component tests |
| NFR-13 | **Data retention**: Configurable retention policy for trend data and audit logs with automatic purge to prevent disk filling (default: trends 90 days, audit 1 year) |
| NFR-14 | **Database**: SQLite in WAL mode for concurrent read performance; periodic backup to configurable location (USB, network share) |

---

## 5. Use Cases

### UC-01: Operator Monitors Machine During Production

**Actor**: Operator
**Precondition**: Operator is logged in; machine is running
**Flow**:
1. Operator opens the dashboard and sees the machine status indicator showing "Running" (green)
2. Dashboard shows current speed (120 packs/min), good count (4,523), reject count (12)
3. OEE widget shows 87.3% (Availability 95%, Performance 92%, Quality 99.7%)
4. A temperature reading trends upward — operator taps it to open the trend view
5. Trend chart shows the temperature rising over the last 30 minutes
6. Operator decides to continue monitoring; no action needed yet

---

### UC-02: Operator Responds to an Alarm

**Actor**: Operator
**Precondition**: Machine is running; alarm occurs
**Flow**:
1. Film break sensor triggers — a critical alarm appears in the alarm banner across the top of the screen
2. Audible notification plays; alarm badge on dashboard turns red
3. Machine status indicator changes (reflecting the PLC's response to the fault)
4. Operator navigates to Alarm page, sees "Film Break – Station 2" with timestamp
5. Operator addresses the physical issue on the machine
6. Operator acknowledges the alarm in the HMI
7. Operator presses the appropriate command button (e.g., "Reset" or "Resume") to restart

---

### UC-03: Operator Performs a Recipe Changeover

**Actor**: Operator
**Precondition**: Machine is not running (or recipe download condition tag is satisfied)
**Flow**:
1. Operator navigates to the Recipe page
2. Selects "Product-B 500ml" from the recipe list
3. Reviews recipe parameters (speed, seal temp, film length, etc.)
4. Presses "Download to Machine" — system confirms with a dialog
5. Backend writes all recipe parameters to the OPC UA server
6. Dashboard shows the new recipe name; operator presses the "Start" command button

---

### UC-04: Supervisor Creates a New Recipe

**Actor**: Supervisor
**Precondition**: Logged in with Supervisor role
**Flow**:
1. Supervisor navigates to Recipe Management
2. Taps "New Recipe" or "Clone from existing"
3. Enters recipe name, fills in parameters (speed setpoint, temperatures, film settings)
4. Saves the recipe — system validates parameter ranges
5. Optionally compares the new recipe against an existing one side-by-side
6. Recipe is stored in the database with version 1

---

### UC-05: Supervisor Reviews Production Report

**Actor**: Supervisor
**Precondition**: Production data has been collected over a shift
**Flow**:
1. Supervisor opens the Reports page
2. Selects "Shift Report" and picks today's date and shift (e.g., Day Shift 06:00–14:00)
3. Report shows: total produced, reject rate, OEE breakdown, top 5 downtime reasons
4. Supervisor drills into a downtime event — sees the alarm that triggered it and duration
5. Exports the report as PDF for the shift handover meeting

---

### UC-06: Engineer Configures a New Machine Connection

**Actor**: Engineer
**Precondition**: Logged in with Engineer role
**Flow**:
1. Engineer navigates to Settings → OPC UA Connections
2. Taps "Add Connection" and enters: endpoint URL (`opc.tcp://192.168.1.10:4840`), security policy (Basic256Sha256), and credentials
3. System tests the connection and confirms it can browse the server address space
4. Engineer navigates to the Tag Editor, selects the new connection, and taps "Browse Server"
5. Browses the OPC UA address space tree; selects nodes to add — each becomes a tag with the OPC UA address auto-populated
6. Assigns each tag a short name (e.g., `FilmTemp`, `SealPressure`, `GoodCount`), engineering units, display format, and min/max range
7. Groups tags into categories (e.g., "Sealing Station", "Film Feed", "Counters")
8. Marks selected tags for trending at 1-second intervals; configures alarm thresholds on temperature tags
9. Saves — tags appear in the tag database; widgets can now bind to them by short name; dashboard begins showing live data

---

### UC-07: Engineer Reviews Audit Trail

**Actor**: Engineer
**Precondition**: Logged in with Engineer role
**Flow**:
1. Engineer opens the Audit Trail page
2. Filters by date range and action type ("Control Commands")
3. Sees a list of all start/stop/reset commands with timestamps and which operator issued them
4. Cross-references with alarm history to investigate a production incident
5. Exports the filtered log to CSV for documentation

---

### UC-08: System Handles OPC UA Connection Loss

**Actor**: System (automated)
**Precondition**: HMI is connected to OPC UA server
**Flow**:
1. Network interruption causes OPC UA connection to drop
2. Backend detects disconnection and logs the event
3. Dashboard shows a "Connection Lost" banner with timestamp
4. All live values show stale/unknown state (grayed out)
5. Backend retries connection with exponential backoff (1s, 2s, 4s, 8s, max 30s)
6. On reconnection, backend re-subscribes to all tags and pushes fresh values
7. "Connection Lost" banner clears; audit log records the reconnection

---

### UC-09: Unauthenticated Operator Controls Machine

**Actor**: Unauthenticated user (at panel PC)
**Precondition**: Machine is faulted; Start, Stop, and Fault Reset buttons are configured as unauthenticated-allowed
**Flow**:
1. Operator approaches the panel PC (no login required)
2. Dashboard shows machine status indicating a fault condition
3. Operator taps the "Fault Reset" button — confirmation dialog appears (if configured)
4. Operator confirms — backend writes the reset command to the OPC UA tag; audit log records the action as "unauthenticated"
5. Machine clears the fault; status indicator updates
6. Operator taps "Start" — machine begins running
7. Later, operator taps "Stop" to halt the machine for a changeover
8. All actions are logged to the audit trail with "unauthenticated" as the user

---

### UC-10: Supervisor Compares Recipes Before Changeover

**Actor**: Supervisor
**Precondition**: Logged in with Supervisor role; multiple recipes exist
**Flow**:
1. Supervisor navigates to Recipe Management
2. Selects the current recipe ("Product-A 250ml") and a candidate recipe ("Product-A 500ml")
3. Taps "Compare" — system displays both recipes side-by-side with differences highlighted
4. Supervisor reviews the parameter differences (e.g., film length, seal temperature, speed setpoint)
5. Satisfied with the changes, supervisor selects the new recipe and taps "Download to Machine"

---

### UC-11: Designer Builds a New Machine Overview Screen

**Actor**: Designer
**Precondition**: Logged in with Designer role; OPC UA tags are already configured
**Flow**:
1. Designer is viewing the Home screen in live mode; taps the edit button (or presses Ctrl+E) to enter edit mode
2. Edit-mode toolbar appears with widget palette, alignment tools, and a "New Screen" option
3. Taps "New Screen", names it "Line 3 — Overview", and selects a grid resolution (1920x1080)
4. Drags a status indicator widget onto the canvas; binds it to `ns=2;s=Machine.Status` and configures value-to-color mappings (1=Running/green, 2=Stopped/red, 3=Faulted/amber)
5. Adds gauge widgets for speed, temperature, and pressure — binds each to its OPC UA tag and sets min/max/warning thresholds; live OPC UA values flow into widgets as they are placed
6. Adds production counter widgets (good count, reject count, total) in a horizontal row
7. Adds a control panel group with Start, Stop, and Fault Reset buttons — configures each button's target tag and write value
8. Uses alignment guides to arrange widgets neatly on the grid
9. Saves the screen — it appears in the navigation menu and is versioned in the database
10. Taps the edit button (or Ctrl+E) to return to live mode — the screen is now operational
11. Audit trail records the new screen creation

---

### UC-12: Designer Creates and Reuses a Screen Template

**Actor**: Designer
**Precondition**: Logged in with Designer role; at least one completed screen exists
**Flow**:
1. Designer navigates to "Line 3 — Overview" in live mode and taps the edit button (or Ctrl+E) to enter edit mode
2. Taps "Save as Template" and names it "Standard Machine Overview"
3. Template is saved with placeholder tag bindings (relative paths)
4. Designer taps "New Screen from Template" and selects "Standard Machine Overview"
5. Names the new screen "Line 4 — Overview"
6. Remaps the tag bindings from Line 3's namespace to Line 4's namespace (e.g., `Machine3.Speed` → `Machine4.Speed`)
7. Adjusts a threshold on one widget — this widget is marked as overridden from the template
8. Saves the screen — it appears as a linked instance of the template
9. Later, the designer updates the template (adds an OEE widget) — the update propagates to Line 4's screen, except for the overridden widget

---

### UC-13: Designer Configures Navigation Structure

**Actor**: Designer
**Precondition**: Logged in with Designer role; multiple screens exist
**Flow**:
1. Designer navigates to Screen Editor and taps "Navigation"
2. Sees the current page tree: Home → Line 3 Overview, Line 4 Overview, Alarms, Recipes
3. Creates a new group "Production Lines" and drags Line 3 and Line 4 screens under it
4. Adds a drill-down link: tapping the Line 3 status indicator on the Home screen navigates to the Line 3 Overview
5. Reorders the menu items and sets "Home" as the default landing page
6. Taps "Preview Navigation" to verify the menu structure and drill-down links
7. Saves — the navigation changes take effect immediately for all users

---

## 6. Packaging Machine Simulation Server

The built-in simulation server provides a realistic OPC UA address space mimicking a packaging machine for development and demo purposes.

### Simulated Nodes

| Category | Tags | Description |
|----------|------|-------------|
| **Machine Status** | MachineRunning (Bool), FaultActive (Bool), Command (Int) | Simple running/faulted status with a command input tag |
| **Counters** | GoodCount, RejectCount, TotalCount | Increment while running based on speed |
| **Speed** | CurrentSpeed, SpeedSetpoint, MaxSpeed | Speed follows setpoint with ramp-up/ramp-down |
| **Temperatures** | SealTemp1, SealTemp2, TunnelTemp | Simulated PID-like behavior with noise |
| **Film Station** | FilmTension, FilmLength, SpliceDetect | Simulated film feed values |
| **Pressures** | VacuumPressure, AirPressure | Simulated with noise |
| **Digital I/O** | DoorClosed, EStopActive, FilmBreak, ProductDetect | Boolean signals |
| **Production** | BatchID, RecipeName, ShiftNumber | String/integer metadata |

### Simulation Behaviors

- **Command handling**: Writing to the Command tag starts/stops/resets the simulated machine (e.g., 1=Start, 2=Stop, 3=Reset)
- **Random faults**: Periodically injects alarms (film break, temperature deviation, E-stop) to test alarm handling
- **Counter progression**: Good count increments at current speed rate while running; rejects at ~0.3% rate
- **Process noise**: Analog values include Gaussian noise to look realistic on trends
- **Recipe support**: Accepts recipe parameter writes and adjusts simulation accordingly

---

## 7. Pages / Navigation Structure

```
├── Dashboard (home)          — Machine overview with live status
├── Trends                    — Historical trend charts
├── Alarms
│   ├── Active Alarms         — Current alarms with acknowledge
│   └── Alarm History         — Past alarms with filtering
├── Recipes
│   ├── Recipe List           — Browse/select/download recipes
│   └── Recipe Editor         — Create/edit recipe parameters
├── Reports
│   ├── Production Runs       — Run history and details
│   └── OEE / Shift Report    — OEE breakdown and shift summary
├── Settings (Engineer only)
│   ├── OPC UA Connections    — Server endpoints and credentials
│   ├── Tag Configuration     — Browse/configure/group tags
│   ├── User Management       — Add/edit/remove users and roles
│   ├── System Settings       — Shift schedules, retention, etc.
│   └── Audit Trail           — Searchable event log
└── Profile                   — Change password, preferences
```

---

## 8. Design Decisions

| # | Topic | Decision |
|---|-------|----------|
| 1 | **Multi-machine** | Single machine for v1. Data model should not preclude adding multi-machine later, but UI and backend target one OPC UA connection initially. |
| 2 | **Notifications** | In-app only (alarm banner, alarm page, optional audible alert in browser). No email, SMS, or push notifications in v1. |
| 3 | **Localization** | i18n-ready — use a localization framework (e.g., react-i18next) from the start so all user-facing strings are externalizable, but ship with English only. |
| 4 | **Historian** | Built-in database only. The HMI logs trend data to its own DB. No OPC UA historian integration in v1. |
| 5 | **Display** | Touch-first design for panel PC touchscreen. Designed for native panel resolution (default 1920x1080). Maintenance laptops can connect via browser on the local network. |
| 6 | **Regulatory** | No special regulatory requirements. Standard audit trail and authentication; no FDA 21 CFR Part 11 or formal GMP compliance needed. |
