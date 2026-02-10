@echo off
chcp 65001 >nul
REM ══════════════════════════════════════════════════════════════
REM  GeminiHydra - Claude Code w Windows Terminal
REM ══════════════════════════════════════════════════════════════

cd /d "%~dp0"

REM Uruchom Claude Code w Windows Terminal z PowerShell
wt -d "%~dp0" pwsh -NoExit -Command "& {$env:SHELL='pwsh'; claude}"
