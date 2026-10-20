<?php
// Configuración central: direcciones de los servicios y dónde se guardan los datos. Edítalo si tu instalación es distinta.
if (!defined('IA_LOCAL')) { http_response_code(403); exit; } // no se puede abrir directamente desde el navegador

$OLLAMA = getenv('IA_LOCAL_OLLAMA') ?: 'http://127.0.0.1:11434'; // 127.0.0.1 evita problemas con IPv6 en Windows
$FASTSD = getenv('IA_LOCAL_FASTSD') ?: 'http://127.0.0.1:8000';  // FastSD CPU (python src/app.py --api)

// Carpeta de datos: la base SQLite (ia_local.sqlite) y la galería de imágenes.
// La app de escritorio (.exe) la pone en %APPDATA%\Local AI UI\data mediante IA_LOCAL_DATA;
// con XAMPP se usa la carpeta data/ del proyecto (protegida con .htaccess).
$DATA_DIR = rtrim(getenv('IA_LOCAL_DATA') ?: dirname(__DIR__) . '/data', '/\\');
$DB_FILE  = $DATA_DIR . '/ia_local.sqlite';
// Las imágenes guardadas se sirven en la URL galeria/<archivo>
$GALLERY_DIR = getenv('IA_LOCAL_DATA') ? $DATA_DIR . '/galeria' : dirname(__DIR__) . '/galeria';
