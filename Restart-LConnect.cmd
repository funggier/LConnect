@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Restart-LConnect.ps1" %*
pause
