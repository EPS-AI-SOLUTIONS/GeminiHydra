@echo off
chcp 65001 >nul
REM ══════════════════════════════════════════════════════════════
REM  GeminiHydra - Gemini CLI Launcher
REM ══════════════════════════════════════════════════════════════
cd /d "%~dp0"

echo [%date% %time%] START >> gemini-launcher.log

:loop
echo.
echo ========================================
echo   GeminiHydra - Gemini CLI
echo ========================================
echo.

echo [%date% %time%] Uruchamiam Gemini CLI... >> gemini-launcher.log

REM Uruchom Gemini CLI
call "%~dp0gemini.bat"

echo [%date% %time%] Gemini CLI zakonczyl sie z kodem: %errorlevel% >> gemini-launcher.log

echo.
echo ========================================
echo   Sesja zakonczona
echo   [R] Uruchom ponownie
echo   [Q] Zamknij
echo ========================================
echo.

choice /c RQ /n /m "Wybierz opcje: "
if errorlevel 2 goto end
if errorlevel 1 goto loop

:end
echo [%date% %time%] KONIEC >> gemini-launcher.log
