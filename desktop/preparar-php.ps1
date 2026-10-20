# Descarga PHP para Windows (versión portátil, x64, NTS) en desktop\php y el certificado raíz de cURL (cacert.pem).
# Lo ejecuta construir.bat automáticamente si desktop\php\php.exe no existe.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$want = '8.3'
$dest = Join-Path $PSScriptRoot 'php'
$base = 'https://windows.php.net/downloads/releases'

Write-Host "Buscando la última versión de PHP $want para Windows..."
$zip = $null; $sha = $null
try {
    $rel = Invoke-RestMethod "$base/releases.json"
    $entry = $rel.$want
    $key = $entry.PSObject.Properties.Name | Where-Object { $_ -match '^nts-vs\d+-x64$' } | Select-Object -First 1
    $zip = $entry.$key.zip.path
    $sha = $entry.$key.zip.sha256
} catch { }
if (-not $zip) {
    $html = (Invoke-WebRequest "$base/" -UseBasicParsing).Content
    $all = [regex]::Matches($html, "php-$([regex]::Escape($want))\.(\d+)-nts-Win32-vs\d+-x64\.zip") | ForEach-Object { $_.Value } | Sort-Object { [int]($_ -replace "^php-$([regex]::Escape($want))\.(\d+).*", '$1') } -Unique
    $zip = $all | Select-Object -Last 1
}
if (-not $zip) { throw "No se encontró PHP $want en $base. Descárgalo a mano (zip 'Non Thread Safe x64') y descomprímelo en $dest" }

$tmp = Join-Path $env:TEMP $zip
Write-Host "Descargando $zip ..."
Invoke-WebRequest "$base/$zip" -OutFile $tmp -UseBasicParsing
if ($sha) {
    $got = (Get-FileHash $tmp -Algorithm SHA256).Hash.ToLower()
    if ($got -ne $sha.ToLower()) { throw "La suma SHA-256 del zip no coincide; vuelve a intentarlo." }
}
if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
Expand-Archive $tmp $dest -Force
Remove-Item $tmp

# PHP para Windows necesita el runtime de Visual C++ (vcruntime140.dll…). Se copia junto a php.exe para que
# el .exe funcione también en PCs que no lo tengan instalado (Microsoft permite distribuirlo así).
foreach ($dll in 'vcruntime140.dll', 'vcruntime140_1.dll', 'msvcp140.dll') {
    $src = Join-Path $env:WINDIR "System32\$dll"
    if (Test-Path $src) { Copy-Item $src $dest -Force }
}

Write-Host "Descargando certificados raíz (cacert.pem) para las conexiones HTTPS..."
Invoke-WebRequest 'https://curl.se/ca/cacert.pem' -OutFile (Join-Path $dest 'cacert.pem') -UseBasicParsing

& (Join-Path $dest 'php.exe') -c (Join-Path $PSScriptRoot 'php.ini') -d "extension_dir=$(Join-Path $dest 'ext')" -r 'echo "PHP ", PHP_VERSION, " listo. Extensiones: ", implode(", ", array_intersect(["curl","openssl","mbstring","pdo_sqlite"], get_loaded_extensions())), PHP_EOL;'
