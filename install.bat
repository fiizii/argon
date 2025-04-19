@echo off
setlocal enabledelayedexpansion


where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Node.js is not installed
    pause
    exit /b 1
)

echo Found Node.js:
node --version

where npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo npm is not installed or not in your PATH
    pause
    exit /b 1
)

if not exist package.json (
    echo Warning: package.json not found in current directory
    choice /M "Continue anyway?"
    if !ERRORLEVEL! NEQ 1 exit /b 1
)

set "MAIN=index.js"
if not exist %MAIN% (
    echo Warning: %MAIN% not found
    set /p MAIN="Bot file (default: index.js): "
    if "!MAIN!"=="" set "MAIN=index.js"
    if not exist !MAIN! (
        echo Error: !MAIN! not found
        pause
        exit /b 1
    )
)

echo Checking for dependencies...
if exist package.json (
    if not exist node_modules (
        echo Installing dependencies...
        npm install
        if !ERRORLEVEL! NEQ 0 (
            echo Failed to install dependencies
            pause
            exit /b 1
        )
    )
)

echo Starting Argon

:startBot
echo [%date% %time%] Launching Argon...
node %MAIN%

if %ERRORLEVEL% NEQ 0 (
    echo [%date% %time%] Argon crashed with error code %ERRORLEVEL%
    echo Restarting in 5 seconds...
    timeout /t 5 /nobreak
    goto startBot
) else (
    echo [%date% %time%] Argon exited normally
    choice /T 10 /D Y /M "Restart Argon?"
    if !ERRORLEVEL! EQU 1 goto startBot
)

echo Argon service terminated.
pause