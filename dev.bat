@echo off
setlocal enabledelayedexpansion

set ROOT_DIR=%~dp0

REM --- User-local tools directory (no admin required) ---
REM Node.js and Python are installed here by `install-prereqs` so developers
REM without admin rights can set up the environment entirely under their user
REM profile. These paths are prepended to PATH for the current session so
REM subsequent commands (install, dev, etc.) find the tools immediately.

set "LOCAL_TOOLS_DIR=%USERPROFILE%\.universal-hmi\tools"
set "LOCAL_NODE_DIR=%LOCAL_TOOLS_DIR%\node"
set "LOCAL_PY_DIR=%LOCAL_TOOLS_DIR%\python"

REM Pinned versions for reproducible installs
set "NODE_VERSION=22.11.0"
set "PYTHON_VERSION=3.12.7"

if exist "%LOCAL_NODE_DIR%\node.exe" set "PATH=%LOCAL_NODE_DIR%;%PATH%"
if exist "%LOCAL_PY_DIR%\python.exe" set "PATH=%LOCAL_PY_DIR%;%LOCAL_PY_DIR%\Scripts;%PATH%"

if "%~1"=="" goto usage
if /i "%~1"=="build" goto build
if /i "%~1"=="lint" goto lint
if /i "%~1"=="check" goto check
if /i "%~1"=="dev" goto dev
if /i "%~1"=="stop" goto stop
if /i "%~1"=="seed" goto seed
if /i "%~1"=="install" goto install_deps
if /i "%~1"=="install-prereqs" goto install_prereqs
if /i "%~1"=="doctor" goto doctor
goto usage

:check_python
where python >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not installed or not on PATH.
    echo.
    echo Run "dev.bat install-prereqs" to install Python to your user folder
    echo (no admin required), or install Python 3.10+ manually:
    echo   https://www.python.org/downloads/
    echo   winget install Python.Python.3.12
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
    echo Run "dev.bat install-prereqs" to install Node.js to your user folder
    echo (no admin required), or install Node.js 18+ LTS manually:
    echo   https://nodejs.org/
    echo   winget install OpenJS.NodeJS.LTS
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

:ensure_venv
call :check_python
if errorlevel 1 exit /b 1
if not exist "%ROOT_DIR%.venv\Scripts\python.exe" (
    echo     Creating virtual environment (.venv\)...
    python -m venv "%ROOT_DIR%.venv"
)
set "PY=%ROOT_DIR%.venv\Scripts\python.exe"
set "PIP=%ROOT_DIR%.venv\Scripts\pip.exe"
exit /b 0

REM --- User-local installers (no admin required) ---

REM Persist a directory in the user's PATH via HKCU (no admin). Uses PowerShell
REM because `setx` truncates PATH values longer than 1024 chars, which is
REM common on locked-down corporate laptops.
:add_user_path
REM %~1 = directory to prepend
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$dir = '%~1';" ^
    "$current = [Environment]::GetEnvironmentVariable('Path', 'User'); if (-not $current) { $current = '' };" ^
    "$parts = @($current.Split(';') ^| Where-Object { $_ -and $_ -ne $dir });" ^
    "$newPath = (@($dir) + $parts) -join ';';" ^
    "[Environment]::SetEnvironmentVariable('Path', $newPath, 'User')"
exit /b 0

:install_node_local
where node >nul 2>&1
if not errorlevel 1 (
    for /f "tokens=1 delims=." %%a in ('node --version') do set EXISTINGVER=%%a
    set EXISTINGVER=!EXISTINGVER:v=!
    if !EXISTINGVER! GEQ 18 (
        for /f %%v in ('node --version') do echo [ OK ] Node.js %%v already available -- skipping.
        exit /b 0
    )
)

echo ==^> Installing Node.js v%NODE_VERSION% to %LOCAL_NODE_DIR% ...
set "NODE_ZIP_NAME=node-v%NODE_VERSION%-win-x64"
set "NODE_URL=https://nodejs.org/dist/v%NODE_VERSION%/%NODE_ZIP_NAME%.zip"
set "TMP_ZIP=%TEMP%\%NODE_ZIP_NAME%.zip"
set "TMP_EXTRACT=%TEMP%\universal-hmi-node-extract"

if not exist "%LOCAL_TOOLS_DIR%" mkdir "%LOCAL_TOOLS_DIR%"
if exist "%LOCAL_NODE_DIR%" rmdir /s /q "%LOCAL_NODE_DIR%"
if exist "%TMP_EXTRACT%" rmdir /s /q "%TMP_EXTRACT%"
mkdir "%TMP_EXTRACT%"

echo     Downloading %NODE_URL% ...
where curl.exe >nul 2>&1
if errorlevel 1 (
    powershell -NoProfile -Command ^
        "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;" ^
        "Invoke-WebRequest -Uri '%NODE_URL%' -OutFile '%TMP_ZIP%' -UseBasicParsing"
) else (
    curl.exe -fsSL -o "%TMP_ZIP%" "%NODE_URL%"
)
if errorlevel 1 (
    echo [ERROR] Failed to download Node.js.
    echo         Check your internet connection or download manually from https://nodejs.org/
    echo         If behind a corporate proxy, set HTTPS_PROXY before running this script.
    exit /b 1
)

echo     Extracting ...
where tar.exe >nul 2>&1
if errorlevel 1 (
    powershell -NoProfile -Command "Expand-Archive -Path '%TMP_ZIP%' -DestinationPath '%TMP_EXTRACT%' -Force"
) else (
    tar.exe -xf "%TMP_ZIP%" -C "%TMP_EXTRACT%"
)
if errorlevel 1 (
    echo [ERROR] Failed to extract Node.js archive.
    exit /b 1
)

move /y "%TMP_EXTRACT%\%NODE_ZIP_NAME%" "%LOCAL_NODE_DIR%" >nul
rmdir /s /q "%TMP_EXTRACT%" 2>nul
del /q "%TMP_ZIP%" 2>nul

call :add_user_path "%LOCAL_NODE_DIR%"
set "PATH=%LOCAL_NODE_DIR%;%PATH%"
echo [ OK ] Node.js installed to %LOCAL_NODE_DIR%
exit /b 0

:install_python_local
where python >nul 2>&1
if not errorlevel 1 (
    for /f "tokens=2 delims= " %%v in ('python --version 2^>^&1') do set EXISTINGPYVER=%%v
    for /f "tokens=1,2 delims=." %%a in ("!EXISTINGPYVER!") do (
        if %%a GEQ 3 if %%b GEQ 10 (
            echo [ OK ] Python !EXISTINGPYVER! already available -- skipping.
            exit /b 0
        )
    )
)

echo ==^> Installing Python %PYTHON_VERSION% ^(user scope, no admin^) ...
set "PY_INSTALLER=python-%PYTHON_VERSION%-amd64.exe"
set "PY_URL=https://www.python.org/ftp/python/%PYTHON_VERSION%/%PY_INSTALLER%"
set "TMP_EXE=%TEMP%\%PY_INSTALLER%"

echo     Downloading %PY_URL% ...
where curl.exe >nul 2>&1
if errorlevel 1 (
    powershell -NoProfile -Command ^
        "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;" ^
        "Invoke-WebRequest -Uri '%PY_URL%' -OutFile '%TMP_EXE%' -UseBasicParsing"
) else (
    curl.exe -fsSL -o "%TMP_EXE%" "%PY_URL%"
)
if errorlevel 1 (
    echo [ERROR] Failed to download Python.
    echo         Check your internet connection or download manually from https://www.python.org/downloads/
    echo         If behind a corporate proxy, set HTTPS_PROXY before running this script.
    exit /b 1
)

echo     Running installer ^(user scope, no admin prompt^) ...
if not exist "%LOCAL_PY_DIR%" mkdir "%LOCAL_PY_DIR%"
REM InstallAllUsers=0 -> per-user install to %LOCALAPPDATA%\Programs\Python\...
REM PrependPath=1     -> add python + Scripts to the user's PATH
REM Include_launcher=0 -> skip the py launcher (which needs admin)
REM TargetDir         -> force a known location under the user profile
"%TMP_EXE%" /passive InstallAllUsers=0 PrependPath=1 Include_launcher=0 Include_test=0 SimpleInstall=1 "TargetDir=%LOCAL_PY_DIR%"
set PY_EXIT=!errorlevel!
del /q "%TMP_EXE%" 2>nul

if not !PY_EXIT!==0 (
    echo [ERROR] Python installer exited with code !PY_EXIT!
    exit /b 1
)

call :add_user_path "%LOCAL_PY_DIR%\Scripts"
call :add_user_path "%LOCAL_PY_DIR%"
set "PATH=%LOCAL_PY_DIR%;%LOCAL_PY_DIR%\Scripts;%PATH%"
echo [ OK ] Python installed to %LOCAL_PY_DIR%
exit /b 0

:install_prereqs
echo === Installing developer prerequisites ^(no admin required^) ===
echo     Tools will be installed under: %LOCAL_TOOLS_DIR%
echo.
call :install_python_local
if errorlevel 1 goto end
call :install_node_local
if errorlevel 1 goto end
echo.
echo ==^> Prerequisites installed.
echo     Your user PATH has been updated. New terminals will pick this up
echo     automatically. For the current terminal, re-run "dev.bat" commands
echo     from this same window ^(PATH is already set for this session^).
echo.
echo     Next: dev.bat install
goto end

:doctor
echo === HMI Development Environment Check ===
echo.

where python >nul 2>&1
if errorlevel 1 (
    echo [FAIL] Python        not found
    echo        Run "dev.bat install-prereqs" ^(no admin needed^)
) else (
    for /f "tokens=*" %%v in ('python --version 2^>^&1') do (
        for /f "tokens=*" %%p in ('where python') do (
            echo [ OK ] %%v  ^(%%p^)
            goto :py_done
        )
    )
    :py_done
)

where pip >nul 2>&1
if errorlevel 1 (
    echo [FAIL] pip           not found
) else (
    echo [ OK ] pip installed
)

where node >nul 2>&1
if errorlevel 1 (
    echo [FAIL] Node.js       not found
    echo        Run "dev.bat install-prereqs" ^(no admin needed^)
) else (
    for /f "tokens=*" %%v in ('node --version') do (
        for /f "tokens=*" %%p in ('where node') do (
            echo [ OK ] Node.js %%v  ^(%%p^)
            goto :node_done
        )
    )
    :node_done
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

if exist "%LOCAL_TOOLS_DIR%" (
    echo [INFO] User-local tools dir: %LOCAL_TOOLS_DIR%
)

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
where python >nul 2>&1
set PY_MISSING=!errorlevel!
where node >nul 2>&1
set NODE_MISSING=!errorlevel!
if !PY_MISSING!==1 goto :doctor_prereqs
if !NODE_MISSING!==1 goto :doctor_prereqs
echo Run "dev.bat install" to install project dependencies.
goto end
:doctor_prereqs
echo Run "dev.bat install-prereqs" to install Python and Node.js
echo to your user folder (no admin required).
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

:kill_existing
REM Kill processes on port 8080 (backend)
for /f "tokens=5" %%p in ('netstat -ano 2^>nul ^| findstr ":8080 " ^| findstr "LISTENING"') do (
    if not "%%p"=="0" (
        echo     Killing existing process on port 8080 (PID %%p)
        taskkill /PID %%p /F >nul 2>&1
    )
)
REM Kill processes on port 5173 (frontend)
for /f "tokens=5" %%p in ('netstat -ano 2^>nul ^| findstr ":5173 " ^| findstr "LISTENING"') do (
    if not "%%p"=="0" (
        echo     Killing existing process on port 5173 (PID %%p)
        taskkill /PID %%p /F >nul 2>&1
    )
)
exit /b 0

:stop
echo ==^> Stopping any running dev servers...
call :kill_existing
echo ==^> Done.
goto end

:dev
call :check_all
if errorlevel 1 goto end
call :ensure_venv
if errorlevel 1 goto end
call :kill_existing
echo ==^> Starting backend and frontend dev servers...
echo     Backend:  http://localhost:8080
echo     Frontend: http://localhost:5173
echo     (Close this window or press Ctrl+C to stop both)
start "HMI Backend" cmd /c "cd /d "%ROOT_DIR%backend" && "%PY%" run.py"
cd /d "%ROOT_DIR%frontend" && npm run dev
goto end

:seed
call :ensure_venv
if errorlevel 1 goto end
echo ==^> Seeding database...
cd /d "%ROOT_DIR%backend" && "%PY%" -m app.seed
goto end

:install_deps
call :check_all
if errorlevel 1 goto end
call :ensure_venv
if errorlevel 1 goto end
echo ==^> Installing backend dependencies...
if exist "%ROOT_DIR%backend\wheels" (
    echo     Found bundled wheels -- installing offline (no internet required).
    cd /d "%ROOT_DIR%backend" && "%PIP%" install --no-index --find-links=wheels -r requirements.txt
) else (
    cd /d "%ROOT_DIR%backend" && "%PIP%" install -r requirements.txt
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
echo   install-prereqs  Install Python + Node.js to your user folder (no admin required)
echo   install          Install all project dependencies (pip + npm)
echo   dev              Start backend (:8080) + frontend (:5173) dev servers
echo   stop             Stop any running dev servers (ports 8080, 5173)
echo   build            TypeScript check + Vite build
echo   lint             Run ESLint on the frontend
echo   check            Run both build and lint
echo   seed             Seed the database with default users/tags
echo   doctor           Check development environment prerequisites
echo.
echo Prerequisites: Python 3.10+, Node.js 18+
echo No admin rights? Run "dev.bat install-prereqs" to install both
echo to your user folder.
echo Run "dev.bat doctor" to check your setup.
goto end

:end
endlocal
