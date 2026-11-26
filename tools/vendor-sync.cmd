@echo off
rem Runs tools\vendor-sync.ps1 without changing the system's PowerShell execution policy.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0vendor-sync.ps1" %*
exit /b %ERRORLEVEL%
