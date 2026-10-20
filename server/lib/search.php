<?php
// Búsqueda web: configuración guardada, buscadores y contexto para el modelo.
// Sin API key: DuckDuckGo (por defecto) y SearXNG (instalado en tu PC). Con API key: Ollama, Tavily y Google.
if (!defined('IA_LOCAL')) { http_response_code(403); exit; } // no se puede abrir directamente desde el navegador

// ---- Búsqueda web: configuración, buscadores y raspado opcional de páginas ----
// La configuración sale de la base de datos (tabla settings, se edita en la consola de API keys) y la petición del navegador
// la puede sobrescribir campo a campo. Los campos vacíos se rellenan con lo guardado o con variables de entorno.
function search_cfg(array $in = []) {
    $cfg = [];
    try {
        foreach (db()->query("SELECT k, v FROM settings WHERE k LIKE 'search_%'")->fetchAll() as $r) $cfg[substr($r['k'], 7)] = $r['v'];
    } catch (Throwable $e) { /* sin base de datos: solo cuenta lo que envíe el navegador */ }
    foreach (['provider', 'key', 'tavily_key', 'google_key', 'google_cx', 'searx_url', 'scrape'] as $k) {
        if (isset($in[$k]) && $in[$k] !== '') $cfg[$k] = $in[$k];
    }
    return $cfg;
}

// Devuelve [['title','url','content'], ...] o lanza una Exception con un mensaje legible
function web_search($q, array $cfg) {
    $prov = $cfg['provider'] ?? 'duckduckgo';
    $name = ['duckduckgo' => 'DuckDuckGo', 'searxng' => 'SearXNG', 'ollama' => 'Ollama', 'tavily' => 'Tavily', 'google' => 'Google'][$prov] ?? null;
    if (!$name) throw new Exception('Buscador desconocido: ' . $prov);

    if ($prov === 'duckduckgo' || $prov === 'searxng') { // sin API key
        $out = $prov === 'duckduckgo' ? ddg_search($q) : searx_search($q, $cfg);
        return scrape_results($out, $cfg);
    }
    if ($prov === 'tavily') {
        $key = trim((string)($cfg['tavily_key'] ?? '')) ?: (string)getenv('TAVILY_API_KEY');
        if ($key === '') throw new Exception('Falta la API key de Tavily (Configuraciones → Buscador web, o consola de API keys)');
        [$r, $code, $err] = http_req('https://api.tavily.com/search', [
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', "Authorization: Bearer $key"],
            CURLOPT_POSTFIELDS => json_encode(['query' => $q, 'max_results' => 5]),
        ]);
    } elseif ($prov === 'google') {
        $key = trim((string)($cfg['google_key'] ?? '')) ?: (string)getenv('GOOGLE_API_KEY');
        $cx = trim((string)($cfg['google_cx'] ?? '')) ?: (string)getenv('GOOGLE_CSE_ID');
        if ($key === '' || $cx === '') throw new Exception('Faltan la API key de Google o el ID del buscador (cx)');
        [$r, $code, $err] = http_req('https://www.googleapis.com/customsearch/v1?' . http_build_query(['key' => $key, 'cx' => $cx, 'q' => $q, 'num' => 5]), []);
    } else {
        $key = trim((string)($cfg['key'] ?? '')) ?: (string)getenv('OLLAMA_API_KEY');
        if ($key === '') throw new Exception('Falta la API key de Ollama: añádela en Configuraciones → Buscador web (se crea en ollama.com/settings/keys)');
        [$r, $code, $err] = http_req('https://ollama.com/api/web_search', [
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', "Authorization: Bearer $key"],
            CURLOPT_POSTFIELDS => json_encode(['query' => $q, 'max_results' => 5]),
        ]);
    }
    if ($r === false) throw new Exception("$name: $err");
    if ($code === 401 || $code === 403) throw new Exception("$name rechazó la API key (HTTP $code). Revisa que esté bien copiada, que no esté revocada y que el servicio esté activado. " . substr(strip_tags((string)$r), 0, 160));
    if ($code >= 400) throw new Exception("$name respondió HTTP $code: " . substr((string)$r, 0, 300));

    $j = json_decode($r, true) ?: [];
    $items = $prov === 'google' ? ($j['items'] ?? []) : ($j['results'] ?? []);
    $out = [];
    foreach ($items as $x) {
        $out[] = [
            'title'   => (string)($x['title'] ?? ''),
            'url'     => (string)($x['url'] ?? $x['link'] ?? ''),
            'content' => mb_substr((string)($x['content'] ?? $x['snippet'] ?? ''), 0, 1500),
        ];
    }
    return scrape_results($out, $cfg);
}

// Raspado opcional: lee de verdad las 4 primeras páginas (los buscadores solo dan un fragmento corto) y apunta su fecha
function scrape_results(array $out, array $cfg) {
    foreach ($out as $i => $r) $out[$i]['date'] = $r['date'] ?? '';
    if (filter_var($cfg['scrape'] ?? true, FILTER_VALIDATE_BOOLEAN)) {
        $t0 = microtime(true);
        foreach (array_slice(array_keys($out), 0, 4) as $i) {
            if (microtime(true) - $t0 > 12) break; // no hacer esperar demasiado
            $t = scrape_page($out[$i]['url'], 2500, $date);
            if ($date) $out[$i]['date'] = $date;
            if (mb_strlen($t) > mb_strlen($out[$i]['content'])) $out[$i]['content'] = $t;
        }
    }
    return $out;
}

// Instrucciones para que el modelo use bien los resultados (las comparten el chat y la API /v1)
function web_rules($today) {
    return "Instrucciones para usar los resultados: hoy es $today. Responde con la información de los resultados, no con lo que recuerdes. "
        . "Fíjate en la fecha de cada fuente y en las fechas que mencionan: si hay datos contradictorios, quédate con la fuente más reciente; "
        . "si algo ya pasó respecto a hoy, no lo presentes como futuro ni como «próximo». Descarta fuentes viejas o de relleno. "
        . "Si los resultados no responden la pregunta, dilo claramente en vez de inventar. Cita las fuentes con [n].";
}

// ---- DuckDuckGo (sin API key) ----
// Lee la versión «lite» de DuckDuckGo (y la HTML sencilla si la primera falla). No es una API oficial:
// si se hacen muchas búsquedas seguidas puede pedir un captcha durante un rato.
const DDG_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

function ddg_search($q, $max = 6) {
    $last = 'DuckDuckGo no devolvió resultados';
    $tries = [['https://lite.duckduckgo.com/lite/', 'ddg_parse_lite'], ['https://html.duckduckgo.com/html/', 'ddg_parse_html'], ['https://lite.duckduckgo.com/lite/', 'ddg_parse_lite']];
    foreach ($tries as $n => [$url, $parse]) {
        if ($n === 2) usleep(700000); // último intento tras una pausa (cortes de red momentáneos)
        [$r, $code, $err] = http_req($url, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => http_build_query(['q' => $q, 'kl' => '', 'df' => '']),
            CURLOPT_USERAGENT => DDG_UA,
            CURLOPT_ENCODING => '',
            CURLOPT_HTTPHEADER => ['Accept: text/html', 'Accept-Language: es-ES,es;q=0.9,en;q=0.8', 'Referer: https://duckduckgo.com/'],
            CURLOPT_TIMEOUT => 12,
            CURLOPT_CONNECTTIMEOUT => 6,
        ]);
        if ($r === false) { $last = "DuckDuckGo no responde ($err). ¿Hay conexión a internet?"; continue; }
        if (stripos($r, 'anomaly-modal') !== false || stripos($r, 'challenge-form') !== false || $code === 202) {
            $last = 'DuckDuckGo pidió un captcha (demasiadas búsquedas seguidas). Espera unos minutos o usa SearXNG en Configuraciones → Buscador web.';
            continue;
        }
        if ($code >= 400) { $last = "DuckDuckGo respondió HTTP $code"; continue; }
        $out = $parse($r);
        if ($out) return array_slice($out, 0, $max);
    }
    throw new Exception($last);
}

// Los enlaces de DuckDuckGo pasan por //duckduckgo.com/l/?uddg=<url real>
function ddg_url($href) {
    $href = html_entity_decode((string)$href, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    if (strpos($href, '//') === 0) $href = 'https:' . $href;
    $p = parse_url($href);
    if (!empty($p['query']) && preg_match('#(^|\.)duckduckgo\.com$#i', $p['host'] ?? '')) {
        parse_str($p['query'], $qs);
        if (!empty($qs['uddg'])) return (string)$qs['uddg'];
        return ''; // anuncios (y.js) y otros enlaces internos
    }
    return preg_match('#^https?://#i', $href) ? $href : '';
}

function ddg_dom($html) {
    $doc = new DOMDocument();
    libxml_use_internal_errors(true);
    $doc->loadHTML('<?xml encoding="UTF-8">' . $html, LIBXML_NOWARNING | LIBXML_NOERROR);
    libxml_clear_errors();
    return new DOMXPath($doc);
}
function ddg_text($n) { return trim(preg_replace('/\s+/u', ' ', $n ? $n->textContent : '')); }
function ddg_has($cls) { return "contains(concat(' ', normalize-space(@class), ' '), ' $cls ')"; }

// html.duckduckgo.com: cada resultado es un div.result (los anuncios llevan además .result--ad)
function ddg_parse_html($html) {
    $x = ddg_dom($html); $out = [];
    foreach ($x->query('//div[' . ddg_has('result') . ' and not(' . ddg_has('result--ad') . ')]') as $div) {
        $a = $x->query('.//a[' . ddg_has('result__a') . ']', $div)->item(0);
        if (!$a) continue;
        $url = ddg_url($a->getAttribute('href'));
        if ($url === '') continue;
        $sn = $x->query('.//*[' . ddg_has('result__snippet') . ']', $div)->item(0);
        $out[$url] = ['title' => ddg_text($a), 'url' => $url, 'content' => mb_substr(ddg_text($sn), 0, 1500)];
    }
    return array_values($out);
}

// lite.duckduckgo.com: una tabla; el enlace (a.result-link) y, filas más abajo, el fragmento (td.result-snippet)
function ddg_parse_lite($html) {
    $x = ddg_dom($html); $out = []; $cur = null;
    foreach ($x->query('//a[' . ddg_has('result-link') . '] | //td[' . ddg_has('result-snippet') . ']') as $n) {
        if ($n->nodeName === 'a') {
            $url = ddg_url($n->getAttribute('href'));
            $cur = $url === '' ? null : $url;
            if ($cur && !isset($out[$cur])) $out[$cur] = ['title' => ddg_text($n), 'url' => $cur, 'content' => ''];
        } elseif ($cur && $out[$cur]['content'] === '') {
            $out[$cur]['content'] = mb_substr(ddg_text($n), 0, 1500);
        }
    }
    return array_values($out);
}

// ---- SearXNG (sin API key, instalado en tu PC; ver la carpeta searxng/) ----
function searx_search($q, array $cfg, $max = 6) {
    $base = rtrim(trim((string)($cfg['searx_url'] ?? '')) ?: (getenv('SEARXNG_URL') ?: 'http://127.0.0.1:8888'), '/');
    if (!preg_match('#^https?://#i', $base)) throw new Exception('La dirección de SearXNG debe empezar por http:// o https://');
    [$r, $code, $err] = http_req("$base/search?" . http_build_query(['q' => $q, 'format' => 'json', 'safesearch' => 0]), [
        CURLOPT_HTTPHEADER => ['Accept: application/json'], CURLOPT_TIMEOUT => 20,
    ]);
    if ($r === false) throw new Exception("SearXNG no responde en $base ($err). ¿Está en marcha? (searxng/iniciar-searxng.bat)");
    if ($code === 403) throw new Exception('SearXNG rechazó el formato JSON: añade «json» en search → formats de su settings.yml (el de la carpeta searxng/ ya lo trae)');
    if ($code >= 400) throw new Exception("SearXNG respondió HTTP $code");
    $j = json_decode($r, true);
    if (!is_array($j)) throw new Exception('SearXNG no devolvió JSON (¿la dirección es correcta?)');
    $out = [];
    foreach ($j['results'] ?? [] as $x) {
        $url = (string)($x['url'] ?? '');
        if ($url === '' || isset($out[$url])) continue;
        $out[$url] = ['title' => (string)($x['title'] ?? ''), 'url' => $url, 'content' => mb_substr((string)($x['content'] ?? ''), 0, 1500)];
        if (count($out) >= $max) break;
    }
    if (!$out) throw new Exception('SearXNG no encontró resultados' . (!empty($j['unresponsive_engines']) ? ' (sus buscadores no respondieron)' : ''));
    return array_values($out);
}

function web_context(array $results) {
    $txt = [];
    foreach ($results as $i => $r) $txt[] = '[' . ($i + 1) . "] {$r['title']}\nURL: {$r['url']}\nFecha de la fuente: " . (($r['date'] ?? '') ?: 'desconocida') . "\n{$r['content']}";
    return "[Resultados de búsqueda web]\n" . implode("\n\n", $txt) . "\n\n[" . web_rules(date('Y-m-d') . ' (' . date('l') . ')') . ']';
}
