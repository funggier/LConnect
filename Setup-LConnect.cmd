@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Setup-LConnect.ps1" %*
exit /b %ERRORLEVEL%
