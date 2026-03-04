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
| **Viewer** | Can view dashboards, trends, and alarms. No control or configuration. |
| **Operator** | Can start/stop/reset machine, acknowledge alarms, select recipes. |
| **Supervisor** | Operator permissions + recipe editing, production reports, user management. |
| **Engineer** | Full access including OPC UA tag configuration, system settings, and audit logs. |

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
| FR-DASH-08 | Auto-refresh all values via WebSocket push (target: <500ms update latency) |
| FR-DASH-09 | All touch targets minimum 44px; UI designed for touch-first interaction (no hover-dependent controls) |

### 3.2 Machine Control

| ID | Requirement |
|----|-------------|
| FR-CTRL-01 | Support configurable command buttons — each button writes a predefined value to a specified OPC UA tag (e.g., "Start" writes 1 to `ns=2;s=Machine.Command`) |
| FR-CTRL-02 | Support configurable parameter inputs — numeric entry fields, sliders, or dropdowns that write to OPC UA tags, with optional min/max/step constraints |
| FR-CTRL-03 | Allow buttons and parameter inputs to be grouped into named control panels on the UI |
| FR-CTRL-04 | Optionally require confirmation dialogs on specific buttons (configurable per button) |
| FR-CTRL-05 | Require Operator role or above for all control actions |
| FR-CTRL-06 | Log all control actions (button presses and parameter writes) to the audit trail with user, timestamp, tag, and value |
| FR-CTRL-07 | Support toggle-style buttons that reflect the current tag value (e.g., ON/OFF with visual state) |

### 3.3 Alarm Management

| ID | Requirement |
|----|-------------|
| FR-ALM-01 | Display active alarms in a sortable, filterable table (severity, time, source, message) |
| FR-ALM-02 | Support alarm severities: Critical, Warning, Info |
| FR-ALM-03 | Alarm states: Active/Unacknowledged, Active/Acknowledged, Inactive/Unacknowledged, Inactive (cleared) |
| FR-ALM-04 | Allow operators to acknowledge individual alarms or acknowledge all |
| FR-ALM-05 | Persist alarm history to database with timestamps for raised, acknowledged, and cleared |
| FR-ALM-06 | Alarm history page with date range filtering and export (CSV) |
| FR-ALM-07 | Visual and optional audible notification on new critical alarms |
| FR-ALM-08 | Alarm banner/ticker visible on all pages showing most recent unacknowledged alarm |

### 3.4 Historical Trending

| ID | Requirement |
|----|-------------|
| FR-TREND-01 | Log configurable OPC UA tags to the database at a configurable sample rate |
| FR-TREND-02 | Interactive time-series chart with zoom, pan, and crosshair |
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

| ID | Requirement |
|----|-------------|
| FR-TAG-01 | Configure OPC UA server connections (endpoint URL, security policy, credentials) |
| FR-TAG-02 | Browse the OPC UA server address space and select tags |
| FR-TAG-03 | Define tag metadata: display name, engineering units, range (min/max), format (decimal places) |
| FR-TAG-04 | Group tags into logical categories (e.g., "Temperatures", "Counters", "Film Station") |
| FR-TAG-05 | Configure which tags are trended (logged to history) and at what sample rate |
| FR-TAG-06 | Tag import/export via JSON or CSV |

### 3.8 User Management & Authentication

| ID | Requirement |
|----|-------------|
| FR-AUTH-01 | Login screen with numeric PIN entry (touch-friendly) as default; optional username/password for Engineer role |
| FR-AUTH-02 | JWT-based session management with configurable token expiration |
| FR-AUTH-03 | Role-based access control (Viewer, Operator, Supervisor, Engineer) |
| FR-AUTH-04 | User CRUD operations (Engineer role only) |
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

---

## 4. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-01 | **Latency**: Dashboard values update within 500ms of OPC UA value change |
| NFR-02 | **Concurrency**: Support at least 5 simultaneous browser clients (panel PC primary + maintenance laptops) |
| NFR-03 | **Uptime**: Backend should auto-reconnect to OPC UA server on connection loss |
| NFR-04 | **Browser**: Chromium-based (panel PC runs Chromium in kiosk mode); also support Chrome and Edge for maintenance laptops |
| NFR-05 | **Display**: Designed for the panel PC's native resolution (configurable, default 1920x1080); touch-first with minimum 44px touch targets |
| NFR-06 | **Security**: All OPC UA credentials and passwords/PINs stored encrypted at rest |
| NFR-07 | **Deployment**: Runs as a systemd service (or equivalent); auto-starts on boot; watchdog restarts on crash. No Docker required. |
| NFR-08 | **Kiosk mode**: Browser launches fullscreen on boot with no browser chrome; on-screen keyboard available for text input |
| NFR-09 | **Offline**: Fully self-contained — no CDN, external fonts, or internet-dependent resources. All assets bundled locally. |
| NFR-10 | **Configuration**: Server endpoint, database, and basic settings via environment variables or config file |
| NFR-11 | **Logging**: Structured application logging (JSON) with configurable log levels |
| NFR-12 | **Testability**: Backend API unit tests, OPC UA integration tests using the sim server |
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
4. A temperature reading trends upward — operator clicks it to open the trend view
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
2. Clicks "New Recipe" or "Clone from existing"
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
2. Clicks "Add Connection" and enters: endpoint URL (`opc.tcp://192.168.1.10:4840`), security policy (Basic256Sha256), and credentials
3. System tests the connection and browses the server address space
4. Engineer selects relevant nodes and assigns display names, units, and ranges
5. Groups tags into categories (e.g., "Sealing Station", "Film Feed", "Counters")
6. Marks selected tags for trending at 1-second intervals
7. Saves — dashboard begins showing live data from the new machine

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
