@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Status-LConnectAutostart.ps1" %*
pause
