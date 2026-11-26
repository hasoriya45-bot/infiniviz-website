@echo off
rem Runs tools\diagnose-viewer.ps1 without changing the system's PowerShell execution policy.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0diagnose-viewer.ps1" %*
exit /b %ERRORLEVEL%
