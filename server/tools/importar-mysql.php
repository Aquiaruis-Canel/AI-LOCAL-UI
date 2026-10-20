<?php
// Importa los datos de la versión con MySQL (XAMPP) a la base SQLite.
// Se ejecuta desde la consola (desktop\importar-mysql.bat lo hace por ti); MySQL tiene que estar en marcha.
//   php importar-mysql.php [host] [usuario] [contraseña] [base]
// Copia chats, imágenes de los chats, memoria, ajustes del buscador, API keys y la galería. No borra nada de MySQL.
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
define('IA_LOCAL', true);
require __DIR__ . '/../config.php';
require __DIR__ . '/../lib/database.php';

[$host, $user, $pass, $name] = [$argv[1] ?? '127.0.0.1', $argv[2] ?? 'root', $argv[3] ?? '', $argv[4] ?? 'ia_local'];
echo "Origen:  MySQL $user@$host / $name\nDestino: $DB_FILE\n\n";
try {
    $my = new PDO("mysql:host=$host;dbname=$name;charset=utf8mb4", $user, $pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
} catch (Throwable $e) {
    fwrite(STDERR, "No se pudo conectar con MySQL: {$e->getMessage()}\n¿Está iniciado MySQL en el panel de XAMPP?\n");
    exit(1);
}
$sq = db();
$has = fn($t) => (bool)$my->query("SHOW TABLES LIKE " . $my->quote($t))->fetch();
$cols = fn($t) => array_column($my->query("SHOW COLUMNS FROM `$t`")->fetchAll(), 'Field');
$utc = fn($v) => $v === null ? null : gmdate('Y-m-d H:i:s', (int)$v);

// tabla => [columnas, columnas de fecha]
$tables = [
    'chats'    => [['id', 'title', 'data'], ['updated_at']],
    'images'   => [['chat_id', 'id', 'data'], []],
    'memories' => [['id', 'text'], ['created_at']],
    'settings' => [['k', 'v'], []],
    'api_keys' => [['id', 'name', 'prefix', 'key_hash', 'web_search', 'uses', 'model'], ['created_at', 'last_used']],
    'gallery'  => [['id', 'file', 'prompt', 'info'], ['created_at']],
];
$sq->beginTransaction();
foreach ($tables as $t => [$plain, $dates]) {
    if (!$has($t)) { echo "  $t: no existe en MySQL, se omite\n"; continue; }
    $exist = $cols($t);
    $plain = array_values(array_intersect($plain, $exist));
    $dates = array_values(array_intersect($dates, $exist));
    $sel = implode(', ', array_merge(array_map(fn($c) => "`$c`", $plain), array_map(fn($c) => "UNIX_TIMESTAMP(`$c`) AS `$c`", $dates)));
    $all = array_merge($plain, $dates);
    $ins = $sq->prepare("INSERT OR REPLACE INTO $t (" . implode(', ', array_map(fn($c) => "`$c`", $all)) . ') VALUES (' . implode(', ', array_fill(0, count($all), '?')) . ')');
    $n = 0;
    foreach ($my->query("SELECT $sel FROM `$t`") as $r) {
        $vals = array_map(fn($c) => $r[$c], $plain);
        foreach ($dates as $c) $vals[] = $utc($r[$c]);
        $ins->execute($vals);
        $n++;
    }
    echo "  $t: $n fila(s)\n";
}
$sq->commit();

// Archivos de la galería: de la carpeta galeria/ del proyecto a la carpeta de datos
$src = dirname(__DIR__, 2) . '/galeria';
if (is_dir($src) && realpath($src) !== realpath($GALLERY_DIR)) {
    if (!is_dir($GALLERY_DIR)) mkdir($GALLERY_DIR, 0777, true);
    $n = 0;
    foreach (glob("$src/*.{jpg,jpeg,png,webp}", GLOB_BRACE) as $f) {
        $to = $GALLERY_DIR . '/' . basename($f);
        if (!is_file($to) && copy($f, $to)) $n++;
    }
    echo "  galería: $n archivo(s) copiados a $GALLERY_DIR\n";
}
echo "\nListo.\n";
