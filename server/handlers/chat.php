<?php
// Chat con Ollama: embed (vectores para RAG), complete (respuesta corta), ps/unload (modelos en memoria) y, por defecto, el chat con streaming.
if (!defined('IA_LOCAL')) { http_response_code(403); exit; } // no se puede abrir directamente desde el navegador

// ---- Embeddings (RAG): vectores de Ollama para los fragmentos de documentos largos ----
if ($action === 'embed') {
    header('Content-Type: application/json');
    $in = json_decode(file_get_contents('php://input'), true) ?: [];
    $model = trim((string)($in['model'] ?? '')) ?: 'nomic-embed-text';
    $ch = curl_init("$OLLAMA/api/embed");
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS     => json_encode(['model' => $model, 'input' => $in['input'] ?? [], 'keep_alive' => '5m']),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 300,
    ]);
    $r = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    if ($r === false) { http_response_code(502); echo json_encode(['error' => 'No se pudo conectar con Ollama: ' . curl_error($ch)]); exit; }
    $j = json_decode($r, true);
    if ($code >= 400 || empty($j['embeddings'])) {
        $msg = is_array($j) && isset($j['error']) ? (is_string($j['error']) ? $j['error'] : json_encode($j['error'])) : 'Respuesta inesperada de Ollama';
        http_response_code(502);
        echo json_encode(['error' => "$msg (¿está descargado el modelo de embeddings «$model»? Ejecuta: ollama pull $model)"]);
        exit;
    }
    echo json_encode(['embeddings' => $j['embeddings']]);
    exit;
}

// ---- Modelos en memoria: ps (cuáles están cargados) y unload (descargar todos menos los indicados) ----
function ollama_json($method, $path, $body = null, $timeout = 15) {
    global $OLLAMA;
    $ch = curl_init("$OLLAMA$path");
    $opt = [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => $timeout, CURLOPT_CONNECTTIMEOUT => 3];
    if ($method === 'POST') $opt += [CURLOPT_POST => true, CURLOPT_HTTPHEADER => ['Content-Type: application/json'], CURLOPT_POSTFIELDS => json_encode($body)];
    curl_setopt_array($ch, $opt);
    $r = curl_exec($ch);
    if ($r === false) throw new Exception('No se pudo conectar con Ollama: ' . curl_error($ch));
    return [json_decode($r, true) ?: [], (int)curl_getinfo($ch, CURLINFO_HTTP_CODE)];
}
function ollama_loaded() {
    [$j] = ollama_json('GET', '/api/ps');
    return array_map(fn($m) => [
        'name' => $m['name'] ?? $m['model'] ?? '', 'size' => (int)($m['size'] ?? 0), 'vram' => (int)($m['size_vram'] ?? 0), 'expires' => $m['expires_at'] ?? '',
    ], $j['models'] ?? []);
}
if ($action === 'ps' || $action === 'unload') {
    header('Content-Type: application/json');
    try {
        $unloaded = [];
        if ($action === 'unload') {
            $in = json_decode(file_get_contents('php://input'), true) ?: [];
            $keep = array_map('norm_model', array_filter((array)($in['keep'] ?? []), 'is_string'));
            foreach (ollama_loaded() as $m) {
                if ($m['name'] === '' || in_array(norm_model($m['name']), $keep, true)) continue;
                // keep_alive 0 = sacarlo de la RAM/VRAM ya. Los modelos de embeddings no admiten /api/generate: se usa /api/embed
                [$j, $code] = ollama_json('POST', '/api/generate', ['model' => $m['name'], 'keep_alive' => 0]);
                if ($code >= 400) ollama_json('POST', '/api/embed', ['model' => $m['name'], 'input' => '', 'keep_alive' => 0]);
                $unloaded[] = $m['name'];
            }
            if ($unloaded) usleep(300000); // Ollama tarda un instante en liberar la memoria
        }
        echo json_encode(['loaded' => ollama_loaded(), 'unloaded' => $unloaded]);
    } catch (Throwable $e) {
        http_response_code(502);
        echo json_encode(['error' => $e->getMessage()]);
    }
    exit;
}

// ---- Respuesta corta sin streaming (prompt de imagen, resumen del chat, consulta para el buscador) ----
if ($action === 'complete') {
    header('Content-Type: application/json');
    $in = json_decode(file_get_contents('php://input'), true) ?: [];
    $opts = ['num_ctx' => (int)($in['num_ctx'] ?? 4096), 'temperature' => (float)($in['temperature'] ?? 0.7)];
    if (isset($in['num_predict'])) $opts['num_predict'] = (int)$in['num_predict'];
    $payload = [
        'model'      => $in['model'] ?? '',
        'messages'   => $in['messages'] ?? [],
        'stream'     => false,
        'keep_alive' => $in['keep_alive'] ?? '5m', // el prompt de imagen manda 0: libera la memoria para el generador
        'options'    => $opts,
    ];
    if (array_key_exists('think', $in) && $in['think'] !== null) {
        $payload['think'] = (bool)$in['think'];
    }
    $ch = curl_init("$OLLAMA/api/chat");
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS     => json_encode($payload),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 300,
    ]);
    $r = curl_exec($ch);
    if ($r === false) {
        http_response_code(502);
        echo json_encode(['error' => 'Error con Ollama: ' . curl_error($ch)]);
        exit;
    }
    echo $r;
    exit;
}

// ---- Chat con streaming ----
$input = json_decode(file_get_contents('php://input'), true);
if (!$input || empty($input['model']) || empty($input['messages'])) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Petición inválida']);
    exit;
}

$payload = [
    'model'    => $input['model'],
    'messages' => $input['messages'],
    'stream'   => true,
    'options'  => [
        'num_ctx'     => (int)($input['num_ctx'] ?? 8192),
        'temperature' => (float)($input['temperature'] ?? 0.7),
    ],
];

// Herramientas (carpeta del proyecto): el modelo puede pedir listar, leer o buscar; el navegador las ejecuta y le devuelve el resultado
if (!empty($input['tools']) && is_array($input['tools'])) $payload['tools'] = $input['tools'];

// "think" solo se envía si el modelo lo soporta (el navegador omite la clave si no)
if (array_key_exists('think', $input) && $input['think'] !== null) {
    $payload['think'] = (bool)$input['think'];
}

header('Content-Type: application/x-ndjson; charset=utf-8');
header('Cache-Control: no-cache');
header('X-Accel-Buffering: no');
while (ob_get_level()) { ob_end_clean(); }
ob_implicit_flush(true);

$ch = curl_init("$OLLAMA/api/chat");
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
    CURLOPT_POSTFIELDS     => json_encode($payload),
    CURLOPT_RETURNTRANSFER => false,
    CURLOPT_TIMEOUT        => 0,
    CURLOPT_WRITEFUNCTION  => function ($ch, $data) {
        echo $data;
        flush();
        return connection_aborted() ? 0 : strlen($data); // si el usuario pulsa "Detener", corta
    },
]);

if (curl_exec($ch) === false && !connection_aborted()) {
    echo json_encode(['error' => 'Error con Ollama: ' . curl_error($ch)]) . "\n";
}
