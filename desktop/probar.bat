@echo off
chcp 65001 >nul
title Local AI UI - probar sin empaquetar
cd /d "%~dp0"
where node >nul 2>nul || (echo Falta Node.js: https://nodejs.org & pause & exit /b 1)
if not exist "php\php.exe" powershell -NoProfile -ExecutionPolicy Bypass -File "preparar-php.ps1" || (pause & exit /b 1)
if not exist "node_modules\electron" call npm install || (pause & exit /b 1)
call npm start
