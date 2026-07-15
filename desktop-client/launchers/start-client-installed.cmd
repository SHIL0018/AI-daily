@echo off
setlocal
cd /d "%~dp0"
title Activity Daily Client - Startup Checks
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-client.ps1"
set EXIT_CODE=%ERRORLEVEL%
if not "%EXIT_CODE%"=="0" (
  echo.
  echo [Activity Daily] Startup checks failed. Please keep this window open and send the log if you need help.
  pause
  exit /b %EXIT_CODE%
)
endlocal