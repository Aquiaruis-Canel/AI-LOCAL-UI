<?php
// Historial en la base de datos (SQLite): db_list, db_get, db_save, db_delete, db_mem_* (memoria) y db_search.
if (!defined('IA_LOCAL')) { http_response_code(403); exit; } // no se puede abrir directamente desde el navegador

if (strpos($action, 'db_') === 0) {
    header('Content-Type: application/json');
    try {
        $pdo = db();
        switch ($action) {
            case 'db_list':
                $rows = $pdo->query('SELECT id, title, ' . sql_ts('updated_at') . ' AS t FROM chats ORDER BY updated_at DESC, rowid DESC')->fetchAll();
                echo json_encode(['chats' => $rows]);
                break;

            case 'db_get':
                $id = chat_id($_GET['id'] ?? '');
                $st = $pdo->prepare('SELECT title, data FROM chats WHERE id = ?');
                $st->execute([$id]);
                $row = $st->fetch();
                if (!$row) { http_response_code(404); echo json_encode(['error' => 'Chat no encontrado']); break; }
                $msgs = json_decode($row['data'], true)['messages'] ?? [];
                $st = $pdo->prepare('SELECT id, data FROM images WHERE chat_id = ?');
                $st->execute([$id]);
                $map = [];
                foreach ($st->fetchAll() as $r) $map['ref:' . $r['id']] = $r['data'];
                foreach ($msgs as $i => $m) {
                    if (!empty($m['genImage']) && isset($map[$m['genImage']])) $msgs[$i]['genImage'] = $map[$m['genImage']];
                    foreach (($m['files'] ?? []) as $k => $f) {
                        if (!empty($f['image']) && isset($map[$f['image']])) $msgs[$i]['files'][$k]['image'] = $map[$f['image']];
                    }
                }
                echo json_encode(['id' => $id, 'title' => $row['title'], 'messages' => $msgs]);
                break;

            case 'db_save':
                $in = json_decode(file_get_contents('php://input'), true);
                $id = chat_id($in['id'] ?? '');
                if ($id === '' || !is_array($in['messages'] ?? null)) { http_response_code(400); echo json_encode(['error' => 'Chat inválido']); break; }
                $msgs = $in['messages'];
                $title = mb_substr((string)($in['title'] ?? 'Chat'), 0, 255);
                $pdo->beginTransaction();
                $put = $pdo->prepare('INSERT OR IGNORE INTO images (chat_id, id, data) VALUES (?, ?, ?)');
                $keep = [];
                $store = function ($b64) use ($put, $id, &$keep) {
                    $h = sha1($b64);
                    $put->execute([$id, $h, $b64]);
                    $keep[$h] = true;
                    return 'ref:' . $h;
                };
                foreach ($msgs as $i => $m) {
                    if (!empty($m['genImage']) && strpos($m['genImage'], 'ref:') !== 0) $msgs[$i]['genImage'] = $store($m['genImage']);
                    foreach (($m['files'] ?? []) as $k => $f) {
                        if (!empty($f['image']) && strpos($f['image'], 'ref:') !== 0) $msgs[$i]['files'][$k]['image'] = $store($f['image']);
                    }
                }
                $st = $pdo->prepare('INSERT INTO chats (id, title, data, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET title = excluded.title, data = excluded.data, updated_at = CURRENT_TIMESTAMP');
                $st->execute([$id, $title, json_encode(['messages' => $msgs], JSON_UNESCAPED_UNICODE)]);
                $ids = array_keys($keep);
                if ($ids) { // borra imágenes que ya no están en el chat (p. ej. tras editar un mensaje)
                    $ph = implode(',', array_fill(0, count($ids), '?'));
                    $pdo->prepare("DELETE FROM images WHERE chat_id = ? AND id NOT IN ($ph)")->execute(array_merge([$id], $ids));
                } else {
                    $pdo->prepare('DELETE FROM images WHERE chat_id = ?')->execute([$id]);
                }
                $pdo->commit();
                echo json_encode(['ok' => true]);
                break;

            case 'db_delete':
                $in = json_decode(file_get_contents('php://input'), true);
                $id = chat_id($in['id'] ?? '');
                $pdo->prepare('DELETE FROM images WHERE chat_id = ?')->execute([$id]);
                $pdo->prepare('DELETE FROM chats WHERE id = ?')->execute([$id]);
                echo json_encode(['ok' => true]);
                break;

            // ---- Memoria a largo plazo ----
            case 'db_mem_list':
                echo json_encode(['memories' => $pdo->query('SELECT id, `text` FROM memories ORDER BY id')->fetchAll()], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
                break;

            case 'db_mem_add':
                $in = json_decode(file_get_contents('php://input'), true) ?: [];
                $txt = trim(mb_substr((string)($in['text'] ?? ''), 0, 500));
                if ($txt === '') { http_response_code(400); echo json_encode(['error' => 'Recuerdo vacío']); break; }
                $pdo->prepare('INSERT INTO memories (`text`) VALUES (?)')->execute([$txt]);
                echo json_encode(['id' => (int)$pdo->lastInsertId()]);
                break;

            case 'db_mem_delete':
                $in = json_decode(file_get_contents('php://input'), true) ?: [];
                if (($in['id'] ?? '') === 'all') $pdo->exec('DELETE FROM memories');
                else $pdo->prepare('DELETE FROM memories WHERE id = ?')->execute([(int)($in['id'] ?? 0)]);
                echo json_encode(['ok' => true]);
                break;

            // ---- Búsqueda de texto en todos los chats (título y mensajes) ----
            case 'db_search':
                $q = trim((string)($_GET['q'] ?? ''));
                $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $q) . '%';
                $st = $pdo->prepare("SELECT id FROM chats WHERE title LIKE ? ESCAPE '\\' OR data LIKE ? ESCAPE '\\' LIMIT 200");
                $st->execute([$like, $like]);
                echo json_encode(['ids' => array_column($st->fetchAll(), 'id')]);
                break;

            default:
                http_response_code(400);
                echo json_encode(['error' => 'Acción desconocida']);
        }
    } catch (Throwable $e) {
        if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['error' => 'Base de datos: ' . $e->getMessage()]);
    }
    exit;
}
