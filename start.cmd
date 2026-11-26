@echo off
rem Double-click to preview the INFINIVIZ website locally.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1" -Port 8080 -Open
