@echo off
rem Runs tools\export.ps1 without changing the system's PowerShell execution policy.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0export.ps1" %*
exit /b %ERRORLEVEL%
