@echo off
cd /d "%~dp0"
powershell -NoProfile -File "%~dp0scripts\start-local.ps1" -Port 3001
pause
