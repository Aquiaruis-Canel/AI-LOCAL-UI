<?php
// Enrutador del servidor integrado de PHP (php -S) que usa la app de escritorio.
// Hace lo que en XAMPP hacen Apache y los .htaccess: bloquear carpetas internas, servir la galería y la API.
$web = rtrim($_SERVER['DOCUMENT_ROOT'], '/\\');
$uri = rawurldecode(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');

// La app nunca se muestra dentro de un marco (p. ej. un enlace pulsado en la vista previa del panel de código)
if (preg_match('/^i?frame$/i', $_SERVER['HTTP_SEC_FETCH_DEST'] ?? '')) {
    http_response_code(403);
    header('Content-Type: text/html; charset=utf-8');
    exit('<!DOCTYPE html><meta charset="utf-8"><body style="font:14px system-ui,sans-serif;color:#8b92a5;padding:24px">Enlace no disponible en la vista previa.</body>');
}

// Carpetas internas y archivos ocultos: prohibidos
if (preg_match('#^/(server|data|desktop|galeria/\.)(/|$)#i', $uri) || strpos($uri, '/.') !== false || strpos($uri, '..') !== false) {
    http_response_code(403);
    exit('Prohibido');
}

// Imágenes de la galería: viven en la carpeta de datos del usuario, no junto al programa
if (preg_match('#^/galeria/([A-Za-z0-9_.-]+)$#', $uri, $m)) {
    $dir = getenv('IA_LOCAL_DATA') ? getenv('IA_LOCAL_DATA') . '/galeria' : $web . '/galeria';
    $f = $dir . '/' . $m[1];
    if (!is_file($f)) { http_response_code(404); exit; }
    $ext = strtolower(pathinfo($f, PATHINFO_EXTENSION));
    header('Content-Type: ' . (['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'][$ext] ?? 'application/octet-stream'));
    header('Content-Length: ' . filesize($f));
    readfile($f);
    exit;
}

// API: api.php?action=... y api.php/v1/... (estilo OpenAI)
if (preg_match('#^/api\.php(/.*)?$#i', $uri, $m)) {
    $_SERVER['SCRIPT_NAME'] = '/api.php';
    $_SERVER['SCRIPT_FILENAME'] = $web . '/api.php';
    $_SERVER['PATH_INFO'] = $m[1] ?? '';
    chdir($web);
    require $web . '/api.php';
    return true;
}

// Cualquier otro .php no se ejecuta
if (preg_match('#\.php$#i', $uri)) { http_response_code(403); exit('Prohibido'); }

return false; // archivos estáticos (html, css, js, imágenes): los sirve PHP tal cual
