<?php
// Imágenes con FastSD CPU: image (chat), imagestatus y imagegen (consola de imágenes).
if (!defined('IA_LOCAL')) { http_response_code(403); exit; } // no se puede abrir directamente desde el navegador

// ---- Generación de imágenes con FastSD CPU (python src/app.py --api, puerto 8000) ----
if ($action === 'image') {
    header('Content-Type: application/json');
    $in = json_decode(file_get_contents('php://input'), true) ?: [];
    $size = max(256, min(1024, (int)($in['width'] ?? 512)));
    $body = [
        'prompt'                => $in['prompt'] ?? '',
        'use_openvino'          => true,
        'use_tiny_auto_encoder' => true,
        'image_width'           => $size,
        'image_height'          => $size,
        'number_of_images'      => 1,
    ];
    $ch = curl_init("$FASTSD/api/generate");
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS     => json_encode($body),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 900,
    ]);
    $r = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    if ($r === false) {
        http_response_code(502);
        echo json_encode(['error' => 'No se pudo conectar con FastSD CPU (puerto 8000). Inicia start-webserver.bat. Detalle: ' . curl_error($ch)]);
        exit;
    }
    if ($code >= 400) {
        http_response_code(502);
        echo json_encode(['error' => "FastSD CPU respondió HTTP $code: " . substr($r, 0, 400)]);
        exit;
    }
    $j = json_decode($r, true);
    $img = null;
    if (is_array($j)) {
        $img = $j['images'][0] ?? $j['image'] ?? null;
    }
    if (!$img || !is_string($img)) {
        http_response_code(502);
        echo json_encode(['error' => 'Respuesta inesperada de FastSD CPU: ' . substr($r, 0, 300)]);
        exit;
    }
    $img = preg_replace('#^data:image/\w+;base64,#', '', $img);
    echo json_encode(['image' => $img]);
    exit;
}

// ---- Estado de FastSD CPU ----
if ($action === 'imagestatus') {
    header('Content-Type: application/json');
    $ch = curl_init("$FASTSD/api/info");
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 5]);
    $r = curl_exec($ch);
    if ($r === false) { http_response_code(502); echo json_encode(['error' => curl_error($ch)]); exit; }
    echo json_encode(['ok' => true]);
    exit;
}

// ---- Generación completa (consola de imágenes) ----
if ($action === 'imagegen') {
    header('Content-Type: application/json');
    $in = json_decode(file_get_contents('php://input'), true) ?: [];
    $openvino = !empty($in['openvino']);
    $model = (string)($in['model'] ?? '');
    $hasSeed = ($in['seed'] ?? '') !== '';
    $body = [
        'prompt'                => $in['prompt'] ?? '',
        'negative_prompt'       => $in['negative'] ?? '',
        'use_openvino'          => $openvino,
        'use_tiny_auto_encoder' => !empty($in['tiny']),
        'inference_steps'       => (int)($in['steps'] ?? 2),
        'guidance_scale'        => (float)($in['guidance'] ?? 1),
        'image_width'           => (int)($in['width'] ?? 512),
        'image_height'          => (int)($in['height'] ?? 512),
        'number_of_images'      => max(1, min(4, (int)($in['count'] ?? 1))),
        'use_seed'              => $hasSeed,
        'seed'                  => $hasSeed ? (int)$in['seed'] : -1,
    ];
    if (strpos($model, 'lora:') === 0) {
    $body['use_openvino'] = false;
    $body['use_lcm_lora'] = true;
    $body['lcm_lora'] = [
        'base_model_id' => substr($model, 5),
        'lcm_lora_id'   => 'latent-consistency/lcm-lora-sdv1-5',
    ];
} elseif ($model !== '') {
    $body[$openvino ? 'openvino_lcm_model_id' : 'lcm_model_id'] = $model;
}

    $ch = curl_init("$FASTSD/api/generate");
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode($body),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 1800,
    ]);
    $r = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    if ($r === false) { http_response_code(502); echo json_encode(['error' => 'No se pudo conectar con FastSD CPU: ' . curl_error($ch)]); exit; }
    if ($code >= 400) { http_response_code(502); echo json_encode(['error' => "FastSD respondió HTTP $code: " . substr($r, 0, 400)]); exit; }
    $j = json_decode($r, true);
    $imgs = array_map(fn($b) => preg_replace('#^data:image/\w+;base64,#', '', $b), $j['images'] ?? []);
    if (!$imgs) { http_response_code(502); echo json_encode(['error' => 'Respuesta inesperada: ' . substr($r, 0, 300)]); exit; }
    echo json_encode(['images' => $imgs]);
    exit;
}
