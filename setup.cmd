@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup.ps1"
set "LOOMNOTE_EXIT=%ERRORLEVEL%"
if not "%LOOMNOTE_EXIT%"=="0" pause
exit /b %LOOMNOTE_EXIT%
