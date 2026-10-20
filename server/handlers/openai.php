<?php
// API compatible con OpenAI (/v1/models y /v1/chat/completions) con búsqueda web opcional.
if (!defined('IA_LOCAL')) { http_response_code(403); exit; } // no se puede abrir directamente desde el navegador

// ---- API compatible con OpenAI para scripts y apps externas (LangChain, openai-python, etc.) ----
// Base URL: http://localhost/<carpeta>/api.php/v1   ·   Rutas: GET /models, POST /chat/completions
// Autenticación: Authorization: Bearer sk-local-...  (se crean en la consola de API keys)
// Búsqueda web (agente): añade "web_search": true al cuerpo, o termina el nombre del modelo en "+web".
if ($action === 'v1') {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Headers: Authorization, Content-Type, X-Api-Key');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if ($method === 'OPTIONS') { http_response_code(204); exit; }
    header('Content-Type: application/json');
    $fail = function ($code, $msg, $type = 'invalid_request_error') {
        http_response_code($code);
        echo json_encode(['error' => ['message' => $msg, 'type' => $type, 'code' => $code]], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
        exit;
    };

    // Apache de XAMPP a veces no pasa la cabecera Authorization a PHP (ver .htaccess)
    $h = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if ($h === '' && function_exists('getallheaders')) {
        foreach (getallheaders() as $k => $v) if (strcasecmp($k, 'Authorization') === 0) $h = $v;
    }
    $key = stripos($h, 'Bearer ') === 0 ? trim(substr($h, 7)) : trim($_SERVER['HTTP_X_API_KEY'] ?? '');
    if ($key === '') $fail(401, 'Falta la API key. Envía la cabecera Authorization: Bearer sk-local-...', 'authentication_error');
    try {
        $pdo = db();
        $st = $pdo->prepare('SELECT id, web_search, model FROM api_keys WHERE key_hash = ?');
        $st->execute([hash('sha256', $key)]);
        $row = $st->fetch();
        if ($row) $pdo->prepare('UPDATE api_keys SET uses = uses + 1, last_used = CURRENT_TIMESTAMP WHERE id = ?')->execute([$row['id']]);
    } catch (Throwable $e) {
        $fail(500, 'Base de datos: ' . $e->getMessage(), 'server_error');
    }
    if (!$row) $fail(401, 'API key inválida', 'authentication_error');

    $route = rtrim(substr($ROUTE_PATH, 3), '/');

    if ($route === '/models' && $method === 'GET') {
        [$r, $code, $err] = http_req("$OLLAMA/api/tags", [CURLOPT_TIMEOUT => 10]);
        if ($r === false) $fail(502, 'No se pudo conectar con Ollama: ' . $err, 'server_error');
        $installed = json_decode($r, true)['models'] ?? [];
        // Una clave con modelo asignado solo ve ese modelo
        if ($row['model'] !== '') $installed = array_values(array_filter($installed, fn($m) => norm_model($m['name']) === norm_model($row['model'])));
        $data = array_map(fn($m) => ['id' => $m['name'], 'object' => 'model', 'created' => 0, 'owned_by' => 'ollama'], $installed);
        echo json_encode(['object' => 'list', 'data' => $data]);
        exit;
    }

    if ($route === '/chat/completions' && $method === 'POST') {
        $in = json_decode(file_get_contents('php://input'), true);
        // Con modelo asignado a la clave, "model" es opcional: se usa el asignado
        if (is_array($in) && empty($in['model']) && $row['model'] !== '') $in['model'] = $row['model'];
        if (!is_array($in) || empty($in['model']) || !is_string($in['model']) || empty($in['messages']) || !is_array($in['messages'])) $fail(400, 'Petición inválida: faltan "model" o "messages"');
        $web = !empty($in['web_search']);
        unset($in['web_search']);
        if (substr($in['model'], -4) === '+web') { $web = true; $in['model'] = substr($in['model'], 0, -4); }
        if ($row['model'] !== '' && norm_model($in['model']) !== norm_model($row['model'])) {
            $fail(403, "Esta API key solo puede usar el modelo «{$row['model']}» (se pidió «{$in['model']}»)", 'permission_error');
        }

        $results = [];
        if ($web) {
            if (!$row['web_search']) $fail(403, 'Esta API key no tiene permiso para la búsqueda web', 'permission_error');
            $li = null;
            for ($i = count($in['messages']) - 1; $i >= 0; $i--) if (($in['messages'][$i]['role'] ?? '') === 'user') { $li = $i; break; }
            if ($li === null) $fail(400, 'No hay ningún mensaje de usuario sobre el que buscar');
            $c = $in['messages'][$li]['content'] ?? '';
            $q = is_array($c) ? implode(' ', array_map(fn($p) => is_array($p) ? (string)($p['text'] ?? '') : (string)$p, $c)) : (string)$c;
            try { $results = web_search(mb_substr(trim($q), 0, 300), search_cfg()); }
            catch (Throwable $e) { $fail(502, 'Búsqueda web: ' . $e->getMessage(), 'server_error'); }
            if ($results) {
                $ctx = "\n\n" . web_context($results);
                if (is_array($c)) $in['messages'][$li]['content'][] = ['type' => 'text', 'text' => $ctx];
                else $in['messages'][$li]['content'] = $c . $ctx;
                $urls = array_map(fn($r) => preg_replace('/[\x00-\x20\x7F-\xFF]/', '', $r['url']), $results);
                header('X-Web-Sources: ' . implode(', ', array_filter($urls)));
            }
        }

        $ch = curl_init("$OLLAMA/v1/chat/completions");
        $opts = [
            CURLOPT_POST       => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS => json_encode($in, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE),
            CURLOPT_TIMEOUT    => 0,
        ];
        if (!empty($in['stream'])) {
            header('Content-Type: text/event-stream; charset=utf-8');
            header('Cache-Control: no-cache');
            header('X-Accel-Buffering: no');
            while (ob_get_level()) { ob_end_clean(); }
            ob_implicit_flush(true);
            curl_setopt_array($ch, $opts + [CURLOPT_RETURNTRANSFER => false, CURLOPT_WRITEFUNCTION => function ($c, $d) {
                echo $d; flush();
                return connection_aborted() ? 0 : strlen($d);
            }]);
            if (curl_exec($ch) === false && !connection_aborted()) echo 'data: ' . json_encode(['error' => ['message' => 'Error con Ollama: ' . curl_error($ch)]]) . "\n\n";
            exit;
        }
        curl_setopt_array($ch, $opts + [CURLOPT_RETURNTRANSFER => true]);
        $r = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        if ($r === false) $fail(502, 'Error con Ollama: ' . curl_error($ch), 'server_error');
        $j = json_decode($r, true);
        if ($results && is_array($j) && !isset($j['error'])) $j['web_sources'] = array_map(fn($x) => ['title' => $x['title'], 'url' => $x['url']], $results);
        http_response_code($code ?: 200);
        echo is_array($j) ? json_encode($j, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE) : $r;
        exit;
    }

    $fail(404, 'Ruta no encontrada: ' . ($route ?: '/') . '. Disponibles: GET /models, POST /chat/completions', 'not_found');
}
