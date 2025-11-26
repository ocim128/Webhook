@echo off
setlocal
if /i "%~1"=="__inner" goto :inner

set "DEV_WINDOW=%DEV_WINDOW%"
if not defined DEV_WINDOW set "DEV_WINDOW=Webhook Dev Server"

taskkill /F /FI "WINDOWTITLE eq %DEV_WINDOW%" /T >nul 2>&1
start "%DEV_WINDOW%" cmd /k "%~f0" __inner
exit /b 0

:inner
setlocal EnableExtensions DisableDelayedExpansion
if not exist ".env" (
  echo [.env not found] Create a .env file before using this launcher.
  exit /b 1
)

for /f "usebackq tokens=1* delims==" %%A in (`findstr /r "^[^#].*=" ".env"`) do (
  set "%%A=%%B"
)

npm run dev
