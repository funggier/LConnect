@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Status-LConnectCredential.ps1" %*
pause
