@echo off
chcp 65001 >nul
REM GeminiHydra - Windows Terminal Launcher
REM Fix #10: Windows Terminal provides better stdin handling than cmd.exe

REM Check if Windows Terminal is available
where wt >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Windows Terminal not found. Using PowerShell instead.
    echo For best experience, install Windows Terminal from Microsoft Store.
    powershell -NoExit -Command "cd '%~dp0'; npm start -- %*"
    exit /b
)

REM Launch in Windows Terminal with PowerShell
wt -d "%~dp0" pwsh -NoExit -Command "npm start -- %*"
