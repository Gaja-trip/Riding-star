@echo off
setlocal
set "APP_DIR=%~dp0"
set "BUNDLED_NODE=C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if exist "%BUNDLED_NODE%" (
  "%BUNDLED_NODE%" "%APP_DIR%server.js"
) else (
  node "%APP_DIR%server.js"
)

pause
