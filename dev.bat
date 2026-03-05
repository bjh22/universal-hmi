@echo off
setlocal

set ROOT_DIR=%~dp0

if "%~1"=="" goto usage
if "%~1"=="build" goto build
if "%~1"=="lint" goto lint
if "%~1"=="check" goto check
if "%~1"=="dev" goto dev
if "%~1"=="seed" goto seed
if "%~1"=="install" goto install_deps
goto usage

:build
echo ==^> Building frontend...
cd /d "%ROOT_DIR%frontend" && npm run build
goto end

:lint
echo ==^> Linting frontend...
cd /d "%ROOT_DIR%frontend" && npm run lint
goto end

:check
echo ==^> Building frontend...
cd /d "%ROOT_DIR%frontend" && npm run build
if errorlevel 1 goto end
echo ==^> Linting frontend...
cd /d "%ROOT_DIR%frontend" && npm run lint
if errorlevel 1 goto end
echo ==^> All checks passed.
goto end

:dev
echo ==^> Starting backend and frontend dev servers...
echo     Backend:  http://localhost:8080
echo     Frontend: http://localhost:5173
start "HMI Backend" cmd /c "cd /d "%ROOT_DIR%backend" && python run.py"
cd /d "%ROOT_DIR%frontend" && npm run dev
goto end

:seed
echo ==^> Seeding database...
cd /d "%ROOT_DIR%backend" && python -m app.seed
goto end

:install_deps
echo ==^> Installing backend dependencies...
cd /d "%ROOT_DIR%backend" && pip install -r requirements.txt
echo ==^> Installing frontend dependencies...
cd /d "%ROOT_DIR%frontend" && npm install
goto end

:usage
echo Usage: dev.bat ^<command^>
echo.
echo Commands:
echo   build       Build the frontend (TypeScript check + Vite build)
echo   lint        Run ESLint on the frontend
echo   check       Run both build and lint
echo   dev         Start backend and frontend dev servers
echo   seed        Seed the backend database with defaults
echo   install     Install all dependencies
goto end

:end
endlocal
