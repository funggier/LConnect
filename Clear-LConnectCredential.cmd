@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Clear-LConnectCredential.ps1" %*
pause
