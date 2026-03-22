# Deployment to Panel PCs

This guide covers packaging the HMI for installation on industrial panel PCs, touchscreens, and embedded PCs. The deployment process creates a self-contained archive with everything needed — the HMI application, all libraries, and optionally a bundled Python runtime and Chromium browser. **No internet connection, Python, Node.js, or any other software is needed on the target machine.**

This is similar to deploying a compiled PLC runtime or a packaged HMI application — you build the package on your development machine and transfer it to the panel PC via USB, SCP, or network share.

## Prerequisites (Build Machine)

The packaging step runs on your **development machine** (the same machine where you develop and test). It needs internet access to download platform-specific bundles:

| Requirement | Purpose |
|-------------|---------|
| Python 3.10+ | Packages the backend and downloads dependency bundles |
| Node.js 18+ | Compiles the browser UI for production |
| `pip` | Downloads offline dependency packages (Python's package manager) |
| `curl` | Downloads the standalone Python interpreter for the target |
| `zip` (optional) | Creates `.zip` archive for Windows targets |
| `pyinstaller` (optional) | Only needed with `--compile` flag to create a single executable (`pip install pyinstaller`) |

## Prerequisites (Target Panel PC)

**None** — by default, the deployment package includes everything. The target machine needs no pre-installed software, no internet connection, and no special configuration.

When using `--compile`, the backend is compiled into a single native executable — no Python interpreter or source files are present on the target at all.

If you specifically build with `--no-bundle-python`, the target machine must have Python 3.11+ installed:

| Platform | Requirement (only with `--no-bundle-python`) |
|----------|-------------|
| **Linux** | Python 3.11+ (`sudo apt install python3 python3-venv`) |
| **Windows** | Python 3.11+ on PATH ([python.org](https://www.python.org/downloads/)) |

## Step 1: Create the Deployment Package

On your development machine, run one of the following commands. The script automatically builds the frontend, packages the backend, downloads all dependencies, and creates an archive file:

```bash
# Linux x86_64 (default — bundles Python interpreter)
./deploy.sh

# Linux + Windows targets
./deploy.sh --windows

# Include Linux ARM (aarch64) support (e.g., Raspberry Pi)
./deploy.sh --arm

# All platforms
./deploy.sh --windows --arm

# Compile backend with PyInstaller (no .py source on target)
./deploy.sh --compile

# Skip bundling Python (target must have Python 3.11+ installed)
./deploy.sh --no-bundle-python

# Override the bundled Python version (default: 3.11.13)
./deploy.sh --python-version 3.12.8

# Bundle Chromium for kiosk mode (no browser needed on target)
./deploy.sh --chromium

# All platforms with kiosk mode
./deploy.sh --windows --arm --chromium
```

### `deploy.sh` Flags

| Flag | Description |
|------|-------------|
| *(none)* | Build for Linux x86_64 with bundled Python (default) |
| `--compile` | Compile backend into a native executable with PyInstaller. No `.py` source code, Python interpreter, wheels, or venv on the target — just a single `hmi-server` binary. Requires `pyinstaller` on the build machine |
| `--windows` | Also build a Windows x86_64 package (downloads Windows-specific wheels and bundles a Windows Python interpreter) |
| `--arm` | Also include a Linux aarch64 (ARM) Python interpreter for Raspberry Pi and ARM-based panel PCs |
| `--no-bundle-python` | Skip bundling the standalone Python interpreter. The target machine must have Python 3.11+ pre-installed |
| `--python-version X.Y.Z` | Override the bundled Python version (default: `3.11.13`). Must match a release available from [python-build-standalone](https://github.com/astral-sh/python-build-standalone/releases) |
| `--chromium` | Bundle Chrome for Testing for kiosk mode deployment. Creates `start-kiosk.sh` / `start-kiosk.bat` and a `hmi-kiosk.service` systemd unit. No browser needs to be pre-installed on the target |
| `--chromium-version X.Y.Z.W` | Override the bundled Chromium version (default: `136.0.7103.92`). Must match a [Chrome for Testing](https://googlechromelabs.github.io/chrome-for-testing/) release |

Flags can be combined freely (e.g., `./deploy.sh --windows --arm --chromium --python-version 3.12.8`).

The script performs these steps automatically:
1. Builds the browser UI into optimized production files
2. Packages the backend — either copies the Python source files (default) or compiles into a single native executable (`--compile`)
3. Downloads all Python library dependencies as offline packages (skipped with `--compile`)
4. Downloads Windows-specific library packages (when `--windows` is specified)
5. Bundles a standalone Python interpreter for each target platform (skipped with `--compile` or `--no-bundle-python`)
6. Downloads and bundles a Chromium browser for kiosk mode (when `--chromium` is specified)
7. Generates platform-specific install scripts (`install.sh` and `install.bat`)
8. Creates deployment archives in `dist/`:
   - `dist/hmi-<version>.tar.gz` — Linux deployment package (always created)
   - `dist/hmi-<version>-windows.zip` — Windows deployment package (when `--windows` is used)

> **Versioning:** Packages are automatically versioned using the date format `YYYY.MM.DD.N` (e.g., `2026.03.21.1`). The version number is written to the `.env` configuration file during installation and displayed on the Support page.

## Step 2: Deploy to the Target

Transfer the archive file to the panel PC using any method — USB drive, SCP, network share, etc.

### Linux Panel PC

```bash
# 1. Copy the archive to the panel PC
scp dist/hmi-*.tar.gz user@panel-pc:/tmp/
# Or: copy to USB drive and mount on the panel PC

# 2. On the panel PC, extract the archive
tar -xzf /tmp/hmi-*.tar.gz

# 3. Run the installer (installs to /opt/hmi by default)
cd hmi-release
sudo ./install.sh

# Or specify a custom install location
sudo ./install.sh /home/hmi/app
```

| Argument | Description |
|----------|-------------|
| *(none)* | Install to `/opt/hmi` (default) |
| `<path>` | Install to a custom directory (e.g., `sudo ./install.sh /home/hmi/app`) |

The Linux installer handles everything automatically:
- Sets up the bundled Python interpreter (no system Python needed)
- Installs all software dependencies from the bundled packages (fully offline)
- Copies the application files and compiled browser UI
- Generates a `.env` configuration file with a random security key
- Creates a **systemd service** (`hmi.service`) so the HMI starts automatically on boot and restarts if it crashes
- Populates the database with default users and demo tags
- Creates helper scripts (`start.sh` for manual start, `seed.sh` to reset demo data)

**After installation:**

```bash
# Start as a systemd service (auto-starts on boot)
sudo systemctl enable --now hmi

# Or start manually
/opt/hmi/start.sh

# Re-seed the database
/opt/hmi/seed.sh

# View logs
journalctl -u hmi -f

# Stop the service
sudo systemctl stop hmi
```

### Windows Panel PC

1. Copy `dist/hmi-<timestamp>-windows.zip` to the panel PC (USB drive, network share, etc.)
2. Extract the archive (right-click > "Extract All" or use 7-Zip)
3. Open **Command Prompt as Administrator** in the `hmi-release` folder
4. Run the installer:

```cmd
install.bat

REM Or specify a custom install location
install.bat D:\hmi
```

| Argument | Description |
|----------|-------------|
| *(none)* | Install to `C:\hmi` (default) |
| `<path>` | Install to a custom directory (e.g., `install.bat D:\hmi`) |

The Windows installer handles everything automatically:
- Sets up the bundled Python interpreter (no system Python needed)
- Installs all software dependencies from the bundled packages (fully offline)
- Copies the application files and compiled browser UI
- Generates a `.env` configuration file with a random security key
- Creates a **Windows Firewall** rule to allow incoming connections on port 8080 (so other machines on the network can access the HMI)
- Populates the database with default users and demo tags
- Creates helper scripts (`start.bat` for manual start, `seed.bat` to reset demo data)

**After installation:**

```cmd
REM Start manually
C:\hmi\start.bat

REM Re-seed the database
C:\hmi\seed.bat
```

**Running as a Windows Service (recommended for production):**

For production use, the HMI should run as a Windows service so it starts automatically on boot and keeps running even when no user is logged in. Use [NSSM](https://nssm.cc/) (a free tool for creating Windows services from any executable):

```cmd
REM Install NSSM, then register the service:
nssm install HMI_Server "C:\hmi\venv\Scripts\python.exe" run.py
nssm set HMI_Server AppDirectory "C:\hmi"
nssm set HMI_Server AppEnvironmentExtra "PATH=C:\hmi\venv\Scripts;%PATH%"
nssm start HMI_Server

REM Or use Task Scheduler to run start.bat at logon
```

## Post-Deployment Verification

After installation on either platform, verify that everything is working:

1. **Open a browser** on the panel PC and navigate to `http://localhost:8080`
2. **Log in** with the default credentials: username `admin`, password `admin`
3. **Check the connection** — the "Connected" indicator in the header should show green (this means the live data link between the browser and the server is working)
4. **Verify tag data** — navigate to the Dashboard and confirm simulated tag values are updating every 500ms

To access the HMI from another machine on the network, use the panel PC's IP address instead of `localhost` (e.g., `http://192.168.1.100:8080`). Multiple browsers can connect simultaneously.

## Kiosk Mode Deployment

Kiosk mode is for dedicated panel PCs where the HMI should fill the entire screen with no browser chrome (no address bar, no tabs, no minimize/close buttons) — just like a traditional embedded HMI. When the deployment package is built with `--chromium`, it bundles a dedicated Chromium browser so the target machine doesn't need any browser pre-installed.

### Linux Kiosk

After installing with a Chromium-bundled package, you get two additional files:

- **`start-kiosk.sh`** — Launches the HMI server and opens Chromium in fullscreen kiosk mode
- **`hmi-kiosk.service`** — A systemd unit that runs the kiosk on boot (requires auto-login configured on the target)

```bash
# Start kiosk manually
/opt/hmi/start-kiosk.sh

# Start in windowed mode (useful for testing)
/opt/hmi/start-kiosk.sh --windowed

# Use a custom URL (e.g., when accessing via network)
HMI_KIOSK_URL=http://192.168.1.100:8080 /opt/hmi/start-kiosk.sh

# Enable as a systemd service (starts on boot)
sudo systemctl enable --now hmi-kiosk
```

> **Note:** The `hmi-kiosk` service replaces the standard `hmi` service — use one or the other, not both. The kiosk service starts the HMI server and Chromium together.

### Windows Kiosk

```cmd
REM Start kiosk manually
C:\hmi\start-kiosk.bat
```

The Windows kiosk script launches the HMI server and opens Chromium in fullscreen mode. For auto-start on boot, add `start-kiosk.bat` to Task Scheduler or use NSSM.

## Updating an Existing Installation

Updates can be applied **directly from the HMI's web interface** (recommended) or via the command line. Both methods perform a safe in-place upgrade — the application code is replaced while **all operational data is preserved** (screens, tags, trend history, alarm history, users, jobs, audit logs, etc.).

### What Is Preserved During Updates

**Source-mode installations:**

| Preserved (never overwritten) | Replaced (updated) |
|-------------------------------|---------------------|
| `.env` (configuration & secret key) | `app/` (backend source code) |
| `data/hmi.db` (database: trends, jobs, screens, alarms, users, audit trail, production runs) | `static/` (frontend build) |
| `media/` (uploaded fault help images) | `requirements.txt` |
| `venv/` (updated only if new wheels bundled) | `run.py`, `start.*`, `seed.*` |
| systemd service / NSSM config | |

**Compiled-mode installations** (`--compile`):

| Preserved (never overwritten) | Replaced (updated) |
|-------------------------------|---------------------|
| `.env` (configuration & secret key) | `hmi-server` binary (or `.exe`) |
| `data/hmi.db` (database) | `_internal/` (bundled runtime + frontend) |
| `media/` (uploaded images) | |
| systemd service / NSSM config | |

The SQLite database file contains all your operational data — trend history, job/recipe definitions, screen layouts, alarm history, user accounts, audit logs, and production records. It is stored in the `data/` subdirectory and is **never overwritten or deleted** during an update. Think of it like the retain memory in a PLC — it survives firmware updates.

> **Important:** Update packages must match the installation type — a compiled package can only be applied to a compiled installation, and a source package to a source installation. The system validates this automatically and rejects mismatched packages.

### Method 1: In-HMI Update (Recommended)

The HMI includes a built-in **Software Update** feature on the Support page. Engineers and designers can apply updates directly from the running HMI — no command line, SSH, or terminal access required. Just upload the package file through the web interface.

1. Build a deployment package on your development machine (`./deploy.sh` or `./deploy.sh --compile`)
2. Copy the `.tar.gz` or `.zip` file to the panel PC (USB drive, network share, or any local folder)
3. In the HMI, navigate to **Support** > **Software Update**
4. Click **Select Update Package** and browse to the deployment archive
5. The package is automatically **validated** — the UI shows what's included (package type, backend, frontend, wheels) and confirms the package structure is correct
6. Review the validation results, then click **Apply Update**
7. The update is applied and the **system restarts automatically**
8. The page reloads when the server is back online (typically within a few seconds)

The update is recorded in the **Audit Trail** with the filename, size, package mode (source/compiled), and what was updated.

> **Note:** The Software Update tab displays current system information (version, platform, uptime, install type, install path) so you can verify what version is running. The install type shows whether the system is running in source or compiled mode.

### Method 2: Command-Line Update

For headless deployments or when the HMI is not accessible, updates can be applied via the command line.

**Linux Panel PC:**

```bash
# 1. Mount USB drive (if applicable)
sudo mount /dev/sdb1 /mnt/usb

# 2. Extract the update package to a temporary location
tar -xzf /mnt/usb/hmi-*.tar.gz -C /tmp/

# 3. Stop the running service
sudo systemctl stop hmi

# 4. Run the installer (same command as initial install)
cd /tmp/hmi-release
sudo ./install.sh          # uses existing /opt/hmi install path

# 5. Restart the service
sudo systemctl start hmi

# 6. Unmount USB
sudo umount /mnt/usb
```

**Windows Panel PC:**

1. Insert the USB drive or copy the `.zip` to a local folder
2. Extract the archive (right-click > "Extract All")
3. Stop the HMI:
   - If running as a service: `nssm stop HMI_Server`
   - If running manually: close the `start.bat` window
4. Open **Command Prompt as Administrator** in the extracted `hmi-release` folder
5. Run the installer:

```cmd
install.bat
REM Uses existing C:\hmi install path by default
```

6. Restart:
   - Service: `nssm start HMI_Server`
   - Manual: `C:\hmi\start.bat`

### Verifying the Update

After updating (via either method), verify the new version is running:

1. Open `http://localhost:8080` in a browser
2. Log in and confirm the application loads correctly
3. Go to **Support** > **Software Update** to confirm the reported version
4. Check that existing screens, trend data, jobs, and alarms are intact
5. Verify the WebSocket "Connected" indicator is green

### Rollback

If an update causes issues, you can restore the previous version:

1. Stop the service (or use the in-HMI update to apply the previous package)
2. Re-run the installer using the **previous** deployment package (keep old archives as backups)
3. Restart the service — the database and configuration are untouched by both the update and the rollback

## Production Configuration

For production panel PC deployments, review these settings in the `.env` file at the install location. The `.env` file is a plain text file with `NAME=VALUE` pairs — similar to PLC system parameters:

| Variable | Recommendation |
|----------|----------------|
| `HMI_SECRET_KEY` | Auto-generated during install — keep the generated value (this secures login tokens) |
| `HMI_DEBUG` | Set to `false` (default) — never enable on production systems |
| `HMI_HOST` | `0.0.0.0` to accept connections from any network interface (default) |
| `HMI_PORT` | `8080` (default) — change if needed, and update firewall rules accordingly |
| `HMI_ACCESS_TOKEN_EXPIRE_MINUTES` | `480` (8 hours) — adjust to match your shift length |
| `HMI_AUTO_LOGOUT_MINUTES` | `30` (default) — minutes of inactivity before the browser auto-logs out the user |
| `HMI_WS_UPDATE_INTERVAL_MS` | `500` (twice per second) — lower for faster updates, higher to reduce CPU load on low-power devices |
| `HMI_TREND_RETENTION_DAYS` | `90` — increase for longer history, but monitor disk usage on devices with limited storage |
| `HMI_APP_VERSION` | Auto-set during install/update — do not edit manually |

## Deployment Directory Structure

After installation, the target machine will have:

**Source mode** (default):
```
/opt/hmi/                          # Linux (or C:\hmi on Windows)
├── venv/                          # Python virtual environment
├── app/                           # Backend application
│   ├── api/                       # Route handlers
│   ├── core/                      # Config, database, security
│   ├── drivers/                   # PLC protocol drivers
│   ├── integrations/              # Plugin integrations (Zebra, Cognex, etc.)
│   ├── models/                    # Database models
│   ├── services/                  # Business logic
│   ├── main.py                    # FastAPI entry point
│   └── seed.py                    # Database seeder
├── static/                        # Built frontend (served by FastAPI)
│   ├── assets/                    # JS, CSS bundles
│   └── index.html                 # SPA entry point
├── data/
│   └── hmi.db                     # SQLite database
├── media/                         # Uploaded fault help images
│   └── fault_help/
├── run.py                         # Server entry point
├── requirements.txt               # Python dependencies list
├── .env                           # Environment configuration
├── start.sh (or start.bat)        # Manual start script
├── seed.sh (or seed.bat)          # Database seed script
├── start-kiosk.sh (or .bat)       # Kiosk launcher (if --chromium was used)
└── chromium/                      # Bundled browser (if --chromium was used)
```

**Compiled mode** (`--compile`):
```
/opt/hmi/                          # Linux (or C:\hmi on Windows)
├── hmi-server                     # Compiled executable (hmi-server.exe on Windows)
├── _internal/                     # Bundled runtime (opaque — no .py source)
├── data/
│   └── hmi.db                     # SQLite database
├── media/                         # Uploaded fault help images
│   └── fault_help/
├── .env                           # Environment configuration
├── start.sh (or start.bat)        # Manual start script
├── start-kiosk.sh (or .bat)       # Kiosk launcher (if --chromium was used)
└── chromium/                      # Bundled browser (if --chromium was used)
```
