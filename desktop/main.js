// App de escritorio de Local AI UI: arranca el PHP portátil (php -S) con la web y la abre en una ventana propia.
// Los datos (base SQLite y galería) se guardan en %APPDATA%\Local AI UI\data, fuera de la carpeta del programa.
const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const http = require('http');
const { spawn } = require('child_process');

const DEV = !app.isPackaged;
const RES = DEV ? __dirname : process.resourcesPath;            // recursos: php/, router.php, php.ini
const WEB = DEV ? path.join(__dirname, '..') : path.join(RES, 'web'); // la web (index.html, api.php, server/…)
const PHP_DIR = path.join(RES, 'php');
const DATA = path.join(app.getPath('userData'), 'data');
const LOG = path.join(app.getPath('userData'), 'php.log');
const PORT = +process.env.IA_LOCAL_PORT || 8765; // puerto fijo: así la URL de la API (/api.php/v1) no cambia
const OLLAMA = process.env.IA_LOCAL_OLLAMA || 'http://127.0.0.1:11434';

let win = null, baseUrl = '', quitting = false;

if (!app.requestSingleInstanceLock()) app.quit(); // una sola copia abierta
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

// ---- PHP ----
function phpBinary() {
  const exe = path.join(PHP_DIR, process.platform === 'win32' ? 'php.exe' : 'php');
  if (fs.existsSync(exe)) return exe;
  if (DEV && process.platform !== 'win32') return 'php'; // desarrollo en Linux/macOS: el PHP del sistema
  return null;
}

const portFree = port => new Promise(res => {
  const s = net.createServer().once('error', () => res(false)).once('listening', () => s.close(() => res(true)));
  s.listen(port, '127.0.0.1');
});
const randomPort = () => new Promise(res => {
  const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

function get(url, timeout = 1500) {
  return new Promise(res => {
    const r = http.get(url, { timeout }, x => { x.resume(); res(x.statusCode); });
    r.on('timeout', () => { r.destroy(); res(0); });
    r.on('error', () => res(0));
  });
}

// php -S atiende UNA petición a la vez (en Windows no admite PHP_CLI_SERVER_WORKERS). Con un solo PHP, una descarga
// de modelo o una respuesta larga dejaban en cola todo lo demás (y al revés: la descarga esperaba a que acabara otra
// petición). Por eso se arrancan varios PHP en puertos internos y un pequeño proxy de Node, en el puerto de siempre,
// reparte cada petición al que esté libre, sin almacenar nada (el streaming llega trozo a trozo).
const WORKERS = Math.max(1, Math.min(16, +process.env.IA_LOCAL_WORKERS || 4));
let workers = [], front = null, phpBin = null, phpArgs = null, phpLog = null, crashes = [];

function spawnWorker(w) {
  w.proc = spawn(phpBin, ['-S', `127.0.0.1:${w.port}`, ...phpArgs], {
    cwd: WEB, windowsHide: true,
    env: { ...process.env, IA_LOCAL_DATA: DATA, IA_LOCAL_OLLAMA: OLLAMA },
  });
  w.proc.stdout.pipe(phpLog, { end: false }); w.proc.stderr.pipe(phpLog, { end: false });
  w.proc.on('error', () => {});
  w.proc.on('exit', code => {
    w.proc = null;
    if (quitting) return;
    phpLog.write(`\n==== PHP (puerto ${w.port}) se cerró con código ${code}; se vuelve a abrir\n`);
    const now = Date.now();
    crashes = crashes.filter(t => now - t < 60000).concat(now);
    if (crashes.length > 10) { // se cae una y otra vez: algo está mal, mejor avisar
      quitting = true;
      dialog.showErrorBox('Local AI UI', `El servidor interno (PHP) se cierra una y otra vez (código ${code}).\nRevisa el registro:\n${LOG}`);
      app.quit();
      return;
    }
    setTimeout(() => { if (!quitting) spawnWorker(w); }, 300);
  });
}

// Elige el PHP con menos peticiones en curso (y que esté vivo)
function pickWorker() {
  let best = null;
  for (const w of workers) if (w.proc && (!best || w.active < best.active)) best = w;
  return best;
}

const HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'proxy-connection', 'upgrade']);

function proxy(req, res) {
  const w = pickWorker();
  if (!w) { res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('El servidor interno (PHP) no está disponible.'); return; }
  w.active++;
  let done = false;
  const finish = () => { if (!done) { done = true; w.active--; } };
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) if (!HOP.has(k)) headers[k] = v;
  headers.connection = 'close';
  const up = http.request({ host: '127.0.0.1', port: w.port, method: req.method, path: req.url, headers, agent: false }, ur => {
    const h = {};
    for (const [k, v] of Object.entries(ur.headers)) if (!HOP.has(k)) h[k] = v;
    res.writeHead(ur.statusCode, ur.statusMessage, h);
    res.flushHeaders();
    ur.on('data', d => res.write(d)); // cada trozo sale en cuanto llega (chat y descargas en streaming)
    ur.on('end', () => { res.end(); finish(); });
    ur.on('error', () => { res.destroy(); finish(); });
  });
  up.setNoDelay(true);
  up.on('error', () => {
    finish();
    if (!res.headersSent) { res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Error del servidor interno (PHP).'); }
    else res.destroy();
  });
  // Si la página corta (botón Detener o Cancelar), se corta también la petición a PHP para que deje de leer de Ollama
  res.on('close', () => { if (!res.writableFinished) { up.destroy(); finish(); } });
  req.pipe(up);
}

async function startPhp() {
  phpBin = phpBinary();
  if (!phpBin) throw new Error('No se encontró php.exe en ' + PHP_DIR + '.\nEjecuta preparar-php.ps1 (lo hace construir.bat) antes de empaquetar.');
  fs.mkdirSync(DATA, { recursive: true });
  phpArgs = ['-t', WEB, path.join(RES, 'router.php')];
  if (phpBin !== 'php') { // PHP portátil: su php.ini y rutas absolutas (la carpeta del programa puede tener espacios)
    const ca = path.join(PHP_DIR, 'cacert.pem');
    phpArgs.unshift('-c', path.join(RES, 'php.ini'), '-d', `extension_dir=${path.join(PHP_DIR, 'ext')}`,
      ...(fs.existsSync(ca) ? ['-d', `curl.cainfo=${ca}`, '-d', `openssl.cafile=${ca}`] : []));
  }
  try { if (fs.statSync(LOG).size > 5e6) fs.renameSync(LOG, LOG + '.old'); } catch (_) {}
  phpLog = fs.createWriteStream(LOG, { flags: 'a' });
  phpLog.write(`\n==== ${new Date().toISOString()} ${WORKERS} × ${phpBin} -S 127.0.0.1:<puerto> ${phpArgs.join(' ')}\n`);

  for (let i = 0; i < WORKERS; i++) {
    const w = { port: await randomPort(), active: 0, proc: null };
    workers.push(w);
    spawnWorker(w);
  }
  // Espera hasta 15 s a que respondan todos
  for (const w of workers) {
    let ok = false;
    for (let i = 0; i < 60 && !ok; i++) {
      ok = await get(`http://127.0.0.1:${w.port}/index.html`, 500) === 200;
      if (!ok) await sleep(250);
    }
    if (!ok) throw new Error('El servidor interno (PHP) no arrancó. Revisa el registro:\n' + LOG);
  }

  const port = (await portFree(PORT)) ? PORT : await randomPort();
  front = http.createServer({ noDelay: true, requestTimeout: 0, headersTimeout: 60000 }, proxy);
  front.keepAliveTimeout = 5000;
  await new Promise((res, rej) => front.once('error', rej).listen(port, '127.0.0.1', res));
  baseUrl = `http://127.0.0.1:${port}`;
}

function stopPhp() {
  quitting = true;
  for (const w of workers) if (w.proc) { try { w.proc.kill(); } catch (_) {} w.proc = null; }
  if (front) { try { front.close(); } catch (_) {} front = null; }
}

// ---- Ventana ----
function isOwn(url) { return url.startsWith(baseUrl + '/'); }

function createWindow() {
  win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 720, minHeight: 500,
    title: 'Local AI UI', backgroundColor: '#0f1115', show: false, autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, spellcheck: true },
  });
  win.once('ready-to-show', () => win.show());
  // Enlaces externos (fuentes de la búsqueda web, ollama.com…) se abren en el navegador normal
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url === 'about:blank' || url === '') { // exportar a PDF abre una ventana en blanco para imprimir
      return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, backgroundColor: '#ffffff' } };
    }
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // Un marco (la vista previa del panel de código) nunca navega a una web: ni a la propia app ni a otra
  win.webContents.on('will-frame-navigate', details => {
    if (!details.isMainFrame && /^https?:/i.test(details.url)) details.preventDefault();
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!isOwn(url)) { e.preventDefault(); if (/^https?:\/\//i.test(url)) shell.openExternal(url); }
  });
  win.loadURL(baseUrl + '/');
  win.on('closed', () => { win = null; });
}

// prompt() síncrono: la página espera (sendSync) hasta que se responde la ventanita
ipcMain.on('ia-prompt', (e, message, def, lang) => {
  const parent = BrowserWindow.fromWebContents(e.sender) || win;
  const w = new BrowserWindow({
    parent, modal: true, width: 440, height: 200, resizable: false, minimizable: false, maximizable: false,
    title: 'Local AI UI', autoHideMenuBar: true, show: false, backgroundColor: '#161922',
    webPreferences: { preload: path.join(__dirname, 'prompt-preload.js'), contextIsolation: true },
  });
  w.setMenu(null);
  let answered = false;
  const onDone = (ev, value) => {
    if (ev.sender !== w.webContents) return;
    answered = true; e.returnValue = value; ipcMain.removeListener('ia-prompt-done', onDone); w.close();
  };
  ipcMain.on('ia-prompt-done', onDone);
  w.on('closed', () => { if (!answered) { ipcMain.removeListener('ia-prompt-done', onDone); e.returnValue = null; } });
  w.once('ready-to-show', () => w.show());
  w.loadFile(path.join(__dirname, 'prompt.html'), { query: { m: message, d: def, lang: lang || 'es' } });
});
ipcMain.on('ia-open-data', () => shell.openPath(DATA));
ipcMain.handle('ia-pick-folder', async e => {
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender) || win, { title: 'Elige la carpeta del proyecto', properties: ['openDirectory'] });
  return r.canceled || !r.filePaths.length ? null : r.filePaths[0];
});

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Archivo', submenu: [
      { label: 'Abrir la carpeta de datos', click: () => shell.openPath(DATA) },
      { label: 'Abrir el registro del servidor', click: () => shell.openPath(LOG) },
      { label: 'Copiar la URL de la API (OpenAI)', click: () => require('electron').clipboard.writeText(baseUrl + '/api.php/v1') },
      { type: 'separator' },
      { role: 'quit', label: 'Salir' },
    ] },
    { label: 'Editar', submenu: [
      { role: 'undo', label: 'Deshacer' }, { role: 'redo', label: 'Rehacer' }, { type: 'separator' },
      { role: 'cut', label: 'Cortar' }, { role: 'copy', label: 'Copiar' }, { role: 'paste', label: 'Pegar' }, { role: 'selectAll', label: 'Seleccionar todo' },
    ] },
    { label: 'Ver', submenu: [
      { role: 'reload', label: 'Recargar' }, { role: 'forceReload', label: 'Forzar recarga' },
      { role: 'toggleDevTools', label: 'Herramientas de desarrollo' }, { type: 'separator' },
      { role: 'resetZoom', label: 'Tamaño real' }, { role: 'zoomIn', label: 'Ampliar' }, { role: 'zoomOut', label: 'Reducir' },
      { type: 'separator' }, { role: 'togglefullscreen', label: 'Pantalla completa' },
    ] },
    { label: 'Ayuda', submenu: [
      { label: 'Descargar Ollama', click: () => shell.openExternal('https://ollama.com/download') },
      { label: 'Acerca de', click: () => dialog.showMessageBox(win, { title: 'Local AI UI', message: `Local AI UI ${app.getVersion()}`, detail: `Servidor: ${baseUrl}\nDatos: ${DATA}` }) },
    ] },
  ]));
}

// ---- Ollama: abrirlo si está instalado pero apagado, y liberar la memoria al salir ----
const ollamaIsLocal = () => /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/i.test(OLLAMA);

function findOllama() {
  const c = [];
  if (process.platform === 'win32') {
    for (const base of [process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'Ollama'), process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Ollama')]) {
      if (base) c.push(path.join(base, 'ollama app.exe'), path.join(base, 'ollama.exe'));
    }
  } else c.push('/usr/local/bin/ollama', '/usr/bin/ollama', '/opt/homebrew/bin/ollama');
  return c.find(f => { try { return fs.statSync(f).isFile(); } catch (_) { return false; } }) || null;
}

async function startOllama() {
  const exe = findOllama();
  if (!exe || !ollamaIsLocal()) return false;
  // «ollama app.exe» es la app de la bandeja (arranca el servidor ella misma); ollama.exe necesita «serve»
  const p = spawn(exe, /ollama app\.exe$/i.test(exe) ? [] : ['serve'], { detached: true, stdio: 'ignore', windowsHide: true });
  p.on('error', () => {});
  p.unref(); // sigue abierto aunque se cierre esta app, como si lo hubieras abierto tú
  for (let i = 0; i < 60; i++) { // hasta 30 s
    await sleep(500);
    if (await get(OLLAMA + '/api/version', 1000)) return true;
  }
  return false;
}

function ollamaCall(method, p, body, timeout = 3000) {
  return new Promise(res => {
    const u = new URL(OLLAMA + p), data = body ? JSON.stringify(body) : null;
    const r = http.request(u, { method, timeout, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} }, x => {
      let b = ''; x.on('data', d => b += d); x.on('end', () => { try { res(JSON.parse(b)); } catch (_) { res(null); } });
    });
    r.on('timeout', () => { r.destroy(); res(null); });
    r.on('error', () => res(null));
    if (data) r.write(data);
    r.end();
  });
}

// Al cerrar la app, los modelos salen de la RAM/VRAM (Ollama los volvería a cargar si otra app los pide)
async function unloadAllModels() {
  const ps = await ollamaCall('GET', '/api/ps', null, 1500);
  await Promise.all((ps?.models || []).map(m => ollamaCall('POST', '/api/generate', { model: m.name, keep_alive: 0 })
    .then(r => r?.error ? ollamaCall('POST', '/api/embed', { model: m.name, input: '', keep_alive: 0 }) : r)));
}

const setStatus = (text, cls = '') => win && win.webContents.executeJavaScript(
  `(() => { const s = document.getElementById('status'); if (s) { s.textContent = ${JSON.stringify(text)}; s.className = ${JSON.stringify(cls)}; } })()`).catch(() => {});

async function checkOllama() {
  if (await get(OLLAMA + '/api/version', 2000)) return;
  if (findOllama() && ollamaIsLocal()) {
    setStatus('● Abriendo Ollama…');
    if (await startOllama()) { // ya responde: la página vuelve a pedir la lista de modelos
      win && win.webContents.executeJavaScript('typeof loadModels === "function" && loadModels(); typeof refreshLoaded === "function" && refreshLoaded();').catch(() => {});
      return;
    }
  }
  const r = await dialog.showMessageBox(win, {
    type: 'warning', title: 'Local AI UI',
    message: 'No se encontró Ollama',
    detail: `La app necesita Ollama en marcha (${OLLAMA}) para hablar con los modelos.\nSi no lo tienes instalado, descárgalo, ábrelo y pulsa «Recargar» (Ctrl+R).`,
    buttons: ['Descargar Ollama', 'Continuar'], defaultId: 0, cancelId: 1,
  });
  if (r.response === 0) shell.openExternal('https://ollama.com/download');
}

app.whenReady().then(async () => {
  buildMenu();
  try { await startPhp(); }
  catch (e) { dialog.showErrorBox('Local AI UI', e.message); stopPhp(); app.quit(); return; }
  createWindow();
  win.webContents.once('did-finish-load', checkOllama);
});
app.on('window-all-closed', () => app.quit());
let leaving = false;
app.on('before-quit', e => {
  if (leaving) return;
  leaving = true;
  e.preventDefault();
  Promise.race([unloadAllModels(), sleep(4000)]).finally(() => { stopPhp(); app.quit(); });
});
process.on('exit', stopPhp);
