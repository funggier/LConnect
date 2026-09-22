@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Refresh-LConnect.ps1" %*
pause
