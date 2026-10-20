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

let win = null, php = null, baseUrl = '', quitting = false;

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

function get(url, timeout = 1500) {
  return new Promise(res => {
    const r = http.get(url, { timeout }, x => { x.resume(); res(x.statusCode); });
    r.on('timeout', () => { r.destroy(); res(0); });
    r.on('error', () => res(0));
  });
}

async function startPhp() {
  const bin = phpBinary();
  if (!bin) throw new Error('No se encontró php.exe en ' + PHP_DIR + '.\nEjecuta preparar-php.ps1 (lo hace construir.bat) antes de empaquetar.');
  fs.mkdirSync(DATA, { recursive: true });
  const port = (await portFree(PORT)) ? PORT : await randomPort();
  const args = ['-S', `127.0.0.1:${port}`, '-t', WEB, path.join(RES, 'router.php')];
  if (bin !== 'php') { // PHP portátil: su php.ini y rutas absolutas (la carpeta del programa puede tener espacios)
    const ca = path.join(PHP_DIR, 'cacert.pem');
    args.unshift('-c', path.join(RES, 'php.ini'), '-d', `extension_dir=${path.join(PHP_DIR, 'ext')}`,
      ...(fs.existsSync(ca) ? ['-d', `curl.cainfo=${ca}`, '-d', `openssl.cafile=${ca}`] : []));
  }
  try { if (fs.statSync(LOG).size > 5e6) fs.renameSync(LOG, LOG + '.old'); } catch (_) {}
  const log = fs.createWriteStream(LOG, { flags: 'a' });
  log.write(`\n==== ${new Date().toISOString()} ${bin} ${args.join(' ')}\n`);
  php = spawn(bin, args, {
    cwd: WEB, windowsHide: true,
    env: { ...process.env, IA_LOCAL_DATA: DATA, IA_LOCAL_OLLAMA: OLLAMA },
  });
  php.stdout.pipe(log); php.stderr.pipe(log);
  php.on('exit', code => {
    php = null;
    if (!quitting) dialog.showErrorBox('Local AI UI', `El servidor interno (PHP) se cerró (código ${code}).\nRevisa el registro:\n${LOG}`);
  });
  baseUrl = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) { // espera hasta 15 s a que responda
    if (await get(baseUrl + '/index.html', 500) === 200) return;
    if (!php) break;
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('El servidor interno (PHP) no arrancó. Revisa el registro:\n' + LOG);
}

function stopPhp() { quitting = true; if (php) { try { php.kill(); } catch (_) {} php = null; } }

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
const sleep = ms => new Promise(r => setTimeout(r, ms));
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
