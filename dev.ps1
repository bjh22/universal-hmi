param(
    [Parameter(Position=0)]
    [ValidateSet("build", "lint", "check", "dev", "stop", "seed", "install", "install-prereqs", "doctor")]
    [string]$Command
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# --- User-local tools directory (no admin required) ---
# Node.js and Python are installed here by `install-prereqs` so developers
# without admin rights can set up the environment entirely under their user
# profile. These paths are prepended to PATH for the current session so
# subsequent commands (install, dev, etc.) find the tools immediately.

$LocalToolsDir = Join-Path $env:USERPROFILE ".universal-hmi\tools"
$LocalNodeDir  = Join-Path $LocalToolsDir "node"
$LocalPyDir    = Join-Path $LocalToolsDir "python"

# Pinned versions for offline-friendly, reproducible installs
$NodeVersion   = "22.11.0"
$PythonVersion = "3.12.7"

function Add-LocalToolsToPath {
    if (Test-Path $LocalNodeDir) {
        $env:PATH = "$LocalNodeDir;$env:PATH"
    }
    if (Test-Path $LocalPyDir) {
        $env:PATH = "$LocalPyDir;$LocalPyDir\Scripts;$env:PATH"
    }
}

Add-LocalToolsToPath

# --- Prerequisite checks ---

function Test-Python {
    $py = Get-Command python -ErrorAction SilentlyContinue
    if (-not $py) {
        Write-Host "[ERROR] Python is not installed or not on PATH." -ForegroundColor Red
        Write-Host ""
        Write-Host "  Run '.\dev.ps1 install-prereqs' to install Python to your user folder" -ForegroundColor Yellow
        Write-Host "  (no admin required), or install Python 3.10+ manually:" -ForegroundColor Yellow
        Write-Host "    https://www.python.org/downloads/" -ForegroundColor Yellow
        Write-Host "    winget install Python.Python.3.12" -ForegroundColor Yellow
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
        Write-Host "  Run '.\dev.ps1 install-prereqs' to install Node.js to your user folder" -ForegroundColor Yellow
        Write-Host "  (no admin required), or install Node.js 18+ LTS manually:" -ForegroundColor Yellow
        Write-Host "    https://nodejs.org/" -ForegroundColor Yellow
        Write-Host "    winget install OpenJS.NodeJS.LTS" -ForegroundColor Yellow
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

$script:VenvPy = $null

function Ensure-Venv {
    Assert-Python
    $venvPython = Join-Path $RootDir ".venv\Scripts\python.exe"
    if (-not (Test-Path $venvPython)) {
        Write-Host "    Creating virtual environment (.venv\)..." -ForegroundColor DarkGray
        python -m venv (Join-Path $RootDir ".venv")
    }
    $script:VenvPy = $venvPython
}

# --- User-local installers (no admin required) ---

function Add-UserPath([string]$Dir) {
    # Persist a directory in the user's PATH (no admin needed). New shells
    # will pick it up automatically; the current session is updated above.
    $current = [Environment]::GetEnvironmentVariable("Path", "User")
    if (-not $current) { $current = "" }
    $parts = $current.Split(';') | Where-Object { $_ -and $_ -ne $Dir }
    $newPath = (@($Dir) + $parts) -join ';'
    [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
}

function Install-NodeLocal {
    if (Get-Command node -ErrorAction SilentlyContinue) {
        $existing = (node --version) -replace 'v',''
        $major = [int]($existing.Split('.')[0])
        if ($major -ge 18) {
            Write-Host "[ OK ] Node.js v$existing already available — skipping." -ForegroundColor Green
            return
        }
    }

    Write-Host "==> Installing Node.js v$NodeVersion to $LocalNodeDir ..." -ForegroundColor Cyan
    $arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
    $zipName = "node-v$NodeVersion-win-$arch"
    $url = "https://nodejs.org/dist/v$NodeVersion/$zipName.zip"
    $tmpZip = Join-Path $env:TEMP "$zipName.zip"
    $tmpExtract = Join-Path $env:TEMP "universal-hmi-node-extract"

    New-Item -ItemType Directory -Force -Path $LocalToolsDir | Out-Null
    if (Test-Path $LocalNodeDir) { Remove-Item -Recurse -Force $LocalNodeDir }
    if (Test-Path $tmpExtract)   { Remove-Item -Recurse -Force $tmpExtract }

    Write-Host "    Downloading $url ..." -ForegroundColor DarkGray
    try {
        # Force TLS 1.2 for older PowerShell versions
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $url -OutFile $tmpZip -UseBasicParsing
    } catch {
        Write-Host "[ERROR] Failed to download Node.js: $_" -ForegroundColor Red
        Write-Host "        Check your internet connection or download manually from https://nodejs.org/" -ForegroundColor Yellow
        exit 1
    }

    Write-Host "    Extracting ..." -ForegroundColor DarkGray
    Expand-Archive -Path $tmpZip -DestinationPath $tmpExtract -Force
    Move-Item -Path (Join-Path $tmpExtract $zipName) -Destination $LocalNodeDir
    Remove-Item -Recurse -Force $tmpExtract -ErrorAction SilentlyContinue
    Remove-Item -Force $tmpZip -ErrorAction SilentlyContinue

    Add-UserPath $LocalNodeDir
    $env:PATH = "$LocalNodeDir;$env:PATH"
    Write-Host "[ OK ] Node.js installed to $LocalNodeDir" -ForegroundColor Green
}

function Install-PythonLocal {
    if (Get-Command python -ErrorAction SilentlyContinue) {
        $ver = (python --version 2>&1) -replace 'Python ',''
        $parts = $ver.Split('.')
        if ([int]$parts[0] -ge 3 -and [int]$parts[1] -ge 10) {
            Write-Host "[ OK ] Python $ver already available — skipping." -ForegroundColor Green
            return
        }
    }

    Write-Host "==> Installing Python $PythonVersion (user scope, no admin) ..." -ForegroundColor Cyan
    $arch = if ([Environment]::Is64BitOperatingSystem) { "amd64" } else { "win32" }
    $installerName = "python-$PythonVersion-$arch.exe"
    $url = "https://www.python.org/ftp/python/$PythonVersion/$installerName"
    $tmpExe = Join-Path $env:TEMP $installerName

    Write-Host "    Downloading $url ..." -ForegroundColor DarkGray
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $url -OutFile $tmpExe -UseBasicParsing
    } catch {
        Write-Host "[ERROR] Failed to download Python: $_" -ForegroundColor Red
        Write-Host "        Check your internet connection or download manually from https://www.python.org/downloads/" -ForegroundColor Yellow
        exit 1
    }

    Write-Host "    Running installer (user scope, no admin prompt) ..." -ForegroundColor DarkGray
    # InstallAllUsers=0 -> per-user install to %LOCALAPPDATA%\Programs\Python\...
    # PrependPath=1     -> add python + Scripts to the user's PATH
    # Include_launcher=0 -> skip the py launcher (which needs admin)
    # TargetDir         -> force a known location under user profile
    New-Item -ItemType Directory -Force -Path $LocalPyDir | Out-Null
    $installArgs = @(
        "/passive",
        "InstallAllUsers=0",
        "PrependPath=1",
        "Include_launcher=0",
        "Include_test=0",
        "SimpleInstall=1",
        "TargetDir=$LocalPyDir"
    )
    $proc = Start-Process -FilePath $tmpExe -ArgumentList $installArgs -Wait -PassThru
    Remove-Item -Force $tmpExe -ErrorAction SilentlyContinue

    if ($proc.ExitCode -ne 0) {
        Write-Host "[ERROR] Python installer exited with code $($proc.ExitCode)" -ForegroundColor Red
        exit 1
    }

    # Installer should prepend to user PATH, but ensure our path is present
    Add-UserPath (Join-Path $LocalPyDir "Scripts")
    Add-UserPath $LocalPyDir
    $env:PATH = "$LocalPyDir;$LocalPyDir\Scripts;$env:PATH"
    Write-Host "[ OK ] Python installed to $LocalPyDir" -ForegroundColor Green
}

function Invoke-InstallPrereqs {
    Write-Host "=== Installing developer prerequisites (no admin required) ===" -ForegroundColor White
    Write-Host "    Tools will be installed under: $LocalToolsDir" -ForegroundColor DarkGray
    Write-Host ""
    Install-PythonLocal
    Install-NodeLocal
    Write-Host ""
    Write-Host "==> Prerequisites installed." -ForegroundColor Green
    Write-Host "    Your user PATH has been updated. New terminals will pick this up" -ForegroundColor DarkGray
    Write-Host "    automatically. For the current terminal, re-run '.\dev.ps1' commands" -ForegroundColor DarkGray
    Write-Host "    from this same window (PATH is already set for this session)." -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "    Next: .\dev.ps1 install" -ForegroundColor White
}

# --- Process management ---

function Stop-ExistingServers {
    $killed = $false
    foreach ($port in @(8080, 5173)) {
        try {
            $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
            foreach ($conn in $connections) {
                $pid = $conn.OwningProcess
                if ($pid -and $pid -ne 0) {
                    $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
                    if ($proc) {
                        Write-Host "    Killing existing process on port ${port}: $($proc.ProcessName) (PID $pid)"
                        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
                        $killed = $true
                    }
                }
            }
        } catch {
            # Port not in use, nothing to kill
        }
    }
    if ($killed) {
        Start-Sleep -Seconds 1
    }
}

# --- Commands ---

function Invoke-Doctor {
    Write-Host "=== HMI Development Environment Check ===" -ForegroundColor White
    Write-Host ""

    # Python
    $py = Get-Command python -ErrorAction SilentlyContinue
    if ($py) {
        $pyVer = python --version 2>&1
        Write-Host "[ OK ] $pyVer  ($($py.Source))" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] Python        not found" -ForegroundColor Red
        Write-Host "       Run '.\dev.ps1 install-prereqs' (no admin needed)" -ForegroundColor Yellow
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
        Write-Host "[ OK ] Node.js $ndVer  ($($nd.Source))" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] Node.js       not found" -ForegroundColor Red
        Write-Host "       Run '.\dev.ps1 install-prereqs' (no admin needed)" -ForegroundColor Yellow
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

    # User-local tools
    if (Test-Path $LocalToolsDir) {
        Write-Host "[INFO] User-local tools dir: $LocalToolsDir" -ForegroundColor Cyan
    }

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
    if (-not $py -or -not $nd) {
        Write-Host "Run '.\dev.ps1 install-prereqs' to install Python and Node.js" -ForegroundColor White
        Write-Host "to your user folder (no admin required)." -ForegroundColor White
    } else {
        Write-Host "Run '.\dev.ps1 install' to install project dependencies." -ForegroundColor White
    }
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

function Invoke-Stop {
    Write-Host "==> Stopping any running dev servers..." -ForegroundColor Cyan
    Stop-ExistingServers
    Write-Host "==> Done." -ForegroundColor Green
}

function Invoke-Dev {
    Assert-All
    Ensure-Venv
    Stop-ExistingServers
    Write-Host "==> Starting backend and frontend dev servers..." -ForegroundColor Cyan
    Write-Host "    Backend:  http://localhost:8080"
    Write-Host "    Frontend: http://localhost:5173"
    Write-Host "    (Press Ctrl+C to stop both)" -ForegroundColor DarkGray

    $backend = Start-Process -PassThru -NoNewWindow -FilePath $script:VenvPy `
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
    Ensure-Venv
    Write-Host "==> Seeding database..." -ForegroundColor Cyan
    Push-Location "$RootDir\backend"
    try { & $script:VenvPy -m app.seed } finally { Pop-Location }
}

function Invoke-Install {
    Assert-All
    Ensure-Venv
    Write-Host "==> Installing backend dependencies..." -ForegroundColor Cyan
    Push-Location "$RootDir\backend"
    try {
        if (Test-Path "wheels") {
            Write-Host "    Found bundled wheels - installing offline (no internet required)." -ForegroundColor DarkGray
            & $script:VenvPy -m pip install --no-index --find-links=wheels -r requirements.txt
        } else {
            & $script:VenvPy -m pip install -r requirements.txt
        }
    } finally { Pop-Location }

    Write-Host "==> Installing frontend dependencies..." -ForegroundColor Cyan
    Push-Location "$RootDir\frontend"
    try { npm install } finally { Pop-Location }

    Write-Host "==> All dependencies installed successfully." -ForegroundColor Green
}

# --- Dispatch ---

switch ($Command) {
    "build"           { Invoke-Build }
    "lint"            { Invoke-Lint }
    "check"           { Invoke-Check }
    "dev"             { Invoke-Dev }
    "stop"            { Invoke-Stop }
    "seed"            { Invoke-Seed }
    "install"         { Invoke-Install }
    "install-prereqs" { Invoke-InstallPrereqs }
    "doctor"          { Invoke-Doctor }
    default {
        Write-Host "Usage: .\dev.ps1 <command>" -ForegroundColor White
        Write-Host ""
        Write-Host "Commands:"
        Write-Host "  install-prereqs  Install Python + Node.js to your user folder (no admin required)"
        Write-Host "  install          Install all project dependencies (pip + npm)"
        Write-Host "  dev              Start backend (:8080) + frontend (:5173) dev servers"
        Write-Host "  stop             Stop any running dev servers (ports 8080, 5173)"
        Write-Host "  build            TypeScript check + Vite build"
        Write-Host "  lint             Run ESLint on the frontend"
        Write-Host "  check            Run both build and lint"
        Write-Host "  seed             Seed the database with default users/tags"
        Write-Host "  doctor           Check development environment prerequisites"
        Write-Host ""
        Write-Host "Prerequisites: Python 3.10+, Node.js 18+" -ForegroundColor DarkGray
        Write-Host "No admin rights? Run '.\dev.ps1 install-prereqs' to install both" -ForegroundColor DarkGray
        Write-Host "to your user folder." -ForegroundColor DarkGray
        Write-Host "Run '.\dev.ps1 doctor' to check your setup." -ForegroundColor DarkGray
    }
}
