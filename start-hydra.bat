@echo off
setlocal enabledelayedexpansion
title GeminiHydra - Witcher Swarm
cd /d "%~dp0"

:: Timestamp for log file
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set datetime=%%I
set logfile=logs\hydra-%datetime:~0,8%-%datetime:~8,6%.log

:: Create logs directory if not exists
if not exist logs mkdir logs

echo ========================================
echo   GeminiHydra - Witcher Swarm
echo   Started: %date% %time%
echo ========================================
echo.

:: Log header
echo ======================================== >> "%logfile%"
echo [%date% %time%] Starting GeminiHydra >> "%logfile%"
echo ======================================== >> "%logfile%"

:: Run and capture output
call pnpm start
set exitcode=!errorlevel!

:: Handle errors
if !exitcode! neq 0 (
    echo.
    echo ========================================
    echo   [ERROR] Exit code: !exitcode!
    echo   Check logs: %logfile%
    echo ========================================
    echo [%date% %time%] ERROR: Exit code !exitcode! >> "%logfile%"
    color 4F
) else (
    echo [%date% %time%] Session ended normally >> "%logfile%"
)

echo.
echo ----------------------------------------
echo Session ended. Press any key to close...
pause >nul
