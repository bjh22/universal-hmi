#!/usr/bin/env bash
set -euo pipefail

#
# deploy.sh — Package the HMI for offline deployment to industrial panel PCs
#
# Usage:
#   ./deploy.sh                       # Build for Linux x86_64 (with bundled Python)
#   ./deploy.sh --windows             # Also include Windows x86_64
#   ./deploy.sh --arm                 # Also include Linux aarch64 (ARM)
#   ./deploy.sh --no-bundle-python    # Skip bundling Python (target must have Python)
#   ./deploy.sh --python-version 3.12.8  # Override Python version (default: 3.11.13)
#
# Output: dist/hmi-<version>.tar.gz  (always)
#         dist/hmi-<version>.zip     (when --windows)
#
# Python is bundled from python-build-standalone (astral-sh) by default,
# so target machines do NOT need Python pre-installed.
#

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
VERSION=$(date +%Y%m%d-%H%M%S)
DIST_DIR="$ROOT_DIR/dist"
RELEASE_DIR="$DIST_DIR/hmi-release"
BUILD_WINDOWS=false
BUILD_ARM=false
BUNDLE_PYTHON=true
PYTHON_VERSION="3.11.13"
# python-build-standalone release tag (date-based)
PBS_RELEASE="20250828"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --windows) BUILD_WINDOWS=true ;;
        --arm) BUILD_ARM=true ;;
        --no-bundle-python) BUNDLE_PYTHON=false ;;
        --python-version)
            shift
            PYTHON_VERSION="$1"
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: ./deploy.sh [--windows] [--arm] [--no-bundle-python] [--python-version X.Y.Z]"
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
if $BUNDLE_PYTHON; then
echo "  Python:  $PYTHON_VERSION (bundled)"
else
echo "  Python:  not bundled (target must have Python $PYTHON_MAJOR_MINOR+)"
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
$BUILD_WINDOWS && STEP_TOTAL=$((STEP_TOTAL + 1))
$BUNDLE_PYTHON && STEP_TOTAL=$((STEP_TOTAL + 1))
STEP=1

# ──────────────────────────────────────────────
# 1. Build frontend
# ──────────────────────────────────────────────
echo "==> [$STEP/$STEP_TOTAL] Building frontend..."
cd "$ROOT_DIR/frontend"
npm run build
echo "    Frontend built successfully."

# ──────────────────────────────────────────────
# 2. Copy backend source
# ──────────────────────────────────────────────
STEP=$((STEP + 1))
echo "==> [$STEP/$STEP_TOTAL] Copying backend..."
mkdir -p "$RELEASE_DIR/backend"
cp -r "$ROOT_DIR/backend/app" "$RELEASE_DIR/backend/app"
cp "$ROOT_DIR/backend/run.py" "$RELEASE_DIR/backend/"
cp "$ROOT_DIR/backend/requirements.txt" "$RELEASE_DIR/backend/"

# Copy built frontend into backend/static for production serving
cp -r "$ROOT_DIR/frontend/dist" "$RELEASE_DIR/backend/static"
echo "    Backend and static files copied."

# ──────────────────────────────────────────────
# 3. Download Linux Python wheels for offline install
# ──────────────────────────────────────────────
STEP=$((STEP + 1))
echo "==> [$STEP/$STEP_TOTAL] Downloading Linux Python dependencies (wheels)..."
mkdir -p "$RELEASE_DIR/wheels"
pip download \
    -r "$ROOT_DIR/backend/requirements.txt" \
    -d "$RELEASE_DIR/wheels" \
    --only-binary=:all: \
    2>&1 | tail -1 || {
    echo "    Some wheels unavailable as binary, retrying with source..."
    pip download \
        -r "$ROOT_DIR/backend/requirements.txt" \
        -d "$RELEASE_DIR/wheels" \
        2>&1 | tail -1
}
WHEEL_COUNT=$(ls -1 "$RELEASE_DIR/wheels/" | wc -l)
echo "    Downloaded $WHEEL_COUNT Linux packages."

# ──────────────────────────────────────────────
# 3b. Download Windows Python wheels (if requested)
# ──────────────────────────────────────────────
if $BUILD_WINDOWS; then
    STEP=$((STEP + 1))
    echo "==> [$STEP/$STEP_TOTAL] Downloading Windows Python dependencies (wheels)..."
    mkdir -p "$RELEASE_DIR/wheels-windows"

    # Download platform-specific (binary) wheels for Windows
    # --no-deps avoids resolution conflicts across platforms;
    # pure-python deps are already in the Linux wheels and work on both.
    pip download \
        -r "$ROOT_DIR/backend/requirements.txt" \
        -d "$RELEASE_DIR/wheels-windows" \
        --platform win_amd64 \
        --python-version "$PYTHON_MAJOR_MINOR" \
        --only-binary=:all: \
        --no-deps \
        2>&1 | tail -3 || true

    # Also grab pure-python (any) wheels that work cross-platform.
    # These cover packages without platform-specific builds.
    pip download \
        -r "$ROOT_DIR/backend/requirements.txt" \
        -d "$RELEASE_DIR/wheels-windows" \
        --platform any \
        --python-version "$PYTHON_MAJOR_MINOR" \
        --only-binary=:all: \
        --no-deps \
        2>&1 | tail -3 || true

    WIN_WHEEL_COUNT=$(ls -1 "$RELEASE_DIR/wheels-windows/" 2>/dev/null | wc -l)
    echo "    Downloaded $WIN_WHEEL_COUNT Windows packages."
    if [ "$WIN_WHEEL_COUNT" -eq 0 ]; then
        echo "    WARNING: No Windows wheels downloaded. The install.bat will"
        echo "    fall back to the Linux wheels directory (pure-python packages"
        echo "    are cross-platform, but native extensions may not work)."
    fi
fi

# ──────────────────────────────────────────────
# 4. Bundle standalone Python interpreter (if enabled)
# ──────────────────────────────────────────────
if $BUNDLE_PYTHON; then
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
# 5. Create install scripts for target machines
# ──────────────────────────────────────────────
STEP=$((STEP + 1))
echo "==> [$STEP/$STEP_TOTAL] Generating install scripts..."

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
pip install --no-index --find-links="$SCRIPT_DIR/wheels" \
    -r "$SCRIPT_DIR/backend/requirements.txt"

# Copy application files
echo "==> Installing application files..."
cp -r "$SCRIPT_DIR/backend/"* "$INSTALL_DIR/"

# Create data directory for database
mkdir -p "$INSTALL_DIR/data"

# Create environment file
if [ ! -f "$INSTALL_DIR/.env" ]; then
    SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
    cat > "$INSTALL_DIR/.env" << ENV_EOF
HMI_DATABASE_URL=sqlite+aiosqlite:///$INSTALL_DIR/data/hmi.db
HMI_SECRET_KEY=$SECRET_KEY
HMI_HOST=0.0.0.0
HMI_PORT=8080
HMI_DEBUG=false
ENV_EOF
    echo "    Created .env with generated secret key."
else
    echo "    Existing .env preserved."
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
    ) > "%INSTALL_DIR%\.env"
    echo     Created .env with generated secret key.
) else (
    echo     Existing .env preserved.
)

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
echo.
echo   Default login:    admin / admin
echo   URL:              http://localhost:8080
echo.
pause
WININSTALL_EOF
echo "    Linux and Windows install scripts created."

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
if $BUNDLE_PYTHON; then
echo "  Python $PYTHON_VERSION is bundled — no prerequisites on target machine."
else
echo "  Python NOT bundled — target must have Python ${PYTHON_MAJOR_MINOR}+ installed."
fi
echo
echo "  Linux deployment:"
echo "    1. Copy $ARCHIVE_NAME to the panel PC"
echo "    2. tar -xzf $ARCHIVE_NAME"
echo "    3. cd hmi-release"
echo "    4. sudo ./install.sh"
echo
if $BUILD_WINDOWS; then
echo "  Windows deployment:"
echo "    1. Copy $ZIP_NAME to the panel PC"
echo "    2. Extract the archive"
echo "    3. Open cmd as Administrator in hmi-release\\"
echo "    4. install.bat"
echo
fi
