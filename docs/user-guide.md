# User Guide

This guide covers day-to-day operation and configuration of the HMI from the web browser interface. It is written for operators, supervisors, and engineers — no web development knowledge is needed.

---

## Logging In

The HMI supports two login modes:

1. **Username / Password** — For engineers and designers. Enter your username and password, then click **Sign In**.
2. **PIN** — For operators and supervisors. Switch to the **PIN** tab, enter your 4-digit PIN on the numeric keypad, and click **Sign In**.

After login, the header shows your name, role, and a **Logout** button. Sessions expire after 8 hours (configurable) or 30 minutes of inactivity.

## Navigating the Application

The sidebar provides access to all pages. Pages are filtered by role — operators see a streamlined sidebar, while engineers and designers see configuration tools.

| Page | Purpose | Minimum Role |
|------|---------|--------------|
| **Dashboard** | Live process screens with real-time widgets | Operator |
| **Trends** | Historical data charting with saved views | Operator |
| **Alarms** | Active alarms, acknowledgment, and history | Operator |
| **Jobs** | Recipe/job management and download | Operator (view) / Supervisor (manage) |
| **Reports** | OEE and production reports with charts | Operator |
| **Projects** | Configuration bundles — export, import, switch | Engineer |
| **Settings** | Tags, data sources, integrations, users, branding, audit trail | Engineer |
| **Factory Config** | Touch-friendly parameter editing for commissioning | Operator (view) / Engineer (edit) |
| **Service** | Manual I/O monitoring and equipment actuation | Engineer |
| **Support** | System info, application logs, ZPL label preview | Operator |

The **Connected** indicator in the header shows whether the browser is receiving live data from the server. Green means live data is flowing (tag values are updating). If it turns red, the browser has lost connection to the server — this could mean the backend service has stopped, a network cable was disconnected, or the server is restarting after an update. It will automatically reconnect when the server is available again. The alarm banner at the top scrolls active alarms with color-coded severity and an "Acknowledge All" button. When no alarms are active, the top bar can show a **machine status indicator** and **Cycle Start / Reset buttons** (configured in Settings > Reporting > Top Bar Controls).

---

## Creating and Editing Screens

Screens are the main way to visualize and interact with your process — similar to screens in FactoryTalk View, CODESYS WebVisu, or WinCC. Only users with the **Designer** role can create and edit screens.

### Creating a New Screen

1. Navigate to the **Dashboard** page.
2. Click the **+** button in the top-right corner of the screen tab bar.
3. Enter a **screen name** (e.g., "Motor Overview"). A URL-friendly slug is generated automatically.
4. Choose a **layout mode**:
   - **Grid** — Responsive 12-column layout that adapts to browser width. Best for desktop dashboards.
   - **Absolute** — Pixel-perfect fixed layout with a target resolution (e.g., 1920x1080). Best for dedicated panel PCs and touchscreens.
5. Click **Create**. The new screen appears as a tab and you can start editing immediately.

### Entering Design Mode

- Press **Ctrl+E** or click the **Edit** button (pencil icon) in the screen tab bar.
- The screen designer activates with three panels:
  - **Widget Palette** (left) — Available widget types organized by category.
  - **Canvas** (center) — Your screen layout. Drag to move widgets, drag corners/edges to resize.
  - **Property Panel** (right) — Configure the selected widget's tag binding, appearance, and behavior.
  - **Toolbar** (top) — Undo/redo, save, grid controls, zoom.

### Adding Widgets

1. In design mode, click a widget type in the **Widget Palette** on the left.
2. The widget appears on the canvas and is immediately selected.
3. Use the **Property Panel** on the right to:
   - **Bind a tag** — Click the tag picker dropdown and search for a tag name. The widget will display that tag's live value.
   - **Set titles, units, and ranges** — Configure display text, engineering units, min/max values.
   - **Set colors and thresholds** — Define normal, warning, and critical color ranges.
   - **Configure visibility** — Control when the widget appears based on tag values and/or user roles.
   - **Configure enabled state** — Control when the widget is interactive.

### Available Widget Types

| Category | Widget | Description |
|----------|--------|-------------|
| **Display** | Status Indicator | Shows a tag's current state with color-coded labels (e.g., Running/Stopped/Faulted) |
| **Display** | Gauge | Horizontal bar gauge with min/max range and engineering units |
| **Display** | Counter | Large numeric display for counts (good parts, rejects, etc.) |
| **Display** | Text Value | Displays a tag's value with units and optional "Change value" link |
| **Display** | Alarm Summary | Embedded list of active alarms |
| **Display** | Multi-Value | Groups multiple tag values in a single card |
| **Display** | OEE | Overall Equipment Effectiveness display with availability, performance, quality |
| **Display** | Trend Chart | Embedded historical trend for selected tags with configurable time range and refresh |
| **Display** | ZPL Preview | Renders a ZPL label template (from a tag or static text) as a live image preview |
| **Input** | Toggle | ON/OFF switch bound to a boolean tag |
| **Input** | Command Button | Executes a Python script action (e.g., start/stop machine, reset counters) |
| **Input** | Parameter Input | Numeric or text input with validation and range limits |
| **Input** | Dropdown Select | Select from predefined values to write to a tag |
| **Layout** | Container | Groups child widgets for organization |

### Moving, Resizing, and Arranging Widgets

- **Move**: Click and drag a widget to reposition it. Snap-to-grid keeps things aligned.
- **Resize**: Drag a corner or edge handle to resize.
- **Multi-select**: Click empty canvas space and drag a marquee, or hold **Shift** and click multiple widgets.
- **Align**: Select multiple widgets, right-click, and choose alignment options (left, right, top, bottom, center).
- **Distribute**: Select 3+ widgets and distribute spacing evenly (horizontal or vertical).
- **Z-Order**: Use **Ctrl+]** / **Ctrl+[** to bring forward or send backward. **Ctrl+Shift+]** / **Ctrl+Shift+[** for front/back.
- **Lock**: Lock a widget to prevent accidental moves or deletes. Locked widgets show a lock icon.

### Saving Screens

- Press **Ctrl+S** or click **Save** in the toolbar. A yellow dot on the screen name indicates unsaved changes.
- Click **Save & Exit** to save and return to runtime mode.
- Every save automatically creates a **version snapshot** for rollback. View version history via the API.
- To discard changes, press **Ctrl+E** or **Escape** while in design mode and confirm.

### Deleting a Screen

1. Select the screen tab you want to delete.
2. Click the **trash** icon in the screen tab bar.
3. Confirm the deletion.

### Keyboard Shortcuts (Design Mode)

| Shortcut | Action |
|----------|--------|
| `Ctrl+E` | Toggle design mode |
| `Ctrl+S` | Save |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |
| `Ctrl+C` / `Ctrl+X` / `Ctrl+V` | Copy / Cut / Paste |
| `Ctrl+D` | Duplicate selected |
| `Ctrl+A` | Select all |
| `Ctrl+]` / `Ctrl+[` | Bring forward / Send backward |
| `Ctrl+Shift+]` / `Ctrl+Shift+[` | Bring to front / Send to back |
| `Delete` | Delete selected (with confirmation) |
| `Shift+Delete` | Delete selected (skip confirmation) |
| `Escape` | Clear selection |

---

## Connecting to a PLC (Data Sources)

Data sources define how the HMI communicates with your PLCs and controllers — similar to how you configure a communication channel in FactoryTalk Linx or a CODESYS gateway connection. Each data source represents one PLC or controller. Requires the **Engineer** or **Designer** role.

### Adding a Data Source

1. Go to **Settings** > **Data Sources** tab.
2. Click **+ Add Data Source**.
3. Fill in the configuration:
   - **Name** — A descriptive label (e.g., "Packaging Line PLC").
   - **Protocol** — Choose from:
     - **OPC-UA** — Endpoint URL (e.g., `opc.tcp://192.168.1.10:4840`), optional security policy and credentials.
     - **Modbus TCP** — Host IP, port (default 502), unit ID.
     - **EtherNet/IP** — Host IP, slot number.
     - **MQTT** — Broker address, port, optional credentials, topic prefix.
     - **Simulation** — No configuration needed; generates demo values.
4. Click **Save**.

### Testing the Connection

1. After saving, click **Test Connection** on the data source row.
2. The system attempts to connect and reports success or failure.
3. For OPC-UA, the connection also auto-detects the CODESYS address prefix for tag import.

### Browsing and Importing Tags from an OPC-UA Server

The most direct way to populate tags is to browse them live from an OPC-UA server. This discovers every variable the PLC exposes and lets you import them in bulk — no CSV files or manual entry required.

1. Click **Browse** on a connected OPC-UA data source.
2. A browse dialog opens and loads the server's **root-level nodes** (folders and objects).
3. **Navigate the tree** — click the arrow icon on any folder to expand it and load its children on demand (lazy loading keeps things fast even on servers with thousands of nodes).
4. **Search** — type in the filter box to find tags by name or address. The filter searches across all loaded nodes. If you need deeper results, click **Full Scan** to load the entire server tree at once.
5. **Review tags** — each variable node shows its OPC-UA display name, relative address, and data type. Tags that already exist in the HMI are marked **Exists**.
6. **Import individual tags** — click **Create** next to any tag to import it immediately.
7. **Import all visible tags** — click **Create All** to import every tag in the current filtered view at once.

Imported tags are automatically configured with:
- **Name** derived from the OPC-UA display name
- **Address** set to the relative address (with the CODESYS prefix stripped when detected)
- **Data source** linked to the OPC-UA connection
- **Data type** mapped from the OPC-UA variant type (Boolean → `bool`, Int16/32/64 → `int`, Float/Double → `float`, String → `string`)
- **Access mode** set to `read` (adjustable later in the tag editor)

> **CODESYS servers:** When connecting to a CODESYS runtime, the HMI automatically detects the address prefix (e.g., `ns=4;s=|var|CODESYS_Control.Application.`) so that tag addresses are displayed as clean relative paths like `GVL.Motor_Speed` instead of full OPC-UA node IDs.

> **Tip:** After importing, go to **Settings > Tags** to enable trending, configure alarms, assign labels, or adjust access modes on the imported tags.

---

## Importing Tags from Files

Tags represent data points in your system — sensor readings, setpoints, machine states, counters, fault flags, etc. Each tag maps to a variable in a PLC or controller. In addition to [browsing tags live from a PLC](#browsing-and-importing-tags-from-an-opc-ua-server), the HMI supports three file-based import formats for bulk tag creation.

### Method 1: HMI CSV Import

Best for manually maintained tag lists or exporting/importing between HMI instances.

1. Go to **Settings** > **Tags** tab.
2. Click **Import Tags**.
3. Select the **HMI CSV** format.
4. Upload a CSV file with these columns:

   ```
   name,description,data_type,access_mode,engineering_units,min_value,max_value,address
   Machine.Speed,Line speed,float,read_write,units/min,0,200,
   Machine.Running,Motor running,bool,read_write,,,
   Machine.Temperature,Seal temp,float,read,°C,0,300,
   ```

5. Review the preview table. Check/uncheck individual tags.
6. Optionally assign a **data source**.
7. If tags already exist, choose a **conflict resolution** strategy:
   - **Skip conflicts** — Keep existing tags unchanged.
   - **Update conflicts** — Overwrite selected fields (display name, data type, address, etc.).
8. Click **Import**. A summary shows how many tags were imported, updated, or skipped.

### Method 2: CODESYS XML Import

For importing tag structures directly from a CODESYS PLC project.

1. Click **Import Tags** and select **CODESYS XML**.
2. Upload the CODESYS symbol configuration XML file (exported from the CODESYS IDE).
3. The system parses the XML, expanding structs, function blocks, arrays, and enums into flat tag paths.
4. A grouped preview appears — tags are organized by their top-level program/struct.
5. Select/deselect entire groups or individual tags using checkboxes.
6. Optionally add a **tag name prefix** to namespace the imported tags.
7. Configure conflict resolution and click **Import**.

Enum types are automatically detected and their string mappings (e.g., `0: Stopped, 1: Running, 2: Faulted`) are preserved.

### Method 3: RSLogix 500 CSV Import

For Allen-Bradley SLC 500 / MicroLogix PLCs.

1. Click **Import Tags** and select **RSLogix 500**.
2. Upload the RSLogix 500 database CSV export.
3. Tags are grouped by file type (Bits, Integers, Floats, Timers, Counters, Strings, etc.).
4. Select the tags you need, configure conflict resolution, and click **Import**.

### Editing Tags After Import

- Click any tag row in the **Settings > Tags** table to edit its properties.
- Configure **display name**, **engineering units**, **data type**, and **address**.
- Enable **trending** to start recording historical data.
- Enable **alarms** and set severity, trigger condition, and message.
- Enable **simulation** for testing without a real PLC (sine, ramp, random, toggle, enum cycle).
- Tags without a data source or simulation are treated as **internal nonvolatile tags** — their values persist across application restarts (like retain variables in a PLC) and can be used as operator-settable flags, counters, or configuration parameters that don't need a PLC.
- Use **bulk operations** to update, label, or delete multiple tags at once.

---

## Working with Alarms

### Viewing Active Alarms

1. Navigate to the **Alarms** page.
2. The **Active** tab shows all current alarms (uncleared).
3. Filter by severity using the dropdown (Critical, Warning, Info).
4. Search by alarm message, tag name, or display name.
5. Sort by clicking column headers (Severity, Time, Source, Message).

### Acknowledging Alarms

- Click the **Acknowledge** button on an individual alarm row.
- Or click **Acknowledge All** to acknowledge all unacknowledged alarms at once.
- Alarms transition through four states:
  1. **Active / Unacknowledged** — Alarm condition is true, not yet acknowledged.
  2. **Active / Acknowledged** — Alarm condition is true, operator has acknowledged.
  3. **Inactive / Unacknowledged** — Alarm cleared before being acknowledged.
  4. **Inactive** — Alarm cleared and acknowledged (moves to history).

### Alarm History

- Switch to the **History** tab to view past alarms.
- History includes triggered time, acknowledged time/user, cleared time.
- Click **Export CSV** to download alarm records for reporting.

### Configuring Alarms on Tags

1. Go to **Settings** > **Tags** and click on a tag.
2. Enable alarms and configure:
   - **Type**: Boolean (triggers when the tag value matches the `trigger_on` value).
   - **Trigger On**: The value that activates the alarm (default: `true` — meaning the alarm fires when the tag becomes true).
   - **Severity**: Critical, Warning, or Info.
   - **Message**: Custom alarm text displayed to operators (e.g., "Conveyor Motor Overload").

> **Note**: This HMI uses boolean alarm triggers — the PLC sets a fault bit, and the HMI monitors it. Analog threshold alarming (high temperature, low pressure, etc.) should be handled in the PLC program and reported to the HMI as boolean fault flags. This is the standard practice in industrial automation because the PLC can react in real time, while the HMI is only for monitoring and acknowledgment.

### Fault Help Dialog

When configured, a help dialog automatically pops up when an alarm triggers, showing an image or animated GIF with troubleshooting instructions to guide the operator.

1. Go to **Settings** > **Tags** and click on a boolean tag with alarms enabled.
2. In the alarm configuration section, check **Show help dialog on fault**.
3. Click **Upload Image** to attach a help image (PNG, JPG, GIF, or WEBP, max 10 MB). Animated GIFs are supported for step-by-step visual guides.
4. Optionally enter **Help Instructions** with text-based troubleshooting steps.
5. Save the tag.

When the alarm triggers, operators see a dialog with:
- The alarm severity and message
- The uploaded help image/GIF
- The troubleshooting instructions
- **Acknowledge** and **Dismiss** buttons

The dialog shows once per alarm instance. If multiple alarms trigger simultaneously, the highest-severity alarm is shown first. Dismissing the dialog does not acknowledge the alarm — use the **Acknowledge** button or the Alarms page to acknowledge.

---

## Viewing Trends

1. Navigate to the **Trends** page.
2. Select up to **8 tags** from the tag list on the left.
3. Choose a time range: **1h**, **8h**, **24h**, **7d**, **30d**, or **Custom** date range.
4. The chart updates with historical data for the selected tags.

### Saving and Loading Trend Views

- Click **Save View** to save the current tag selection and time range as a named view.
- Click **Load View** to recall a previously saved view.
- Views persist across sessions, making it easy to return to frequently monitored tag sets.

### Exporting Trend Data

- Click **Export CSV** to download the currently displayed trend data.
- The export includes timestamps, tag names, and values for the selected time range.

> **Tip**: Only tags with **trending enabled** in Settings > Tags will record historical data.

---

## Managing Jobs and Recipes

Jobs (also called recipes in some HMI systems) define sets of machine setpoints that can be downloaded to a PLC in one operation — like a recipe manager in FactoryTalk or a parameter set in a CODESYS recipe system. Requires **Supervisor** role or higher.

### Creating a Job

1. Navigate to the **Jobs** page.
2. Click **+ New Job**.
3. Enter a **name** and optional description.
4. Add **setpoints** — select writable tags and enter target values:
   - Tags are organized by label groups for easy navigation.
   - Use the search field to find specific tags.
   - Boolean tags show a toggle switch; numeric tags accept typed values.
5. Optionally add **download conditions** (guards):
   - Example: Machine must be in "idle" state and safety door must be "closed" before download.
   - Guards are checked before any setpoints are written.
6. Click **Save**.

### Downloading a Job to the Machine

1. Open a job from the list.
2. Review the setpoints displayed in the detail view.
3. Click **Download**.
4. The system checks all download conditions:
   - If any guard fails, the download is rejected with a descriptive error.
   - If all guards pass, all setpoints are written atomically to the PLC.
5. The `$ACTIVE_JOB` system tag is updated with the job name.
6. The action is recorded in the audit trail.

### Uploading Current Values as a New Job

- Click **Upload from Machine** to capture the current values of all writable tags and save them as a new job. This is useful for creating a baseline or saving a known-good configuration.

### Job Version History

- Each time a job is edited and saved, a new version is created automatically.
- View the version history to see what changed and who made the change.

---

## Production Reports

The Reports page provides production analytics with tag-driven data collection and OEE tracking.

### Viewing Reports

1. Navigate to the **Reports** page.
2. The page displays a unified scrollable layout:
   - **Summary cards** — Total Runs, Good Count, Reject Count, Average OEE, Yield Rate, and Downtime minutes.
   - **OEE Trend chart** — OEE, Availability, Performance, and Quality over time with an 85% target reference line.
   - **Production Volume chart** — Stacked bar chart of good and reject counts per period.
   - **Downtime Pareto chart** — Bar chart of downtime by reason code with a cumulative percentage line.
   - **Production Runs table** — All runs with expandable detail panels showing downtime events.
3. Use the **Day / Week / Month** toggle to change the time-series granularity.
4. Filter by date range using the preset buttons (7d, 30d, 90d, YTD) or a custom date picker.
5. Click **Export CSV** to download report data for external analysis.

### Starting a Production Run

1. Click **Start Run** on the Reports page.
2. Enter a **product name** and optional **target count** and **target rate**.
3. Click **Start**. If a good count tag is configured in Settings, the current counter value is captured automatically as the baseline.

### Stopping a Production Run

1. Click the **Stop** button on an active run.
2. If tag-driven counting is configured, good count is computed automatically as the delta between the current counter value and the start value. You can enter a manual override if needed.
3. Enter reject count (if not tracked automatically via fault tags) and select a stop reason.
4. Click **Stop Run**. OEE is calculated server-side as Availability × Performance × Quality.

### Automatic Reject and Downtime Tracking

When configured in Settings > Reporting:

- **Reject fault tags** — Each time a configured fault alarm fires, the reject count for the active run is automatically incremented.
- **Downtime alarm tags** — When a configured alarm activates, a downtime event is automatically created. When the alarm clears, the event is closed with the duration calculated.
- Manual downtime entry is still available: click **+ Add Downtime** on a run's detail panel and select a reason code.

### Automatic Shift Scheduling

Instead of starting and stopping runs manually, you can configure automatic shift-based runs:

1. Go to **Settings** > **Reporting** tab.
2. Under **Shift Mode**, select **Automatic Shifts**.
3. Use a preset (1-Shift, 2-Shift, 3-Shift) or add shifts manually with name, start time, end time, and optional target count.
4. The 24-hour timeline bar provides a visual overview of shift coverage.
5. Click **Save**. The system will automatically start a run at each shift's start time and stop it at the end time.
6. When in automatic mode, the Reports page shows an "Auto Shifts" badge and the manual Start Run button is hidden.
7. Manual stop is still allowed for emergencies — the scheduler will restart a run on its next check if the shift is still active.

### Configuring Production Settings

1. Go to **Settings** > **Reporting** tab.
2. Configure the **Good Count Tag** — select an integer or float tag that represents a running counter on the PLC. The system uses delta mode (value at stop minus value at start).
3. Select **Reject Fault Tags** — check alarm-enabled tags that indicate a faulty product. Each alarm activation increments the reject count.
4. Select **Downtime Alarm Tags** — check alarm-enabled tags that indicate machine downtime. Alarm events auto-create and auto-close downtime records.
5. Click **Save**.

### Configuring Top Bar Controls

When no alarms are active, the top bar can display a machine status indicator and control buttons. To configure:

1. Go to **Settings** > **Reporting** tab, scroll to the **Top Bar Controls** section.
2. **Machine Status Tag** — select a tag whose value represents the machine state (e.g. "Running", "Stopped", "Faulted", "Idle"). The indicator is color-coded: green for running states, red for faulted, yellow for idle, gray for stopped.
3. **Cycle Start Tag** — select a boolean tag. Pressing the Cycle Start button in the top bar writes `true` to this tag.
4. **Reset Tag** — select a boolean tag. Pressing the Reset button writes `true` to this tag.
5. Click **Save**. The controls appear in the top bar immediately (you may need to refresh the page).

If no tags are configured, the top bar remains blank when alarm-free. Each control is independently optional — you can configure just the status indicator, just the buttons, or any combination.

### Managing Reason Codes

Downtime reason codes are predefined categories used in the downtime Pareto chart and when logging downtime events.

1. Go to **Settings** > **Reporting** tab, scroll to the **Downtime Reason Codes** section.
2. The system comes seeded with default codes: MECHANICAL, ELECTRICAL, MATERIAL, CHANGEOVER, OPERATOR, PLANNED_MAINTENANCE, QUALITY_HOLD, OTHER.
3. Click **+ Add Code** to create a new code with an optional category.
4. Click a row to edit, or use the toggle to activate/deactivate a code.
5. Deactivated codes are preserved for historical Pareto analysis but no longer appear in dropdown menus.

---

## Managing Projects

Projects bundle your HMI configuration (screens, tags, data sources) into a portable package that can be exported, imported, and version-tracked. This is useful for backing up configurations, deploying to multiple machines, or maintaining separate configs for different production lines. Requires **Engineer** role or higher.

### Creating a Project

1. Navigate to the **Projects** page.
2. Click **+ New Project**.
3. Enter a **name**, **description**, and optional **version** string.
4. Choose a starting template:
   - **Empty** — Blank project with no screens or tags.
   - **Demo** — Pre-configured with sample widgets and simulated tags for testing.
5. Click **Create**.

### Exporting a Project

1. Click the **Export** button on a project row.
2. The system packages all screens, tags, data sources, and settings into a `.hmi.json` file.
3. Save the file for backup, transfer to another HMI instance, or version control.

### Importing a Project

1. Click **Import** in the page header.
2. Upload a `.hmi.json` file previously exported from any HMI instance.
3. Review the import preview showing what will be created.
4. Click **Import** to apply.

### Switching Between Projects

- Click **Load** on a project to make it the active configuration. The current state is replaced with the project's saved state.
- Click **Save Current State** to snapshot the running configuration back to the active project.
- Click **Save & Load** to save the current state, then switch to a different project in one operation.

---

## Factory Configuration

The Factory Config page provides a simplified, touch-friendly interface for viewing and editing machine parameters. It is designed for commissioning, setup, and maintenance tasks where operators need to adjust parameters without navigating the full tag editor in Settings.

### How It Works

1. Navigate to **Factory Config** in the sidebar.
2. Parameters are displayed grouped by their tag labels (categories), with collapsible sections.
3. Each parameter shows its display name, current value, and engineering units.

### Editing Parameters

1. Click **Edit** in the header bar (requires Engineer role or higher).
2. The page enters edit mode — input controls appear next to each parameter:
   - **Boolean** tags show a toggle switch.
   - **Numeric** tags open a touch-friendly numeric keypad.
   - **Enum** tags show a dropdown with the mapped values (e.g., "Off", "On", "Auto").
   - **Text** tags open an alpha keyboard.
3. Modify the values you need to change.
4. Click **Save** to write all changes to the PLC in one batch, or **Cancel** to discard.

> **Note:** Only tags that have been assigned the "Factory Config" label in Settings > Tags appear on this page. To add parameters, go to Settings > Tags and apply the "Factory Config" label to the relevant tags.

---

## Service Page

The Service page provides manual I/O monitoring and equipment actuation for commissioning and maintenance. Requires **Engineer** or **Designer** role.

### I/O Monitor

The top section displays all tags labeled "Input" or "Output" in a live read-only view, split into Input and Output columns. Values update in real time via WebSocket, showing engineering units and enum mappings.

### Service Controls

Below the I/O monitor, all tags labeled "Service" are grouped by their additional labels and presented as interactive controls:

- **Momentary** (default) — Press and hold to send `true`, release to send `false`. Used for solenoids, valves, and cylinders.
- **Toggle** — Click to alternate between `true` and `false`. Used for pumps and motors.
- **Numeric/String/Enum** — Text or numeric input with on-screen keypads for touchscreen use.

### Configure Mode

Engineers can click **Configure** to enter edit mode, where they can:
- Override the default control mode for individual tags (momentary vs toggle).
- Reorder controls within groups using arrow buttons.
- Settings are persisted server-side.

> **Note:** Only tags with the "Service", "Input", or "Output" labels appear on this page. Assign labels in Settings > Tags.

---

## Support and Diagnostics

The Support page provides system monitoring, log viewing, and software update management.

### Support Dashboard

The first tab shows a customizable support dashboard screen. Designers can add widgets (status indicators, gauges, alarm summaries) to display system health metrics. This screen works like any other HMI screen — enter design mode with Ctrl+E to add and configure widgets.

### Application Logs

1. Switch to the **Application Logs** tab.
2. View real-time application log entries from the backend.
3. Filter by log level: **DEBUG**, **INFO**, **WARNING**, **ERROR**, **CRITICAL**.
4. Search logs by keyword.
5. Enable **Auto-refresh** to stream new log entries as they arrive.

### ZPL Label Preview

1. Switch to the **ZPL Preview** tab.
2. Enter ZPL code in the text editor or upload a `.zpl` file (drag-and-drop supported).
3. Select a **DPI** (152, 203, 300, or 600) to match your target printer.
4. The label is rendered as a PNG image in the preview pane using the backend's offline renderer (Pillow-based, no internet required).
5. Click **Download** to save the rendered image.

The renderer supports text (`^FD`, `^A`, `^FB`), barcodes (Code 128, Code 39), QR codes (`^BQ`), graphics (`^GB`, `^GC`, `^GD`, `^GF`), rotation (`^FW`), reverse fields (`^FR`, `^LR`), hex escapes (`^FH`), and compressed graphic fields (`:Z64:`, `:B64:`).

### Software Update

1. Switch to the **Software Update** tab.
2. The page displays current system information: version, platform, uptime, and install path.
3. To apply an update:
   - Click **Select Update Package** and browse to a deployment archive (`.tar.gz` or `.zip`).
   - The package is validated — the UI shows what's included (backend, frontend, wheels).
   - Click **Apply Update** and confirm.
   - The system applies the update and restarts automatically.
4. The update is recorded in the audit trail.

> See the [Deployment Guide](deployment.md#updating-an-existing-installation) for full details on the update process and what is preserved.

---

## Configuring Integrations

Integrations connect the HMI to third-party equipment like Zebra label printers, Cognex barcode readers, and FTP file watchers. Each integration runs as a background service that creates "virtual tags" — these appear alongside PLC tags everywhere in the HMI (dashboards, alarms, trends) and update in real time. For example, a Zebra printer integration creates tags like `zebra.status`, `zebra.paper_out`, and `zebra.labels_in_queue`.

### Adding an Integration

1. Go to **Settings** > **Integrations** tab.
2. Click **+ Add Integration**.
3. Choose an integration type from the available list (e.g., Zebra Printer, Cognex DataMan, FTP Hot Folder).
4. Enter a **name** and configure the type-specific settings (IP address, port, poll interval, tag prefix).
5. Click **Save**.

### Enabling and Disabling

- Toggle the **Enabled** switch on an integration row to start or stop it.
- Enabled integrations connect automatically on HMI startup.
- The status column shows **Running**, **Stopped**, or **Error** with a message.

### Using Integration Tags

Once an integration is running, its virtual tags appear in the tag list alongside PLC tags. You can:
- Bind them to dashboard widgets (e.g., show printer status on a status indicator).
- Enable trending to record historical data.
- Configure alarms on integration tags (e.g., alert when a printer reports "Paper Out").

For example, a Zebra Printer integration with prefix `zebra` provides tags like `zebra.status`, `zebra.paper_out`, `zebra.labels_in_queue` — all updated in real time.

---

## Settings Page Overview

The Settings page is the central configuration hub, organized into tabs:

| Tab | Purpose |
|-----|---------|
| **Branding** | Customize the application title, navigation title, favicon, and accent color theme |
| **Preferences** | User display preferences (theme, accent color) |
| **Tags** | Create, edit, delete, and bulk-manage data points. Configure data types, addresses, alarms, trending, simulation, and enum mappings |
| **Data Sources** | Add and configure PLC connections (OPC-UA, Modbus, EtherNet/IP, MQTT, Simulation) with test and browse capabilities |
| **Integrations** | Manage third-party equipment connections (printers, scanners, file watchers) |
| **Reporting** | Configure shift schedules (manual or automatic), tag bindings for production tracking, top bar machine controls, and manage downtime reason codes |
| **Users** | Create and manage user accounts, set roles and credentials |
| **Audit Trail** | Browse all configuration changes with timestamps, usernames, actions, and source IPs. Filter and export to CSV |

---

## Managing Users

User management requires the **Supervisor** role or higher. Go to **Settings** > **Users**.

### Adding a User

1. Click **+ Add User**.
2. Enter **username**, **display name**, and **password** (or PIN for operator/supervisor roles).
3. Select a **role**:
   - **Operator** — View dashboards, acknowledge alarms, view trends/reports.
   - **Supervisor** — All operator abilities + manage jobs, view users.
   - **Engineer** — All supervisor abilities + configure tags, data sources, alarms.
   - **Designer** — All engineer abilities + create and edit screens.
4. Click **Save**.

### Editing or Disabling a User

- Click a user row to edit their display name, password, or role.
- Toggle the **Active** flag to disable a user without deleting them.
- Delete a user permanently from the edit dialog (requires Engineer role).

---

## Audit Trail

All configuration changes are logged with timestamps, usernames, actions, and source IPs.

1. Go to **Settings** > **Audit Trail** tab.
2. Browse logged actions: logins, tag changes, screen saves, user edits, job downloads, etc.
3. Filter by **action type** using the dropdown.
4. **Search** by keyword across all audit fields.
5. Click **Export CSV** to download the full audit log.
