<?php
// Acción websearch: busca en la web con el buscador elegido (DuckDuckGo, SearXNG, Ollama, Tavily o Google).
if (!defined('IA_LOCAL')) { http_response_code(403); exit; } // no se puede abrir directamente desde el navegador

// ---- Búsqueda web (ver search_cfg / web_search arriba) ----
if ($action === 'websearch') {
    header('Content-Type: application/json');
    $in = json_decode(file_get_contents('php://input'), true) ?: [];
    $q = trim((string)($in['query'] ?? ''));
    if ($q === '') { http_response_code(400); echo json_encode(['error' => 'Consulta vacía']); exit; }
    try {
        $cfg = search_cfg($in);
        $res = web_search($q, $cfg);
        echo json_encode(['results' => $res, 'provider' => $cfg['provider'] ?? 'duckduckgo'], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    } catch (Throwable $e) {
        http_response_code(502);
        echo json_encode(['error' => $e->getMessage()], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    }
    exit;
}
