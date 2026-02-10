@echo off
chcp 65001 >nul
REM ============================================================
REM GeminiHydra - Llama.cpp Model Server
REM ============================================================
REM Uruchamia serwer modelu GGUF z API kompatybilnym z OpenAI
REM Endpoint: http://localhost:8081/v1/chat/completions
REM ============================================================

setlocal

REM Ścieżki
set LLAMA_SERVER=bin\llama\llama-server.exe
set MODEL_PATH=models\tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf

REM Konfiguracja serwera
set PORT=8081
set HOST=0.0.0.0
set CONTEXT_SIZE=4096
set THREADS=4
set GPU_LAYERS=0

REM Sprawdź czy serwer istnieje
if not exist "%LLAMA_SERVER%" (
    echo [ERROR] Nie znaleziono llama-server.exe
    echo         Uruchom: bin\llama\llama-server.exe
    pause
    exit /b 1
)

REM Sprawdź czy model istnieje
if not exist "%MODEL_PATH%" (
    echo [ERROR] Nie znaleziono modelu: %MODEL_PATH%
    echo         Pobierz model GGUF i umieść w katalogu models/
    pause
    exit /b 1
)

echo ============================================================
echo   GeminiHydra Llama.cpp Server
echo ============================================================
echo.
echo   Model:    %MODEL_PATH%
echo   Port:     %PORT%
echo   Context:  %CONTEXT_SIZE%
echo   Threads:  %THREADS%
echo.
echo   API Endpoints:
echo   - http://localhost:%PORT%/v1/chat/completions
echo   - http://localhost:%PORT%/v1/completions
echo   - http://localhost:%PORT%/health
echo.
echo ============================================================
echo.

REM Uruchom serwer
"%LLAMA_SERVER%" ^
    --model "%MODEL_PATH%" ^
    --port %PORT% ^
    --host %HOST% ^
    --ctx-size %CONTEXT_SIZE% ^
    --threads %THREADS% ^
    --n-gpu-layers %GPU_LAYERS% ^
    --verbose

pause
