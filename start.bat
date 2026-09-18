@echo off
setlocal
cd /d "%~dp0"
title Klados Development Stack

powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0dev.ps1"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Exited with error code %ERRORLEVEL%.
    pause
)
endlocal
