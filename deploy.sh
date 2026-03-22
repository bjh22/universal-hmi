#!/usr/bin/env bash
set -euo pipefail

#
# deploy.sh — Package the HMI for offline deployment to industrial panel PCs
#
# Usage:
#   ./deploy.sh                       # Build for Linux x86_64 (with bundled Python)
#   ./deploy.sh --compile             # Compile backend with PyInstaller (no .py source)
#   ./deploy.sh --windows             # Also include Windows x86_64
#   ./deploy.sh --arm                 # Also include Linux aarch64 (ARM)
#   ./deploy.sh --no-bundle-python    # Skip bundling Python (target must have Python)
#   ./deploy.sh --python-version 3.12.8  # Override Python version (default: 3.11.13)
#   ./deploy.sh --chromium             # Bundle Chromium browser for kiosk mode
#
# Output: dist/hmi-<version>.tar.gz  (always)
#         dist/hmi-<version>.zip     (when --windows)
#
# Python is bundled from python-build-standalone (astral-sh) by default,
# so target machines do NOT need Python pre-installed.
#

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
# CalVer: YYYY.MM.DD.N where N = number of git commits today + 1
CALVER_DATE=$(date +%Y.%m.%d)
if [ -d "$ROOT_DIR/.git" ]; then
    DAILY_COMMITS=$(git -C "$ROOT_DIR" log --oneline --since="$(date +%Y-%m-%d) 00:00:00" 2>/dev/null | wc -l | tr -d ' ')
else
    DAILY_COMMITS=0
fi
APP_VERSION="${CALVER_DATE}.$((DAILY_COMMITS + 1))"
VERSION="$APP_VERSION"
DIST_DIR="$ROOT_DIR/dist"
RELEASE_DIR="$DIST_DIR/hmi-release"
BUILD_WINDOWS=false
BUILD_ARM=false
BUNDLE_PYTHON=true
COMPILE=false
BUNDLE_CHROMIUM=false
PYTHON_VERSION="3.11.13"
# python-build-standalone release tag (date-based)
PBS_RELEASE="20250828"
# Chrome for Testing version (stable channel)
CHROMIUM_VERSION="136.0.7103.92"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --windows) BUILD_WINDOWS=true ;;
        --arm) BUILD_ARM=true ;;
        --compile) COMPILE=true ;;
        --no-bundle-python) BUNDLE_PYTHON=false ;;
        --chromium) BUNDLE_CHROMIUM=true ;;
        --python-version)
            shift
            PYTHON_VERSION="$1"
            ;;
        --chromium-version)
            shift
            CHROMIUM_VERSION="$1"
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: ./deploy.sh [--compile] [--windows] [--arm] [--no-bundle-python] [--python-version X.Y.Z] [--chromium] [--chromium-version X.Y.Z.W]"
            exit 1
            ;;
    esac
    shift
done

# Derive Python major.minor for wheel downloads
PYTHON_MAJOR_MINOR="${PYTHON_VERSION%.*}"

echo "============================================"
echo "  HMI Deployment Packager"
echo "  Version: $VERSION"
echo -n "  Targets: Linux x86_64"
$BUILD_ARM && echo -n " + Linux aarch64"
$BUILD_WINDOWS && echo -n " + Windows x86_64"
echo
if $COMPILE; then
echo "  Backend: compiled (PyInstaller) — no .py source in output"
elif $BUNDLE_PYTHON; then
echo "  Python:  $PYTHON_VERSION (bundled)"
else
echo "  Python:  not bundled (target must have Python $PYTHON_MAJOR_MINOR+)"
fi
if $BUNDLE_CHROMIUM; then
echo "  Chromium: $CHROMIUM_VERSION (bundled for kiosk mode)"
fi
echo "============================================"
echo

# Clean previous build
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"

# ──────────────────────────────────────────────
# Calculate total steps
# ──────────────────────────────────────────────
STEP_TOTAL=5
$BUILD_ARM && STEP_TOTAL=$((STEP_TOTAL + 1))
$BUILD_WINDOWS && STEP_TOTAL=$((STEP_TOTAL + 1))
$BUNDLE_PYTHON && STEP_TOTAL=$((STEP_TOTAL + 1))
$BUNDLE_CHROMIUM && STEP_TOTAL=$((STEP_TOTAL + 1))
STEP=1

# ──────────────────────────────────────────────
# 1. Build frontend
# ──────────────────────────────────────────────
echo "==> [$STEP/$STEP_TOTAL] Building frontend..."
cd "$ROOT_DIR/frontend"
npm run build
echo "    Frontend built successfully."

# ──────────────────────────────────────────────
# 2. Package backend (source copy or PyInstaller compile)
# ──────────────────────────────────────────────
STEP=$((STEP + 1))
if $COMPILE; then
    echo "==> [$STEP/$STEP_TOTAL] Compiling backend with PyInstaller..."

    # Copy frontend build into backend/static so PyInstaller bundles it
    rm -rf "$ROOT_DIR/backend/static"
    cp -r "$ROOT_DIR/frontend/dist" "$ROOT_DIR/backend/static"

    cd "$ROOT_DIR/backend"
    pyinstaller hmi-server.spec --distpath "$RELEASE_DIR" --workpath "/tmp/hmi-pyinstaller-build" --noconfirm
    echo "    Backend compiled successfully."

    # Clean up the temporary static dir from backend/
    rm -rf "$ROOT_DIR/backend/static"
else
    echo "==> [$STEP/$STEP_TOTAL] Copying backend..."
    mkdir -p "$RELEASE_DIR/backend"
    cp -r "$ROOT_DIR/backend/app" "$RELEASE_DIR/backend/app"
    cp "$ROOT_DIR/backend/run.py" "$RELEASE_DIR/backend/"
    cp "$ROOT_DIR/backend/requirements.txt" "$RELEASE_DIR/backend/"

    # Copy built frontend into backend/static for production serving
    cp -r "$ROOT_DIR/frontend/dist" "$RELEASE_DIR/backend/static"
    echo "    Backend and static files copied."
fi

# ──────────────────────────────────────────────
# 3. Download Linux Python wheels for offline install
#    (skipped when --compile: dependencies are inside the executable)
# ──────────────────────────────────────────────

# Helper: download wheels for a given set of platform tags.
# Downloads each requirement individually so one sdist-only package
# (e.g. pyftpdlib) doesn't block all others. Falls back to source
# distributions for packages without binary wheels.
download_wheels_for_platforms() {
    local DEST_DIR="$1"
    shift
    local PLATFORM_ARGS=("$@")

    mkdir -p "$DEST_DIR"
    while IFS= read -r req; do
        # Skip empty lines and comments
        [[ -z "$req" || "$req" =~ ^[[:space:]]*# ]] && continue
        # Try binary wheel with platform tags (includes transitive deps)
        pip download "$req" \
            -d "$DEST_DIR" \
            "${PLATFORM_ARGS[@]}" \
            --python-version "$PYTHON_MAJOR_MINOR" \
            --only-binary=:all: \
            2>/dev/null || \
        # Fallback: download source and build into a wheel so the target
        # doesn't need setuptools or a compiler
        {
            local TMPSDIST
            TMPSDIST=$(mktemp -d)
            pip download "$req" \
                -d "$TMPSDIST" \
                --no-deps \
                --no-binary=:all: \
                2>/dev/null && \
            pip wheel "$TMPSDIST"/*.tar.gz \
                --no-deps \
                --wheel-dir "$DEST_DIR" \
                2>/dev/null && \
            rm -rf "$TMPSDIST"
        } || \
        echo "    WARNING: Could not download $req"
    done < "$ROOT_DIR/backend/requirements.txt"
    echo "    Downloaded $(ls -1 "$DEST_DIR/" 2>/dev/null | wc -l | tr -d ' ') packages."
}

if $COMPILE; then
    echo "    Skipping wheel download (compiled mode)."
elif true; then
STEP=$((STEP + 1))
echo "==> [$STEP/$STEP_TOTAL] Downloading Linux x86_64 Python dependencies (wheels)..."
download_wheels_for_platforms "$RELEASE_DIR/wheels" \
    --platform manylinux_2_28_x86_64 \
    --platform manylinux_2_24_x86_64 \
    --platform manylinux_2_17_x86_64 \
    --platform manylinux2014_x86_64 \
    --platform linux_x86_64 \
    --platform any

# ──────────────────────────────────────────────
# 3b. Download Linux aarch64 (ARM) wheels (if requested)
# ──────────────────────────────────────────────
if $BUILD_ARM; then
    STEP=$((STEP + 1))
    echo "==> [$STEP/$STEP_TOTAL] Downloading Linux aarch64 Python dependencies (wheels)..."
    download_wheels_for_platforms "$RELEASE_DIR/wheels-arm" \
        --platform manylinux_2_28_aarch64 \
        --platform manylinux_2_24_aarch64 \
        --platform manylinux_2_17_aarch64 \
        --platform manylinux2014_aarch64 \
        --platform linux_aarch64 \
        --platform any
fi

# ──────────────────────────────────────────────
# 3c. Download Windows Python wheels (if requested)
# ──────────────────────────────────────────────
if $BUILD_WINDOWS; then
    STEP=$((STEP + 1))
    echo "==> [$STEP/$STEP_TOTAL] Downloading Windows Python dependencies (wheels)..."
    download_wheels_for_platforms "$RELEASE_DIR/wheels-windows" \
        --platform win_amd64 \
        --platform any
fi
fi  # end of: if $COMPILE ... elif true

# ──────────────────────────────────────────────
# 4. Bundle standalone Python interpreter (if enabled)
#    (skipped when --compile: Python is inside the executable)
# ──────────────────────────────────────────────
if $COMPILE; then
    echo "    Skipping Python bundling (compiled mode)."
elif $BUNDLE_PYTHON; then
    STEP=$((STEP + 1))
    echo "==> [$STEP/$STEP_TOTAL] Bundling standalone Python $PYTHON_VERSION..."

    PBS_BASE_URL="https://github.com/astral-sh/python-build-standalone/releases/download/$PBS_RELEASE"

    # Helper: download and extract a python-build-standalone archive
    download_python() {
        local TRIPLE="$1"        # e.g. x86_64-unknown-linux-gnu
        local DEST_DIR="$2"      # e.g. $RELEASE_DIR/python-linux-x86_64
        local ARCHIVE_NAME="cpython-${PYTHON_VERSION}+${PBS_RELEASE}-${TRIPLE}-install_only_stripped.tar.gz"
        local URL="${PBS_BASE_URL}/${ARCHIVE_NAME}"

        echo "    Downloading $ARCHIVE_NAME..."
        mkdir -p "$DEST_DIR"
        if ! curl -fSL --retry 4 --retry-delay 2 -o "/tmp/$ARCHIVE_NAME" "$URL"; then
            echo "    ERROR: Failed to download $URL"
            echo "    Check that Python $PYTHON_VERSION exists for $TRIPLE at:"
            echo "      https://github.com/astral-sh/python-build-standalone/releases/tag/$PBS_RELEASE"
            exit 1
        fi

        # python-build-standalone extracts to a 'python/' directory
        tar -xzf "/tmp/$ARCHIVE_NAME" -C "$DEST_DIR"
        rm -f "/tmp/$ARCHIVE_NAME"

        # Remove macOS resource fork files (._*) that break venv on Linux
        find "$DEST_DIR" -name '._*' -delete 2>/dev/null || true

        # Verify the extracted Python works (for native platform only)
        if [ -x "$DEST_DIR/python/bin/python3" ]; then
            local PY_VER
            PY_VER=$("$DEST_DIR/python/bin/python3" --version 2>&1 || true)
            echo "    Extracted: $PY_VER"
        else
            echo "    Extracted to $DEST_DIR/python/"
        fi
    }

    # Always bundle Linux x86_64
    echo "    --- Linux x86_64 ---"
    download_python "x86_64-unknown-linux-gnu" "$RELEASE_DIR/python-linux-x86_64"

    # Optionally bundle Linux aarch64
    if $BUILD_ARM; then
        echo "    --- Linux aarch64 ---"
        download_python "aarch64-unknown-linux-gnu" "$RELEASE_DIR/python-linux-aarch64"
    fi

    # Optionally bundle Windows x86_64
    if $BUILD_WINDOWS; then
        echo "    --- Windows x86_64 ---"
        download_python "x86_64-pc-windows-msvc" "$RELEASE_DIR/python-windows"
    fi

    echo "    Python bundling complete."
fi

# ──────────────────────────────────────────────
# 4b. Bundle Chromium browser (if enabled)
#     Downloads Chrome for Testing — a standalone build that needs no installation.
#     Used for kiosk mode on panel PCs without a pre-installed browser.
# ──────────────────────────────────────────────
if $BUNDLE_CHROMIUM; then
    STEP=$((STEP + 1))
    echo "==> [$STEP/$STEP_TOTAL] Bundling Chromium $CHROMIUM_VERSION..."

    CFT_BASE_URL="https://storage.googleapis.com/chrome-for-testing-public/${CHROMIUM_VERSION}"

    # Helper: download and extract Chrome for Testing
    download_chromium() {
        local PLATFORM="$1"   # e.g. linux64, win64
        local DEST_DIR="$2"
        local ARCHIVE_EXT="$3" # zip for all platforms
        local ARCHIVE_NAME="chrome-${PLATFORM}.${ARCHIVE_EXT}"
        local URL="${CFT_BASE_URL}/${PLATFORM}/${ARCHIVE_NAME}"

        echo "    Downloading $ARCHIVE_NAME..."
        mkdir -p "$DEST_DIR"
        if ! curl -fSL --retry 4 --retry-delay 2 -o "/tmp/$ARCHIVE_NAME" "$URL"; then
            echo "    ERROR: Failed to download $URL"
            echo "    Check that Chromium $CHROMIUM_VERSION exists for $PLATFORM at:"
            echo "      https://googlechromelabs.github.io/chrome-for-testing/"
            exit 1
        fi

        # Extract — Chrome for Testing ships as zip for all platforms
        unzip -qo "/tmp/$ARCHIVE_NAME" -d "$DEST_DIR"
        rm -f "/tmp/$ARCHIVE_NAME"

        echo "    Extracted to $DEST_DIR/"
    }

    # Drop a marker so install scripts know --chromium was requested.
    # On aarch64, the install script uses this marker to apt-install
    # chromium-browser instead of looking for a bundled binary.
    touch "$RELEASE_DIR/.chromium-kiosk"

    # Chrome for Testing does not publish linux-arm64 builds.
    # ARM targets get chromium-browser from apt at install time.
    if $BUILD_ARM; then
        echo "    Skipping Chromium download (ARM target uses system chromium-browser)."
    else
        echo "    --- Linux x86_64 ---"
        if [ -d "$RELEASE_DIR/chromium-linux-x86_64/chrome-linux64" ]; then
            echo "    Already exists, skipping download."
        else
            download_chromium "linux64" "$RELEASE_DIR/chromium-linux-x86_64" "zip"
        fi
    fi

    # Optionally bundle Windows x86_64
    if $BUILD_WINDOWS; then
        echo "    --- Windows x86_64 ---"
        if [ -d "$RELEASE_DIR/chromium-windows/chrome-win64" ]; then
            echo "    Already exists, skipping download."
        else
            download_chromium "win64" "$RELEASE_DIR/chromium-windows" "zip"
        fi
    fi

    echo "    Chromium bundling complete."
fi

# ──────────────────────────────────────────────
# 5. Create install scripts for target machines
# ──────────────────────────────────────────────
STEP=$((STEP + 1))
echo "==> [$STEP/$STEP_TOTAL] Generating install scripts..."

# Write version file so install scripts can read it
# (install scripts are inside single-quoted heredocs, so $APP_VERSION
#  can't be injected from deploy.sh — they read this file instead)
echo "$APP_VERSION" > "$RELEASE_DIR/VERSION"

if $COMPILE; then

# ── Compiled-mode Linux install script ──
cat > "$RELEASE_DIR/install.sh" << 'INSTALL_EOF'
#!/usr/bin/env bash
set -euo pipefail

#
# install.sh — Install compiled HMI on an offline Linux panel PC
#
# No prerequisites — Python and all dependencies are compiled into the binary.
#
# Usage:
#   sudo ./install.sh              # Install to /opt/hmi (default)
#   sudo ./install.sh /custom/path # Install to custom location
#

INSTALL_DIR="${1:-/opt/hmi}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_VERSION="$(cat "$SCRIPT_DIR/VERSION" 2>/dev/null || true)"
APP_VERSION="${APP_VERSION:-unknown}"

echo "============================================"
echo "  HMI Installer (Linux — compiled)"
echo "  Target: $INSTALL_DIR"
echo "============================================"
echo

# Create install directory
mkdir -p "$INSTALL_DIR"

# Copy compiled application
echo "==> Installing compiled application..."
cp -r "$SCRIPT_DIR/hmi-server/"* "$INSTALL_DIR/"
chmod +x "$INSTALL_DIR/hmi-server"

# Create data directories (writable by all so the app
# can run as any user, not just root)
mkdir -p "$INSTALL_DIR/data"
mkdir -p "$INSTALL_DIR/media/fault_help"
chmod 777 "$INSTALL_DIR/data" "$INSTALL_DIR/media" "$INSTALL_DIR/media/fault_help"

# Create environment file
if [ ! -f "$INSTALL_DIR/.env" ]; then
    SECRET_KEY=$(head -c 32 /dev/urandom | xxd -p)
    cat > "$INSTALL_DIR/.env" << ENV_EOF
HMI_DATABASE_URL=sqlite+aiosqlite:///$INSTALL_DIR/data/hmi.db
HMI_SECRET_KEY=$SECRET_KEY
HMI_HOST=0.0.0.0
HMI_PORT=8080
HMI_DEBUG=false
HMI_APP_VERSION=$APP_VERSION
ENV_EOF
    echo "    Created .env with generated secret key."
else
    echo "    Existing .env preserved."
fi
# Always update version in .env (even on upgrades)
if grep -q "^HMI_APP_VERSION=" "$INSTALL_DIR/.env" 2>/dev/null; then
    sed -i.bak "s/^HMI_APP_VERSION=.*/HMI_APP_VERSION=$APP_VERSION/" "$INSTALL_DIR/.env" && rm -f "$INSTALL_DIR/.env.bak"
else
    echo "HMI_APP_VERSION=$APP_VERSION" >> "$INSTALL_DIR/.env"
fi

# Create systemd service
if [ -d /etc/systemd/system ]; then
    cat > /etc/systemd/system/hmi.service << SERVICE_EOF
[Unit]
Description=Industrial HMI Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$INSTALL_DIR/.env
ExecStart=$INSTALL_DIR/hmi-server
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICE_EOF
    echo "    Created systemd service: hmi.service"
fi

# Create convenience start script
cat > "$INSTALL_DIR/start.sh" << 'START_EOF'
#!/usr/bin/env bash
cd "$(dirname "$0")"
./hmi-server
START_EOF
chmod +x "$INSTALL_DIR/start.sh"

# ── Install Chromium for kiosk mode (if present in package) ──
ARCH=$(uname -m)
CHROMIUM_SRC=""
KIOSK_ENABLED=false
if [ "$ARCH" = "x86_64" ] && [ -d "$SCRIPT_DIR/chromium-linux-x86_64" ]; then
    CHROMIUM_SRC="$SCRIPT_DIR/chromium-linux-x86_64/chrome-linux64"
fi

if [ -n "$CHROMIUM_SRC" ] && [ -d "$CHROMIUM_SRC" ]; then
    echo "==> Installing bundled Chromium..."
    cp -r "$CHROMIUM_SRC" "$INSTALL_DIR/chromium"
    chmod +x "$INSTALL_DIR/chromium/chrome"
    echo "    Chromium installed to $INSTALL_DIR/chromium/"
    KIOSK_ENABLED=true
elif [ "$ARCH" = "aarch64" ] && [ -f "$SCRIPT_DIR/.chromium-kiosk" ]; then
    # Chrome for Testing doesn't publish ARM builds — install from system packages
    echo "==> Installing Chromium from system packages (aarch64)..."
    if command -v apt-get > /dev/null 2>&1; then
        apt-get update -qq && apt-get install -y -qq chromium-browser 2>/dev/null \
            || apt-get install -y -qq chromium 2>/dev/null
    fi
    # Verify it's available
    if command -v chromium-browser > /dev/null 2>&1 || command -v chromium > /dev/null 2>&1; then
        echo "    Chromium installed from system packages."
        KIOSK_ENABLED=true
    else
        echo "    WARNING: Could not install Chromium. Install manually: apt install chromium-browser"
        echo "    Kiosk mode will not be available until Chromium is installed."
    fi
fi

if $KIOSK_ENABLED; then
    # Create kiosk launcher script
    cat > "$INSTALL_DIR/start-kiosk.sh" << 'KIOSK_EOF'
#!/usr/bin/env bash
#
# start-kiosk.sh — Launch HMI server + Chromium in kiosk mode
#
# Usage:
#   ./start-kiosk.sh                    # Fullscreen kiosk on http://localhost:8080
#   ./start-kiosk.sh --windowed         # Non-fullscreen window (for testing)
#   HMI_KIOSK_URL=http://x:8080 ./start-kiosk.sh  # Custom URL
#
cd "$(dirname "$0")"

HMI_URL="${HMI_KIOSK_URL:-http://localhost:8080}"
KIOSK_FLAGS="--kiosk"
CHROMIUM_DATA="$(pwd)/data/chromium-profile"

# Find Chromium binary: bundled takes priority, then system-installed
if [ -x "$(pwd)/chromium/chrome" ]; then
    CHROME_BIN="$(pwd)/chromium/chrome"
elif command -v chromium-browser > /dev/null 2>&1; then
    CHROME_BIN="chromium-browser"
elif command -v chromium > /dev/null 2>&1; then
    CHROME_BIN="chromium"
else
    echo "ERROR: Chromium not found. Install with: apt install chromium-browser"
    exit 1
fi

# Detect the desktop session user — Chromium must run as this user to
# access the display.  The HMI server can run as root, but the browser
# needs the session owner's display/dbus environment.
DESKTOP_USER=""
RUN_CHROME=""   # command prefix to run Chromium as the desktop user
if [ "$(id -u)" = "0" ]; then
    DESKTOP_USER=$(who 2>/dev/null | grep -v root | head -1 | awk '{print $1}')
    if [ -z "$DESKTOP_USER" ]; then
        # Fallback: check logind for graphical sessions
        DESKTOP_USER=$(loginctl list-sessions --no-legend 2>/dev/null \
            | awk '{print $3}' | grep -v root | head -1)
    fi
fi

for arg in "$@"; do
    case "$arg" in
        --windowed) KIOSK_FLAGS="--start-maximized" ;;
    esac
done

# Build the command prefix for launching Chromium
CHROME_EXTRA_FLAGS=""
if [ -n "$DESKTOP_USER" ]; then
    # Run Chromium as the desktop user so it inherits display access
    RUN_CHROME="sudo -u $DESKTOP_USER"
    echo "Running Chromium as user: $DESKTOP_USER"
else
    # Not root, or no desktop user found — run directly
    RUN_CHROME=""
    if [ "$(id -u)" = "0" ]; then
        CHROME_EXTRA_FLAGS="--no-sandbox"
        echo "WARNING: Running as root with no desktop user detected."
    fi
fi

# Default DISPLAY if not set (systemd won't have it)
export DISPLAY="${DISPLAY:-:0}"

# Force X11 rendering — Chromium's native Wayland support causes invisible
# windows on RPi OS Bookworm's labwc compositor.  XWayland is always available
# alongside Wayland on RPi OS, so --ozone-platform=x11 works in both cases.
DISPLAY_FLAGS="--ozone-platform=x11"

# Start the HMI server only if not already running (e.g. via hmi.service)
HMI_PID=""
if curl -sf http://localhost:8080/api/system/health > /dev/null 2>&1; then
    echo "HMI server already running on port 8080."
else
    ./hmi-server &
    HMI_PID=$!
    echo "Waiting for HMI server to start..."
    for i in $(seq 1 30); do
        if curl -sf http://localhost:8080/api/system/health > /dev/null 2>&1; then
            echo "HMI server is ready."
            break
        fi
        sleep 1
    done
fi

# Launch Chromium in kiosk mode
echo "Launching Chromium kiosk at $HMI_URL ($(basename "$CHROME_BIN"))..."
mkdir -p "$CHROMIUM_DATA"
chmod 777 "$CHROMIUM_DATA"
$RUN_CHROME "$CHROME_BIN" \
    $KIOSK_FLAGS \
    $CHROME_EXTRA_FLAGS \
    $DISPLAY_FLAGS \
    --disable-gpu \
    --no-first-run \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --disable-features=TranslateUI \
    --autoplay-policy=no-user-gesture-required \
    --user-data-dir="$CHROMIUM_DATA" \
    --disable-background-networking \
    --disable-sync \
    --disable-default-apps \
    --noerrdialogs \
    --disable-pinch \
    --overscroll-history-navigation=0 \
    "$HMI_URL" &
CHROME_PID=$!

# Wait for either process to exit, then clean up the other
cleanup() {
    kill $CHROME_PID 2>/dev/null
    [ -n "$HMI_PID" ] && kill $HMI_PID 2>/dev/null
    wait
}
trap cleanup EXIT INT TERM
if [ -n "$HMI_PID" ]; then
    wait -n $HMI_PID $CHROME_PID 2>/dev/null || true
else
    wait $CHROME_PID 2>/dev/null || true
fi
KIOSK_EOF
    chmod +x "$INSTALL_DIR/start-kiosk.sh"

    # Create systemd kiosk service (auto-login + chromium)
    if [ -d /etc/systemd/system ]; then
        cat > /etc/systemd/system/hmi-kiosk.service << SERVICE_EOF
[Unit]
Description=Industrial HMI Kiosk (Server + Chromium)
After=network.target graphical.target
Wants=graphical.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$INSTALL_DIR/.env
Environment=DISPLAY=:0
ExecStart=$INSTALL_DIR/start-kiosk.sh
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=graphical.target
SERVICE_EOF
        echo "    Created systemd service: hmi-kiosk.service"
    fi
fi

echo
echo "============================================"
echo "  Installation complete!"
echo "============================================"
echo
echo "  Install location: $INSTALL_DIR"
echo "  Database:         $INSTALL_DIR/data/hmi.db"
echo "  Config:           $INSTALL_DIR/.env"
echo
echo "  Start manually:   $INSTALL_DIR/start.sh"
echo "  Start as service: systemctl enable --now hmi"
if $KIOSK_ENABLED; then
echo
echo "  Kiosk mode:       $INSTALL_DIR/start-kiosk.sh"
echo "  Kiosk service:    systemctl enable --now hmi-kiosk"
fi
echo
echo "  Default login:    admin / admin"
echo "  URL:              http://localhost:8080"
echo
INSTALL_EOF
chmod +x "$RELEASE_DIR/install.sh"

# ── Compiled-mode Windows install script ──
cat > "$RELEASE_DIR/install.bat" << 'WININSTALL_EOF'
@echo off
setlocal enabledelayedexpansion

::
:: install.bat — Install compiled HMI on an offline Windows panel PC
::
:: No prerequisites — Python and all dependencies are compiled into the binary.
::
:: Usage:
::   install.bat                    Install to C:\hmi (default)
::   install.bat D:\hmi             Install to custom location
::
:: Run as Administrator for firewall configuration.
::

set "INSTALL_DIR=%~1"
if "%INSTALL_DIR%"=="" set "INSTALL_DIR=C:\hmi"
set "SCRIPT_DIR=%~dp0"
if exist "%SCRIPT_DIR%VERSION" (
    set /p APP_VERSION=<"%SCRIPT_DIR%VERSION"
) else (
    set "APP_VERSION=unknown"
)

echo ============================================
echo   HMI Installer (Windows — compiled)
echo   Target: %INSTALL_DIR%
echo ============================================
echo.

:: Create install directory
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

:: Copy compiled application
echo ==^> Installing compiled application...
xcopy /E /I /Y "%SCRIPT_DIR%hmi-server\*" "%INSTALL_DIR%\" >nul

:: Create data directories
if not exist "%INSTALL_DIR%\data" mkdir "%INSTALL_DIR%\data"
if not exist "%INSTALL_DIR%\media\fault_help" mkdir "%INSTALL_DIR%\media\fault_help"

:: Create environment file
if not exist "%INSTALL_DIR%\.env" (
    for /f "tokens=*" %%k in ('powershell -Command "[System.Guid]::NewGuid().ToString('N') + [System.Guid]::NewGuid().ToString('N')"') do set "SECRET_KEY=%%k"
    (
        echo HMI_DATABASE_URL=sqlite+aiosqlite:///%INSTALL_DIR:\=/%/data/hmi.db
        echo HMI_SECRET_KEY=!SECRET_KEY!
        echo HMI_HOST=0.0.0.0
        echo HMI_PORT=8080
        echo HMI_DEBUG=false
        echo HMI_APP_VERSION=!APP_VERSION!
    ) > "%INSTALL_DIR%\.env"
    echo     Created .env with generated secret key.
) else (
    echo     Existing .env preserved.
)
:: Always update version in .env (even on upgrades)
powershell -Command "$f='%INSTALL_DIR%\.env'; $c=Get-Content $f; if($c -match 'HMI_APP_VERSION='){$c=$c -replace 'HMI_APP_VERSION=.*','HMI_APP_VERSION=%APP_VERSION%'}else{$c+='HMI_APP_VERSION=%APP_VERSION%'}; Set-Content $f $c"

:: Create convenience scripts
(
    echo @echo off
    echo cd /d "%%~dp0"
    echo hmi-server.exe
) > "%INSTALL_DIR%\start.bat"

:: Install bundled Chromium (if present)
if exist "%SCRIPT_DIR%chromium-windows\chrome-win64\" (
    echo ==^> Installing bundled Chromium...
    xcopy /E /I /Y "%SCRIPT_DIR%chromium-windows\chrome-win64\*" "%INSTALL_DIR%\chromium\" >nul
    echo     Chromium installed to %INSTALL_DIR%\chromium\

    :: Create kiosk launcher script
    (
        echo @echo off
        echo :: start-kiosk.bat — Launch HMI server + Chromium in kiosk mode
        echo cd /d "%%~dp0"
        echo.
        echo :: Start HMI server in background
        echo start "" /B hmi-server.exe
        echo.
        echo :: Wait for server to be ready
        echo echo Waiting for HMI server to start...
        echo :wait_loop
        echo timeout /t 1 /nobreak ^>nul
        echo powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:8080/api/system/health' -UseBasicParsing -TimeoutSec 2; if($r.StatusCode -eq 200){exit 0} } catch { exit 1 }"
        echo if errorlevel 1 goto wait_loop
        echo echo HMI server is ready.
        echo.
        echo :: Launch Chromium in kiosk mode
        echo echo Launching Chromium kiosk...
        echo start "" "%%~dp0chromium\chrome.exe" --kiosk --no-first-run --disable-infobars --disable-session-crashed-bubble --disable-features=TranslateUI --autoplay-policy=no-user-gesture-required --user-data-dir="%%~dp0data\chromium-profile" --disable-background-networking --disable-sync --disable-default-apps --noerrdialogs --disable-pinch --overscroll-history-navigation=0 "http://localhost:8080"
    ) > "%INSTALL_DIR%\start-kiosk.bat"
    echo     Created start-kiosk.bat
)

:: Windows Service setup
echo.
echo     NOTE: To run as a Windows Service, use NSSM (recommended):
echo       nssm install HMI_Server "%INSTALL_DIR%\hmi-server.exe"
echo       nssm set HMI_Server AppDirectory "%INSTALL_DIR%"
echo       nssm start HMI_Server
echo.
echo     Or use Task Scheduler to run start.bat at logon.

:: Configure Windows Firewall rule
echo ==^> Configuring firewall...
netsh advfirewall firewall show rule name="HMI Server" >nul 2>&1
if errorlevel 1 (
    netsh advfirewall firewall add rule name="HMI Server" dir=in action=allow protocol=tcp localport=8080 >nul 2>&1
    if not errorlevel 1 (
        echo     Firewall rule added for port 8080.
    ) else (
        echo     Could not add firewall rule. Run as Administrator or add manually.
    )
) else (
    echo     Firewall rule already exists.
)

echo.
echo ============================================
echo   Installation complete!
echo ============================================
echo.
echo   Install location: %INSTALL_DIR%
echo   Database:         %INSTALL_DIR%\data\hmi.db
echo   Config:           %INSTALL_DIR%\.env
echo.
echo   Start manually:   %INSTALL_DIR%\start.bat
if exist "%INSTALL_DIR%\chromium\chrome.exe" (
echo   Kiosk mode:       %INSTALL_DIR%\start-kiosk.bat
)
echo.
echo   Default login:    admin / admin
echo   URL:              http://localhost:8080
echo.
pause
WININSTALL_EOF
echo "    Compiled install scripts created."

else
# ── Source-mode install scripts (original) ──

# --- Linux install script ---
cat > "$RELEASE_DIR/install.sh" << 'INSTALL_EOF'
#!/usr/bin/env bash
set -euo pipefail

#
# install.sh — Install HMI on an offline Linux panel PC
#
# If a bundled Python is included in this package, no prerequisites are needed.
# Otherwise, Python 3.11+ must be installed on the target machine.
#
# Usage:
#   sudo ./install.sh              # Install to /opt/hmi (default)
#   sudo ./install.sh /custom/path # Install to custom location
#

INSTALL_DIR="${1:-/opt/hmi}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_VERSION="$(cat "$SCRIPT_DIR/VERSION" 2>/dev/null || true)"
APP_VERSION="${APP_VERSION:-unknown}"

echo "============================================"
echo "  HMI Installer (Linux)"
echo "  Target: $INSTALL_DIR"
echo "============================================"
echo

# ── Resolve Python interpreter ──
# Prefer bundled Python (always used when present for version consistency).
# Falls back to system Python only when no bundle is included.
PYTHON_BIN=""
ARCH=$(uname -m)

if [ -d "$SCRIPT_DIR/python-linux-$ARCH/python" ]; then
    echo "==> Found bundled Python for $ARCH"
    BUNDLED_PYTHON_SRC="$SCRIPT_DIR/python-linux-$ARCH/python"
else
    BUNDLED_PYTHON_SRC=""
fi

if [ -n "$BUNDLED_PYTHON_SRC" ]; then
    # Install bundled Python to the install directory
    echo "==> Installing bundled Python..."
    mkdir -p "$INSTALL_DIR"
    cp -r "$BUNDLED_PYTHON_SRC" "$INSTALL_DIR/python"
    PYTHON_BIN="$INSTALL_DIR/python/bin/python3"
    PYTHON_VERSION=$("$PYTHON_BIN" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}")')
    echo "    Installed Python $PYTHON_VERSION"
elif command -v python3 &> /dev/null; then
    PYTHON_BIN="python3"
    PYTHON_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
    echo "==> Using system Python $PYTHON_VERSION"
    echo "    NOTE: No bundled Python found for $ARCH."
else
    echo "ERROR: No Python found."
    echo "  No bundled Python for architecture '$ARCH' was included in this package,"
    echo "  and no system Python 3 was found on PATH."
    echo
    echo "  Either rebuild the deployment package with Python bundled for your platform,"
    echo "  or install Python 3.11+ manually and retry."
    exit 1
fi

# Create install directory
mkdir -p "$INSTALL_DIR"

# Create virtual environment
echo "==> Creating virtual environment..."
"$PYTHON_BIN" -m venv "$INSTALL_DIR/venv"
source "$INSTALL_DIR/venv/bin/activate"

# Install dependencies from local wheels (offline)
echo "==> Installing Python dependencies (offline)..."
WHEEL_DIR="$SCRIPT_DIR/wheels"
if [ "$ARCH" = "aarch64" ] && [ -d "$SCRIPT_DIR/wheels-arm" ]; then
    echo "    Using aarch64 wheels."
    WHEEL_DIR="$SCRIPT_DIR/wheels-arm"
fi
pip install --no-index --find-links="$WHEEL_DIR" \
    -r "$SCRIPT_DIR/backend/requirements.txt"

# Copy application files
echo "==> Installing application files..."
cp -r "$SCRIPT_DIR/backend/"* "$INSTALL_DIR/"

# Create data directories (writable by all so the app
# can run as any user, not just root)
mkdir -p "$INSTALL_DIR/data"
mkdir -p "$INSTALL_DIR/media/fault_help"
chmod 777 "$INSTALL_DIR/data" "$INSTALL_DIR/media" "$INSTALL_DIR/media/fault_help"
# If database already exists from a prior install, ensure it's writable
[ -f "$INSTALL_DIR/data/hmi.db" ] && chmod 666 "$INSTALL_DIR/data/hmi.db"

# Create environment file
if [ ! -f "$INSTALL_DIR/.env" ]; then
    SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
    cat > "$INSTALL_DIR/.env" << ENV_EOF
HMI_DATABASE_URL=sqlite+aiosqlite:///$INSTALL_DIR/data/hmi.db
HMI_SECRET_KEY=$SECRET_KEY
HMI_HOST=0.0.0.0
HMI_PORT=8080
HMI_DEBUG=false
HMI_APP_VERSION=$APP_VERSION
ENV_EOF
    echo "    Created .env with generated secret key."
else
    echo "    Existing .env preserved."
fi
# Always update version in .env (even on upgrades)
if grep -q "^HMI_APP_VERSION=" "$INSTALL_DIR/.env" 2>/dev/null; then
    sed -i.bak "s/^HMI_APP_VERSION=.*/HMI_APP_VERSION=$APP_VERSION/" "$INSTALL_DIR/.env" && rm -f "$INSTALL_DIR/.env.bak"
else
    echo "HMI_APP_VERSION=$APP_VERSION" >> "$INSTALL_DIR/.env"
fi

# Create systemd service
if [ -d /etc/systemd/system ]; then
    cat > /etc/systemd/system/hmi.service << SERVICE_EOF
[Unit]
Description=Industrial HMI Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
Environment=PATH=$INSTALL_DIR/venv/bin:/usr/bin:/bin
EnvironmentFile=$INSTALL_DIR/.env
ExecStart=$INSTALL_DIR/venv/bin/python run.py
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICE_EOF
    echo "    Created systemd service: hmi.service"
fi

# Create convenience scripts
cat > "$INSTALL_DIR/start.sh" << 'START_EOF'
#!/usr/bin/env bash
cd "$(dirname "$0")"
source venv/bin/activate
python run.py
START_EOF
chmod +x "$INSTALL_DIR/start.sh"

cat > "$INSTALL_DIR/seed.sh" << 'SEED_EOF'
#!/usr/bin/env bash
cd "$(dirname "$0")"
source venv/bin/activate
python -m app.seed
SEED_EOF
chmod +x "$INSTALL_DIR/seed.sh"

# ── Install Chromium for kiosk mode (if present in package) ──
# NOTE: This must run BEFORE the seed step so that a seed failure
#       (which exits the script via set -e) does not skip kiosk setup.
ARCH=$(uname -m)
CHROMIUM_SRC=""
KIOSK_ENABLED=false
if [ "$ARCH" = "x86_64" ] && [ -d "$SCRIPT_DIR/chromium-linux-x86_64" ]; then
    CHROMIUM_SRC="$SCRIPT_DIR/chromium-linux-x86_64/chrome-linux64"
fi

if [ -n "$CHROMIUM_SRC" ] && [ -d "$CHROMIUM_SRC" ]; then
    echo "==> Installing bundled Chromium..."
    cp -r "$CHROMIUM_SRC" "$INSTALL_DIR/chromium"
    chmod +x "$INSTALL_DIR/chromium/chrome"
    echo "    Chromium installed to $INSTALL_DIR/chromium/"
    KIOSK_ENABLED=true
elif [ "$ARCH" = "aarch64" ] && [ -f "$SCRIPT_DIR/.chromium-kiosk" ]; then
    # Chrome for Testing doesn't publish ARM builds — install from system packages
    echo "==> Installing Chromium from system packages (aarch64)..."
    if command -v apt-get > /dev/null 2>&1; then
        apt-get update -qq && apt-get install -y -qq chromium-browser 2>/dev/null \
            || apt-get install -y -qq chromium 2>/dev/null
    fi
    # Verify it's available
    if command -v chromium-browser > /dev/null 2>&1 || command -v chromium > /dev/null 2>&1; then
        echo "    Chromium installed from system packages."
        KIOSK_ENABLED=true
    else
        echo "    WARNING: Could not install Chromium. Install manually: apt install chromium-browser"
        echo "    Kiosk mode will not be available until Chromium is installed."
    fi
fi

if $KIOSK_ENABLED; then
    # Create kiosk launcher script
    cat > "$INSTALL_DIR/start-kiosk.sh" << 'KIOSK_EOF'
#!/usr/bin/env bash
#
# start-kiosk.sh — Launch HMI server + Chromium in kiosk mode
#
# Usage:
#   ./start-kiosk.sh                    # Fullscreen kiosk on http://localhost:8080
#   ./start-kiosk.sh --windowed         # Non-fullscreen window (for testing)
#   HMI_KIOSK_URL=http://x:8080 ./start-kiosk.sh  # Custom URL
#
cd "$(dirname "$0")"

HMI_URL="${HMI_KIOSK_URL:-http://localhost:8080}"
KIOSK_FLAGS="--kiosk"
CHROMIUM_DATA="$(pwd)/data/chromium-profile"

# Find Chromium binary: bundled takes priority, then system-installed
if [ -x "$(pwd)/chromium/chrome" ]; then
    CHROME_BIN="$(pwd)/chromium/chrome"
elif command -v chromium-browser > /dev/null 2>&1; then
    CHROME_BIN="chromium-browser"
elif command -v chromium > /dev/null 2>&1; then
    CHROME_BIN="chromium"
else
    echo "ERROR: Chromium not found. Install with: apt install chromium-browser"
    exit 1
fi

# Detect the desktop session user — Chromium must run as this user to
# access the display.  The HMI server can run as root, but the browser
# needs the session owner's display/dbus environment.
DESKTOP_USER=""
RUN_CHROME=""   # command prefix to run Chromium as the desktop user
if [ "$(id -u)" = "0" ]; then
    DESKTOP_USER=$(who 2>/dev/null | grep -v root | head -1 | awk '{print $1}')
    if [ -z "$DESKTOP_USER" ]; then
        # Fallback: check logind for graphical sessions
        DESKTOP_USER=$(loginctl list-sessions --no-legend 2>/dev/null \
            | awk '{print $3}' | grep -v root | head -1)
    fi
fi

for arg in "$@"; do
    case "$arg" in
        --windowed) KIOSK_FLAGS="--start-maximized" ;;
    esac
done

# Build the command prefix for launching Chromium
CHROME_EXTRA_FLAGS=""
if [ -n "$DESKTOP_USER" ]; then
    # Run Chromium as the desktop user so it inherits display access
    RUN_CHROME="sudo -u $DESKTOP_USER"
    echo "Running Chromium as user: $DESKTOP_USER"
else
    # Not root, or no desktop user found — run directly
    RUN_CHROME=""
    if [ "$(id -u)" = "0" ]; then
        CHROME_EXTRA_FLAGS="--no-sandbox"
        echo "WARNING: Running as root with no desktop user detected."
    fi
fi

# Default DISPLAY if not set (systemd won't have it)
export DISPLAY="${DISPLAY:-:0}"

# Force X11 rendering — Chromium's native Wayland support causes invisible
# windows on RPi OS Bookworm's labwc compositor.  XWayland is always available
# alongside Wayland on RPi OS, so --ozone-platform=x11 works in both cases.
DISPLAY_FLAGS="--ozone-platform=x11"

# Start the HMI server only if not already running (e.g. via hmi.service)
HMI_PID=""
if curl -sf http://localhost:8080/api/system/health > /dev/null 2>&1; then
    echo "HMI server already running on port 8080."
else
    source venv/bin/activate
    python run.py &
    HMI_PID=$!
    echo "Waiting for HMI server to start..."
    for i in $(seq 1 30); do
        if curl -sf http://localhost:8080/api/system/health > /dev/null 2>&1; then
            echo "HMI server is ready."
            break
        fi
        sleep 1
    done
fi

# Launch Chromium in kiosk mode
echo "Launching Chromium kiosk at $HMI_URL ($(basename "$CHROME_BIN"))..."
mkdir -p "$CHROMIUM_DATA"
chmod 777 "$CHROMIUM_DATA"
$RUN_CHROME "$CHROME_BIN" \
    $KIOSK_FLAGS \
    $CHROME_EXTRA_FLAGS \
    $DISPLAY_FLAGS \
    --disable-gpu \
    --no-first-run \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --disable-features=TranslateUI \
    --autoplay-policy=no-user-gesture-required \
    --user-data-dir="$CHROMIUM_DATA" \
    --disable-background-networking \
    --disable-sync \
    --disable-default-apps \
    --noerrdialogs \
    --disable-pinch \
    --overscroll-history-navigation=0 \
    "$HMI_URL" &
CHROME_PID=$!

# Wait for either process to exit, then clean up the other
cleanup() {
    kill $CHROME_PID 2>/dev/null
    [ -n "$HMI_PID" ] && kill $HMI_PID 2>/dev/null
    wait
}
trap cleanup EXIT INT TERM
if [ -n "$HMI_PID" ]; then
    wait -n $HMI_PID $CHROME_PID 2>/dev/null || true
else
    wait $CHROME_PID 2>/dev/null || true
fi
KIOSK_EOF
    chmod +x "$INSTALL_DIR/start-kiosk.sh"

    # Create systemd kiosk service (auto-login + chromium)
    if [ -d /etc/systemd/system ]; then
        cat > /etc/systemd/system/hmi-kiosk.service << SERVICE_EOF
[Unit]
Description=Industrial HMI Kiosk (Server + Chromium)
After=network.target graphical.target
Wants=graphical.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
Environment=PATH=$INSTALL_DIR/venv/bin:/usr/bin:/bin
Environment=DISPLAY=:0
EnvironmentFile=$INSTALL_DIR/.env
ExecStart=$INSTALL_DIR/start-kiosk.sh
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=graphical.target
SERVICE_EOF
        echo "    Created systemd service: hmi-kiosk.service"
    fi
fi

# Seed database
echo "==> Seeding database with defaults..."
cd "$INSTALL_DIR"
python -m app.seed

echo
echo "============================================"
echo "  Installation complete!"
echo "============================================"
echo
echo "  Install location: $INSTALL_DIR"
echo "  Database:         $INSTALL_DIR/data/hmi.db"
echo "  Config:           $INSTALL_DIR/.env"
echo
echo "  Start manually:   $INSTALL_DIR/start.sh"
echo "  Start as service: systemctl enable --now hmi"
if $KIOSK_ENABLED; then
echo
echo "  Kiosk mode:       $INSTALL_DIR/start-kiosk.sh"
echo "  Kiosk service:    systemctl enable --now hmi-kiosk"
fi
echo
echo "  Default login:    admin / admin"
echo "  URL:              http://localhost:8080"
echo
INSTALL_EOF
chmod +x "$RELEASE_DIR/install.sh"

# --- Windows install script ---
cat > "$RELEASE_DIR/install.bat" << 'WININSTALL_EOF'
@echo off
setlocal enabledelayedexpansion

::
:: install.bat — Install HMI on an offline Windows panel PC
::
:: If a bundled Python is included in this package, no prerequisites are needed.
:: Otherwise, Python 3.11+ must be installed and on PATH.
::
:: Usage:
::   install.bat                    Install to C:\hmi (default)
::   install.bat D:\hmi             Install to custom location
::
:: Run as Administrator for firewall and service registration.
::

set "INSTALL_DIR=%~1"
if "%INSTALL_DIR%"=="" set "INSTALL_DIR=C:\hmi"
set "SCRIPT_DIR=%~dp0"
if exist "%SCRIPT_DIR%VERSION" (
    set /p APP_VERSION=<"%SCRIPT_DIR%VERSION"
) else (
    set "APP_VERSION=unknown"
)

echo ============================================
echo   HMI Installer (Windows)
echo   Target: %INSTALL_DIR%
echo ============================================
echo.

:: ── Resolve Python interpreter ──
:: Prefer bundled Python (always used when present for version consistency).
:: Falls back to system Python only when no bundle is included.
set "PYTHON_BIN="
set "BUNDLED=0"

if exist "%SCRIPT_DIR%python-windows\python\" (
    echo ==^> Found bundled Python
    set "BUNDLED=1"
) else (
    :: Check for system Python as fallback
    python --version >nul 2>&1
    if errorlevel 1 (
        echo ERROR: No Python found.
        echo   No bundled Python was included in this package,
        echo   and no system Python was found on PATH.
        echo.
        echo   Either rebuild the deployment package with --windows to include
        echo   bundled Python, or install Python 3.11+ manually and retry.
        echo.
        pause
        exit /b 1
    )
    for /f "tokens=*" %%v in ('python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"') do set "PYTHON_VERSION=%%v"
    echo ==^> Using system Python !PYTHON_VERSION!
    echo     NOTE: No bundled Python was included in this package.
)

:: Create install directory
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

:: Install bundled Python or use system Python
if "%BUNDLED%"=="1" (
    echo ==^> Installing bundled Python...
    xcopy /E /I /Y "%SCRIPT_DIR%python-windows\python\*" "%INSTALL_DIR%\python\" >nul
    set "PYTHON_BIN=%INSTALL_DIR%\python\python.exe"

    for /f "tokens=*" %%v in ('!PYTHON_BIN! -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}')"') do set "PYTHON_VERSION=%%v"
    echo     Installed Python !PYTHON_VERSION!

    :: Create virtual environment using bundled Python
    echo ==^> Creating virtual environment...
    !PYTHON_BIN! -m venv "%INSTALL_DIR%\venv"
) else (
    :: Create virtual environment using system Python
    echo ==^> Creating virtual environment...
    python -m venv "%INSTALL_DIR%\venv"
)

call "%INSTALL_DIR%\venv\Scripts\activate.bat"

:: Determine which wheel directory to use
set "WHEEL_DIR=%SCRIPT_DIR%wheels-windows"
if not exist "%WHEEL_DIR%" (
    echo    No windows-specific wheels found, falling back to wheels\
    set "WHEEL_DIR=%SCRIPT_DIR%wheels"
)

:: Install dependencies from local wheels (offline)
echo ==^> Installing Python dependencies (offline)...
pip install --no-index --find-links="%WHEEL_DIR%" -r "%SCRIPT_DIR%backend\requirements.txt"
if errorlevel 1 (
    echo.
    echo ERROR: Dependency installation failed.
    echo If you see platform mismatch errors, rebuild the package with:
    echo   ./deploy.sh --windows
    echo.
    pause
    exit /b 1
)

:: Copy application files
echo ==^> Installing application files...
xcopy /E /I /Y "%SCRIPT_DIR%backend\*" "%INSTALL_DIR%\" >nul

:: Create data directory for database
if not exist "%INSTALL_DIR%\data" mkdir "%INSTALL_DIR%\data"

:: Create environment file
if not exist "%INSTALL_DIR%\.env" (
    for /f "tokens=*" %%k in ('python -c "import secrets; print(secrets.token_hex(32))"') do set "SECRET_KEY=%%k"
    (
        echo HMI_DATABASE_URL=sqlite+aiosqlite:///%INSTALL_DIR:\=/%/data/hmi.db
        echo HMI_SECRET_KEY=!SECRET_KEY!
        echo HMI_HOST=0.0.0.0
        echo HMI_PORT=8080
        echo HMI_DEBUG=false
        echo HMI_APP_VERSION=!APP_VERSION!
    ) > "%INSTALL_DIR%\.env"
    echo     Created .env with generated secret key.
) else (
    echo     Existing .env preserved.
)
:: Always update version in .env (even on upgrades)
powershell -Command "$f='%INSTALL_DIR%\.env'; $c=Get-Content $f; if($c -match 'HMI_APP_VERSION='){$c=$c -replace 'HMI_APP_VERSION=.*','HMI_APP_VERSION=%APP_VERSION%'}else{$c+='HMI_APP_VERSION=%APP_VERSION%'}; Set-Content $f $c"

:: Create convenience scripts
(
    echo @echo off
    echo cd /d "%%~dp0"
    echo call venv\Scripts\activate.bat
    echo python run.py
) > "%INSTALL_DIR%\start.bat"

(
    echo @echo off
    echo cd /d "%%~dp0"
    echo call venv\Scripts\activate.bat
    echo python -m app.seed
) > "%INSTALL_DIR%\seed.bat"

:: Register as Windows Service using sc (requires Administrator)
echo ==^> Registering Windows service...
set "VENV_PYTHON=%INSTALL_DIR%\venv\Scripts\python.exe"

:: Create a wrapper script for the service (NSSM-free approach)
(
    echo @echo off
    echo cd /d "%INSTALL_DIR%"
    echo call venv\Scripts\activate.bat
    echo python run.py
) > "%INSTALL_DIR%\service_runner.bat"

:: Try to create service with sc.exe (native)
sc query HMI_Server >nul 2>&1
if not errorlevel 1 (
    echo     Stopping existing HMI_Server service...
    sc stop HMI_Server >nul 2>&1
    sc delete HMI_Server >nul 2>&1
    timeout /t 2 /nobreak >nul
)

:: Note: sc.exe cannot directly run Python scripts as services.
:: We create the service entry but recommend NSSM for production.
echo.
echo     NOTE: To run as a Windows Service, use NSSM (recommended):
echo       nssm install HMI_Server "%VENV_PYTHON%" run.py
echo       nssm set HMI_Server AppDirectory "%INSTALL_DIR%"
echo       nssm set HMI_Server AppEnvironmentExtra "PATH=%INSTALL_DIR%\venv\Scripts;%%PATH%%"
echo       nssm start HMI_Server
echo.
echo     Or use Task Scheduler to run start.bat at logon.

:: Seed database
echo ==^> Seeding database with defaults...
cd /d "%INSTALL_DIR%"
python -m app.seed

:: Install bundled Chromium (if present)
if exist "%SCRIPT_DIR%chromium-windows\chrome-win64\" (
    echo ==^> Installing bundled Chromium...
    xcopy /E /I /Y "%SCRIPT_DIR%chromium-windows\chrome-win64\*" "%INSTALL_DIR%\chromium\" >nul
    echo     Chromium installed to %INSTALL_DIR%\chromium\

    :: Create kiosk launcher script
    (
        echo @echo off
        echo :: start-kiosk.bat — Launch HMI server + Chromium in kiosk mode
        echo cd /d "%%~dp0"
        echo.
        echo :: Start HMI server in background
        echo start "" /B cmd /c "call venv\Scripts\activate.bat ^&^& python run.py"
        echo.
        echo :: Wait for server to be ready
        echo echo Waiting for HMI server to start...
        echo :wait_loop
        echo timeout /t 1 /nobreak ^>nul
        echo powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:8080/api/system/health' -UseBasicParsing -TimeoutSec 2; if($r.StatusCode -eq 200){exit 0} } catch { exit 1 }"
        echo if errorlevel 1 goto wait_loop
        echo echo HMI server is ready.
        echo.
        echo :: Launch Chromium in kiosk mode
        echo echo Launching Chromium kiosk...
        echo start "" "%%~dp0chromium\chrome.exe" --kiosk --no-first-run --disable-infobars --disable-session-crashed-bubble --disable-features=TranslateUI --autoplay-policy=no-user-gesture-required --user-data-dir="%%~dp0data\chromium-profile" --disable-background-networking --disable-sync --disable-default-apps --noerrdialogs --disable-pinch --overscroll-history-navigation=0 "http://localhost:8080"
    ) > "%INSTALL_DIR%\start-kiosk.bat"
    echo     Created start-kiosk.bat
)

:: Configure Windows Firewall rule
echo ==^> Configuring firewall...
netsh advfirewall firewall show rule name="HMI Server" >nul 2>&1
if errorlevel 1 (
    netsh advfirewall firewall add rule name="HMI Server" dir=in action=allow protocol=tcp localport=8080 >nul 2>&1
    if not errorlevel 1 (
        echo     Firewall rule added for port 8080.
    ) else (
        echo     Could not add firewall rule. Run as Administrator or add manually.
    )
) else (
    echo     Firewall rule already exists.
)

echo.
echo ============================================
echo   Installation complete!
echo ============================================
echo.
echo   Install location: %INSTALL_DIR%
echo   Database:         %INSTALL_DIR%\data\hmi.db
echo   Config:           %INSTALL_DIR%\.env
echo.
echo   Start manually:   %INSTALL_DIR%\start.bat
echo   Seed database:    %INSTALL_DIR%\seed.bat
if exist "%INSTALL_DIR%\chromium\chrome.exe" (
echo   Kiosk mode:       %INSTALL_DIR%\start-kiosk.bat
)
echo.
echo   Default login:    admin / admin
echo   URL:              http://localhost:8080
echo.
pause
WININSTALL_EOF
echo "    Linux and Windows install scripts created."
fi  # end of: if $COMPILE ... else

# ──────────────────────────────────────────────
# 6. Create archives
# ──────────────────────────────────────────────
STEP=$((STEP + 1))
echo "==> [$STEP/$STEP_TOTAL] Creating deployment packages..."

# Always create Linux tarball
ARCHIVE_NAME="hmi-${VERSION}.tar.gz"
cd "$DIST_DIR"
tar -czf "$ARCHIVE_NAME" -C "$DIST_DIR" hmi-release
ARCHIVE_SIZE=$(du -h "$DIST_DIR/$ARCHIVE_NAME" | cut -f1)

echo
echo "============================================"
echo "  Package created successfully!"
echo "============================================"
echo
echo "  Linux:  dist/$ARCHIVE_NAME ($ARCHIVE_SIZE)"

# Create Windows zip if windows wheels were built
if $BUILD_WINDOWS; then
    ZIP_NAME="hmi-${VERSION}-windows.zip"
    cd "$DIST_DIR"
    if command -v zip &> /dev/null; then
        zip -rq "$ZIP_NAME" hmi-release
    else
        tar -czf "${ZIP_NAME%.zip}.tar.gz" -C "$DIST_DIR" hmi-release
        ZIP_NAME="${ZIP_NAME%.zip}.tar.gz"
        echo "    (zip not found, created .tar.gz instead)"
    fi
    ZIP_SIZE=$(du -h "$DIST_DIR/$ZIP_NAME" | cut -f1)
    echo "  Windows: dist/$ZIP_NAME ($ZIP_SIZE)"
fi

echo
if $COMPILE; then
echo "  Backend compiled with PyInstaller — no Python or .py source on target machine."
elif $BUNDLE_PYTHON; then
echo "  Python $PYTHON_VERSION is bundled — no prerequisites on target machine."
else
echo "  Python NOT bundled — target must have Python ${PYTHON_MAJOR_MINOR}+ installed."
fi
if $BUNDLE_CHROMIUM; then
echo "  Chromium $CHROMIUM_VERSION is bundled — use start-kiosk.sh for full kiosk mode."
fi
echo
echo "  Linux deployment:"
echo "    1. Copy $ARCHIVE_NAME to the panel PC"
echo "    2. tar -xzf $ARCHIVE_NAME"
echo "    3. cd hmi-release"
echo "    4. sudo ./install.sh"
if $BUNDLE_CHROMIUM; then
echo "    5. (optional) systemctl enable --now hmi-kiosk  # auto-start kiosk"
fi
echo
if $BUILD_WINDOWS; then
echo "  Windows deployment:"
echo "    1. Copy $ZIP_NAME to the panel PC"
echo "    2. Extract the archive"
echo "    3. Open cmd as Administrator in hmi-release\\"
echo "    4. install.bat"
if $BUNDLE_CHROMIUM; then
echo "    5. (optional) start-kiosk.bat  # launch with Chromium kiosk"
fi
echo
fi
