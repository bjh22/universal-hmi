# Industrial HMI for Packaging Machines — Requirements & Use Cases

## 1. Project Overview

A web-based Human-Machine Interface (HMI) for monitoring and controlling packaging machines, deployed on a **dedicated industrial panel PC** with touchscreen. The HMI communicates with PLCs via a **pluggable protocol driver** architecture supporting OPC UA, EtherNet/IP (CIP), and Modbus TCP — allowing connection to a wide range of industrial controllers from CODESYS-based PLCs to Allen-Bradley MicroLogix/CompactLogix. The HMI is **state-model agnostic** — it does not impose PackML or any other state machine. Instead, it reads and displays whatever tags the PLC exposes and lets operators interact through configurable command buttons and parameter inputs. It provides real-time visualization, alarm management, historical trending, recipe management, and production reporting.

The system is designed to run **fully offline** with no internet dependency — all assets are bundled locally.

### 1.1 Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | React + TypeScript + Vite | Responsive, component-based UI with strong typing |
| UI Library | Shadcn/ui + Tailwind CSS | Clean industrial look, accessible, customizable |
| Real-time Comms | WebSocket (via FastAPI) | Low-latency live data push to browser |
| Backend | Python 3.11+ / FastAPI | Async-native, excellent performance, easy integration with industrial protocols |
| OPC UA Driver | asyncua (opcua-asyncio) | Mature async Python OPC UA client/server library |
| EtherNet/IP Driver | pycomm3 | Python library for Allen-Bradley EtherNet/IP (CIP) communication — supports MicroLogix, CompactLogix, ControlLogix |
| Modbus TCP Driver | pymodbus | Async Python Modbus TCP client for generic PLC/device communication |
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
| **Engineer** | Full access including PLC connection and tag configuration, system settings, audit logs, and full user management (all roles). Logs in via username/password. |
| **Designer** | All Engineer permissions plus screen design capabilities: create and edit screen layouts, configure widgets, define navigation structure, and manage reusable screen templates. Logs in via username/password. |

---

## 3. Functional Requirements

### 3.1 Machine Overview Dashboard

| ID | Requirement |
|----|-------------|
| FR-DASH-01 | Display machine status using configurable indicator widgets that map tag values to colors/labels (e.g., a tag value of 1 = "Running"/green, 2 = "Stopped"/red). No fixed state model assumed. |
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
| FR-CTRL-01 | Support configurable command buttons — each button writes a predefined value to a specified tag (e.g., "Start" writes 1 to the tag bound to `MachineCmd`) |
| FR-CTRL-02 | Support configurable parameter inputs — numeric entry fields, sliders, or dropdowns that write to tags, with optional min/max/step constraints |
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
| FR-TREND-01 | Log configurable tags to the database at a configurable sample rate |
| FR-TREND-02 | Interactive time-series chart with zoom, pan, and crosshair (touch: pinch-to-zoom, swipe-to-pan) |
| FR-TREND-03 | Support multiple tags on one chart (up to 8, each with its own Y-axis scaling) |
| FR-TREND-04 | Preset time ranges (1h, 8h, 24h, 7d, 30d) and custom date range picker |
| FR-TREND-05 | Save and recall named trend views (tag selections + time range) |
| FR-TREND-06 | Export trend data to CSV |
| FR-TREND-07 | Down-sample large datasets for responsive chart rendering |

### 3.5 Recipe Management

| ID | Requirement |
|----|-------------|
| FR-RCP-01 | Define recipes as named collections of tag setpoints (e.g., speed, temperature, film length) |
| FR-RCP-02 | CRUD operations on recipes (Create, Read, Update, Delete) |
| FR-RCP-03 | Download recipe parameters to machine (write values to the corresponding PLC tags) |
| FR-RCP-04 | Upload current machine parameters as a new recipe |
| FR-RCP-05 | Compare two recipes side-by-side with differences highlighted |
| FR-RCP-06 | Recipe versioning — track changes over time |
| FR-RCP-07 | Require Supervisor role or above for recipe edits; Operator can select/download only |
| FR-RCP-08 | Optionally restrict recipe download based on a configurable tag condition (e.g., only when a "ReadyForRecipe" tag is true) |

### 3.6 Production Reporting

| ID | Requirement |
|----|-------------|
| FR-RPT-01 | Track production runs (start time, end time, recipe, counts, downtime) |
| FR-RPT-02 | Calculate and display OEE (Availability x Performance x Quality) per run and per shift |
| FR-RPT-03 | Downtime tracking with reason codes (operator-entered or auto-detected from alarms) |
| FR-RPT-04 | Shift-based reporting (configurable shift schedules) |
| FR-RPT-05 | Summary tables and charts for production over time |
| FR-RPT-06 | Export reports to CSV or PDF |

### 3.7 PLC Connections & Protocol Drivers

The backend uses a **pluggable protocol driver** architecture. Each PLC connection specifies a protocol, and the corresponding driver handles communication. The HMI application code (widgets, recipes, alarms, trends) interacts only with the tag database by short name — it is completely protocol-agnostic.

| ID | Requirement |
|----|-------------|
| FR-PROTO-01 | Support multiple concurrent PLC connections, each using its own protocol driver |
| FR-PROTO-02 | **OPC UA driver** — connects via endpoint URL with configurable security policy (None, Basic256Sha256) and authentication (anonymous, username/password, certificate). Supports browsing the server address space. |
| FR-PROTO-03 | **EtherNet/IP (CIP) driver** — connects to Allen-Bradley PLCs (MicroLogix, CompactLogix, ControlLogix) via IP address and slot number. Tags addressed by CIP tag path (e.g., `N7:0`, `F8:0`, `T4:0.ACC`) or symbolic name (e.g., `Program:MainProgram.Speed`). |
| FR-PROTO-04 | **Modbus TCP driver** — connects via IP address and port (default 502) with configurable unit ID. Tags addressed by register type and address (e.g., Holding Register 40001, Input Register 30001, Coil 00001, Discrete Input 10001). Supports configurable data types (INT16, UINT16, INT32, FLOAT32, BOOL) and byte order (big/little endian, word swap). |
| FR-PROTO-05 | Each driver provides a common interface: read tag, write tag, subscribe to value changes, test connection, and (where supported) browse available tags |
| FR-PROTO-06 | Auto-reconnect on connection loss with exponential backoff (1s, 2s, 4s, 8s, max 30s), per connection |
| FR-PROTO-07 | Connection status (connected, disconnected, error) displayed per connection in the UI; "Connection Lost" banner shows which connection(s) are affected |

### 3.8 Tag Configuration

The system maintains a **tag database** stored in SQLite. Each tag record contains:

| Field | Description |
|-------|-------------|
| **Short name** | Unique, friendly identifier used throughout the UI (e.g., `FilmTemp`, `MachineSpeed`, `GoodCount`) |
| **PLC address** | Protocol-specific address — OPC UA node ID (e.g., `ns=2;s=Machine.Temperatures.FilmSeal`), CIP tag path (e.g., `N7:0`), or Modbus register (e.g., `HR:40001:FLOAT32`) |
| **Connection** | Which PLC connection this tag belongs to (determines the protocol) |
| **Data type** | Tag data type (Bool, Int16, Int32, Float32, Float64, String). For Modbus, this also determines how many registers to read. |
| **Group** | Logical category for organizing tags (e.g., "Temperatures", "Counters", "Film Station") |
| **Options** | Per-tag configuration (see FR-TAG-04 below) |

| ID | Requirement |
|----|-------------|
| FR-TAG-01 | Configure PLC connections: protocol type, endpoint/IP address, and protocol-specific settings (see FR-PROTO-02 through FR-PROTO-04) |
| FR-TAG-02 | Import tags from external sources. Supported import sources: **(a)** browse a live OPC UA server address space and select nodes, **(b)** browse an EtherNet/IP controller's tag list, **(c)** import a CODESYS symbol configuration XML file. In all cases, the PLC address is auto-populated from the source. For Modbus (no browsing), tags are added manually or via CSV/JSON import. |
| FR-TAG-03 | Each tag must have a unique short name (friendly identifier) and a PLC address. Short names are used in widget bindings, recipes, alarms, and audit logs — the raw PLC address is not exposed to operators. The tag editor shows the appropriate address format based on the connection's protocol. |
| FR-TAG-04 | Each tag has configurable options: engineering units (e.g., "°C", "mm/s"), display format (decimal places, number format), range (min/max for validation and gauge scaling), deadband (minimum change before a value update is pushed), and read/write mode (read-only, read-write, write-only) |
| FR-TAG-05 | Tags can be flagged as trended (logged to history) with a configurable sample rate per tag |
| FR-TAG-06 | Tags can be flagged as alarm sources. Two alarm modes are supported: **threshold** — for analog tags, with high, high-high, low, low-low limits and severity per limit; **boolean** — for discrete tags, where a true value raises an alarm (e.g., `conveyorMotorFault` = true → Critical alarm "Conveyor Motor Fault"). Each alarm source has a configurable severity, message text, and active-on state (true or false, to handle both fault flags and healthy-state flags). |
| FR-TAG-07 | Group tags into logical categories; groups are displayed in the tag editor as a tree or filtered list |
| FR-TAG-08 | Tag editor provides a searchable, sortable table view of all tags with inline editing of short name, group, and options |
| FR-TAG-09 | Tag import/export via JSON or CSV for backup and transfer between systems |
| FR-TAG-10 | When importing from any source (live OPC UA/EtherNet/IP browse, CODESYS XML, JSON, or CSV), the system compares the incoming tags against the existing tag database and presents a **diff view** showing: **(a)** new tags (exist in source but not in database), **(b)** deleted tags (exist in database but not in source), **(c)** changed tags (same short name or PLC address but different options/address). Each difference is individually selectable — the user can accept or reject each add, delete, and change before committing the import. |
| FR-TAG-11 | The import diff view displays a summary count (e.g., "12 new, 3 changed, 2 removed") and supports select-all/deselect-all per category. Changed tags show a side-by-side comparison of old vs. new values for each modified field. |
| FR-TAG-12 | Deleting a tag (manually or via import) warns if it is referenced by any widget, alarm, recipe, or trend configuration; optionally cascade-remove or block deletion |
| FR-TAG-13 | All tag database changes are logged to the audit trail, including import operations (source, number of adds/changes/deletes applied) |

### 3.9 User Management & Authentication

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

### 3.10 Audit Trail

| ID | Requirement |
|----|-------------|
| FR-AUDIT-01 | Log all control actions, recipe changes, alarm acknowledgments, and login events |
| FR-AUDIT-02 | Each entry: timestamp, user, action type, details, source IP |
| FR-AUDIT-03 | Searchable/filterable audit log page (Engineer role only) |
| FR-AUDIT-04 | Audit log retention policy (see NFR-13) |
| FR-AUDIT-05 | Export audit log to CSV |

### 3.11 Screen Design

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
| FR-SCRN-12 | In edit mode, live PLC data continues to flow into widgets so the designer sees real values while editing. Toggling back to live mode exits the editor and returns to normal runtime operation. |
| FR-SCRN-13 | Screen editor includes undo/redo (minimum 50 levels) |
| FR-SCRN-14 | Import/export screen designs as JSON for backup or transfer between systems |
| FR-SCRN-15 | All screen design changes are logged to the audit trail (who changed what screen, when) |

---

## 4. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-01 | **Latency**: Dashboard values update within 500ms of PLC value change |
| NFR-02 | **Concurrency**: Support at least 5 simultaneous browser clients (panel PC primary + maintenance laptops) |
| NFR-03 | **Uptime**: Backend should auto-reconnect to PLC on connection loss (see FR-PROTO-06) |
| NFR-04 | **Browser**: Chromium-based (panel PC runs Chromium in kiosk mode); also support Chrome and Edge for maintenance laptops |
| NFR-05 | **Display**: Designed for the panel PC's native resolution (configurable, default 1920x1080); touch-first with minimum 44px touch targets |
| NFR-06 | **Security**: All PLC credentials and passwords/PINs stored encrypted at rest. HTTPS/TLS for browser-to-backend communication is supported but optional — HTTP is acceptable on isolated factory networks. |
| NFR-07 | **Deployment**: Runs as a systemd service (or equivalent); auto-starts on boot; watchdog restarts on crash. No Docker required. |
| NFR-08 | **Kiosk mode**: Browser launches fullscreen on boot with no browser chrome; on-screen keyboard available for text input |
| NFR-09 | **Offline**: Fully self-contained — no CDN, external fonts, or internet-dependent resources. All assets bundled locally. |
| NFR-10 | **Configuration**: Server endpoint, database, and basic settings via environment variables or config file |
| NFR-11 | **Logging**: Structured application logging (JSON) with configurable log levels |
| NFR-12 | **Testability**: Backend API unit tests, protocol driver integration tests using the sim server, and frontend component tests |
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
5. Backend writes all recipe parameters to the PLC
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

### UC-06a: Engineer Configures an OPC UA Connection

**Actor**: Engineer
**Precondition**: Logged in with Engineer role
**Flow**:
1. Engineer navigates to Settings → PLC Connections
2. Taps "Add Connection", selects "OPC UA" as the protocol
3. Enters: endpoint URL (`opc.tcp://192.168.1.10:4840`), security policy (Basic256Sha256), and credentials
4. System tests the connection and confirms it can browse the server address space
5. Engineer navigates to the Tag Editor and taps "Import from → Browse Live Server"
6. Browses the OPC UA address space tree and selects the nodes to import
7. System presents a diff view: "47 new tags, 0 changed, 0 removed" (first import, so all are new)
8. Engineer reviews the list, deselects a few diagnostic nodes not needed, and taps "Apply"
9. Tags are created in the database with OPC UA node IDs auto-populated; engineer assigns short names, engineering units, display format, and min/max ranges
10. Groups tags into categories (e.g., "Sealing Station", "Film Feed", "Counters")
11. Marks selected tags for trending at 1-second intervals; configures alarm thresholds on temperature tags and boolean alarm sources on fault flags
12. Saves — widgets can now bind to tags by short name; dashboard begins showing live data

---

### UC-06b: Engineer Configures a MicroLogix 1400 via EtherNet/IP

**Actor**: Engineer
**Precondition**: Logged in with Engineer role; Allen-Bradley MicroLogix 1400 on the network
**Flow**:
1. Engineer navigates to Settings → PLC Connections
2. Taps "Add Connection", selects "EtherNet/IP (CIP)" as the protocol
3. Enters: PLC IP address (`192.168.1.20`) and slot number (0)
4. System tests the connection and confirms communication with the controller
5. Engineer navigates to the Tag Editor and taps "Import from → Browse Controller Tags"
6. System retrieves the tag list from the MicroLogix; engineer selects relevant data files (e.g., `N7` integers, `F8` floats, `T4` timers)
7. System presents a diff view: "32 new tags, 0 changed, 0 removed"
8. Engineer assigns friendly short names (e.g., `N7:0` → `MachineCmd`, `F8:0` → `SpeedSetpoint`, `T4:0.ACC` → `CycleTimer`)
9. Configures data types, units, and ranges for each tag
10. Saves — tags are available for widget binding by short name

---

### UC-06c: Engineer Re-imports Tags After PLC Program Change

**Actor**: Engineer
**Precondition**: Logged in with Engineer role; tags were previously imported; PLC program has been updated with new and renamed variables
**Flow**:
1. Engineer navigates to the Tag Editor and taps "Import from → CODESYS Symbol XML"
2. Uploads the updated symbol configuration XML exported from the CODESYS IDE
3. System parses the XML and compares against the existing tag database
4. Diff view shows: "5 new, 2 changed, 1 removed" — each category is expandable
5. Engineer expands "Changed" — sees that `SealTemp1` PLC address changed from `ns=2;s=GVL.SealTemp` to `ns=2;s=GVL.Sealing.Temp1`; side-by-side comparison highlights the difference
6. Engineer expands "Removed" — sees `OldDiagCounter` is no longer in the PLC; system warns it is bound to a widget on the Line 3 screen
7. Engineer accepts all new and changed tags, but deselects the deletion to investigate the widget binding first
8. Taps "Apply" — 5 tags added, 2 updated; the removed tag is left unchanged for now
9. Audit trail records the import: source (CODESYS XML), filename, and the specific adds/changes applied

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

### UC-08: System Handles PLC Connection Loss

**Actor**: System (automated)
**Precondition**: HMI is connected to one or more PLCs
**Flow**:
1. Network interruption causes a PLC connection to drop
2. Backend detects disconnection and logs the event
3. Dashboard shows a "Connection Lost" banner identifying the affected connection, with timestamp
4. Tags on the affected connection show stale/unknown state (grayed out); other connections continue normally
5. Backend retries connection with exponential backoff (1s, 2s, 4s, 8s, max 30s)
6. On reconnection, backend re-subscribes to all tags on that connection and pushes fresh values
7. "Connection Lost" banner clears; audit log records the reconnection

---

### UC-09: Unauthenticated Operator Controls Machine

**Actor**: Unauthenticated user (at panel PC)
**Precondition**: Machine is faulted; Start, Stop, and Fault Reset buttons are configured as unauthenticated-allowed
**Flow**:
1. Operator approaches the panel PC (no login required)
2. Dashboard shows machine status indicating a fault condition
3. Operator taps the "Fault Reset" button — confirmation dialog appears (if configured)
4. Operator confirms — backend writes the reset command to the PLC tag; audit log records the action as "unauthenticated"
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
**Precondition**: Logged in with Designer role; tags are already configured in the tag database
**Flow**:
1. Designer is viewing the Home screen in live mode; taps the edit button (or presses Ctrl+E) to enter edit mode
2. Edit-mode toolbar appears with widget palette, alignment tools, and a "New Screen" option
3. Taps "New Screen", names it "Line 3 — Overview", and selects a grid resolution (1920x1080)
4. Drags a status indicator widget onto the canvas; binds it to the `MachineStatus` tag (by short name) and configures value-to-color mappings (1=Running/green, 2=Stopped/red, 3=Faulted/amber)
5. Adds gauge widgets for speed, temperature, and pressure — binds each to its tag by short name and sets min/max/warning thresholds; live PLC values flow into widgets as they are placed
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
│   ├── PLC Connections       — Protocol, endpoints, and credentials
│   ├── Tag Configuration     — Import/configure/group tags
│   ├── User Management       — Add/edit/remove users and roles
│   ├── System Settings       — Shift schedules, retention, etc.
│   └── Audit Trail           — Searchable event log
└── Profile                   — Change password, preferences
```

---

## 8. Design Decisions

| # | Topic | Decision |
|---|-------|----------|
| 1 | **Multi-machine** | Single machine for v1. Data model should not preclude adding multi-machine later, but UI and backend target one primary PLC connection initially (additional connections supported for auxiliary devices). |
| 2 | **Notifications** | In-app only (alarm banner, alarm page, optional audible alert in browser). No email, SMS, or push notifications in v1. |
| 3 | **Localization** | i18n-ready — use a localization framework (e.g., react-i18next) from the start so all user-facing strings are externalizable, but ship with English only. |
| 4 | **Historian** | Built-in database only. The HMI logs trend data to its own DB. No external historian integration in v1. |
| 5 | **Display** | Touch-first design for panel PC touchscreen. Designed for native panel resolution (default 1920x1080). Maintenance laptops can connect via browser on the local network. |
| 6 | **Regulatory** | No special regulatory requirements. Standard audit trail and authentication; no FDA 21 CFR Part 11 or formal GMP compliance needed. |
