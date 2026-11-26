@echo off
rem Runs tools\test-site.ps1 without changing the system's PowerShell execution policy.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0test-site.ps1" %*
exit /b %ERRORLEVEL%
