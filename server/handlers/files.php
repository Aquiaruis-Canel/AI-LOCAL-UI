<?php
// Carpeta del proyecto (solo lectura): fs_check, fs_list, fs_read y fs_search. Las usa la IA como herramientas.
// Nunca sale de la carpeta elegida, no escribe nada y solo atiende peticiones de este mismo PC.
if (!defined('IA_LOCAL')) { http_response_code(403); exit; } // no se puede abrir directamente desde el navegador

const FS_SKIP_DIRS = ['.git', '.svn', '.hg', 'node_modules', 'vendor', 'bower_components', '__pycache__', '.venv', 'venv', 'env',
    '.idea', '.vscode', 'dist', 'build', 'out', '.next', '.nuxt', '.cache', 'coverage', 'target', 'bin', 'obj', '.gradle', '.dart_tool'];
const FS_MAX_READ = 400;       // líneas por lectura
const FS_MAX_FILE = 2000000;   // bytes: más grande no se lee ni se busca dentro
const FS_MAX_LIST = 400;       // entradas por listado

function fs_fail($code, $msg) { http_response_code($code); echo json_encode(['error' => $msg], JSON_UNESCAPED_UNICODE); exit; }
function fs_norm($p) { return rtrim(str_replace('\\', '/', $p), '/'); }

// Carpeta raíz: absoluta, existente, y que no sea la raíz de un disco ni una carpeta del sistema
function fs_root($root) {
    $r = realpath((string)$root);
    if ($r === false || !is_dir($r)) fs_fail(400, 'La carpeta no existe: ' . $root);
    $n = fs_norm($r);
    if (preg_match('#^[A-Za-z]:$#', $n) || $n === '' || $n === '/') fs_fail(400, 'Elige una carpeta concreta, no la raíz de un disco');
    if (preg_match('#^[A-Za-z]:/(Windows|Program Files|Program Files \(x86\)|ProgramData)(/|$)#i', $n) || preg_match('#^/(etc|proc|sys|bin|sbin|usr|boot|dev)(/|$)#', $n)) {
        fs_fail(400, 'Por seguridad no se permiten carpetas del sistema');
    }
    return $n;
}

// Ruta relativa dentro de la raíz → ruta real; fuera de la raíz (.., enlaces) = error
function fs_path($root, $rel) {
    $rel = trim(str_replace('\\', '/', (string)$rel));
    if ($rel === '' || $rel === '.' || $rel === './') return $root;
    if (preg_match('#^([A-Za-z]:)?/#', $rel)) { // ruta absoluta: se acepta solo si cae dentro de la raíz
        $abs = $rel;
    } else {
        $abs = $root . '/' . ltrim(preg_replace('#^\./#', '', $rel), '/');
    }
    $real = realpath($abs);
    if ($real === false) fs_fail(404, 'No existe: ' . $rel);
    $real = fs_norm($real);
    $cmp = DIRECTORY_SEPARATOR === '\\' ? 'strcasecmp' : 'strcmp';
    if ($cmp($real, $root) !== 0 && $cmp(substr($real, 0, strlen($root) + 1), $root . '/') !== 0) fs_fail(403, 'Fuera de la carpeta del proyecto: ' . $rel);
    return $real;
}
function fs_rel($root, $abs) { $r = substr($abs, strlen($root) + 1); return $r === false || $r === '' ? '.' : $r; }
function fs_is_text($file) {
    $h = @fopen($file, 'rb'); if (!$h) return false;
    $chunk = fread($h, 8000); fclose($h);
    return $chunk === '' || strpos($chunk, "\0") === false;
}
function fs_size($n) { return $n < 1024 ? "$n B" : ($n < 1048576 ? round($n / 1024, 1) . ' KB' : round($n / 1048576, 1) . ' MB'); }

// Recorre la carpeta en anchura, saltando dependencias, compilados y carpetas ocultas
function fs_walk($dir, $maxDepth, callable $fn) {
    $queue = [[$dir, 0]];
    while ($queue) {
        [$d, $depth] = array_shift($queue);
        $items = @scandir($d);
        if ($items === false) continue;
        natcasesort($items);
        $dirs = []; $files = [];
        foreach ($items as $it) {
            if ($it === '.' || $it === '..') continue;
            $p = "$d/$it";
            if (is_dir($p)) { if (!in_array(strtolower($it), FS_SKIP_DIRS, true) && $it[0] !== '.') $dirs[] = $p; }
            else $files[] = $p;
        }
        foreach (array_merge($dirs, $files) as $p) {
            if ($fn($p, $depth, is_dir($p)) === false) return;
            if (is_dir($p) && $depth + 1 < $maxDepth) $queue[] = [$p, $depth + 1];
        }
    }
}

if (strpos($action, 'fs_') === 0) {
    header('Content-Type: application/json; charset=utf-8');
    if (!in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true)) fs_fail(403, 'La carpeta del proyecto solo se puede usar desde este PC');
    $in = json_decode(file_get_contents('php://input'), true) ?: [];
    $root = fs_root($in['root'] ?? '');

    switch ($action) {
        case 'fs_check': { // al conectar una carpeta: nombre y tamaño aproximado
            $n = 0; $bytes = 0;
            fs_walk($root, 12, function ($p, $d, $isDir) use (&$n, &$bytes) { if (!$isDir) { $n++; $bytes += @filesize($p); } return $n < 20000; });
            echo json_encode(['root' => $root, 'name' => basename($root), 'files' => $n, 'size' => fs_size($bytes), 'more' => $n >= 20000], JSON_UNESCAPED_UNICODE);
            break;
        }
        case 'fs_list': {
            $base = fs_path($root, $in['path'] ?? '.');
            if (!is_dir($base)) fs_fail(400, 'No es una carpeta: ' . ($in['path'] ?? ''));
            $depth = max(1, min(4, (int)($in['depth'] ?? 2)));
            $lines = []; $cut = false;
            fs_walk($base, $depth, function ($p, $d, $isDir) use (&$lines, &$cut, $root) {
                if (count($lines) >= FS_MAX_LIST) { $cut = true; return false; }
                $lines[] = str_repeat('  ', $d) . fs_rel($root, $p) . ($isDir ? '/' : '  (' . fs_size((int)@filesize($p)) . ')');
            });
            $txt = implode("\n", $lines) ?: '(carpeta vacía)';
            if ($cut) $txt .= "\n… (lista cortada en " . FS_MAX_LIST . ' entradas: lista una subcarpeta concreta)';
            echo json_encode(['result' => $txt, 'summary' => 'Listó ' . fs_rel($root, $base)], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
            break;
        }
        case 'fs_read': {
            $f = fs_path($root, $in['path'] ?? '');
            $rel = fs_rel($root, $f);
            if (is_dir($f)) fs_fail(400, "$rel es una carpeta: usa list_files");
            if (filesize($f) > FS_MAX_FILE) fs_fail(400, "$rel es demasiado grande (" . fs_size(filesize($f)) . '): usa search para encontrar la parte que necesitas');
            if (!fs_is_text($f)) fs_fail(400, "$rel es un archivo binario (imagen, ejecutable…): no se puede leer como texto");
            $all = preg_split('/\r\n|\n|\r/', (string)file_get_contents($f));
            $total = count($all);
            $from = max(1, (int)($in['start_line'] ?? 1));
            $to = min($total, max($from, (int)($in['end_line'] ?? ($from + 249))), $from + FS_MAX_READ - 1);
            $out = [];
            for ($i = $from; $i <= $to; $i++) $out[] = str_pad((string)$i, 5, ' ', STR_PAD_LEFT) . '| ' . mb_substr($all[$i - 1], 0, 400);
            $txt = "$rel (líneas {$from}–{$to} de {$total})\n" . implode("\n", $out) . ($to < $total ? "\n… quedan " . ($total - $to) . " líneas: pide start_line=" . ($to + 1) : '');
            echo json_encode(['result' => $txt, 'summary' => "Leyó $rel" . ($from > 1 || $to < $total ? " (líneas {$from}–{$to})" : '')], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
            break;
        }
        case 'fs_search': {
            $q = (string)($in['query'] ?? '');
            if (trim($q) === '') fs_fail(400, 'Falta el texto a buscar');
            $base = fs_path($root, $in['path'] ?? '.');
            $hits = []; $files = 0; $t0 = microtime(true);
            $check = function ($p) use (&$hits, &$files, $q, $root) {
                if (@filesize($p) > FS_MAX_FILE || !fs_is_text($p)) return;
                $files++;
                $n = 0;
                foreach (preg_split('/\r\n|\n|\r/', (string)@file_get_contents($p)) as $ln => $line) {
                    if (mb_stripos($line, $q) !== false) {
                        $hits[] = fs_rel($root, $p) . ':' . ($ln + 1) . ': ' . trim(mb_substr($line, 0, 200));
                        if (++$n >= 8) break; // como mucho 8 por archivo
                    }
                }
            };
            if (is_file($base)) $check($base);
            else fs_walk($base, 12, function ($p, $d, $isDir) use ($check, &$hits, $t0) {
                if (!$isDir) $check($p);
                return count($hits) < 60 && microtime(true) - $t0 < 8;
            });
            // Sin coincidencias de la frase completa: se buscan sus palabras sueltas (los modelos pequeños suelen buscar frases)
            $loose = false;
            $words = array_values(array_filter(preg_split('/[^\p{L}\p{N}_$.\-]+/u', mb_strtolower($q)), fn($w) => mb_strlen($w) >= 3 && !in_array($w, ['the', 'and', 'for', 'del', 'las', 'los', 'una', 'que', 'con', 'por', 'para', 'esta', 'este', 'donde', 'dónde'], true)));
            if (!$hits && count($words) > 1) {
                $loose = true; $scored = []; $t0 = microtime(true);
                $scan = function ($p) use (&$scored, $words, $root) {
                    if (@filesize($p) > FS_MAX_FILE || !fs_is_text($p)) return;
                    foreach (preg_split('/\r\n|\n|\r/', (string)@file_get_contents($p)) as $ln => $line) {
                        $low = mb_strtolower($line); $n = 0;
                        foreach ($words as $w) if (mb_strpos($low, $w) !== false) $n++;
                        if ($n) $scored[] = [$n, fs_rel($root, $p) . ':' . ($ln + 1) . ': ' . trim(mb_substr($line, 0, 200))];
                    }
                };
                if (is_file($base)) $scan($base);
                else fs_walk($base, 12, function ($p, $d, $isDir) use ($scan, $t0) { if (!$isDir) $scan($p); return microtime(true) - $t0 < 8; });
                usort($scored, fn($a, $b) => $b[0] <=> $a[0]);
                $hits = array_column(array_slice($scored, 0, 40), 1);
            }
            $txt = $hits ? ($loose ? "La frase exacta no aparece; líneas con alguna de las palabras (" . implode(', ', $words) . "):\n" : '') . implode("\n", array_slice($hits, 0, 60))
                : "Sin coincidencias de «{$q}» ($files archivos revisados). Prueba con una sola palabra que aparezca en el código o lee los archivos con read_file.";
            echo json_encode(['result' => $txt, 'summary' => "Buscó «{$q}»" . ' (' . count($hits) . ' resultado' . (count($hits) === 1 ? '' : 's') . ($loose ? ', por palabras' : '') . ')'], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
            break;
        }
        default:
            fs_fail(400, 'Acción desconocida');
    }
    exit;
}
