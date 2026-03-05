param(
    [Parameter(Position=0)]
    [ValidateSet("build", "lint", "check", "dev", "seed", "install")]
    [string]$Command
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Invoke-Build {
    Write-Host "==> Building frontend..." -ForegroundColor Cyan
    Push-Location "$RootDir\frontend"
    try { npm run build } finally { Pop-Location }
}

function Invoke-Lint {
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
    Write-Host "==> Starting backend and frontend dev servers..." -ForegroundColor Cyan
    Write-Host "    Backend:  http://localhost:8080"
    Write-Host "    Frontend: http://localhost:5173"

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
    Write-Host "==> Seeding database..." -ForegroundColor Cyan
    Push-Location "$RootDir\backend"
    try { python -m app.seed } finally { Pop-Location }
}

function Invoke-Install {
    Write-Host "==> Installing backend dependencies..." -ForegroundColor Cyan
    Push-Location "$RootDir\backend"
    try { pip install -r requirements.txt } finally { Pop-Location }

    Write-Host "==> Installing frontend dependencies..." -ForegroundColor Cyan
    Push-Location "$RootDir\frontend"
    try { npm install } finally { Pop-Location }
}

switch ($Command) {
    "build"   { Invoke-Build }
    "lint"    { Invoke-Lint }
    "check"   { Invoke-Check }
    "dev"     { Invoke-Dev }
    "seed"    { Invoke-Seed }
    "install" { Invoke-Install }
    default {
        Write-Host "Usage: .\dev.ps1 <command>" -ForegroundColor White
        Write-Host ""
        Write-Host "Commands:"
        Write-Host "  build       Build the frontend (TypeScript check + Vite build)"
        Write-Host "  lint        Run ESLint on the frontend"
        Write-Host "  check       Run both build and lint"
        Write-Host "  dev         Start backend and frontend dev servers"
        Write-Host "  seed        Seed the backend database with defaults"
        Write-Host "  install     Install all dependencies"
    }
}
