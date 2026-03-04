# Industrial HMI — Requirements & Use Cases

## 1. Project Overview

A general-purpose, web-based Human-Machine Interface (HMI) for monitoring and controlling industrial machines and processes. While the examples and simulation in this document use a packaging machine scenario, the system is **application-agnostic** — it can be deployed for any industrial control context including packaging, food & beverage, material handling, water/wastewater, HVAC, building automation, discrete manufacturing, and process control.

The HMI communicates with data sources via a **pluggable protocol driver** architecture supporting OPC UA, EtherNet/IP (CIP), Modbus TCP, and MQTT — allowing connection to a wide range of industrial controllers from CODESYS-based PLCs to Allen-Bradley MicroLogix/CompactLogix, as well as MQTT brokers for IIoT sensors, edge gateways, and other publish/subscribe data sources. The HMI is **state-model agnostic** — it does not impose PackML or any other state machine. Instead, it reads and displays whatever tags the data sources expose and lets operators interact through configurable command buttons and parameter inputs. It provides real-time visualization, alarm management, historical trending, job management, and production reporting.

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
| MQTT Driver | aiomqtt (paho-mqtt) | Async Python MQTT 3.1.1/5.0 client for subscribing to and publishing tag values via an MQTT broker |
| Database | SQLite | Embedded, zero-config, portable — ideal for a dedicated panel PC deployment |
| ORM | SQLAlchemy + Alembic | Database access and migrations |
| Auth | JWT tokens + bcrypt | Stateless auth with role-based access control |
| Simulation | Tag database simulation layer | Protocol-agnostic tag value simulation for development, demo, and screen design without a live PLC |

---

## 2. User Roles

| Role | Description |
|------|-------------|
| **Unauthenticated** | Default state — can view dashboards, trends, and alarms. No login required. Can use specific controls explicitly configured for unauthenticated access (e.g., fault reset, resettable counters). |
| **Operator** | Can start/stop/reset machine, acknowledge alarms, select jobs. Logs in via numeric PIN. |
| **Supervisor** | Operator permissions + job editing, production reports, user management (can manage Operator accounts only). Logs in via numeric PIN. |
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
| FR-CTRL-02 | **Parameter input widget** — numeric entry field or slider that writes to a tag. Supports configurable **input limits**: **(a)** min and max values — the widget rejects any entered value outside this range; **(b)** step size — constrains the value to increments (e.g., step 0.5 allows 10.0, 10.5, 11.0); **(c)** decimal places — limits input precision. When a tag has a range configured (FR-TAG-04), the parameter input widget **inherits the tag's min/max as default limits** — the designer can override with tighter (but not wider) limits per widget instance. **Enforcement behavior**: if the operator types a value outside the limits, the input field displays a validation error inline (e.g., "Must be between 0 and 100") and the write is blocked until a valid value is entered. Slider mode visually constrains the handle to the min/max range. The widget displays engineering units from the bound tag beside the input field. |
| FR-CTRL-03 | Allow buttons and parameter inputs to be grouped into named control panels on screen |
| FR-CTRL-04 | Optionally require confirmation dialogs on specific buttons (configurable per button) |
| FR-CTRL-05 | Control actions require authenticated Operator role or above by default. Individual buttons/inputs can be configured to allow unauthenticated access (e.g., fault reset, resettable operator counter). |
| FR-CTRL-06 | Log all control actions (button presses and parameter writes) to the audit trail with user (or "unauthenticated" if no login), timestamp, tag, and value |
| FR-CTRL-07 | **Toggle button widget** — reflects the current tag value visually (e.g., ON/OFF with color state) and writes the opposite value on press |
| FR-CTRL-08 | **Dropdown select widget** — presents a list of named options that each map to a tag value (e.g., "Auto" → 1, "Manual" → 2, "Service" → 3). Writes the mapped value to the bound tag on selection. The current tag value highlights the active option. For enum-typed tags (FR-TAG-17), the option list can be auto-populated from the enum mapping. |
| FR-CTRL-09 | **Visibility property** — every control widget has a `visible` property that determines whether the widget is rendered. Can be set to: **(a)** always visible (default), **(b)** bound to a boolean tag (widget visible when tag is true, hidden when false), or **(c)** restricted to one or more security roles (widget visible only when the current user has a matching role; hidden for others). When hidden, the widget is removed from the layout — it does not occupy space. |
| FR-CTRL-10 | **Enabled property** — every control widget has an `enabled` property that determines whether the widget accepts user interaction. Can be set to: **(a)** always enabled (default), **(b)** bound to a boolean tag (widget enabled when tag is true, disabled when false), or **(c)** restricted to one or more security roles (widget enabled only when the current user has a matching role; disabled for others). When disabled, the widget is visually grayed out and ignores touch/click input, but remains visible. |
| FR-CTRL-11 | Visibility and enabled properties can be combined — e.g., a button visible to Operators and above but enabled only when a boolean `ReadyToRun` tag is true. Tag-based and role-based conditions on the same property are AND-ed (all conditions must be met). |
| FR-CTRL-12 | **Script action** — any button widget (command button, toggle button) can be configured to execute a Python script on press, either instead of or in addition to writing a tag value. The script is a short Python function stored in the database as part of the button's configuration. Scripts execute on the backend in a **sandboxed environment** (see FR-SCRIPT-01 through FR-SCRIPT-08). |
| FR-CTRL-13 | **Script editor** — the button property panel includes an inline script editor with syntax highlighting and basic autocompletion for the scripting API (tag read/write, system tags, logging). The editor shows validation errors before saving (syntax check, prohibited import check). |
| FR-CTRL-14 | **Script trigger modes** — a button's script can be configured to run: **(a)** on press (default), **(b)** on release, **(c)** on press with a confirmation dialog (combines with FR-CTRL-04), or **(d)** periodically while held (configurable interval, minimum 100ms). |

### 3.2.1 Scripting Engine

The system provides a lightweight Python scripting engine that allows engineers to attach short scripts to button actions. Scripts run on the backend and interact with the tag database via a controlled API. Scripts are intended for simple automation logic (value transformations, multi-tag writes, conditional actions) — not as a replacement for PLC programs.

| ID | Requirement |
|----|-------------|
| FR-SCRIPT-01 | Scripts execute in a **restricted Python sandbox** on the backend. The sandbox provides: **(a)** the `tags` API for reading and writing tag values, **(b)** the `system` API for reading system tags (FR-TAG-26), **(c)** the `log` API for writing to the audit trail, **(d)** standard Python builtins (math, string operations, conditionals, loops), and **(e)** the `time` module (for `time.time()`, `time.sleep()` with a maximum of 2 seconds). No file system access, no network access, no `import` of arbitrary modules, no `exec`/`eval`, no subprocess spawning. |
| FR-SCRIPT-02 | **Tag API**: `tags.read("TagName")` returns the current value; `tags.write("TagName", value)` writes a value (respects the tag's read/write mode and the user's role permissions). `tags.read_multiple(["Tag1", "Tag2"])` returns a dict. `tags.write_multiple({"Tag1": val1, "Tag2": val2})` writes atomically. |
| FR-SCRIPT-03 | **Execution timeout**: Scripts are terminated if they exceed a configurable maximum execution time (default: 5 seconds). A timed-out script logs a warning to the audit trail and does not apply any partial tag writes (writes are committed only on successful completion). |
| FR-SCRIPT-04 | **Error handling**: If a script raises an exception, the error is logged to the audit trail (with script name, button, user, and traceback) and an error toast is shown to the operator. No partial tag writes are applied. |
| FR-SCRIPT-05 | **Audit logging**: All script executions are logged to the audit trail: user, button, script name, success/failure, execution time, and any tags written. The `log.info("message")` / `log.warn("message")` API allows scripts to write custom entries to the audit trail. |
| FR-SCRIPT-06 | **Script management**: Scripts are stored in the database as part of the button widget configuration. The tag editor's export/import (FR-TAG-09) and screen export/import (FR-SCRN-18) include associated scripts. Engineers can also manage a **script library** — named, reusable scripts that can be attached to multiple buttons. Changes to a library script propagate to all buttons using it. |
| FR-SCRIPT-07 | **Context variables**: When a script executes, it receives a `context` object containing: `context.user` (logged-in username), `context.role` (user's role), `context.button` (button short name), `context.screen` (current screen name), and `context.timestamp` (execution time as ISO 8601). |
| FR-SCRIPT-08 | **Permitted modules**: In addition to builtins, scripts may use: `math`, `datetime`, `json`, `re`, and `collections`. No other imports are allowed. The allowed module list is fixed and not user-configurable. |

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

### 3.5 Job Management

Jobs (sometimes called "recipes" in other HMI systems) are named collections of tag setpoints that define how a machine should be configured for a particular product, process, or production run. A job captures all the parameters needed to set up or change over a machine — speeds, temperatures, positions, timers, and any other writable tag values.

**Job interface overview:**

The Job page has two sub-pages accessible via tabs: **Job List** and **Job Editor**.

**Job List** displays all saved jobs in a searchable, sortable table showing: job name, description, version number, last-modified date, last-modified-by user, and status (active/inactive). The currently loaded job (if any) is highlighted. Operators can select a job and download it; Supervisors and above can create, edit, clone, and delete jobs.

**Job Editor** provides a form-based interface for defining a job's parameters. Each parameter row shows: the bound tag's short name, description, the setpoint value, the tag's engineering units, and the tag's configured min/max range. Parameters that fall outside the tag's range are flagged with a validation warning. The editor supports grouping parameters by tag group for readability.

| ID | Requirement |
|----|-------------|
| FR-JOB-01 | **Job definition** — a job is a named, versioned collection of tag-value pairs (setpoints). Each job contains: a unique name, an optional description, and a list of parameters where each parameter maps a tag (by short name) to a target value. Jobs are stored in the SQLite database. |
| FR-JOB-02 | **CRUD operations** — create, read, update, and delete jobs. Creating a job can start from scratch (empty parameter list), by cloning an existing job, or by uploading current machine values (FR-JOB-04). |
| FR-JOB-03 | **Download job to machine** — write all of a job's parameter values to the corresponding PLC tags in a single batch operation. The download shows a confirmation dialog listing every parameter and its target value. If any tag write fails, the system reports which parameters succeeded and which failed. The download is logged to the audit trail as a single event with the job name and all parameter values. |
| FR-JOB-04 | **Upload from machine** — read the current values of a defined set of tags from the PLC and save them as a new job (or a new version of an existing job). The engineer configures which tags are included in the "upload set" — this is defined once and reused across all jobs. |
| FR-JOB-05 | **Compare jobs** — select two jobs and display them side-by-side with differences highlighted (changed values in amber, parameters present in one but not the other in red/green). The comparison view also shows the engineering units and valid range for each parameter. |
| FR-JOB-06 | **Job versioning** — every save creates a new version. The version history shows: version number, timestamp, user who made the change, and a diff against the previous version. Previous versions can be viewed and restored. |
| FR-JOB-07 | **Role-based access** — Operators can view the job list and download (apply) a job to the machine. Supervisors and above can create, edit, clone, delete, and manage job versions. Individual jobs can optionally be locked by a Supervisor to prevent further edits. |
| FR-JOB-08 | **Conditional download** — job download can be restricted based on a configurable tag condition (e.g., only when a `ReadyForJob` tag is true, or when `MachineRunning` is false). When the condition is not met, the "Download" button is disabled with a tooltip explaining why (e.g., "Machine must be stopped before loading a job"). |
| FR-JOB-09 | **Job import/export** — jobs can be exported as JSON files and imported on another system. Import uses the same diff view as tag import (FR-TAG-10) to show new, changed, and deleted jobs. |
| FR-JOB-10 | **Parameter validation** — when editing a job, each parameter value is validated against the bound tag's configured range (FR-TAG-04). Out-of-range values show a warning but can be saved (soft validation). On download, out-of-range values require explicit confirmation. |
| FR-JOB-11 | **Active job tracking** — the system tracks which job was last downloaded to the machine. The active job name is available as a system-like tag (`$ACTIVE_JOB`) and can be displayed on dashboard screens. If an operator manually changes a parameter that differs from the active job, the system flags the job as "modified" (visual indicator on the dashboard). |

### 3.6 Production Reporting

| ID | Requirement |
|----|-------------|
| FR-RPT-01 | Track production runs (start time, end time, job, counts, downtime) |
| FR-RPT-02 | Calculate and display OEE (Availability x Performance x Quality) per run and per shift |
| FR-RPT-03 | Downtime tracking with reason codes (operator-entered or auto-detected from alarms) |
| FR-RPT-04 | Shift-based reporting (configurable shift schedules) |
| FR-RPT-05 | Summary tables and charts for production over time |
| FR-RPT-06 | Export reports to CSV or PDF |

### 3.7 Data Source Connections & Protocol Drivers

The backend uses a **pluggable protocol driver** architecture. Each data source connection specifies a protocol, and the corresponding driver handles communication. Data sources include PLCs (via OPC UA, EtherNet/IP, Modbus) and MQTT brokers (for IIoT sensors, edge gateways, and other pub/sub sources). The HMI application code (widgets, jobs, alarms, trends) interacts only with the tag database by short name — it is completely protocol-agnostic.

| ID | Requirement |
|----|-------------|
| FR-PROTO-01 | Support multiple concurrent data source connections, each using its own protocol driver |
| FR-PROTO-02 | **OPC UA driver** — connects via endpoint URL with configurable security policy (None, Basic256Sha256) and authentication (anonymous, username/password, certificate). Supports browsing the server address space. Reads and decodes complex data types including structures (ExtensionObjects), arrays, and enumerations using the server's type dictionary or DataType definitions. |
| FR-PROTO-03 | **EtherNet/IP (CIP) driver** — connects to Allen-Bradley PLCs (MicroLogix, CompactLogix, ControlLogix) via IP address and slot number. Tags addressed by CIP tag path (e.g., `N7:0`, `F8:0`, `T4:0.ACC`) or symbolic name (e.g., `Program:MainProgram.Speed`). |
| FR-PROTO-04 | **Modbus TCP driver** — connects via IP address and port (default 502) with configurable unit ID. Tags addressed by register type and address (e.g., Holding Register 40001, Input Register 30001, Coil 00001, Discrete Input 10001). Supports configurable data types (INT16, UINT16, INT32, FLOAT32, BOOL) and byte order (big/little endian, word swap). |
| FR-PROTO-05 | Each driver provides a common interface: read tag, write tag, subscribe to value changes, test connection, and (where supported) browse available tags. For pub/sub protocols like MQTT, "read" means the last received value and "subscribe" is the native delivery model. |
| FR-PROTO-08 | **MQTT driver** — connects to an MQTT broker via hostname/IP, port (default 1883), and optional TLS (port 8883). Authentication via anonymous, username/password, or client certificate. Supports MQTT 3.1.1 and 5.0. Each tag maps to a topic and an optional JSON path for extracting a value from a JSON payload (e.g., topic `machine/temps`, JSON path `$.sealTemp1`). Supports subscribing (read) and publishing (write). Configurable QoS level (0, 1, 2) per tag. Raw payload parsing supports JSON (default), plain-text numeric, and binary (with configurable byte offset/type, similar to Modbus). |
| FR-PROTO-06 | Auto-reconnect on connection loss with exponential backoff (1s, 2s, 4s, 8s, max 30s), per data source |
| FR-PROTO-07 | Connection status (connected, disconnected, error) displayed per data source in the UI; "Connection Lost" banner shows which data source(s) are affected |

### 3.8 Tag Configuration

The system maintains a **tag database** stored in SQLite. Each tag record contains:

| Field | Description |
|-------|-------------|
| **Short name** | Unique, friendly identifier used throughout the UI (e.g., `FilmTemp`, `MachineSpeed`, `GoodCount`) |
| **Description** | Optional free-text description of the tag's purpose (e.g., "Film seal heater temperature", "Main conveyor motor current"). Displayed as a tooltip in the tag editor and widget tag-binding selector. Imported automatically from source where available (e.g., OPC UA DisplayName/Description, RSLogix 500 symbol description, CODESYS XML comments). |
| **Data source** | The data source this tag belongs to (see FR-TAG-01). Every tag is associated with exactly one data source. The data source determines the communication protocol, which in turn controls the source address format, available data types, and import capabilities. Tags cannot exist without a data source assignment. In the tag editor, the data source is selected first; subsequent fields (source address, data type) adapt to the data source's protocol. |
| **Source address** | Protocol-specific address, validated and formatted according to the tag's data source protocol — OPC UA: node ID (e.g., `ns=2;s=Machine.Temperatures.FilmSeal`); EtherNet/IP (CIP): tag path (e.g., `N7:0`); Modbus TCP: register specification (e.g., `HR:40001:FLOAT32`); MQTT: topic + optional JSON path (e.g., `machine/temps → $.sealTemp1`). The tag editor enforces the correct format for the selected data source and rejects invalid addresses. |
| **Data type** | Tag data type. **Scalar types**: Bool, Int16, Int32, UInt16, UInt32, Float32, Float64, String. **Complex types** (OPC UA only): Struct, Array, Enum. For Modbus, the scalar data type also determines how many registers to read. For MQTT, the data type determines how the extracted value (from JSON path or raw payload) is parsed and stored. The available data types are filtered based on the data source's protocol (e.g., Struct/Array/Enum only shown for OPC UA data sources). See FR-TAG-14 through FR-TAG-18 for complex type handling. |
| **Group** | Logical category for organizing tags (e.g., "Temperatures", "Counters", "Film Station") |
| **Options** | Per-tag configuration (see FR-TAG-04 below) |

| ID | Requirement |
|----|-------------|
| FR-TAG-01 | **Data source management** — configure named data sources, each with a protocol type, endpoint/IP address (or broker hostname for MQTT), and protocol-specific settings (see FR-PROTO-02 through FR-PROTO-04, FR-PROTO-08). Each data source has a unique name (e.g., "Main PLC", "Packaging Line 2", "Roof Sensor Gateway") and a single protocol. Tags are created under a data source; the data source's protocol governs the tag's address format, available data types, and import methods. |
| FR-TAG-02 | Import tags from external sources. Supported import sources: **(a)** browse a live OPC UA server address space and select nodes, **(b)** browse an EtherNet/IP controller's tag list, **(c)** import a CODESYS symbol configuration XML file (see FR-TAG-24), **(d)** import an RSLogix 500 CSV export file (see FR-TAG-25), **(e)** subscribe to an MQTT broker and discover topics with recent activity (see FR-PROTO-08). In all cases, the source address is auto-populated from the source. For Modbus (no browsing), tags are added manually or via CSV/JSON import. |
| FR-TAG-03 | Each tag must have a unique short name (friendly identifier), a data source assignment, and a source address. Short names are used in widget bindings, jobs, alarms, and audit logs — the raw source address is not exposed to operators. The tag editor enforces the source address format based on the data source's protocol: when adding or editing a tag, the address input field provides protocol-appropriate validation, placeholder text, and format hints (e.g., Modbus shows `HR:40001:FLOAT32` format, OPC UA shows `ns=2;s=...` format). |
| FR-TAG-04 | Each tag has configurable options: engineering units (e.g., "°C", "mm/s"), display format (decimal places, number format), range (min/max for validation and gauge scaling), deadband (minimum change before a value update is pushed), and read/write mode (read-only, read-write, write-only) |
| FR-TAG-05 | Tags can be flagged as trended (logged to history) with a configurable sample rate per tag |
| FR-TAG-06 | Tags can be flagged as alarm sources. Two alarm modes are supported: **threshold** — for analog tags, with high, high-high, low, low-low limits and severity per limit; **boolean** — for discrete tags, where a true value raises an alarm (e.g., `conveyorMotorFault` = true → Critical alarm "Conveyor Motor Fault"). Each alarm source has a configurable severity, message text, and active-on state (true or false, to handle both fault flags and healthy-state flags). |
| FR-TAG-07 | Group tags into logical categories; groups are displayed in the tag editor as a tree or filtered list |
| FR-TAG-08 | Tag editor provides a searchable, sortable table view of all tags with inline editing of short name, group, and options |
| FR-TAG-09 | Tag import/export via JSON or CSV for backup and transfer between systems |
| FR-TAG-10 | When importing from any source (live OPC UA/EtherNet/IP browse, CODESYS XML, JSON, or CSV), the system compares the incoming tags against the existing tag database and presents a **diff view** showing: **(a)** new tags (exist in source but not in database), **(b)** deleted tags (exist in database but not in source), **(c)** changed tags (same short name or source address but different options/address). Each difference is individually selectable — the user can accept or reject each add, delete, and change before committing the import. |
| FR-TAG-11 | The import diff view displays a summary count (e.g., "12 new, 3 changed, 2 removed") and supports select-all/deselect-all per category. Changed tags show a side-by-side comparison of old vs. new values for each modified field. |
| FR-TAG-12 | Deleting a tag (manually or via import) warns if it is referenced by any widget, alarm, job, or trend configuration; optionally cascade-remove or block deletion |
| FR-TAG-13 | All tag database changes are logged to the audit trail, including import operations (source, number of adds/changes/deletes applied) |
| FR-TAG-14 | **Structured types (Structs)**: When importing struct-typed variables — from an OPC UA server (ExtensionObject nodes) or a CODESYS XML file (FR-TAG-24) — the engineer can choose to **(a)** auto-flatten the struct into individual scalar tags, one tag per field, with short names derived from the struct path (e.g., `Motor1.Speed`, `Motor1.Current`, `Motor1.FaultCode`), or **(b)** import the struct as a single compound tag. Flattened tags behave identically to manually created scalar tags. |
| FR-TAG-15 | **Compound tag display**: A compound (non-flattened struct) tag stores the full struct value. Widgets that bind to a compound tag can reference individual fields using dot notation (e.g., binding to `Motor1Status.Speed` accesses the Speed field of the `Motor1Status` struct). The tag editor shows the struct's field list with data types. |
| FR-TAG-16 | **OPC UA arrays**: Array-typed OPC UA nodes can be imported as **(a)** individual tags per element (e.g., `ZoneTemps[0]` through `ZoneTemps[9]`), or **(b)** a single array tag. Widgets binding to an array tag reference elements by index using bracket notation (e.g., `ZoneTemps[3]`). |
| FR-TAG-17 | **Enumerations**: Enumeration-typed tags are imported with their value-to-name mapping (e.g., 0 = "Stopped", 1 = "Running", 2 = "Faulted"). Enum mappings are populated from the source — OPC UA enum data types, CODESYS XML type definitions (FR-TAG-24), or manually defined. The mapping is stored as part of the tag configuration. Widgets display the enumeration name by default with the option to show the numeric value. Enum mappings can be edited locally if the PLC's definitions are unclear or need operator-friendly labels. |
| FR-TAG-18 | **Complex type discovery**: During OPC UA server browse (FR-TAG-02a), the import dialog indicates each node's type category (scalar, struct, array, enum) with an icon or badge. Struct and array nodes show an expand/collapse control to preview their fields or element count before import. The engineer selects the import mode (flatten vs. compound/array) per node or applies a default for all. |
| FR-TAG-19 | **Tag templates**: Engineers can define a tag template (virtual struct) consisting of a set of named fields, each with a data type, engineering unit, display format, and optional alarm/trend configuration. Templates are protocol-agnostic and do not encode source addresses or offsets. |
| FR-TAG-20 | **Tag template instances**: Engineers can create an instance of a tag template by providing a short-name prefix (e.g., `motor1`) and independently mapping each field to any source address on any connection. For example, a `Motor` template with fields `speedCommand`, `speedFeedback`, `current`, `faultCode` could produce instance `motor1` with mappings `speedCommand` → `N7:0`, `speedFeedback` → `N7:1`, `current` → `F8:0`, `faultCode` → `B3:0/0` — each field's address, data type, and data source are independent. Fields can even mix protocols (e.g., speed from a PLC via Modbus, vibration from an MQTT sensor). |
| FR-TAG-21 | **Template instance tag generation**: When a template instance is saved, the system generates individual tags in the tag database using the pattern `{prefix}.{fieldName}` (e.g., `motor1.speedCommand`, `motor1.current`). Generated tags are fully functional scalar tags — they can be bound to widgets, trended, and alarmed identically to manually created tags. |
| FR-TAG-22 | **Template instance management**: Editing a template (adding/removing/renaming fields) presents a diff view (similar to FR-TAG-10) showing the impact on all existing instances. Adding a field prompts the engineer to map addresses for each instance. Removing a field warns if the generated tags are referenced by widgets, alarms, or trends. Renaming a field updates all generated tag short names and widget bindings automatically. |
| FR-TAG-23 | **Template-aware tag editor**: The tag editor displays template instances as collapsible groups. The instance header shows the template name and prefix; expanding reveals the individual field tags with their mapped addresses. Engineers can also view and edit template instances in a dedicated "Templates" section of the tag editor. |
| FR-TAG-24 | **CODESYS type schema import**: The CODESYS symbol configuration XML export includes type definitions — enumerations (with value-to-name mappings), structs (with field names and data types), and custom types (aliases, subranges). When importing a CODESYS XML file, the system parses these type definitions and applies them to the imported tags: **(a)** enum-typed variables receive their value-to-name mappings automatically (populating FR-TAG-17 enum configuration), **(b)** struct-typed variables can be flattened or imported as compound tags with correct field names and data types (consistent with FR-TAG-14), **(c)** array types are handled per FR-TAG-16. Type definitions are stored in the tag database so that tags added manually or via CSV/JSON can also reference CODESYS-defined types. The engineer can import a CODESYS XML file purely for its type definitions (without importing tags) to pre-populate the type library for later use. **Implementation note: require example CODESYS symbol configuration XML files before implementing the parser to ensure all type variants are handled correctly.** |
| FR-TAG-25 | **RSLogix 500 CSV import**: Import tag databases exported from Rockwell RSLogix 500 as CSV files. The parser extracts tag names, addresses (e.g., `N7:0`, `F8:0`, `B3:0/0`, `T4:0`, `C5:0`), data types (integer, float, timer, counter, bit), and descriptions. RSLogix 500 data file types are mapped to HMI tag types: **(a)** integer files (N) → integer tags, **(b)** float files (F) → float tags, **(c)** bit files (B) → boolean tags, **(d)** timer (T) and counter (C) files → struct tags with standard sub-elements (e.g., `T4:0.ACC`, `T4:0.PRE`, `T4:0.DN`), **(e)** string files (ST) → string tags. Imported tags use the RSLogix symbol/description as the short name where available, falling back to the raw address. The diff view (FR-TAG-10) applies to RSLogix imports identically to other sources. **Implementation note: require example RSLogix 500 CSV export files before implementing the parser to ensure all data file types and address formats are handled correctly.** |

### 3.8.1 System Tags

The system provides a set of **built-in system tags** that are always available regardless of data source configuration. System tags use a `$` prefix to distinguish them from user-defined tags. They are read-only, require no data source, and can be bound to widgets, used in scripts (FR-SCRIPT-01), and referenced in visibility/enabled expressions identically to regular tags.

| System Tag | Data Type | Description |
|------------|-----------|-------------|
| `$CURRENT_TIME` | String | Current time in the configured display format (e.g., "14:32:05"), updated every second |
| `$CURRENT_DATE` | String | Current date in the configured display format (e.g., "2025-03-04") |
| `$CURRENT_DATETIME` | String | Combined date and time (e.g., "2025-03-04 14:32:05") |
| `$CURRENT_TIMESTAMP` | Float64 | Current time as Unix epoch seconds (for calculations and scripting) |
| `$LOGGED_IN_USER` | String | Username of the currently logged-in user, or "Unauthenticated" if no user is logged in |
| `$LOGGED_IN_ROLE` | String | Role of the currently logged-in user (e.g., "Operator", "Engineer"), or "Unauthenticated" |
| `$SESSION_DURATION` | Int32 | Seconds since the current user logged in (resets on login/logout) |
| `$ACTIVE_ALARM_COUNT` | Int32 | Total number of currently active (uncleared) alarms |
| `$CRITICAL_ALARM_COUNT` | Int32 | Number of currently active critical-severity alarms |
| `$UNACKED_ALARM_COUNT` | Int32 | Number of active alarms not yet acknowledged |
| `$CURRENT_SCREEN` | String | Short name of the currently displayed screen |
| `$APP_VERSION` | String | Installed HMI application version (from VERSION file) |
| `$APP_UPTIME` | Int32 | Seconds since the HMI backend process started |
| `$COMM_STATUS` | String | Aggregate data source status: "OK" if all connected, "DEGRADED" if any disconnected, "OFFLINE" if all disconnected |
| `$CURRENT_SHIFT` | String | Name of the currently active shift (from shift schedule configuration), or empty if no shift is active |
| `$ACTIVE_JOB` | String | Name of the currently loaded job (see FR-JOB-11), or empty if no job has been downloaded |

| ID | Requirement |
|----|-------------|
| FR-TAG-26 | **System tag availability** — system tags are always present in the tag database and cannot be deleted, renamed, or modified by the user. They appear in the tag selector under a dedicated "$System" group. The `$` prefix is reserved — user-defined tags cannot start with `$`. |
| FR-TAG-27 | **System tag binding** — system tags can be bound to any read-capable widget (text value, status indicator, etc.) and referenced in visibility/enabled expressions. For example, a widget can be configured as visible only when `$LOGGED_IN_ROLE` equals "Engineer". System tags are accessible in scripts via `tags.read("$CURRENT_TIME")`. |
| FR-TAG-28 | **Time/date format** — the display format for `$CURRENT_TIME`, `$CURRENT_DATE`, and `$CURRENT_DATETIME` is configurable in System Settings (e.g., 12h vs. 24h, MM/DD/YYYY vs. YYYY-MM-DD). The format applies globally and also affects timestamps in the alarm table, audit trail, and trend chart axes. |

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
| FR-AUDIT-01 | Log all control actions, job changes, alarm acknowledgments, and login events |
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
| FR-SCRN-04 | Each widget exposes a property panel for configuration: tag binding, label, units, colors, thresholds, size, position, visibility, and enabled state (FR-CTRL-09/10). Tag binding uses a **dropdown selector** populated from the tag database, with **autocomplete** filtering as the engineer types (matching against short name, group, and template). The dropdown displays tags organized by group and template instance, and indicates each tag's data type. The engineer can also filter by data-type compatibility (e.g., a numeric input widget only shows numeric tags). |
| FR-SCRN-05 | Support widget resize and move with visual guides (alignment lines, equal spacing indicators) |
| FR-SCRN-06 | **Navigation shell** — the application uses a persistent navigation shell visible on all screens at runtime. The shell consists of: **(a)** a **top bar** containing the application title/logo, active alarm summary badge (tappable → alarm page), data source connection status indicators, the current user name with role, and a user menu (profile, logout); **(b)** a **side navigation rail** (collapsible to icons on small screens) listing the top-level pages (Dashboard, Trends, Alarms, Jobs, Reports, Settings, Profile). The active page is highlighted. Settings is visible only to Engineer/Designer roles. The navigation rail can be collapsed or expanded by the user; collapsed state is persisted per user. |
| FR-SCRN-07 | **Page hierarchy and sub-navigation** — top-level pages that contain sub-pages (e.g., Alarms → Active Alarms / Alarm History; Jobs → Job List / Job Editor) use a **tab bar** or **segmented control** below the top bar to switch between sub-pages. The URL updates to reflect the current page and sub-page (e.g., `/alarms/active`, `/jobs/editor/3`), enabling direct linking and browser back/forward navigation. |
| FR-SCRN-08 | **Designer-created screen navigation** — the Dashboard top-level page hosts one or more designer-created screens. When multiple screens exist, the navigation rail shows them as nested entries under Dashboard (e.g., "Overview", "Sealing Station", "Film Feed"). The designer defines the screen order and display names. Each screen has a unique URL path (e.g., `/screens/sealing-station`). |
| FR-SCRN-09 | **In-screen navigation links** — widgets can be configured as navigation links that navigate to another screen on tap (e.g., tapping a machine area graphic opens its detail screen). Navigation links can target: **(a)** another designer-created screen by name, **(b)** a built-in page (e.g., Trends pre-filtered to specific tags), or **(c)** an external URL (opens in new tab). Navigation links show a visual affordance (e.g., subtle arrow icon or underline on hover). |
| FR-SCRN-10 | **Breadcrumb trail** — when navigating from one screen to another via an in-screen link, a breadcrumb trail appears below the top bar showing the navigation path (e.g., "Overview → Sealing Station → Heater Detail"). Tapping any breadcrumb navigates back to that screen. The breadcrumb clears when navigating via the side rail. |
| FR-SCRN-11 | **Keyboard navigation** — all navigation elements are keyboard-accessible. The side rail supports arrow-key navigation. Screens support Tab to move between interactive widgets. Ctrl+G (or a configurable shortcut) opens a quick "Go to screen" search dialog that filters all screens and pages by name. |
| FR-SCRN-12 | Provide reusable screen templates — save a screen layout as a template that can be instantiated for new machines or areas |
| FR-SCRN-13 | Provide reusable widget groups — group multiple widgets into a composite that can be placed as a single unit and reused across screens |
| FR-SCRN-14 | Template and widget group instances inherit updates from the source unless explicitly overridden (linked instances) |
| FR-SCRN-15 | Screen designs are saved to the database and versioned; previous versions can be viewed and restored |
| FR-SCRN-16 | In edit mode, live PLC data continues to flow into widgets so the designer sees real values while editing. Toggling back to live mode exits the editor and returns to normal runtime operation. |
| FR-SCRN-17 | Screen editor includes undo/redo (minimum 50 levels) |
| FR-SCRN-18 | Import/export screen designs as JSON for backup or transfer between systems |
| FR-SCRN-19 | All screen design changes are logged to the audit trail (who changed what screen, when) |

---

## 4. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-01 | **Latency**: Dashboard values update within 500ms of PLC value change |
| NFR-02 | **Concurrency**: Support at least 5 simultaneous browser clients (panel PC primary + maintenance laptops) |
| NFR-03 | **Uptime**: Backend should auto-reconnect to PLC on connection loss (see FR-PROTO-06) |
| NFR-04 | **Browser**: Chromium-based (panel PC runs Chromium in kiosk mode); also support Chrome and Edge for maintenance laptops |
| NFR-05 | **Display**: Designed for the panel PC's native resolution (configurable, default 1920x1080); touch-first with minimum 44px touch targets |
| NFR-06 | **Security**: All PLC credentials and passwords/PINs stored encrypted at rest. HTTPS/TLS for browser-to-backend communication is supported but optional — HTTP is acceptable on isolated factory networks. When TLS is enabled, the server listens on a non-privileged port (e.g., 8443) to avoid requiring root for port binding. |
| NFR-07 | **Deployment**: Deployed as a self-contained offline package (see §9). **No root or administrator privileges required** — the application installs into a user-writable directory and runs as an unprivileged user process. On Linux, an optional systemd user service or shell launcher is provided for auto-start; on Windows, an optional scheduled task or shell shortcut is provided. No Docker required. Target machines have **no internet access**. |
| NFR-08 | **Kiosk mode**: Browser launches fullscreen on boot with no browser chrome; on-screen keyboard available for text input. Kiosk configuration is platform-specific (e.g., Chromium autostart via user session on Linux/Raspberry Pi, Chrome in kiosk mode via shortcut on Windows). Kiosk setup does not require root/admin — it configures the current user's desktop session or autostart. |
| NFR-09 | **Offline**: Fully self-contained — no CDN, external fonts, or internet-dependent resources. All assets bundled locally. Installation itself must also work offline (no `pip install` from PyPI on the target). |
| NFR-10 | **Configuration**: Server endpoint, database, and basic settings via environment variables or config file |
| NFR-11 | **Logging**: Structured application logging (JSON) with configurable log levels |
| NFR-12 | **Testability**: Backend API unit tests, protocol driver integration tests using the tag simulation layer, and frontend component tests |
| NFR-13 | **Data retention**: Configurable retention policy for trend data and audit logs with automatic purge to prevent disk filling (default: trends 90 days, audit 1 year) |
| NFR-14 | **Database**: SQLite in WAL mode for concurrent read performance; periodic backup to configurable location (USB, network share) |
| NFR-15 | **Multi-platform**: Runs on Windows (10/11, x86_64), Linux (x86_64), and ARM (armv7l / aarch64, including Raspberry Pi 3/4/5). All Python dependencies must have pure-Python fallbacks or provide pre-built wheels for all target platforms. Frontend assets are platform-independent. |
| NFR-16 | **Packaging**: The build system (running on a developer machine with internet) produces a self-contained deployment archive per target platform. The archive includes the Python runtime, all Python dependencies, pre-built frontend assets, install/upgrade scripts, and service configuration. Deployment to the target machine is copy-and-run — no internet, no compilation, no package manager, and **no root/admin privileges** required on the target (see §9). |
| NFR-17 | **No elevated privileges**: The entire application lifecycle — install, run, upgrade, uninstall — operates without root (Linux) or Administrator (Windows) access. The application binds to a **non-privileged port** (default: 8080, configurable) to avoid requiring port-binding privileges. All files are stored under a user-writable directory (e.g., `~/hmi` or `%LOCALAPPDATA%\hmi`). If an organization later wants system-level service management (systemd system service, Windows Service), that is an optional post-install step that does require admin — but it is not needed for basic operation. |

---

## 5. Use Cases

> The use cases below are illustrated with a packaging machine scenario, but the workflows apply to any industrial application. Replace "film break" with "pump cavitation", "seal temperature" with "zone pressure", etc. — the HMI's behavior is the same regardless of the machine or process type.

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

### UC-03: Operator Loads a Job for Production Changeover

**Actor**: Operator
**Precondition**: Machine is not running (or job download condition tag is satisfied, FR-JOB-08)
**Flow**:
1. Operator navigates to the Jobs page → Job List tab
2. Scrolls or searches for "Product-B 500ml" — the list shows job name, description, and version
3. Taps the job to preview its parameters: speed setpoint (120 ppm), seal temperature (185°C), film length (320mm), etc., each shown with engineering units and the current machine value for comparison
4. Presses "Load Job" — confirmation dialog shows all parameters that will change, with current → new values highlighted
5. Backend writes all job parameters to the PLC in a single batch; progress indicator shows completion
6. Dashboard updates: the `$ACTIVE_JOB` indicator shows "Product-B 500ml"; operator presses the "Start" command button

---

### UC-04: Supervisor Creates a New Job

**Actor**: Supervisor
**Precondition**: Logged in with Supervisor role
**Flow**:
1. Supervisor navigates to Jobs → Job Editor tab
2. Taps "New Job" — chooses to start from scratch or clone an existing job (e.g., clone "Product-A 250ml" as a starting point)
3. Enters job name ("Product-C 750ml") and description ("Large format, high-speed configuration for 750ml pouches")
4. Fills in parameters — the editor shows each tag's short name, current value, engineering units, and valid range; values outside the range are flagged with a warning (FR-JOB-10)
5. Optionally compares the new job against the cloned source side-by-side to verify changes (FR-JOB-05)
6. Saves — job is stored in the database as version 1; audit trail records the creation with all parameter values

---

### UC-04a: Supervisor Captures Current Machine State as a New Job

**Actor**: Supervisor
**Precondition**: Machine is running with a good configuration that should be saved
**Flow**:
1. Supervisor navigates to Jobs → Job Editor tab
2. Taps "Upload from Machine" — system reads the current values of all tags in the upload set (FR-JOB-04)
3. Parameter table auto-fills with the live machine values
4. Supervisor enters a job name ("Product-A Optimized") and description, reviews the captured values
5. Saves the job — system stores it as a new job with version 1

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

### UC-06a: Engineer Configures an OPC UA Data Source

**Actor**: Engineer
**Precondition**: Logged in with Engineer role
**Flow**:
1. Engineer navigates to Settings → Data Sources
2. Taps "Add Data Source", selects "OPC UA" as the protocol
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
1. Engineer navigates to Settings → Data Sources
2. Taps "Add Data Source", selects "EtherNet/IP (CIP)" as the protocol
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
**Precondition**: Logged in with Engineer role; MicroLogix 1400 data source already configured (UC-06b); PLC is not currently accessible on the network (e.g., commissioning preparation at the office)
**Flow**:
1. Engineer navigates to the Tag Editor and taps "Import from → RSLogix 500 CSV"
2. Uploads the CSV file exported from RSLogix 500 (containing data file symbols, addresses, and descriptions)
3. System parses the CSV and maps data file types: integer files → INT tags, float files → FLOAT tags, timer/counter files → struct tags with sub-elements (ACC, PRE, DN, etc.)
4. Diff view shows: "48 new tags, 0 changed, 0 removed"
5. Engineer reviews the imported tags — RSLogix descriptions are used as short names where available (e.g., `MACHINE_SPEED` for `N7:5`)
6. Engineer edits short names for clarity (e.g., `MACHINE_SPEED` → `MachineSpeed`), assigns engineering units and display formats
7. Taps "Apply" — 48 tags imported and associated with the MicroLogix data source
8. When the PLC is later connected on-site, tags are already configured and ready for live data

---

### UC-06b2: Engineer Creates Tag Templates for Identical Motors on a Legacy PLC

**Actor**: Engineer
**Precondition**: Logged in with Engineer role; MicroLogix 1400 data source configured (UC-06b); plant has 4 identical motors with tags spread across multiple data files
**Flow**:
1. Engineer navigates to Tag Editor → Templates and taps "New Template"
2. Names the template `Motor` and defines fields: `speedCommand` (INT), `speedFeedback` (INT), `current` (FLOAT, units: Amps), `faultCode` (INT), `running` (BOOL)
3. Configures template-level defaults: alarm on `current` > 15A, trend `speedFeedback` at 1s interval
4. Taps "Create Instance", enters prefix `motor1`
5. Maps each field to a source address independently:
   - `speedCommand` → `N7:0`
   - `speedFeedback` → `N7:1`
   - `current` → `F8:0`
   - `faultCode` → `N7:2`
   - `running` → `B3:0/0`
6. Repeats for `motor2` (addresses `N7:10`, `N7:11`, `F8:1`, `N7:12`, `B3:0/1`), `motor3`, `motor4`
7. Saves — system generates 20 tags (5 fields × 4 instances): `motor1.speedCommand`, `motor1.speedFeedback`, `motor1.current`, etc.
8. All generated tags appear in the tag editor grouped under their template instance and are immediately available for widget binding
9. Later, engineer adds a `vibration` field (FLOAT, units: mm/s) to the `Motor` template; system prompts for the source address mapping on each of the 4 instances; new tags (`motor1.vibration`, `motor2.vibration`, etc.) are generated upon save

---

### UC-06c: Engineer Re-imports Tags After PLC Program Change

**Actor**: Engineer
**Precondition**: Logged in with Engineer role; tags were previously imported; PLC program has been updated with new and renamed variables
**Flow**:
1. Engineer navigates to the Tag Editor and taps "Import from → CODESYS Symbol XML"
2. Uploads the updated symbol configuration XML exported from the CODESYS IDE
3. System parses the XML — including type definitions (enums, structs) — and compares against the existing tag database
4. Diff view shows: "5 new, 2 changed, 1 removed, 1 type updated" — each category is expandable. The type update shows that enum `MachineState` gained a new value (3 = "Maintenance"); the diff shows old vs. new enum mappings
5. Engineer expands "Changed" — sees that `SealTemp1` source address changed from `ns=2;s=GVL.SealTemp` to `ns=2;s=GVL.Sealing.Temp1`; side-by-side comparison highlights the difference
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

### UC-08: System Handles Data Source Connection Loss

**Actor**: System (automated)
**Precondition**: HMI is connected to one or more data sources
**Flow**:
1. Network interruption causes a data source connection to drop
2. Backend detects disconnection and logs the event
3. Dashboard shows a "Connection Lost" banner identifying the affected data source, with timestamp
4. Tags on the affected data source show stale/unknown state (grayed out); other data sources continue normally
5. Backend retries connection with exponential backoff (1s, 2s, 4s, 8s, max 30s)
6. On reconnection, backend re-subscribes to all tags on that data source and pushes fresh values
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

### UC-10: Supervisor Compares Jobs Before Changeover

**Actor**: Supervisor
**Precondition**: Logged in with Supervisor role; multiple jobs exist
**Flow**:
1. Supervisor navigates to Jobs → Job List tab
2. Selects the currently active job ("Product-A 250ml") and a candidate job ("Product-A 500ml") using checkboxes
3. Taps "Compare" — system displays both jobs side-by-side with differences highlighted (changed values in amber, parameters present in one but not the other in red/green)
4. Supervisor reviews the parameter differences (e.g., film length 200mm → 320mm, seal temperature 175°C → 185°C, speed setpoint 150 ppm → 120 ppm)
5. Satisfied with the changes, supervisor selects the candidate job and taps "Load Job"

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
2. Sees the current page tree: Home → Line 3 Overview, Line 4 Overview, Alarms, Jobs
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
| **Per-tag simulation** | Any individual tag can be placed into simulation mode independently. The tag's value is driven by a configurable simulation behavior (see below) instead of the live data source. Other tags on the same data source continue to read/write live. |
| **Per-data-source simulation** | All tags on a given data source are simulated. Useful when the PLC or device is offline or not yet commissioned. |
| **Global simulation** | All tags across all data sources are simulated. Used for full offline screen design and demo. |

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

### Example Simulated Tags (Packaging Machine Scenario)

The example screens are backed by a pre-configured tag set using a packaging machine scenario. These tags are not tied to any protocol — they exist only in the tag database with simulation enabled. The packaging-specific names (film tension, seal temperature, etc.) are illustrative; real deployments would have tags matching the actual machine or process.

| Category | Tags | Simulation Behavior |
|----------|------|-------------|
| **Machine Status** | MachineRunning (Bool), FaultActive (Bool), Command (Int) | Script: Command writes drive MachineRunning and FaultActive state |
| **Counters** | GoodCount, RejectCount, TotalCount | Script: increment while MachineRunning=true, rate based on CurrentSpeed |
| **Speed** | CurrentSpeed, SpeedSetpoint, MaxSpeed | Script: CurrentSpeed ramps toward SpeedSetpoint; MaxSpeed is static |
| **Temperatures** | SealTemp1, SealTemp2, TunnelTemp | Sine wave + noise (PID-like behavior) |
| **Film Station** | FilmTension, FilmLength, SpliceDetect | Random/noise for analogs, toggle for SpliceDetect |
| **Pressures** | VacuumPressure, AirPressure | Sine wave + noise |
| **Digital I/O** | DoorClosed, EStopActive, FilmBreak, ProductDetect | Static (manually togglable) with periodic random fault injection |
| **Production** | BatchID, JobName, ShiftNumber | Static (set via job downloads) |
| **Structured Types** | MotorStatus (Struct: Speed Float32, Current Float32, FaultCode UInt16, Running Bool), ZoneTemps (Array[6] of Float32), MachineState (Enum: 0=Stopped, 1=Running, 2=Faulted, 3=Maintenance) | Struct fields use individual behaviors; enum cycles through values |

### Simulation Indicator

When any tag is in simulation mode, the HMI displays a clear visual indicator (e.g., a persistent banner or badge) so that operators and engineers are always aware that displayed values are not live PLC data. Individual widgets bound to simulated tags show a subtle "SIM" badge. The indicator cannot be suppressed in production mode — only disabling simulation removes it.

---

## 7. Pages / Navigation Structure

The application shell provides a **side navigation rail** (left) and a **top bar** (see FR-SCRN-06). The side rail lists top-level pages; sub-pages appear as tabs within each page. Designer-created screens are nested under Dashboard.

```
┌─────────────────────────────────────────────────────────────┐
│  TOP BAR: [Logo/Title]  [Alarm Badge 🔔2]  [Connection ●●○]  [User ▾] │
├──────────┬──────────────────────────────────────────────────┤
│ SIDE NAV │                                                  │
│          │  ┌─ Breadcrumb: Overview → Sealing Station ──┐   │
│ Dashboard│  │                                           │   │
│  Overview│  │          PAGE CONTENT AREA                 │   │
│  Sealing │  │                                           │   │
│  Film Fd │  │   (designer screens, built-in pages,      │   │
│ Trends   │  │    or settings panels rendered here)      │   │
│ Alarms   │  │                                           │   │
│ Jobs     │  │                                           │   │
│ Reports  │  │                                           │   │
│ Settings*│  └───────────────────────────────────────────┘   │
│ Profile  │          [Tab: Active | History]  ← sub-pages    │
└──────────┴──────────────────────────────────────────────────┘
  * Settings visible to Engineer/Designer only
```

**Page hierarchy:**

```
├── Dashboard (home)              /screens/:slug
│   ├── Overview (default)        /screens/overview
│   ├── <designer screen 1>      /screens/sealing-station
│   └── <designer screen N>      /screens/...
├── Trends                        /trends
├── Alarms                        /alarms
│   ├── Active Alarms             /alarms/active        (tab)
│   └── Alarm History             /alarms/history       (tab)
├── Jobs                          /jobs
│   ├── Job List                  /jobs/list            (tab)
│   └── Job Editor                /jobs/editor/:id      (tab)
├── Reports                       /reports
│   ├── Production Runs           /reports/runs         (tab)
│   └── OEE / Shift Report        /reports/oee          (tab)
├── Settings (Engineer only)      /settings
│   ├── Data Sources              /settings/data-sources
│   ├── Tag Configuration         /settings/tags
│   ├── User Management           /settings/users
│   ├── System Settings           /settings/system
│   └── Audit Trail               /settings/audit
└── Profile                       /profile
```

**Navigation behaviors:**
- Side rail click → navigates to the page's default sub-page/screen; clears breadcrumb
- Tab click → switches sub-page within the current top-level page; URL updates
- In-screen link → pushes onto the breadcrumb trail; back button and breadcrumb taps return to previous screen
- Browser back/forward → standard history navigation across all page and screen transitions
- Ctrl+G → "Go to screen" quick-search dialog (FR-SCRN-11)

---

## 8. Design Decisions

| # | Topic | Decision |
|---|-------|----------|
| 1 | **Multi-machine** | Single machine for v1. Data model should not preclude adding multi-machine later, but UI and backend target one primary data source initially (additional data sources supported for auxiliary devices). |
| 2 | **Notifications** | In-app only (alarm banner, alarm page, optional audible alert in browser). No email, SMS, or push notifications in v1. |
| 3 | **Localization** | i18n-ready — use a localization framework (e.g., react-i18next) from the start so all user-facing strings are externalizable, but ship with English only. |
| 4 | **Historian** | Built-in database only. The HMI logs trend data to its own DB. No external historian integration in v1. |
| 5 | **Display** | Touch-first design for panel PC touchscreen. Designed for native panel resolution (default 1920x1080). Maintenance laptops can connect via browser on the local network. |
| 6 | **Regulatory** | No special regulatory requirements. Standard audit trail and authentication; no FDA 21 CFR Part 11 or formal GMP compliance needed. |
| 7 | **Complex data types** | OPC UA structs, arrays, and enumerations are supported via flatten-on-import (recommended) or compound tags. Flatten is the default as it keeps the widget binding model simple and consistent across all protocols. Compound tags are available for engineers who prefer to preserve the PLC's type structure. EtherNet/IP, Modbus, and MQTT do not support complex types natively — those protocols use scalar tags only. MQTT tags with JSON payloads use JSON path expressions to extract individual scalar values from nested objects. For protocols without native struct support, **tag templates** provide a virtual struct mechanism: engineers define a template with named fields, then create instances where each field is independently mapped to any source address. This gives legacy PLCs and MQTT topics the same logical grouping benefits as OPC UA structs without requiring source-side support. |
| 8 | **Multi-platform** | The chosen technology stack (Python + SQLite backend, React frontend served as static assets) is inherently cross-platform. Python and all key dependencies (asyncua, pycomm3, pymodbus, SQLAlchemy) run on Windows, Linux x86_64, and ARM without platform-specific code. SQLite is embedded and works everywhere. The frontend is browser-based and platform-independent. Platform-specific concerns are limited to optional auto-start configuration (systemd user service vs. Windows scheduled task) and optional kiosk-mode setup. |
| 9 | **Deployment** | Target machines have no internet access, so deployment must be fully offline. The build system produces self-contained archives on a developer machine (with internet); these are transferred to targets via USB, network share, or similar. PyInstaller or similar bundling tool is used to include the Python runtime so the target does not need Python pre-installed. |
| 10 | **No root/admin** | Installation and operation must not require elevated privileges. The application installs into a user-writable directory, binds to a non-privileged port (default 8080), and uses user-level auto-start mechanisms. This accommodates locked-down industrial PCs where operators and engineers do not have admin rights, shared IT-managed machines, and Raspberry Pi deployments where `sudo` may be restricted. System-level service installation is available as an optional step for admins who want it. |

---

## 9. Deployment & Installation

Target machines are air-gapped or have no reliable internet access. All build and dependency resolution happens on a **developer/build machine** with internet. The output is a self-contained deployment artifact that is transferred to the target machine (via USB drive, local network share, or similar) and installed with a single script. **No root or administrator privileges are required on the target** — the application runs entirely within user space.

### 9.1 Build Pipeline (Developer Machine — has internet)

The build pipeline runs on a developer machine and produces one deployment archive per target platform:

1. **Frontend build**: `npm run build` produces static assets (HTML, JS, CSS) — platform-independent.
2. **Python bundling**: Use [PyInstaller](https://pyinstaller.org/) (or equivalent: cx_Freeze, Nuitka) to package the Python backend, all dependencies, and the Python runtime itself into a single self-contained directory or executable. Cross-compilation or platform-specific build VMs/containers are used to produce bundles for each target architecture (Windows x86_64, Linux x86_64, Linux ARM).
3. **Asset inclusion**: The bundled frontend assets, default configuration, example screens, and example simulated tag set are embedded in the archive.
4. **Install scripts**: Platform-specific install/upgrade scripts are included in the archive (see §9.2).
5. **Archive**: Everything is packaged into a single archive file per platform:
   - Linux/ARM: `.tar.gz` (e.g., `hmi-1.0.0-linux-x86_64.tar.gz`, `hmi-1.0.0-linux-aarch64.tar.gz`)
   - Windows: `.zip` (e.g., `hmi-1.0.0-windows-x86_64.zip`)

### 9.2 Installation on Target Machine (no internet, no root/admin)

Installation is a copy-and-run process that requires **no elevated privileges**:

| Step | Linux / Raspberry Pi | Windows |
|------|---------------------|---------|
| **1. Transfer** | Copy `.tar.gz` to target (USB, scp, network share) | Copy `.zip` to target (USB, network share) |
| **2. Extract** | `tar xzf hmi-*.tar.gz -C ~/hmi` | Extract zip to `%LOCALAPPDATA%\hmi` (or chosen directory) |
| **3. Install** | `~/hmi/install.sh` | Run `install.bat` (no "Run as Administrator" needed) |
| **4. Verify** | `~/hmi/bin/hmi-server --status` or check browser at `http://localhost:8080` | Same — check browser at `http://localhost:8080` |

The install script handles:
- Creating the application directory structure under the user's home (no system directories)
- Optionally setting up a **systemd user service** (`systemctl --user`) on Linux or a **scheduled task** on Windows for auto-start on login — neither requires root/admin
- Creating a default configuration file if one does not already exist
- Setting up the SQLite database (running Alembic migrations)
- Optionally configuring Chromium/Chrome kiosk mode autostart (user session, no root/admin)
- Starting the application

No Python installation, no `pip`, no `npm`, no compiler, no internet, and **no root/admin** required on the target.

> **Optional system-level service**: If an administrator later wants to run the HMI as a system-wide service (systemd system unit, Windows Service via NSSM), the archive includes an optional `install-system-service.sh` / `install-system-service.bat` script that does require elevated privileges. This is not needed for normal operation.

### 9.3 Upgrades

Upgrades follow the same copy-and-run pattern:

1. Transfer the new archive to the target machine.
2. Run the install script again — it detects an existing installation and performs an upgrade:
   - Stops the running service
   - Backs up the current database and configuration
   - Replaces application files with the new version
   - Runs database migrations (Alembic) to update the schema
   - Preserves all user configuration, screens, tags, trend history, and audit logs
   - Restarts the service
3. If the upgrade fails, the script rolls back to the previous version from the backup.

### 9.4 Configuration Preservation

The install/upgrade scripts distinguish between **application files** (replaced on upgrade) and **user data** (preserved):

| Preserved across upgrades | Replaced on upgrade |
|--------------------------|-------------------|
| SQLite database (tags, screens, trends, alarms, audit, users) | Python application bundle |
| Configuration file (`config.yaml` or equivalent) | Frontend static assets |
| TLS certificates (if configured) | Install/upgrade scripts |
| Custom screen exports / backups | Default/example screens (re-imported only if no screens exist) |

### 9.5 Directory Layout (Linux example)

```
~/hmi/                            # User-writable, no root needed
├── bin/                          # PyInstaller-bundled executable(s)
│   └── hmi-server                # Single entry point — starts backend + serves frontend
├── web/                          # Pre-built frontend static assets
├── config/
│   └── config.yaml               # User configuration (preserved on upgrade)
├── data/
│   ├── hmi.db                    # SQLite database (preserved on upgrade)
│   └── backups/                  # Automatic pre-upgrade backups
├── logs/                         # Application log files
├── install.sh                    # Install/upgrade script (no root)
├── install-system-service.sh     # Optional: system-level service (requires root)
└── VERSION                       # Installed version identifier
```
