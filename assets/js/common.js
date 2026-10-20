// Utilidades compartidas por todas las páginas (chat, consola de imágenes y consola de API keys).
const API = 'api.php';
const $ = id => document.getElementById(id);
const JSON_HDR = { 'Content-Type': 'application/json' };
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Llama a api.php?action=... y devuelve el JSON; lanza Error con el mensaje del servidor si algo falla
const dbApi = (action, opts = {}, qs = '') => fetch(API + '?action=' + action + qs, opts).then(async r => {
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || 'HTTP ' + r.status);
  return j;
});

// App de escritorio (Electron): prompt() no existe allí, se usa la ventanita que ofrece desktop/preload.js
if (window.iaDesktop) window.prompt = (m, d) => window.iaDesktop.prompt(m, d, localStorage.getItem('lang'));
