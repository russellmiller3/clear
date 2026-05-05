@echo off
REM ==============================================================
REM   Clear Studio launcher
REM   Double-click this (or its desktop shortcut) to:
REM     1. Pull the latest code (fast-forward only — never destructive)
REM     2. Restart the Studio server on port 3456
REM     3. Open Studio in a Chrome app window (no URL bar, no tabs)
REM ==============================================================

setlocal
title Clear Studio
cd /d "%~dp0"

echo ==============================
echo   Clear Studio
echo ==============================
echo.

REM ---- Step 1: pull latest (safe: fast-forward only) ----
echo [1/4] Pulling latest...
git pull --ff-only >nul 2>&1
if errorlevel 1 (
  echo       Skipped pull ^(local changes or no upstream^).
) else (
  echo       Up to date.
)

REM ---- Step 2: stop any running Studio + Marcus apps so they pick up the rebuild ----
echo [2/5] Stopping old Studio + Marcus apps if running...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":3456 "') do (
  taskkill /pid %%a /f >nul 2>&1
)
REM Marcus app ports (from .claude/launch.json marcus-* entries)
for %%P in (4100 4101 4102 4103 4104) do (
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":%%P "') do (
    taskkill /pid %%a /f >nul 2>&1
  )
)

REM ---- Step 3: rebuild every Marcus app with the latest compiler ----
REM Without this, the compiled <app>/server.js stays whatever it was last
REM time — so a freshly-pulled compiler.js change (button styles, layout
REM rules, etc.) doesn't reach the running app until each one is rebuilt.
echo [3/5] Rebuilding Marcus apps with latest compiler...
for %%A in (deal-desk lead-router approval-queue onboarding-tracker internal-request-queue) do (
  if exist "apps\%%A\main.clear" (
    node cli\clear.js build "apps\%%A\main.clear" >nul 2>&1
    if errorlevel 1 (
      echo       %%A: BUILD FAILED ^(skipped^)
    ) else (
      echo       %%A: rebuilt
    )
  )
)

REM ---- Step 4: start fresh Studio server (minimized) ----
REM Route Meph through your Claude Code subscription instead of an Anthropic
REM API key. cc-agent spawns the local `claude` CLI, which bills against your
REM Claude Code plan. No x-api-key needed; no 401 even if the API key is empty
REM or capped. GHOST_MEPH_CC_TOOLS=1 turns on the tool-dispatch mode (28 Meph
REM tools auto-routed through the MCP server) — text-only mode is the older
REM fallback.
echo [4/5] Starting Studio server with latest code (Meph via Claude Code)...
start "Clear Studio Server" /min cmd /c "set MEPH_BRAIN=cc-agent && set GHOST_MEPH_CC_TOOLS=1 && node playground\server.js"

REM Wait up to 30 seconds for the port to come alive
set /a WAIT_TRIES=0
:wait_loop
timeout /t 1 /nobreak >nul
set /a WAIT_TRIES+=1
if %WAIT_TRIES% GEQ 30 goto fail
netstat -ano | findstr "LISTENING" | findstr ":3456 " >nul
if errorlevel 1 goto wait_loop

REM ---- Step 4: open in Chrome's app mode ----
REM ?studio-mode=classic forces the 3-panel dev view (editor + preview + Meph
REM chat). Without the param, Studio defaults to Builder Mode (Marcus-first
REM layout). The view switcher at the top of Studio still works either way.
echo [5/5] Opening Studio window...
set "STUDIO_URL=http://localhost:3456/?studio-mode=classic"
set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
if exist "%CHROME%" (
  start "" "%CHROME%" --app=%STUDIO_URL% --window-size=1600,1000
) else (
  REM Edge is always present on Windows 11
  start "" msedge --app=%STUDIO_URL% --window-size=1600,1000
)

echo.
echo Studio is open. Closing this launcher in 2 seconds...
timeout /t 2 /nobreak >nul
exit /b 0

:fail
echo.
echo Studio did not come up within 30 seconds.
echo Check the minimized "Clear Studio Server" window in your taskbar for errors.
pause
exit /b 1
