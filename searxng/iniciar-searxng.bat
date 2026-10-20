@echo off
chcp 65001 >nul
title SearXNG para Local AI UI
cd /d "%~dp0"
rem Arranca SearXNG (buscador sin API key) en http://127.0.0.1:8888 usando Docker Desktop.
rem Solo hace falta ejecutarlo una vez: despues arranca solo cada vez que se abre Docker Desktop.

where docker >nul 2>nul
if errorlevel 1 (
  echo Falta Docker Desktop. Instalalo desde https://www.docker.com/products/docker-desktop/ , abrelo y vuelve a ejecutar este archivo.
  pause & exit /b 1
)
docker info >nul 2>nul
if errorlevel 1 (
  echo Docker Desktop no esta en marcha. Abrelo, espera a que diga "Engine running" y vuelve a ejecutar este archivo.
  pause & exit /b 1
)

docker rm -f searxng >nul 2>nul
docker run -d --name searxng --restart unless-stopped -p 127.0.0.1:8888:8080 -v "%~dp0settings.yml:/etc/searxng/settings.yml:ro" searxng/searxng:latest
if errorlevel 1 ( echo No se pudo arrancar SearXNG. & pause & exit /b 1 )

echo.
echo SearXNG arrancando en http://127.0.0.1:8888 (tarda unos segundos la primera vez).
echo En Local AI UI: Configuraciones - Buscador web - SearXNG - Probar busqueda web.
pause
