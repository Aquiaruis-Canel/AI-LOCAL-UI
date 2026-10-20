@echo off
chcp 65001 >nul
title Local AI UI - construir el .exe
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Falta Node.js. Instala la version LTS desde https://nodejs.org y vuelve a ejecutar este archivo.
  pause & exit /b 1
)

if not exist "php\php.exe" (
  echo === 1/3 Descargando PHP portatil ===
  powershell -NoProfile -ExecutionPolicy Bypass -File "preparar-php.ps1" || goto :error
)

rem Runtime de Visual C++ junto a php.exe: asi el .exe funciona tambien en PCs que no lo tengan instalado
for %%D in (vcruntime140.dll vcruntime140_1.dll msvcp140.dll) do if exist "%WINDIR%\System32\%%D" copy /y "%WINDIR%\System32\%%D" "php\" >nul

echo === 2/3 Instalando Electron (solo la primera vez tarda) ===
call npm install || goto :error

echo === 3/3 Creando el instalador y la version portatil ===
call npm run dist || goto :error

echo.
echo Listo. En la carpeta "dist" tienes:
echo   - Local AI UI-...-setup.exe   (instalador)
echo   - Local AI UI-...-portable.exe (se abre sin instalar)
start "" "%~dp0dist"
pause
exit /b 0

:error
echo.
echo Algo fallo. Revisa los mensajes de arriba.
pause
exit /b 1
