# Industrial HMI for Packaging Machines — Requirements & Use Cases

## 1. Project Overview

A web-based Human-Machine Interface (HMI) for monitoring and controlling packaging machines. The HMI communicates with PLCs via a **pluggable protocol driver** architecture supporting OPC UA, EtherNet/IP (CIP), and Modbus TCP — allowing connection to a wide range of industrial controllers from CODESYS-based PLCs to Allen-Bradley MicroLogix/CompactLogix. The HMI is **state-model agnostic** — it does not impose PackML or any other state machine. Instead, it reads and displays whatever tags the PLC exposes and lets operators interact through configurable command buttons and parameter inputs. It provides real-time visualization, alarm management, historical trending, recipe management, and production reporting.

The system is **multi-platform** — it runs on **Windows, Linux (x86_64), and ARM platforms** (including Raspberry Pi and ARM-based industrial panel PCs). Typical deployments include dedicated industrial panel PCs with touchscreen, Raspberry Pi units for cost-sensitive installations, and standard Windows or Linux PCs for development and auxiliary HMI stations.

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
| Simulation | Tag database simulation layer | Protocol-agnostic tag value simulation for development, demo, and screen design without a live PLC |

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

### 3.1 Dashboard & Visualization Widgets

The system provides a library of configurable widgets that can be placed on designer-created screens (see §3.11 Screen Design). The requirements below define the **widget capabilities** available in the widget palette — they do not prescribe a fixed screen layout. The built-in simulation ships with an example dashboard screen demonstrating these widgets (see §6).

| ID | Requirement |
|----|-------------|
| FR-DASH-01 | **Status indicator widget** — maps tag values to colors and labels (e.g., a tag value of 1 = "Running"/green, 2 = "Stopped"/red). No fixed state model assumed; mappings are fully configurable per widget instance. |
| FR-DASH-02 | **Gauge / bar widget** — displays a numeric tag value as a gauge, progress bar, or vertical bar with configurable min/max/warning/critical zones |
| FR-DASH-03 | **Counter widget** — displays an integer tag value with optional label, units, and reset button (if configured as unauthenticated-allowed or with appropriate role) |
| FR-DASH-04 | **Text value widget** — displays a tag's current value as formatted text (string, numeric with units, or enum name) |
| FR-DASH-05 | **Alarm summary widget** — shows active alarm count with severity badges (critical/warning/info); tappable to navigate to the alarm page |
| FR-DASH-06 | **OEE widget** — computes and displays OEE (availability × performance × quality) from configured source tags; supports dial, bar, or numeric display modes |
| FR-DASH-07 | **Multi-value group widget** — displays a configurable set of tag values in a compact table or card layout (e.g., a group of temperatures or pressures) |
| FR-DASH-08 | All widgets auto-refresh via WebSocket push (see NFR-01 for latency target) |

### 3.2 Control Widgets

Control widgets allow operators to write values to PLC tags. Like visualization widgets, these are placed on screens via the screen designer and are not tied to a fixed layout. The simulation ships with an example control panel demonstrating these widgets.

| ID | Requirement |
|----|-------------|
| FR-CTRL-01 | **Command button widget** — writes a predefined value to a specified tag on press (e.g., "Start" writes 1 to `MachineCmd`). Label, tag, value, and appearance are configurable per instance. |
| FR-CTRL-02 | **Parameter input widget** — numeric entry field or slider that writes to a tag, with optional min/max/step constraints and engineering units display |
| FR-CTRL-03 | Allow buttons and parameter inputs to be grouped into named control panels on screen |
| FR-CTRL-04 | Optionally require confirmation dialogs on specific buttons (configurable per button) |
| FR-CTRL-05 | Control actions require authenticated Operator role or above by default. Individual buttons/inputs can be configured to allow unauthenticated access (e.g., fault reset, resettable operator counter). |
| FR-CTRL-06 | Log all control actions (button presses and parameter writes) to the audit trail with user (or "unauthenticated" if no login), timestamp, tag, and value |
| FR-CTRL-07 | **Toggle button widget** — reflects the current tag value visually (e.g., ON/OFF with color state) and writes the opposite value on press |
| FR-CTRL-08 | **Dropdown select widget** — presents a list of named options that each map to a tag value (e.g., "Auto" → 1, "Manual" → 2, "Service" → 3). Writes the mapped value to the bound tag on selection. The current tag value highlights the active option. For enum-typed tags (FR-TAG-17), the option list can be auto-populated from the enum mapping. |

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
| FR-PROTO-02 | **OPC UA driver** — connects via endpoint URL with configurable security policy (None, Basic256Sha256) and authentication (anonymous, username/password, certificate). Supports browsing the server address space. Reads and decodes complex data types including structures (ExtensionObjects), arrays, and enumerations using the server's type dictionary or DataType definitions. |
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
| **Data type** | Tag data type. **Scalar types**: Bool, Int16, Int32, UInt16, UInt32, Float32, Float64, String. **Complex types** (OPC UA only): Struct, Array, Enum. For Modbus, the scalar data type also determines how many registers to read. See FR-TAG-14 through FR-TAG-18 for complex type handling. |
| **Group** | Logical category for organizing tags (e.g., "Temperatures", "Counters", "Film Station") |
| **Options** | Per-tag configuration (see FR-TAG-04 below) |

| ID | Requirement |
|----|-------------|
| FR-TAG-01 | Configure PLC connections: protocol type, endpoint/IP address, and protocol-specific settings (see FR-PROTO-02 through FR-PROTO-04) |
| FR-TAG-02 | Import tags from external sources. Supported import sources: **(a)** browse a live OPC UA server address space and select nodes, **(b)** browse an EtherNet/IP controller's tag list, **(c)** import a CODESYS symbol configuration XML file (see FR-TAG-24), **(d)** import an RSLogix 500 CSV export file (see FR-TAG-25). In all cases, the PLC address is auto-populated from the source. For Modbus (no browsing), tags are added manually or via CSV/JSON import. |
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
| FR-TAG-14 | **Structured types (Structs)**: When importing struct-typed variables — from an OPC UA server (ExtensionObject nodes) or a CODESYS XML file (FR-TAG-24) — the engineer can choose to **(a)** auto-flatten the struct into individual scalar tags, one tag per field, with short names derived from the struct path (e.g., `Motor1.Speed`, `Motor1.Current`, `Motor1.FaultCode`), or **(b)** import the struct as a single compound tag. Flattened tags behave identically to manually created scalar tags. |
| FR-TAG-15 | **Compound tag display**: A compound (non-flattened struct) tag stores the full struct value. Widgets that bind to a compound tag can reference individual fields using dot notation (e.g., binding to `Motor1Status.Speed` accesses the Speed field of the `Motor1Status` struct). The tag editor shows the struct's field list with data types. |
| FR-TAG-16 | **OPC UA arrays**: Array-typed OPC UA nodes can be imported as **(a)** individual tags per element (e.g., `ZoneTemps[0]` through `ZoneTemps[9]`), or **(b)** a single array tag. Widgets binding to an array tag reference elements by index using bracket notation (e.g., `ZoneTemps[3]`). |
| FR-TAG-17 | **Enumerations**: Enumeration-typed tags are imported with their value-to-name mapping (e.g., 0 = "Stopped", 1 = "Running", 2 = "Faulted"). Enum mappings are populated from the source — OPC UA enum data types, CODESYS XML type definitions (FR-TAG-24), or manually defined. The mapping is stored as part of the tag configuration. Widgets display the enumeration name by default with the option to show the numeric value. Enum mappings can be edited locally if the PLC's definitions are unclear or need operator-friendly labels. |
| FR-TAG-18 | **Complex type discovery**: During OPC UA server browse (FR-TAG-02a), the import dialog indicates each node's type category (scalar, struct, array, enum) with an icon or badge. Struct and array nodes show an expand/collapse control to preview their fields or element count before import. The engineer selects the import mode (flatten vs. compound/array) per node or applies a default for all. |
| FR-TAG-19 | **Tag templates**: Engineers can define a tag template (virtual struct) consisting of a set of named fields, each with a data type, engineering unit, display format, and optional alarm/trend configuration. Templates are protocol-agnostic and do not encode PLC addresses or offsets. |
| FR-TAG-20 | **Tag template instances**: Engineers can create an instance of a tag template by providing a short-name prefix (e.g., `motor1`) and independently mapping each field to any PLC address on any connection. For example, a `Motor` template with fields `speedCommand`, `speedFeedback`, `current`, `faultCode` could produce instance `motor1` with mappings `speedCommand` → `N7:0`, `speedFeedback` → `N7:1`, `current` → `F8:0`, `faultCode` → `B3:0/0` — each field's address, data type, and connection are independent. |
| FR-TAG-21 | **Template instance tag generation**: When a template instance is saved, the system generates individual tags in the tag database using the pattern `{prefix}.{fieldName}` (e.g., `motor1.speedCommand`, `motor1.current`). Generated tags are fully functional scalar tags — they can be bound to widgets, trended, and alarmed identically to manually created tags. |
| FR-TAG-22 | **Template instance management**: Editing a template (adding/removing/renaming fields) presents a diff view (similar to FR-TAG-10) showing the impact on all existing instances. Adding a field prompts the engineer to map addresses for each instance. Removing a field warns if the generated tags are referenced by widgets, alarms, or trends. Renaming a field updates all generated tag short names and widget bindings automatically. |
| FR-TAG-23 | **Template-aware tag editor**: The tag editor displays template instances as collapsible groups. The instance header shows the template name and prefix; expanding reveals the individual field tags with their mapped addresses. Engineers can also view and edit template instances in a dedicated "Templates" section of the tag editor. |
| FR-TAG-24 | **CODESYS type schema import**: The CODESYS symbol configuration XML export includes type definitions — enumerations (with value-to-name mappings), structs (with field names and data types), and custom types (aliases, subranges). When importing a CODESYS XML file, the system parses these type definitions and applies them to the imported tags: **(a)** enum-typed variables receive their value-to-name mappings automatically (populating FR-TAG-17 enum configuration), **(b)** struct-typed variables can be flattened or imported as compound tags with correct field names and data types (consistent with FR-TAG-14), **(c)** array types are handled per FR-TAG-16. Type definitions are stored in the tag database so that tags added manually or via CSV/JSON can also reference CODESYS-defined types. The engineer can import a CODESYS XML file purely for its type definitions (without importing tags) to pre-populate the type library for later use. **Implementation note: require example CODESYS symbol configuration XML files before implementing the parser to ensure all type variants are handled correctly.** |
| FR-TAG-25 | **RSLogix 500 CSV import**: Import tag databases exported from Rockwell RSLogix 500 as CSV files. The parser extracts tag names, addresses (e.g., `N7:0`, `F8:0`, `B3:0/0`, `T4:0`, `C5:0`), data types (integer, float, timer, counter, bit), and descriptions. RSLogix 500 data file types are mapped to HMI tag types: **(a)** integer files (N) → integer tags, **(b)** float files (F) → float tags, **(c)** bit files (B) → boolean tags, **(d)** timer (T) and counter (C) files → struct tags with standard sub-elements (e.g., `T4:0.ACC`, `T4:0.PRE`, `T4:0.DN`), **(e)** string files (ST) → string tags. Imported tags use the RSLogix symbol/description as the short name where available, falling back to the raw address. The diff view (FR-TAG-10) applies to RSLogix imports identically to other sources. **Implementation note: require example RSLogix 500 CSV export files before implementing the parser to ensure all data file types and address formats are handled correctly.** |

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
| FR-SCRN-04 | Each widget exposes a property panel for configuration: tag binding, label, units, colors, thresholds, size, and position. Tag binding uses a **dropdown selector** populated from the tag database, with **autocomplete** filtering as the engineer types (matching against short name, group, and template). The dropdown displays tags organized by group and template instance, and indicates each tag's data type. The engineer can also filter by data-type compatibility (e.g., a numeric input widget only shows numeric tags). |
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
| NFR-07 | **Deployment**: Platform-native service management — systemd on Linux/Raspberry Pi, Windows Service (or NSSM wrapper) on Windows. Auto-starts on boot with watchdog restart on crash. No Docker required. |
| NFR-08 | **Kiosk mode**: Browser launches fullscreen on boot with no browser chrome; on-screen keyboard available for text input. Kiosk configuration is platform-specific (e.g., Chromium autostart on Linux/Raspberry Pi, Chrome in kiosk mode on Windows). |
| NFR-09 | **Offline**: Fully self-contained — no CDN, external fonts, or internet-dependent resources. All assets bundled locally. |
| NFR-10 | **Configuration**: Server endpoint, database, and basic settings via environment variables or config file |
| NFR-11 | **Logging**: Structured application logging (JSON) with configurable log levels |
| NFR-12 | **Testability**: Backend API unit tests, protocol driver integration tests using the tag simulation layer, and frontend component tests |
| NFR-13 | **Data retention**: Configurable retention policy for trend data and audit logs with automatic purge to prevent disk filling (default: trends 90 days, audit 1 year) |
| NFR-14 | **Database**: SQLite in WAL mode for concurrent read performance; periodic backup to configurable location (USB, network share) |
| NFR-15 | **Multi-platform**: Runs on Windows (10/11, x86_64), Linux (x86_64), and ARM (armv7l / aarch64, including Raspberry Pi 3/4/5). All Python dependencies must have pure-Python fallbacks or provide pre-built wheels for all target platforms. Frontend assets are platform-independent. |
| NFR-16 | **Packaging**: Provide a single-command install method per platform — e.g., a pip-installable package, a self-contained archive, or platform-specific installers. Avoid requiring users to compile native extensions. |

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
6. Browses the OPC UA address space tree and selects the nodes to import; struct nodes show an expand control revealing their fields, array nodes show element count, and enum nodes show their value mappings
7. For a `MotorStatus` struct node, engineer chooses "Flatten" — system will create individual tags (`Motor1.Speed`, `Motor1.Current`, `Motor1.FaultCode`, `Motor1.Running`). For a `MachineState` enum node, the value-to-name mapping (0=Stopped, 1=Running, etc.) is auto-populated.
8. System presents a diff view: "51 new tags, 0 changed, 0 removed" (first import, so all are new)
9. Engineer reviews the list, deselects a few diagnostic nodes not needed, and taps "Apply"
10. Tags are created in the database with OPC UA node IDs auto-populated; engineer assigns short names, engineering units, display format, and min/max ranges
11. Groups tags into categories (e.g., "Sealing Station", "Film Feed", "Counters")
12. Marks selected tags for trending at 1-second intervals; configures alarm thresholds on temperature tags and boolean alarm sources on fault flags
13. Saves — widgets can now bind to tags by short name; dashboard begins showing live data

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

### UC-06b-alt: Engineer Imports Tags Offline from RSLogix 500 CSV Export

**Actor**: Engineer
**Precondition**: Logged in with Engineer role; MicroLogix 1400 connection already configured (UC-06b); PLC is not currently accessible on the network (e.g., commissioning preparation at the office)
**Flow**:
1. Engineer navigates to the Tag Editor and taps "Import from → RSLogix 500 CSV"
2. Uploads the CSV file exported from RSLogix 500 (containing data file symbols, addresses, and descriptions)
3. System parses the CSV and maps data file types: integer files → INT tags, float files → FLOAT tags, timer/counter files → struct tags with sub-elements (ACC, PRE, DN, etc.)
4. Diff view shows: "48 new tags, 0 changed, 0 removed"
5. Engineer reviews the imported tags — RSLogix descriptions are used as short names where available (e.g., `MACHINE_SPEED` for `N7:5`)
6. Engineer edits short names for clarity (e.g., `MACHINE_SPEED` → `MachineSpeed`), assigns engineering units and display formats
7. Taps "Apply" — 48 tags imported and associated with the MicroLogix connection
8. When the PLC is later connected on-site, tags are already configured and ready for live data

---

### UC-06b2: Engineer Creates Tag Templates for Identical Motors on a Legacy PLC

**Actor**: Engineer
**Precondition**: Logged in with Engineer role; MicroLogix 1400 connection configured (UC-06b); plant has 4 identical motors with tags spread across multiple data files
**Flow**:
1. Engineer navigates to Tag Editor → Templates and taps "New Template"
2. Names the template `Motor` and defines fields: `speedCommand` (INT), `speedFeedback` (INT), `current` (FLOAT, units: Amps), `faultCode` (INT), `running` (BOOL)
3. Configures template-level defaults: alarm on `current` > 15A, trend `speedFeedback` at 1s interval
4. Taps "Create Instance", enters prefix `motor1`
5. Maps each field to a PLC address independently:
   - `speedCommand` → `N7:0`
   - `speedFeedback` → `N7:1`
   - `current` → `F8:0`
   - `faultCode` → `N7:2`
   - `running` → `B3:0/0`
6. Repeats for `motor2` (addresses `N7:10`, `N7:11`, `F8:1`, `N7:12`, `B3:0/1`), `motor3`, `motor4`
7. Saves — system generates 20 tags (5 fields × 4 instances): `motor1.speedCommand`, `motor1.speedFeedback`, `motor1.current`, etc.
8. All generated tags appear in the tag editor grouped under their template instance and are immediately available for widget binding
9. Later, engineer adds a `vibration` field (FLOAT, units: mm/s) to the `Motor` template; system prompts for the PLC address mapping on each of the 4 instances; new tags (`motor1.vibration`, `motor2.vibration`, etc.) are generated upon save

---

### UC-06c: Engineer Re-imports Tags After PLC Program Change

**Actor**: Engineer
**Precondition**: Logged in with Engineer role; tags were previously imported; PLC program has been updated with new and renamed variables
**Flow**:
1. Engineer navigates to the Tag Editor and taps "Import from → CODESYS Symbol XML"
2. Uploads the updated symbol configuration XML exported from the CODESYS IDE
3. System parses the XML — including type definitions (enums, structs) — and compares against the existing tag database
4. Diff view shows: "5 new, 2 changed, 1 removed, 1 type updated" — each category is expandable. The type update shows that enum `MachineState` gained a new value (3 = "Maintenance"); the diff shows old vs. new enum mappings
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

## 6. Tag Database Simulation Layer

The system includes a **protocol-agnostic tag simulation layer** that operates at the tag database level rather than emulating a specific PLC or protocol. This means simulation works identically regardless of whether tags were imported from OPC UA, RSLogix 500 CSV, CODESYS XML, EtherNet/IP, Modbus, or created manually. Engineers can design, test, and demo screens without a live PLC connection.

### Simulation Modes

| Mode | Description |
|------|-------------|
| **Per-tag simulation** | Any individual tag can be placed into simulation mode independently. The tag's value is driven by a configurable simulation behavior (see below) instead of the PLC connection. Other tags on the same connection continue to read/write live. |
| **Per-connection simulation** | All tags on a given PLC connection are simulated. Useful when the PLC is offline or not yet commissioned. |
| **Global simulation** | All tags across all connections are simulated. Used for full offline screen design and demo. |

### Simulation Behaviors (per tag)

Each simulated tag has a configurable behavior that determines how its value changes over time:

| Behavior | Applies to | Description |
|----------|-----------|-------------|
| **Static** | All types | Holds a fixed value (default: 0 / false / empty). Engineer sets the value manually via the tag editor or a control widget. |
| **Ramp** | Numeric | Ramps linearly between min and max, then resets or reverses. Configurable period and direction. |
| **Sine wave** | Numeric | Oscillates sinusoidally between min and max. Configurable period, offset, and phase. |
| **Random / noise** | Numeric | Random value within min/max range, or Gaussian noise around a center value. Configurable update rate. |
| **Toggle** | Bool | Alternates true/false at a configurable interval. |
| **Enum cycle** | Enum | Cycles through all defined enum values sequentially at a configurable interval. |
| **Script** | All types | A simple expression or state machine (e.g., "if `Command` == 1 then set `MachineRunning` = true"). Allows tags to react to writes on other simulated tags. |

### Writes in Simulation Mode

When an operator or engineer writes to a simulated tag (e.g., pressing a Start button), the written value is applied to the tag database immediately. This allows control widgets, confirmation dialogs, and write-back logic to be tested without a PLC. Script-behavior tags can react to these writes to create realistic cause-and-effect chains (e.g., writing Command=1 causes MachineRunning to become true and counters to start incrementing).

### Example Screens (Simulation Only)

The system ships with pre-built example screens that demonstrate the widget capabilities. These screens are **not** intended as a production layout — they serve as a starting point and reference for designers building machine-specific screens. Production deployments will have custom screens created via the screen designer (§3.11) tailored to the specific machine and customer requirements.

| Screen | Contents | Demonstrates |
|--------|----------|-------------|
| **Dashboard** | Status indicator, speed gauge, counter widgets, OEE display, alarm summary, process value group (temperatures, pressures) | §3.1 visualization widgets with live simulation data |
| **Control Panel** | Start/Stop/Reset command buttons, speed setpoint slider, fault reset (unauthenticated-allowed) | §3.2 control widgets, confirmation dialogs, auth levels |

### Example Simulated Tags

The example screens are backed by a pre-configured tag set with simulation behaviors already assigned. These tags are not tied to any protocol — they exist only in the tag database with simulation enabled.

| Category | Tags | Simulation Behavior |
|----------|------|-------------|
| **Machine Status** | MachineRunning (Bool), FaultActive (Bool), Command (Int) | Script: Command writes drive MachineRunning and FaultActive state |
| **Counters** | GoodCount, RejectCount, TotalCount | Script: increment while MachineRunning=true, rate based on CurrentSpeed |
| **Speed** | CurrentSpeed, SpeedSetpoint, MaxSpeed | Script: CurrentSpeed ramps toward SpeedSetpoint; MaxSpeed is static |
| **Temperatures** | SealTemp1, SealTemp2, TunnelTemp | Sine wave + noise (PID-like behavior) |
| **Film Station** | FilmTension, FilmLength, SpliceDetect | Random/noise for analogs, toggle for SpliceDetect |
| **Pressures** | VacuumPressure, AirPressure | Sine wave + noise |
| **Digital I/O** | DoorClosed, EStopActive, FilmBreak, ProductDetect | Static (manually togglable) with periodic random fault injection |
| **Production** | BatchID, RecipeName, ShiftNumber | Static (set via recipe writes) |
| **Structured Types** | MotorStatus (Struct: Speed Float32, Current Float32, FaultCode UInt16, Running Bool), ZoneTemps (Array[6] of Float32), MachineState (Enum: 0=Stopped, 1=Running, 2=Faulted, 3=Maintenance) | Struct fields use individual behaviors; enum cycles through values |

### Simulation Indicator

When any tag is in simulation mode, the HMI displays a clear visual indicator (e.g., a persistent banner or badge) so that operators and engineers are always aware that displayed values are not live PLC data. Individual widgets bound to simulated tags show a subtle "SIM" badge. The indicator cannot be suppressed in production mode — only disabling simulation removes it.

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
| 7 | **Complex data types** | OPC UA structs, arrays, and enumerations are supported via flatten-on-import (recommended) or compound tags. Flatten is the default as it keeps the widget binding model simple and consistent across all protocols. Compound tags are available for engineers who prefer to preserve the PLC's type structure. EtherNet/IP UDTs and Modbus do not support complex types — those protocols continue to use scalar tags only. For protocols without native struct support, **tag templates** provide a virtual struct mechanism: engineers define a template with named fields, then create instances where each field is independently mapped to any PLC address. This gives legacy PLCs the same logical grouping benefits as OPC UA structs without requiring PLC-side support. |
| 8 | **Multi-platform** | The chosen technology stack (Python + SQLite backend, React frontend served as static assets) is inherently cross-platform. Python and all key dependencies (asyncua, pycomm3, pymodbus, SQLAlchemy) run on Windows, Linux x86_64, and ARM without platform-specific code. SQLite is embedded and works everywhere. The frontend is browser-based and platform-independent. Platform-specific concerns are limited to service management (systemd vs. Windows Service) and optional kiosk-mode configuration. |
