# SearXNG (buscador local opcional)

[SearXNG](https://github.com/searxng/searxng) es un metabuscador que corre en tu PC y consulta Google, Bing, DuckDuckGo,
Wikipedia y otros a la vez, sin API keys ni límites. Local AI UI puede usarlo en lugar de DuckDuckGo.

1. Instala y abre [Docker Desktop](https://www.docker.com/products/docker-desktop/).
2. Ejecuta `iniciar-searxng.bat`: crea el contenedor `searxng` en `http://127.0.0.1:8888` con el `settings.yml` de esta carpeta
   (que activa el formato JSON que necesita la app) y lo deja configurado para arrancar con Docker.
3. En la app: Configuraciones → Buscador web → **SearXNG** → Probar búsqueda web.

`settings.yml` lleva una `secret_key` aleatoria propia de esta instalación; si publicas el proyecto puedes cambiarla por cualquier
otra cadena larga.
