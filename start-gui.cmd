@echo off
:: Claude Code GUI - Production Launcher
:: Uruchamia zbudowana aplikacje (szybki start)

title Claude Code GUI
echo ========================================
echo   Claude Code GUI - Starting...
echo ========================================
echo.

set "APP_PATH=%~dp0claude-gui\src-tauri\target\release\claude-gui.exe"

if not exist "%APP_PATH%" (
    echo [ERROR] Aplikacja nie jest zbudowana!
    echo Uruchom najpierw: npm run tauri build
    echo.
    echo Przechodze do trybu deweloperskiego...
    timeout /t 3
    call "%~dp0start-gui-dev.cmd"
    exit /b
)

echo Starting: %APP_PATH%
start "" "%APP_PATH%"
