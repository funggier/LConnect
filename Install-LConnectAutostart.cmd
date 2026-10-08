@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-LConnectAutostart.ps1" %*
pause
