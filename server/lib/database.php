<?php
// Base de datos SQLite (un solo archivo, sin servidor; se crea sola la primera vez) y utilidades de chats.
if (!defined('IA_LOCAL')) { http_response_code(403); exit; } // no se puede abrir directamente desde el navegador

function db() {
    global $DATA_DIR, $DB_FILE;
    static $pdo = null;
    if ($pdo) return $pdo;
    if (!extension_loaded('pdo_sqlite')) throw new Exception('La extensión pdo_sqlite de PHP no está activa (php.ini: extension=pdo_sqlite)');
    if (!is_dir($DATA_DIR) && !@mkdir($DATA_DIR, 0777, true)) throw new Exception("No se pudo crear la carpeta de datos: $DATA_DIR");
    // Si la carpeta de datos está dentro de la web (XAMPP), que nadie pueda descargar la base desde el navegador
    if (!is_file("$DATA_DIR/.htaccess")) @file_put_contents("$DATA_DIR/.htaccess", "Require all denied\n");
    $pdo = new PDO('sqlite:' . $DB_FILE, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_TIMEOUT => 10, // espera si otra petición está escribiendo
    ]);
    $pdo->exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;');
    $pdo->exec("CREATE TABLE IF NOT EXISTS chats (
        id TEXT NOT NULL PRIMARY KEY,
        title TEXT NOT NULL,
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $pdo->exec("CREATE INDEX IF NOT EXISTS chats_updated ON chats (updated_at)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS images (
        chat_id TEXT NOT NULL,
        id TEXT NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (chat_id, id)
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        `text` TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS settings (
        k TEXT NOT NULL PRIMARY KEY,
        v TEXT NOT NULL
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS api_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        prefix TEXT NOT NULL,
        key_hash TEXT NOT NULL UNIQUE,
        web_search INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_used TEXT NULL DEFAULT NULL,
        uses INTEGER NOT NULL DEFAULT 0,
        model TEXT NOT NULL DEFAULT ''
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS gallery (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file TEXT NOT NULL,
        prompt TEXT NOT NULL,
        info TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    return $pdo;
}

// Fecha guardada (texto UTC) -> segundos Unix, como hacía UNIX_TIMESTAMP() en MySQL
function sql_ts($col) { return "CAST(strftime('%s', $col) AS INTEGER)"; }

function chat_id($v) { return preg_replace('/[^A-Za-z0-9_-]/', '', (string)$v); }

// Ollama trata «qwen3» y «qwen3:latest» como el mismo modelo
function norm_model($m) {
    $m = strtolower(trim((string)$m));
    return $m === '' || strpos($m, ':') !== false ? $m : $m . ':latest';
}
