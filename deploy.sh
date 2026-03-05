#!/usr/bin/env bash
set -euo pipefail

#
# deploy.sh — Package the HMI for offline deployment to industrial panel PCs
#
# Usage:
#   ./deploy.sh                    # Build release package
#   ./deploy.sh --platform linux   # Specify target platform (default: current)
#
# Output: dist/hmi-<version>.tar.gz
#

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
VERSION=$(date +%Y%m%d-%H%M%S)
DIST_DIR="$ROOT_DIR/dist"
RELEASE_DIR="$DIST_DIR/hmi-release"
PLATFORM="${1:-}"

echo "============================================"
echo "  HMI Deployment Packager"
echo "  Version: $VERSION"
echo "============================================"
echo

# Clean previous build
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"

# ──────────────────────────────────────────────
# 1. Build frontend
# ──────────────────────────────────────────────
echo "==> [1/5] Building frontend..."
cd "$ROOT_DIR/frontend"
npm run build
echo "    Frontend built successfully."

# ──────────────────────────────────────────────
# 2. Copy backend source
# ──────────────────────────────────────────────
echo "==> [2/5] Copying backend..."
mkdir -p "$RELEASE_DIR/backend"
cp -r "$ROOT_DIR/backend/app" "$RELEASE_DIR/backend/app"
cp "$ROOT_DIR/backend/run.py" "$RELEASE_DIR/backend/"
cp "$ROOT_DIR/backend/requirements.txt" "$RELEASE_DIR/backend/"

# Copy built frontend into backend/static for production serving
cp -r "$ROOT_DIR/frontend/dist" "$RELEASE_DIR/backend/static"
echo "    Backend and static files copied."

# ──────────────────────────────────────────────
# 3. Download Python wheels for offline install
# ──────────────────────────────────────────────
echo "==> [3/5] Downloading Python dependencies (wheels)..."
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
echo "    Downloaded $WHEEL_COUNT packages."

# ──────────────────────────────────────────────
# 4. Create install script for target machine
# ──────────────────────────────────────────────
echo "==> [4/5] Generating install script..."
cat > "$RELEASE_DIR/install.sh" << 'INSTALL_EOF'
#!/usr/bin/env bash
set -euo pipefail

#
# install.sh — Install HMI on an offline panel PC
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
echo "  HMI Installer"
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
echo "    Install script created."

# ──────────────────────────────────────────────
# 5. Create tarball
# ──────────────────────────────────────────────
echo "==> [5/5] Creating deployment package..."
ARCHIVE_NAME="hmi-${VERSION}.tar.gz"
cd "$DIST_DIR"
tar -czf "$ARCHIVE_NAME" -C "$DIST_DIR" hmi-release
ARCHIVE_SIZE=$(du -h "$DIST_DIR/$ARCHIVE_NAME" | cut -f1)

echo
echo "============================================"
echo "  Package created successfully!"
echo "============================================"
echo
echo "  File: dist/$ARCHIVE_NAME"
echo "  Size: $ARCHIVE_SIZE"
echo
echo "  To deploy on target panel PC:"
echo "    1. Copy $ARCHIVE_NAME to the panel PC"
echo "    2. tar -xzf $ARCHIVE_NAME"
echo "    3. cd hmi-release"
echo "    4. sudo ./install.sh"
echo
