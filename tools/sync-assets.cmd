@echo off
rem Runs tools\sync-assets.ps1 without changing the system's PowerShell execution policy.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sync-assets.ps1" %*
exit /b %ERRORLEVEL%
