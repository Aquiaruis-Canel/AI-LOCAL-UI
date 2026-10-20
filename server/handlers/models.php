<?php
// Modelos de Ollama: models, check_updates y pull (descarga con progreso).
if (!defined('IA_LOCAL')) { http_response_code(403); exit; } // no se puede abrir directamente desde el navegador

// ---- Lista de modelos ----
if ($action === 'models') {
    header('Content-Type: application/json');
    $ch = curl_init("$OLLAMA/api/tags");
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10]);
    $r = curl_exec($ch);
    if ($r === false) {
        http_response_code(502);
        echo json_encode(['error' => 'No se pudo conectar con Ollama: ' . curl_error($ch)]);
        exit;
    }
    // Capacidades (visión, herramientas, razonamiento): algunas versiones de Ollama no las incluyen en /api/tags,
    // así que se piden a /api/show, todas a la vez
    $j = json_decode($r, true);
    if (is_array($j) && !empty($j['models'])) {
        $mh = curl_multi_init(); $hs = [];
        foreach ($j['models'] as $i => $m) {
            if (isset($m['capabilities'])) continue;
            $h = curl_init("$OLLAMA/api/show");
            curl_setopt_array($h, [CURLOPT_POST => true, CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
                CURLOPT_POSTFIELDS => json_encode(['model' => $m['name'] ?? $m['model'] ?? '']), CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 8]);
            curl_multi_add_handle($mh, $h); $hs[$i] = $h;
        }
        do { $st = curl_multi_exec($mh, $run); if ($run) curl_multi_select($mh, 0.5); } while ($run && $st === CURLM_OK);
        foreach ($hs as $i => $h) {
            $sj = json_decode((string)curl_multi_getcontent($h), true);
            if (isset($sj['capabilities']) && is_array($sj['capabilities'])) $j['models'][$i]['capabilities'] = $sj['capabilities'];
            curl_multi_remove_handle($mh, $h);
        }
        curl_multi_close($mh);
        $r = json_encode($j);
    }
    echo $r;
    exit;
}

// ---- Comprobar si hay versiones nuevas de los modelos instalados (compara con el registro) ----
function parse_model_ref($name) {
    $tag = 'latest';
    if (preg_match('/^(.*):([^:\/]+)$/', $name, $mm)) { $name = $mm[1]; $tag = $mm[2]; }
    $parts = explode('/', $name);
    if (count($parts) >= 3 && strpos($parts[0], '.') !== false) { // p. ej. hf.co/usuario/repo
        $host = array_shift($parts);
        $repo = implode('/', $parts);
    } elseif (count($parts) === 2) {                                 // usuario/modelo
        $host = 'registry.ollama.ai';
        $repo = implode('/', $parts);
    } else {                                                         // modelo oficial
        $host = 'registry.ollama.ai';
        $repo = 'library/' . $parts[0];
    }
    return [$host, $repo, $tag];
}

if ($action === 'check_updates') {
    header('Content-Type: application/json');
    $ch = curl_init("$OLLAMA/api/tags");
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10]);
    $r = curl_exec($ch);
    if ($r === false) {
        http_response_code(502);
        echo json_encode(['error' => 'No se pudo conectar con Ollama: ' . curl_error($ch)]);
        exit;
    }
    $models = json_decode($r, true)['models'] ?? [];
    $mh = curl_multi_init();
    $jobs = [];
    foreach ($models as $i => $m) {
        [$host, $repo, $tag] = parse_model_ref($m['name']);
        $jobs[$i] = ['h' => curl_init("https://$host/v2/$repo/manifests/$tag"), 'hdr' => null];
        curl_setopt_array($jobs[$i]['h'], [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT        => 20,
            CURLOPT_CONNECTTIMEOUT => 8,
            CURLOPT_USERAGENT      => 'ia-local/1.0',
            CURLOPT_HTTPHEADER     => ['Accept: application/vnd.docker.distribution.manifest.v2+json'],
            CURLOPT_HEADERFUNCTION => function ($c, $line) use (&$jobs, $i) {
                if (stripos($line, 'docker-content-digest:') === 0) {
                    $jobs[$i]['hdr'] = strtolower(preg_replace('/^sha256:/', '', trim(substr($line, 22))));
                }
                return strlen($line);
            },
        ]);
        curl_multi_add_handle($mh, $jobs[$i]['h']);
    }
    do {
        $st = curl_multi_exec($mh, $running);
        if ($running) curl_multi_select($mh, 1.0);
    } while ($running && $st === CURLM_OK);

    $out = [];
    foreach ($models as $i => $m) {
        $h = $jobs[$i]['h'];
        $body = curl_multi_getcontent($h);
        $code = curl_getinfo($h, CURLINFO_HTTP_CODE);
        $err = curl_error($h);
        $local = strtolower($m['digest'] ?? '');
        $row = ['name' => $m['name'], 'size' => $m['size'] ?? 0, 'digest' => $local, 'local' => substr($local, 0, 12), 'remote' => '', 'status' => 'error', 'note' => ''];
        if ($code === 200 && is_string($body) && $body !== '') {
            $bodyHash = hash('sha256', $body);
            $remote = $jobs[$i]['hdr'] ?: $bodyHash;
            $row['remote'] = substr($remote, 0, 12);
            $row['status'] = ($local === $remote || $local === $bodyHash) ? 'ok' : 'update';
        } elseif ($code === 404) {
            $row['note'] = 'No existe con ese nombre en el registro (modelo local o copia)';
        } elseif ($code === 0) {
            $row['note'] = 'Sin conexión con el registro' . ($err ? ": $err" : '');
        } else {
            $row['note'] = "El registro respondió HTTP $code";
        }
        $out[] = $row;
        curl_multi_remove_handle($mh, $h);
    }
    curl_multi_close($mh);
    echo json_encode(['models' => $out]);
    exit;
}

// ---- Descargar / actualizar un modelo (progreso en streaming) ----
if ($action === 'pull') {
    $in = json_decode(file_get_contents('php://input'), true) ?: [];
    $name = trim((string)($in['name'] ?? ''));
    if ($name === '' || strlen($name) > 200 || !preg_match('#^[A-Za-z0-9._/:\-]+$#', $name)) {
        http_response_code(400);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Nombre de modelo inválido']);
        exit;
    }
    header('Content-Type: application/x-ndjson; charset=utf-8');
    header('Cache-Control: no-cache');
    header('X-Accel-Buffering: no');
    while (ob_get_level()) { ob_end_clean(); }
    ob_implicit_flush(true);
    $ch = curl_init("$OLLAMA/api/pull");
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS     => json_encode(['model' => $name, 'name' => $name, 'stream' => true]),
        CURLOPT_RETURNTRANSFER => false,
        CURLOPT_TIMEOUT        => 0,
        CURLOPT_WRITEFUNCTION  => function ($ch, $data) {
            echo $data;
            flush();
            return connection_aborted() ? 0 : strlen($data); // "Cancelar" corta la descarga (se puede reanudar)
        },
    ]);
    if (curl_exec($ch) === false && !connection_aborted()) {
        echo json_encode(['error' => 'Error con Ollama: ' . curl_error($ch)]) . "\n";
    }
    exit;
}
