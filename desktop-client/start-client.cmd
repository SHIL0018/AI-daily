@echo off
setlocal
chcp 65001 >nul

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

if not exist "%SCRIPT_DIR%scripts\start-client.ps1" (
  echo start-client.ps1 was not found.
  echo Path: %SCRIPT_DIR%scripts\start-client.ps1
  echo.
  pause
  exit /b 1
)

echo Activity Daily Windows client launcher
echo Working directory: %CD%
echo.

powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\start-client.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo Client launcher failed. Exit code: %EXIT_CODE%
  echo Check log: %SCRIPT_DIR%logs\start-client.log
  echo.
  echo Press any key to close this window.
  pause >nul
)

exit /b %EXIT_CODE%