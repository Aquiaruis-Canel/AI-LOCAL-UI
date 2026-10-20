<?php
// Utilidades HTTP: peticiones cURL sencillas y lectura segura de páginas web (raspado).
if (!defined('IA_LOCAL')) { http_response_code(403); exit; } // no se puede abrir directamente desde el navegador

function http_req($url, array $opt) {
    $ch = curl_init($url);
    curl_setopt_array($ch, $opt + [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 30, CURLOPT_CONNECTTIMEOUT => 10]);
    $r = curl_exec($ch);
    return [$r, (int)curl_getinfo($ch, CURLINFO_HTTP_CODE), curl_error($ch)];
}

// Solo http/https hacia direcciones públicas: el raspado nunca debe tocar tu red local ni localhost
function safe_url($u) {
    $p = parse_url((string)$u);
    if (!$p || !in_array(strtolower($p['scheme'] ?? ''), ['http', 'https'], true) || empty($p['host'])) return false;
    $ip = filter_var($p['host'], FILTER_VALIDATE_IP) ? $p['host'] : gethostbyname($p['host']);
    return (bool)filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE);
}

// Fecha de publicación de una página (Y-m-d) a partir de sus metadatos, <time> o la propia URL. '' si no se sabe.
function page_date($html, $url) {
    $c = [];
    $metas = 'article:published_time|datePublished|pubdate|publishdate|publish-date|date|dc\.date|dc\.date\.issued|sailthru\.date|parsely-pub-date|og:published_time';
    if (preg_match_all('#<meta\b[^>]*>#i', $html, $mm)) {
        foreach ($mm[0] as $tag) {
            if (preg_match('#(?:property|name|itemprop)\s*=\s*["\'](' . $metas . ')["\']#i', $tag) && preg_match('#content\s*=\s*["\']([^"\']+)#i', $tag, $v)) $c[] = $v[1];
        }
    }
    if (preg_match('#"datePublished"\s*:\s*"([^"]+)"#', $html, $v)) $c[] = $v[1];
    if (preg_match('#<time\b[^>]*datetime\s*=\s*["\']([^"\']+)#i', $html, $v)) $c[] = $v[1];
    if (preg_match('#/(20\d\d)/(\d{1,2})/(\d{1,2})(?:/|-|$)#', $url, $v)) $c[] = sprintf('%s-%02d-%02d', $v[1], $v[2], $v[3]);
    elseif (preg_match('#[/-](20\d\d)[/-](\d{2})(?:[/-]|$)#', $url, $v) && $v[2] >= 1 && $v[2] <= 12) $c[] = "{$v[1]}-{$v[2]}-01";
    foreach ($c as $d) {
        $t = strtotime(trim($d));
        if ($t && $t > strtotime('2000-01-01') && $t < time() + 86400 * 2) return date('Y-m-d', $t);
    }
    return '';
}

// Descarga una página y devuelve su texto útil (sin scripts, menús, botones ni etiquetas). Vacío si falla.
// $date recibe la fecha de publicación si se puede averiguar.
function scrape_page($url, $max = 2500, &$date = null) {
    $date = '';
    for ($hop = 0; $hop < 4; $hop++) { // redirecciones manuales: cada salto se vuelve a validar
        if (!safe_url($url)) return '';
        $buf = ''; $loc = null;
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_TIMEOUT        => 8,
            CURLOPT_CONNECTTIMEOUT => 4,
            CURLOPT_ENCODING       => '',
            CURLOPT_USERAGENT      => 'Mozilla/5.0 (compatible; ia-local/1.0)',
            CURLOPT_HTTPHEADER     => ['Accept: text/html,text/plain;q=0.9'],
            CURLOPT_HEADERFUNCTION => function ($c, $l) use (&$loc) { if (stripos($l, 'location:') === 0) $loc = trim(substr($l, 9)); return strlen($l); },
            CURLOPT_WRITEFUNCTION  => function ($c, $d) use (&$buf) { $buf .= $d; return strlen($buf) > 500000 ? 0 : strlen($d); }, // tope de 500 KB
        ]);
        curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $type = (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
        if ($code >= 300 && $code < 400 && $loc) {
            if (!preg_match('#^https?://#i', $loc)) {
                $p = parse_url($url);
                $loc = $p['scheme'] . '://' . $p['host'] . (isset($p['port']) ? ':' . $p['port'] : '') . (strpos($loc, '/') === 0 ? $loc : '/' . $loc);
            }
            $url = $loc;
            continue;
        }
        if ($code !== 200 || ($type !== '' && stripos($type, 'text/') !== 0 && stripos($type, 'xhtml') === false)) return '';
        if (!mb_check_encoding($buf, 'UTF-8')) $buf = mb_convert_encoding($buf, 'UTF-8', 'ISO-8859-1');
        $date = page_date($buf, $url);
        $title = preg_match('#<title[^>]*>(.*?)</title>#is', $buf, $tm) ? trim(html_entity_decode(strip_tags($tm[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8')) : '';
        $buf = preg_replace('#<(script|style|noscript|svg|nav|header|footer|form|iframe|aside|button|figure|select)\b[^>]*>.*?</\1>#is', ' ', $buf) ?? '';
        // Si la página marca su contenido principal (<article> o <main>), solo se lee eso
        if (preg_match_all('#<article\b[^>]*>(.*?)</article>#is', $buf, $am) && ($best = max(array_map('strlen', $am[1]))) > 800) {
            foreach ($am[1] as $a) if (strlen($a) === $best) { $buf = $a; break; }
        } elseif (preg_match('#<main\b[^>]*>(.*)</main>#is', $buf, $mn) && strlen($mn[1]) > 800) {
            $buf = $mn[1];
        }
        $buf = preg_replace('#<!--.*?-->#s', ' ', $buf) ?? '';
        $buf = preg_replace('#</(p|div|li|h\d|tr|section|article)>|<br\s*/?>#i', "\n", $buf) ?? '';
        $txt = html_entity_decode(strip_tags($buf), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $txt = preg_replace('/[ \t\x{00A0}]+/u', ' ', $txt) ?? '';
        $txt = preg_replace('/\s*\n\s*/', "\n", $txt) ?? '';
        // Fuera menús, botones y créditos: se quedan las líneas con frases (o datos cortos con cifras, como fechas y horas)
        $keep = [];
        foreach (explode("\n", $txt) as $l) {
            $l = trim($l);
            $len = mb_strlen($l);
            if ($len >= 60 || ($len >= 20 && preg_match('/\d/', $l) && preg_match('/\s/', $l))) $keep[$l] = true;
        }
        $txt = implode("\n", array_keys($keep));
        if ($title !== '' && mb_strpos($txt, $title) !== 0) $txt = $title . "\n" . $txt;
        return mb_substr(trim($txt), 0, $max);
    }
    return '';
}
