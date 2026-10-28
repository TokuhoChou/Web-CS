@echo off
cd /d "%~dp0"
if not exist "node-runtime\node.exe" (
  echo Missing portable Node.js in node-runtime. Install Node.js 22 or restore the folder.
  where node >nul 2>nul || (pause & exit /b 1)
  node server.js
) else (
  set "PATH=%~dp0node-runtime;%PATH%"
  if not exist "node_modules\express" (
    echo Installing dependencies...
    call "%~dp0node-runtime\npm.cmd" install
    if errorlevel 1 (pause & exit /b 1)
  )
  "%~dp0node-runtime\node.exe" server.js
)
pause
