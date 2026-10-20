<?php
// Consola de API keys locales (key_*) y configuración del buscador del servidor.
if (!defined('IA_LOCAL')) { http_response_code(403); exit; } // no se puede abrir directamente desde el navegador

// ---- Consola de API keys locales: claves, y buscador que usa el servidor para los clientes externos ----
if (strpos($action, 'key_') === 0) {
    header('Content-Type: application/json');
    try {
        $pdo = db();
        $in = json_decode(file_get_contents('php://input'), true) ?: [];
        switch ($action) {
            case 'key_list':
                $rows = $pdo->query('SELECT id, name, prefix, web_search, model, ' . sql_ts('created_at') . ' AS created, ' . sql_ts('last_used') . ' AS last_used, uses FROM api_keys ORDER BY id DESC')->fetchAll();
                echo json_encode(['keys' => $rows], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
                break;

            case 'key_create': // la clave completa solo se devuelve ahora; en la base de datos queda únicamente su hash SHA-256
                $name = trim(mb_substr((string)($in['name'] ?? ''), 0, 100)) ?: 'Sin nombre';
                $key = 'sk-local-' . bin2hex(random_bytes(24));
                $model = trim(mb_substr((string)($in['model'] ?? ''), 0, 200)); // '' = cualquier modelo
                $pdo->prepare('INSERT INTO api_keys (name, prefix, key_hash, web_search, model) VALUES (?, ?, ?, ?, ?)')
                    ->execute([$name, substr($key, 0, 13) . '...' . substr($key, -4), hash('sha256', $key), !empty($in['web_search']) ? 1 : 0, $model]);
                echo json_encode(['key' => $key, 'id' => (int)$pdo->lastInsertId(), 'model' => $model]);
                break;

            case 'key_update': // cambia el modelo asignado a una clave que ya existe ('' = cualquier modelo)
                $pdo->prepare('UPDATE api_keys SET model = ? WHERE id = ?')
                    ->execute([trim(mb_substr((string)($in['model'] ?? ''), 0, 200)), (int)($in['id'] ?? 0)]);
                echo json_encode(['ok' => true]);
                break;

            case 'key_delete':
                $pdo->prepare('DELETE FROM api_keys WHERE id = ?')->execute([(int)($in['id'] ?? 0)]);
                echo json_encode(['ok' => true]);
                break;

            case 'key_search_get': // nunca devuelve las claves, solo si están guardadas
                $c = search_cfg();
                echo json_encode([
                    'provider'  => $c['provider'] ?? 'duckduckgo',
                    'scrape'    => filter_var($c['scrape'] ?? true, FILTER_VALIDATE_BOOLEAN),
                    'google_cx' => $c['google_cx'] ?? '',
                    'searx_url' => $c['searx_url'] ?? '',
                    'has'       => ['key' => !empty($c['key']), 'tavily_key' => !empty($c['tavily_key']), 'google_key' => !empty($c['google_key'])],
                ]);
                break;

            case 'key_search_save':
                $put = $pdo->prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v');
                if (in_array($in['provider'] ?? '', ['duckduckgo', 'searxng', 'ollama', 'tavily', 'google'], true)) $put->execute(['search_provider', $in['provider']]);
                if (array_key_exists('scrape', $in)) $put->execute(['search_scrape', $in['scrape'] ? '1' : '0']);
                if (array_key_exists('google_cx', $in)) $put->execute(['search_google_cx', trim((string)$in['google_cx'])]);
                if (array_key_exists('searx_url', $in)) $put->execute(['search_searx_url', trim((string)$in['searx_url'])]);
                foreach (['key', 'tavily_key', 'google_key'] as $k) {
                    if (trim((string)($in[$k] ?? '')) !== '') $put->execute(["search_$k", trim((string)$in[$k])]); // vacío = conservar la anterior
                }
                if (!empty($in['clear_keys'])) $pdo->exec("DELETE FROM settings WHERE k IN ('search_key', 'search_tavily_key', 'search_google_key')");
                echo json_encode(['ok' => true]);
                break;

            case 'key_search_test':
                try {
                    $c = search_cfg();
                    $res = web_search(trim((string)($in['query'] ?? '')) ?: 'Ollama', $c);
                    echo json_encode(['provider' => $c['provider'] ?? 'duckduckgo', 'results' => $res], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
                } catch (Throwable $e) {
                    http_response_code(502);
                    echo json_encode(['error' => $e->getMessage()], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
                }
                break;

            default:
                http_response_code(400);
                echo json_encode(['error' => 'Acción desconocida']);
        }
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Base de datos: ' . $e->getMessage()]);
    }
    exit;
}
