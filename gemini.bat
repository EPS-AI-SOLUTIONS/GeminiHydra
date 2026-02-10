@echo off
chcp 65001 >nul
REM GeminiHydra v14.0 - School of the Wolf Edition
REM Interactive Chat Launcher with STDIN fixes

cd /d "%~dp0"

REM Hint about Windows Terminal
echo.
echo [INFO] Jesli prompt nie reaguje, uzyj: gemini-wt.bat (Windows Terminal)
echo        lub wylacz Quick Edit Mode w CMD (PPM na pasek tytulowy -^> Wlasciwosci)
echo.

REM Build if dist doesn't exist
if not exist "%~dp0dist\bin\gemini.js" (
    echo [!] Building TypeScript...
    call npx tsc
)

REM If no arguments, start interactive mode
if "%~1"=="" (
    node "%~dp0dist\bin\gemini.js" --interactive
) else (
    node "%~dp0dist\bin\gemini.js" %*
)
