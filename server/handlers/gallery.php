<?php
// Biblioteca de imágenes: archivos en /galeria y metadatos en la base de datos (gal_save, gal_list, gal_delete).
if (!defined('IA_LOCAL')) { http_response_code(403); exit; } // no se puede abrir directamente desde el navegador

// ---- Biblioteca de imágenes (archivos en /galeria + metadatos en la base de datos) ----
if (strpos($action, 'gal_') === 0) {
    header('Content-Type: application/json');
    try {
        $pdo = db();
        global $GALLERY_DIR;
        $dir = $GALLERY_DIR;
        if (!is_dir($dir)) mkdir($dir, 0777, true);

        if ($action === 'gal_save') {
            $in = json_decode(file_get_contents('php://input'), true) ?: [];
            $raw = base64_decode(preg_replace('#^data:image/\w+;base64,#', '', (string)($in['image'] ?? '')), true);
            if ($raw === false || $raw === '') { http_response_code(400); echo json_encode(['error' => 'Imagen inválida']); exit; }
            $ext = substr($raw, 0, 3) === "\xFF\xD8\xFF" ? 'jpg' : 'png';
            $file = sha1($raw . microtime()) . '.' . $ext;
            file_put_contents("$dir/$file", $raw);
            $st = $pdo->prepare('INSERT INTO gallery (file, prompt, info) VALUES (?, ?, ?)');
            $st->execute([$file, (string)($in['prompt'] ?? ''), mb_substr((string)($in['info'] ?? ''), 0, 255)]);
            echo json_encode(['id' => (int)$pdo->lastInsertId(), 'url' => "galeria/$file"]);
        } elseif ($action === 'gal_list') {
            $rows = $pdo->query('SELECT id, file, prompt, info FROM gallery ORDER BY id DESC LIMIT 300')->fetchAll();
            foreach ($rows as &$r) { $r['url'] = 'galeria/' . $r['file']; unset($r['file']); }
            echo json_encode(['items' => $rows]);
        } elseif ($action === 'gal_delete') {
            $in = json_decode(file_get_contents('php://input'), true) ?: [];
            $st = $pdo->prepare('SELECT file FROM gallery WHERE id = ?');
            $st->execute([(int)($in['id'] ?? 0)]);
            if ($f = $st->fetchColumn()) {
                @unlink("$dir/" . basename($f));
                $pdo->prepare('DELETE FROM gallery WHERE id = ?')->execute([(int)$in['id']]);
            }
            echo json_encode(['ok' => true]);
        } else {
            http_response_code(400); echo json_encode(['error' => 'Acción desconocida']);
        }
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Biblioteca: ' . $e->getMessage()]);
    }
    exit;
}
