@echo off
setlocal enabledelayedexpansion

set ROOT_DIR=%~dp0

if "%~1"=="" goto usage
if "%~1"=="build" goto build
if "%~1"=="lint" goto lint
if "%~1"=="check" goto check
if "%~1"=="dev" goto dev
if "%~1"=="seed" goto seed
if "%~1"=="install" goto install_deps
if "%~1"=="doctor" goto doctor
goto usage

:check_python
where python >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not installed or not on PATH.
    echo.
    echo Install Python 3.10+ from https://www.python.org/downloads/
    echo  - Check "Add python.exe to PATH" during install
    echo  - Or install via winget:  winget install Python.Python.3.12
    exit /b 1
)
for /f "tokens=2 delims= " %%v in ('python --version 2^>^&1') do set PYVER=%%v
for /f "tokens=1,2 delims=." %%a in ("!PYVER!") do (
    if %%a LSS 3 (
        echo [ERROR] Python 3.10+ required, found !PYVER!
        exit /b 1
    )
    if %%a==3 if %%b LSS 10 (
        echo [ERROR] Python 3.10+ required, found !PYVER!
        exit /b 1
    )
)
exit /b 0

:check_node
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed or not on PATH.
    echo.
    echo Install Node.js 18+ LTS from https://nodejs.org/
    echo  - Or install via winget:  winget install OpenJS.NodeJS.LTS
    exit /b 1
)
for /f "tokens=1 delims=v." %%a in ('node --version') do set NODEMAJOR=%%a
REM node --version returns "v22.x.x", strip the v
for /f "tokens=1 delims=." %%a in ('node --version') do set NODEVER=%%a
set NODEVER=!NODEVER:v=!
if !NODEVER! LSS 18 (
    echo [ERROR] Node.js 18+ required, found older version.
    exit /b 1
)
exit /b 0

:check_npm
where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm is not installed. It should come with Node.js.
    echo Reinstall Node.js from https://nodejs.org/
    exit /b 1
)
exit /b 0

:check_all
call :check_python
if errorlevel 1 exit /b 1
call :check_node
if errorlevel 1 exit /b 1
call :check_npm
if errorlevel 1 exit /b 1
exit /b 0

:doctor
echo === HMI Development Environment Check ===
echo.

where python >nul 2>&1
if errorlevel 1 (
    echo [FAIL] Python        not found
    echo        Install from https://www.python.org/downloads/
) else (
    for /f "tokens=*" %%v in ('python --version 2^>^&1') do echo [ OK ] %%v
)

where pip >nul 2>&1
if errorlevel 1 (
    echo [FAIL] pip           not found
) else (
    for /f "tokens=*" %%v in ('pip --version 2^>^&1') do echo [ OK ] pip found
)

where node >nul 2>&1
if errorlevel 1 (
    echo [FAIL] Node.js       not found
    echo        Install from https://nodejs.org/
) else (
    for /f "tokens=*" %%v in ('node --version') do echo [ OK ] Node.js %%v
)

where npm >nul 2>&1
if errorlevel 1 (
    echo [FAIL] npm           not found
) else (
    for /f "tokens=*" %%v in ('npm --version') do echo [ OK ] npm %%v
)

where git >nul 2>&1
if errorlevel 1 (
    echo [WARN] Git           not found (optional, needed for version control)
) else (
    for /f "tokens=*" %%v in ('git --version') do echo [ OK ] %%v
)

echo.

if exist "%ROOT_DIR%backend\hmi.db" (
    echo [ OK ] Database exists (backend\hmi.db)
) else (
    echo [INFO] No database yet - run: dev.bat seed
)

if exist "%ROOT_DIR%frontend\node_modules" (
    echo [ OK ] Frontend dependencies installed
) else (
    echo [INFO] Frontend dependencies not installed - run: dev.bat install
)

echo.
echo Run "dev.bat install" to install project dependencies.
goto end

:build
call :check_node
if errorlevel 1 goto end
echo ==^> Building frontend...
cd /d "%ROOT_DIR%frontend" && npm run build
goto end

:lint
call :check_node
if errorlevel 1 goto end
echo ==^> Linting frontend...
cd /d "%ROOT_DIR%frontend" && npm run lint
goto end

:check
call :check_node
if errorlevel 1 goto end
echo ==^> Building frontend...
cd /d "%ROOT_DIR%frontend" && npm run build
if errorlevel 1 goto end
echo ==^> Linting frontend...
cd /d "%ROOT_DIR%frontend" && npm run lint
if errorlevel 1 goto end
echo ==^> All checks passed.
goto end

:dev
call :check_all
if errorlevel 1 goto end
echo ==^> Starting backend and frontend dev servers...
echo     Backend:  http://localhost:8080
echo     Frontend: http://localhost:5173
echo     (Close this window or press Ctrl+C to stop both)
start "HMI Backend" cmd /c "cd /d "%ROOT_DIR%backend" && python run.py"
cd /d "%ROOT_DIR%frontend" && npm run dev
goto end

:seed
call :check_python
if errorlevel 1 goto end
echo ==^> Seeding database...
cd /d "%ROOT_DIR%backend" && python -m app.seed
goto end

:install_deps
call :check_all
if errorlevel 1 goto end
echo ==^> Installing backend dependencies...
if exist "%ROOT_DIR%backend\wheels" (
    echo     Found bundled wheels -- installing offline (no internet required).
    cd /d "%ROOT_DIR%backend" && pip install --no-index --find-links=wheels -r requirements.txt
) else (
    cd /d "%ROOT_DIR%backend" && pip install -r requirements.txt
)
if errorlevel 1 (
    echo [ERROR] Backend dependency install failed.
    goto end
)
echo ==^> Installing frontend dependencies...
cd /d "%ROOT_DIR%frontend" && npm install
if errorlevel 1 (
    echo [ERROR] Frontend dependency install failed.
    goto end
)
echo ==^> All dependencies installed successfully.
goto end

:usage
echo Usage: dev.bat ^<command^>
echo.
echo Commands:
echo   install     Install all dependencies (pip + npm)
echo   dev         Start backend (:8080) + frontend (:5173) dev servers
echo   build       TypeScript check + Vite build
echo   lint        Run ESLint on the frontend
echo   check       Run both build and lint
echo   seed        Seed the database with default users/tags
echo   doctor      Check development environment prerequisites
echo.
echo Prerequisites: Python 3.10+, Node.js 18+
echo Run "dev.bat doctor" to check your setup.
goto end

:end
endlocal
