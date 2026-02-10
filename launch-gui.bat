@echo off
chcp 65001 >nul
cd /d "%~dp0GeminiGUI"
powershell -ExecutionPolicy Bypass -File "clean-start.ps1"
pause