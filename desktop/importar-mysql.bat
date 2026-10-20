@echo off
chcp 65001 >nul
title Local AI UI - importar chats de MySQL
cd /d "%~dp0"
rem Copia los chats, la memoria, las API keys y la galeria de la version con XAMPP/MySQL a la app de escritorio.
rem Antes: inicia MySQL en el panel de XAMPP. Uso: importar-mysql.bat [host] [usuario] [contrasena] [base]
if not exist "php\php.exe" powershell -NoProfile -ExecutionPolicy Bypass -File "preparar-php.ps1" || (pause & exit /b 1)
set "IA_LOCAL_DATA=%APPDATA%\Local AI UI\data"
"php\php.exe" -c "php.ini" -d "extension_dir=%~dp0php\ext" "..\server\tools\importar-mysql.php" %*
pause
