param(
    [Parameter(Position=0)]
    [ValidateSet("build", "lint", "check", "dev", "seed", "install", "doctor")]
    [string]$Command
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# --- Prerequisite checks ---

function Test-Python {
    $py = Get-Command python -ErrorAction SilentlyContinue
    if (-not $py) {
        Write-Host "[ERROR] Python is not installed or not on PATH." -ForegroundColor Red
        Write-Host ""
        Write-Host "  Install Python 3.10+ from https://www.python.org/downloads/" -ForegroundColor Yellow
        Write-Host "    - Check 'Add python.exe to PATH' during install" -ForegroundColor Yellow
        Write-Host "  Or:  winget install Python.Python.3.12" -ForegroundColor Yellow
        return $false
    }
    $ver = (python --version 2>&1) -replace 'Python ',''
    $parts = $ver.Split('.')
    $major = [int]$parts[0]; $minor = [int]$parts[1]
    if ($major -lt 3 -or ($major -eq 3 -and $minor -lt 10)) {
        Write-Host "[ERROR] Python 3.10+ required, found $ver" -ForegroundColor Red
        return $false
    }
    return $true
}

function Test-Node {
    $nd = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nd) {
        Write-Host "[ERROR] Node.js is not installed or not on PATH." -ForegroundColor Red
        Write-Host ""
        Write-Host "  Install Node.js 18+ LTS from https://nodejs.org/" -ForegroundColor Yellow
        Write-Host "  Or:  winget install OpenJS.NodeJS.LTS" -ForegroundColor Yellow
        return $false
    }
    $ver = (node --version) -replace 'v',''
    $major = [int]($ver.Split('.')[0])
    if ($major -lt 18) {
        Write-Host "[ERROR] Node.js 18+ required, found v$ver" -ForegroundColor Red
        return $false
    }
    return $true
}

function Test-Npm {
    $np = Get-Command npm -ErrorAction SilentlyContinue
    if (-not $np) {
        Write-Host "[ERROR] npm not found. It should come with Node.js." -ForegroundColor Red
        return $false
    }
    return $true
}

function Assert-Python { if (-not (Test-Python)) { exit 1 } }
function Assert-Node   { if (-not (Test-Node))   { exit 1 } }
function Assert-All    { Assert-Python; Assert-Node; if (-not (Test-Npm)) { exit 1 } }

# --- Commands ---

function Invoke-Doctor {
    Write-Host "=== HMI Development Environment Check ===" -ForegroundColor White
    Write-Host ""

    # Python
    $py = Get-Command python -ErrorAction SilentlyContinue
    if ($py) {
        $pyVer = python --version 2>&1
        Write-Host "[ OK ] $pyVer" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] Python        not found" -ForegroundColor Red
        Write-Host "       Install from https://www.python.org/downloads/" -ForegroundColor Yellow
    }

    # pip
    $pip = Get-Command pip -ErrorAction SilentlyContinue
    if ($pip) {
        Write-Host "[ OK ] pip installed" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] pip           not found" -ForegroundColor Red
    }

    # Node
    $nd = Get-Command node -ErrorAction SilentlyContinue
    if ($nd) {
        $ndVer = node --version
        Write-Host "[ OK ] Node.js $ndVer" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] Node.js       not found" -ForegroundColor Red
        Write-Host "       Install from https://nodejs.org/" -ForegroundColor Yellow
    }

    # npm
    $np = Get-Command npm -ErrorAction SilentlyContinue
    if ($np) {
        $npVer = npm --version
        Write-Host "[ OK ] npm $npVer" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] npm           not found" -ForegroundColor Red
    }

    # Git
    $gt = Get-Command git -ErrorAction SilentlyContinue
    if ($gt) {
        $gtVer = git --version
        Write-Host "[ OK ] $gtVer" -ForegroundColor Green
    } else {
        Write-Host "[WARN] Git           not found (optional)" -ForegroundColor Yellow
    }

    Write-Host ""

    # Project state
    if (Test-Path "$RootDir\backend\hmi.db") {
        Write-Host "[ OK ] Database exists (backend\hmi.db)" -ForegroundColor Green
    } else {
        Write-Host "[INFO] No database yet - run: .\dev.ps1 seed" -ForegroundColor Cyan
    }

    if (Test-Path "$RootDir\frontend\node_modules") {
        Write-Host "[ OK ] Frontend dependencies installed" -ForegroundColor Green
    } else {
        Write-Host "[INFO] Frontend dependencies not installed - run: .\dev.ps1 install" -ForegroundColor Cyan
    }

    Write-Host ""
    Write-Host "Run '.\dev.ps1 install' to install project dependencies." -ForegroundColor White
}

function Invoke-Build {
    Assert-Node
    Write-Host "==> Building frontend..." -ForegroundColor Cyan
    Push-Location "$RootDir\frontend"
    try { npm run build } finally { Pop-Location }
}

function Invoke-Lint {
    Assert-Node
    Write-Host "==> Linting frontend..." -ForegroundColor Cyan
    Push-Location "$RootDir\frontend"
    try { npm run lint } finally { Pop-Location }
}

function Invoke-Check {
    Invoke-Build
    Invoke-Lint
    Write-Host "==> All checks passed." -ForegroundColor Green
}

function Invoke-Dev {
    Assert-All
    Write-Host "==> Starting backend and frontend dev servers..." -ForegroundColor Cyan
    Write-Host "    Backend:  http://localhost:8080"
    Write-Host "    Frontend: http://localhost:5173"
    Write-Host "    (Press Ctrl+C to stop both)" -ForegroundColor DarkGray

    $backend = Start-Process -PassThru -NoNewWindow -FilePath "python" `
        -ArgumentList "run.py" -WorkingDirectory "$RootDir\backend"

    try {
        Push-Location "$RootDir\frontend"
        try { npm run dev } finally { Pop-Location }
    } finally {
        if (!$backend.HasExited) {
            Write-Host "Stopping backend..." -ForegroundColor Yellow
            Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue
        }
    }
}

function Invoke-Seed {
    Assert-Python
    Write-Host "==> Seeding database..." -ForegroundColor Cyan
    Push-Location "$RootDir\backend"
    try { python -m app.seed } finally { Pop-Location }
}

function Invoke-Install {
    Assert-All
    Write-Host "==> Installing backend dependencies..." -ForegroundColor Cyan
    Push-Location "$RootDir\backend"
    try {
        if (Test-Path "wheels") {
            Write-Host "    Found bundled wheels - installing offline (no internet required)." -ForegroundColor DarkGray
            pip install --no-index --find-links=wheels -r requirements.txt
        } else {
            pip install -r requirements.txt
        }
    } finally { Pop-Location }

    Write-Host "==> Installing frontend dependencies..." -ForegroundColor Cyan
    Push-Location "$RootDir\frontend"
    try { npm install } finally { Pop-Location }

    Write-Host "==> All dependencies installed successfully." -ForegroundColor Green
}

# --- Dispatch ---

switch ($Command) {
    "build"   { Invoke-Build }
    "lint"    { Invoke-Lint }
    "check"   { Invoke-Check }
    "dev"     { Invoke-Dev }
    "seed"    { Invoke-Seed }
    "install" { Invoke-Install }
    "doctor"  { Invoke-Doctor }
    default {
        Write-Host "Usage: .\dev.ps1 <command>" -ForegroundColor White
        Write-Host ""
        Write-Host "Commands:"
        Write-Host "  install     Install all dependencies (pip + npm)"
        Write-Host "  dev         Start backend (:8080) + frontend (:5173) dev servers"
        Write-Host "  build       TypeScript check + Vite build"
        Write-Host "  lint        Run ESLint on the frontend"
        Write-Host "  check       Run both build and lint"
        Write-Host "  seed        Seed the database with default users/tags"
        Write-Host "  doctor      Check development environment prerequisites"
        Write-Host ""
        Write-Host "Prerequisites: Python 3.10+, Node.js 18+" -ForegroundColor DarkGray
        Write-Host "Run '.\dev.ps1 doctor' to check your setup." -ForegroundColor DarkGray
    }
}
