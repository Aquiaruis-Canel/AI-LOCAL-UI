// Consola de API keys (claves.html). Utilidades comunes en assets/js/common.js.
const BASE = new URL('api.php/v1', location.href).href; // base URL de la API compatible con OpenAI

const api = (action, body) => fetch(API + '?action=' + action, body === undefined ? {} : { method: 'POST', headers: JSON_HDR, body: JSON.stringify(body) })
  .then(async r => {
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(typeof j.error === 'string' ? j.error : (j.error?.message || 'HTTP ' + r.status));
    return j;
  });
const LOCALES = { es: 'es', en: 'en', ru: 'ru', zh: 'zh-CN', ja: 'ja' };
const fmt = s => s ? new Date(s * 1000).toLocaleString(LOCALES[LANG] || undefined) : '—';

// Modelos instalados en Ollama (para asignar uno a cada clave) y <option>s con «Cualquier modelo» al principio
let installed = [];
function fillModelSelect(sel, selected) {
  sel.innerHTML = '';
  const add = (v, label) => { const o = document.createElement('option'); o.value = v; o.textContent = label; sel.append(o); };
  add('', 'Cualquier modelo');
  installed.forEach(m => add(m, m));
  if (selected && !installed.includes(selected)) add(selected, selected + ' (no instalado)');
  sel.value = selected || '';
}

// ---- Lista de claves ----
async function loadKeys() {
  try {
    const j = await api('key_list');
    const tb = $('keyTable').querySelector('tbody');
    tb.innerHTML = '';
    j.keys.forEach(k => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${esc(k.name)}</td><td><code>${esc(k.prefix)}</code></td><td class="mcell"></td><td>${+k.web_search ? '<span class="kbadge">web</span>' : '—'}</td><td>${fmt(k.created)}</td><td>${fmt(k.last_used)}</td><td>${k.uses}</td><td></td>`;
      const ms = document.createElement('select');
      fillModelSelect(ms, k.model);
      ms.onchange = async () => { // cambiar el modelo asignado a una clave existente
        try { await api('key_update', { id: +k.id, model: ms.value }); } catch (e) { alert(e.message); loadKeys(); }
      };
      tr.querySelector('.mcell').append(ms);
      const b = document.createElement('button');
      b.className = 'hbtn'; b.textContent = 'Revocar';
      b.onclick = async () => {
        if (!confirm(`¿Revocar la clave «${k.name}»? Los scripts que la usen dejarán de funcionar.`)) return;
        try { await api('key_delete', { id: +k.id }); loadKeys(); } catch (e) { alert(e.message); }
      };
      tr.lastChild.appendChild(b);
      tb.appendChild(tr);
    });
    $('noKeys').hidden = j.keys.length > 0;
    $('keyTable').hidden = j.keys.length === 0;
    $('status').textContent = '● Base de datos lista'; $('status').className = 'ok';
  } catch (e) {
    $('status').textContent = '● ' + t(e.message); $('status').className = 'bad';
  }
}
$('reload').onclick = () => { loadModels().then(loadKeys); loadCfg(); };
document.addEventListener('langchange', loadKeys); // las fechas dependen del idioma

$('keyCreate').onclick = async () => {
  try {
    const j = await api('key_create', { name: $('keyName').value, web_search: $('keyWeb').checked, model: $('keyModel').value });
    $('newKeyVal').textContent = j.key;
    $('newKey').hidden = false;
    $('tKey').value = j.key;
    $('keyName').value = '';
    if (j.model) $('tModel').innerHTML = `<option>${esc(j.model)}</option>`; // la prueba usa el modelo asignado
    else fillTestModels();
    renderExamples(j.key, j.model);
    loadKeys();
  } catch (e) { alert(t(e.message)); }
};
$('copyKey').onclick = async () => {
  try { await navigator.clipboard.writeText($('newKeyVal').textContent); $('copyKey').textContent = '✔ Copiada'; }
  catch (e) { $('copyKey').textContent = 'Selecciona y copia a mano'; }
  setTimeout(() => $('copyKey').textContent = 'Copiar', 2000);
};

// ---- Ejemplos de uso ----
function renderExamples(key, model) {
  const k = key || 'sk-local-...';
  const m = model || installed[0] || 'qwen3:8b';
  $('baseUrl').textContent = BASE;
  $('exCurl').textContent =
`curl ${BASE}/chat/completions \\
  -H "Authorization: Bearer ${k}" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${m}+web","messages":[{"role":"user","content":"¿Qué hay de nuevo hoy en tecnología?"}]}'`;
  $('exPy').textContent =
`from openai import OpenAI  # pip install openai

client = OpenAI(base_url="${BASE}", api_key="${k}")
r = client.chat.completions.create(
    model="${m}",
    messages=[{"role": "user", "content": "¿Qué hay de nuevo hoy en tecnología?"}],
    extra_body={"web_search": True},   # o usa el modelo "${m}+web"
)
print(r.choices[0].message.content)`;
}
renderExamples();

// ---- Buscador del servidor ----
function showProv() {
  document.querySelectorAll('#keyPanel [data-prov]').forEach(el => { el.hidden = el.dataset.prov !== $('sProvider').value; });
}
$('sProvider').onchange = showProv;

async function loadCfg() {
  try {
    const c = await api('key_search_get');
    $('sProvider').value = c.provider;
    $('sScrape').checked = c.scrape;
    $('sCx').value = c.google_cx;
    $('sSearx').value = c.searx_url || '';
    const ph = (el, has, name) => { el.value = ''; el.placeholder = has ? '(guardada: escribe para cambiarla)' : name; };
    ph($('sKey'), c.has.key, 'ollama.com/settings/keys');
    ph($('sTavily'), c.has.tavily_key, 'tvly-…');
    ph($('sGoogle'), c.has.google_key, 'API key');
    showProv();
  } catch (e) { $('sInfo').className = 'bad'; $('sInfo').textContent = t(e.message); }
}
const sMsg = (ok, msg) => { $('sInfo').className = ok ? 'ok' : 'bad'; $('sInfo').textContent = msg; };

async function saveCfg(extra = {}) {
  await api('key_search_save', {
    provider: $('sProvider').value, scrape: $('sScrape').checked, google_cx: $('sCx').value, searx_url: $('sSearx').value,
    key: $('sKey').value, tavily_key: $('sTavily').value, google_key: $('sGoogle').value, ...extra,
  });
}
$('sSave').onclick = async () => {
  try { await saveCfg(); await loadCfg(); sMsg(true, '✔ Guardado'); } catch (e) { sMsg(false, '✘ ' + t(e.message)); }
};
$('sClear').onclick = async () => {
  if (!confirm('¿Borrar las API keys de buscador guardadas en el servidor?')) return;
  try { await saveCfg({ clear_keys: true, key: '', tavily_key: '', google_key: '' }); await loadCfg(); sMsg(true, '✔ Claves borradas'); } catch (e) { sMsg(false, '✘ ' + t(e.message)); }
};
$('sTest').onclick = async () => {
  $('sTest').disabled = true; $('sInfo').className = 'muted'; $('sInfo').textContent = 'Probando…';
  const t0 = performance.now();
  try {
    await saveCfg(); // se prueba lo que hay en pantalla (queda guardado)
    await loadCfg();
    const j = await api('key_search_test', { query: 'Ollama' });
    if (!j.results.length) throw new Error('El buscador respondió, pero sin resultados');
    sMsg(true, `✔ Funciona (${j.provider}): ${j.results.length} resultado(s) en ${((performance.now() - t0) / 1000).toFixed(1)} s · ${j.results[0].title.slice(0, 40)}`);
  } catch (e) { sMsg(false, '✘ ' + t(e.message)); }
  $('sTest').disabled = false;
};

// ---- Pruebas de la API /v1 con una clave ----
const authHdr = () => ({ ...JSON_HDR, Authorization: 'Bearer ' + $('tKey').value.trim() });
async function v1(path, opt = {}) {
  const r = await fetch(BASE + path, { ...opt, headers: authHdr() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error?.message || 'HTTP ' + r.status);
  return { j, r };
}
$('tPing').onclick = async () => {
  if (!$('tKey').value.trim()) { $('tOut').textContent = 'Pega una API key arriba.'; return; }
  $('tOut').textContent = 'Comprobando…';
  try {
    const { j } = await v1('/models');
    $('tOut').textContent = `✔ Clave válida. Modelos disponibles (${j.data.length}): ${j.data.map(m => m.id).join(', ') || '—'}`;
    // lo que la clave puede usar es lo que debe ofrecer la prueba (con modelo asignado, solo ese)
    if (j.data.length) $('tModel').innerHTML = j.data.map(m => `<option>${esc(m.id)}</option>`).join('');
  } catch (e) { $('tOut').textContent = '✘ ' + t(e.message); }
};
$('tGo').onclick = async () => {
  if (!$('tKey').value.trim()) { $('tOut').textContent = 'Pega una API key arriba.'; return; }
  if (!$('tModel').value) { $('tOut').textContent = 'No hay modelos: ¿está Ollama encendido?'; return; }
  const model = $('tModel').value + ($('tWeb').checked ? '+web' : '');
  $('tGo').disabled = true; $('tOut').textContent = 'Consultando… (con búsqueda web tarda algo más)';
  const t0 = performance.now();
  try {
    const { j } = await v1('/chat/completions', { method: 'POST', body: JSON.stringify({ model, stream: false, messages: [{ role: 'user', content: $('tPrompt').value }] }) });
    const txt = (j.choices?.[0]?.message?.content || t('(respuesta vacía)')).replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    const src = (j.web_sources || []).map(s => '- ' + s.url).join('\n');
    $('tOut').textContent = txt + (src ? '\n\n' + t('Fuentes consultadas por el servidor:') + '\n' + src : '') + `\n\n(${((performance.now() - t0) / 1000).toFixed(1)} s)`;
  } catch (e) { $('tOut').textContent = '✘ ' + t(e.message); }
  $('tGo').disabled = false;
};

// La prueba empieza con todos los modelos instalados; al comprobar una clave se limita a los que esa clave puede usar
function fillTestModels() { $('tModel').innerHTML = installed.map(m => `<option>${esc(m)}</option>`).join(''); }
async function loadModels() {
  try {
    const j = await api('models');
    installed = (j.models || []).map(m => m.name);
  } catch (e) { installed = []; /* Ollama apagado: solo se pierde la lista de modelos */ }
  fillModelSelect($('keyModel'), $('keyModel').value);
  fillTestModels();
}

loadModels().then(loadKeys); loadCfg();
