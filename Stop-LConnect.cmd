@echo off
setlocal
set "_lconnect_hold=1"
if /i "%~1"=="--no-hold" set "_lconnect_hold=0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Stop-LConnect.ps1"
set "_lconnect_rc=%errorlevel%"

if "%_lconnect_hold%"=="1" (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Hold-LConnectConsole.ps1"
)

exit /b %_lconnect_rc%
