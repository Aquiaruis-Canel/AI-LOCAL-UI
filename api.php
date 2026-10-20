<?php
// Punto de entrada de la API (la URL no cambia: api.php?action=... y api.php/v1/...).
// Aquí solo se decide qué módulo atiende cada acción; la lógica vive en server/.
//   server/config.php        direcciones y credenciales
//   server/lib/              base de datos, utilidades HTTP, buscador web
//   server/handlers/         un archivo por grupo de acciones
define('IA_LOCAL', true);
define('ROOT_DIR', __DIR__);
set_time_limit(0);
ignore_user_abort(false);

require __DIR__ . '/server/config.php';
$action = $_GET['action'] ?? 'chat';

// Rutas estilo OpenAI: api.php/v1/models y api.php/v1/chat/completions
$ROUTE_PATH = $_SERVER['PATH_INFO'] ?? '';
if ($ROUTE_PATH === '' && preg_match('#/api\.php(/v1(?:/[^?]*)?)#i', $_SERVER['REQUEST_URI'] ?? '', $m)) $ROUTE_PATH = $m[1];
if (strpos($ROUTE_PATH, '/v1') === 0) $action = 'v1';

if (!function_exists('curl_init')) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'La extensión cURL de PHP no está activa. En XAMPP: php.ini -> quita el ; de extension=curl y reinicia Apache.']);
    exit;
}

require __DIR__ . '/server/lib/database.php';
require __DIR__ . '/server/lib/http.php';
require __DIR__ . '/server/lib/search.php';

// Acción -> módulo. Todo lo que no figura aquí (chat, complete, embed...) lo atiende handlers/chat.php.
if     (strpos($action, 'db_')  === 0) $handler = 'chats';
elseif (strpos($action, 'gal_') === 0) $handler = 'gallery';
elseif (strpos($action, 'key_') === 0) $handler = 'keys';
elseif (strpos($action, 'fs_')  === 0) $handler = 'files';
else $handler = [
    'models' => 'models', 'check_updates' => 'models', 'pull' => 'models',
    'image' => 'images', 'imagestatus' => 'images', 'imagegen' => 'images',
    'websearch' => 'websearch',
    'v1' => 'openai',
][$action] ?? 'chat';

require __DIR__ . '/server/handlers/' . $handler . '.php';
