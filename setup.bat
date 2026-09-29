@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed.
  echo Please install Node.js 22.5 or newer, then run this file again.
  pause
  exit /b 1
)
echo Installing dependencies...
call npm install
if errorlevel 1 goto :fail
echo Initializing local SQLite database...
call npm run db:migrate
if errorlevel 1 goto :fail
echo.
echo Setup completed successfully.
pause
exit /b 0
:fail
echo.
echo Setup failed. Please copy the error message and send it to ChatGPT.
pause
exit /b 1
