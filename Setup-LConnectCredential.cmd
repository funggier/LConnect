@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Setup-LConnectCredential.ps1" %*
pause
