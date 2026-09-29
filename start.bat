@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed. Run setup.bat after installing Node.js.
  pause
  exit /b 1
)
if not exist "node_modules" (
  echo Dependencies are missing. Running setup first...
  call setup.bat
)
start "" "http://127.0.0.1:5173"
call npm run dev
