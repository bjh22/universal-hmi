#!/usr/bin/env bash
set -euo pipefail

#
# deploy.sh — Package the HMI for offline deployment to industrial panel PCs
#
# Usage:
#   ./deploy.sh                # Build for Linux only (current platform)
#   ./deploy.sh --windows      # Also download Windows wheels
#
# Output: dist/hmi-<version>.tar.gz  (always)
#         dist/hmi-<version>.zip     (when --windows)
#

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
VERSION=$(date +%Y%m%d-%H%M%S)
DIST_DIR="$ROOT_DIR/dist"
RELEASE_DIR="$DIST_DIR/hmi-release"
BUILD_WINDOWS=false

for arg in "$@"; do
    case "$arg" in
        --windows) BUILD_WINDOWS=true ;;
    esac
done

echo "============================================"
echo "  HMI Deployment Packager"
echo "  Version: $VERSION"
if $BUILD_WINDOWS; then
echo "  Targets: Linux + Windows"
else
echo "  Target:  Linux"
echo "  (use --windows to include Windows)"
fi
echo "============================================"
echo

# Clean previous build
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"

# ──────────────────────────────────────────────
# 1. Build frontend
# ──────────────────────────────────────────────
STEP_TOTAL=5
$BUILD_WINDOWS && STEP_TOTAL=6
STEP=1

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
        --python-version 3.11 \
        --only-binary=:all: \
        --no-deps \
        2>&1 | tail -3 || true

    # Also grab pure-python (any) wheels that work cross-platform.
    # These cover packages without platform-specific builds.
    pip download \
        -r "$ROOT_DIR/backend/requirements.txt" \
        -d "$RELEASE_DIR/wheels-windows" \
        --platform any \
        --python-version 3.11 \
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
# 4. Create install scripts for target machines
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
# Prerequisites: Python 3.11+ must be installed on the target machine.
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

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python 3 is required but not found."
    echo "Install Python 3.11+ and try again."
    exit 1
fi

PYTHON_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
echo "==> Found Python $PYTHON_VERSION"

# Create install directory
mkdir -p "$INSTALL_DIR"

# Create virtual environment
echo "==> Creating virtual environment..."
python3 -m venv "$INSTALL_DIR/venv"
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
:: Prerequisites: Python 3.11+ must be installed and on PATH.
::
:: Usage:
::   install.bat                    Install to C:\hmi (default)
::   install.bat D:\hmi             Install to custom location
::
:: Run as Administrator for Windows Service registration.
::

set "INSTALL_DIR=%~1"
if "%INSTALL_DIR%"=="" set "INSTALL_DIR=C:\hmi"
set "SCRIPT_DIR=%~dp0"

echo ============================================
echo   HMI Installer (Windows)
echo   Target: %INSTALL_DIR%
echo ============================================
echo.

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is required but not found on PATH.
    echo Install Python 3.11+ from python.org and ensure it is added to PATH.
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"') do set "PYTHON_VERSION=%%v"
echo ==^> Found Python %PYTHON_VERSION%

:: Create install directory
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

:: Create virtual environment
echo ==^> Creating virtual environment...
python -m venv "%INSTALL_DIR%\venv"
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
# 5. Create archives
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
