// Apariencia y buscador web (proveedor, claves, raspado y prueba)
// (script clásico: comparte ámbito global con el resto de assets/js/chat/; el orden de carga está en index.html)

// ---- Apariencia y ajustes guardados ----
function applyLook() {
  const light = $('theme').value === 'light';
  document.documentElement.dataset.theme = $('theme').value;
  document.documentElement.style.fontSize = (+$('fontSize').value || 15) + 'px';
  $('hljsCss').href = `assets/vendor/hljs/${light ? 'github' : 'github-dark'}.min.css`;
}
['theme', 'fontSize', 'embedModel'].forEach(id => {
  const v = localStorage.getItem(id);
  if (v !== null) $(id).value = v;
  $(id).addEventListener('change', () => { localStorage.setItem(id, $(id).value); applyLook(); });
});
$('fontSize').addEventListener('input', applyLook);
$('ragOn').checked = localStorage.getItem('ragOn') === '1';
$('ragOn').onchange = () => localStorage.setItem('ragOn', $('ragOn').checked ? '1' : '0');
// Búsqueda web: automática (la IA decide), siempre o nunca
$('webMode').value = localStorage.getItem('webMode') || 'auto';
$('webMode').onchange = () => localStorage.setItem('webMode', $('webMode').value);
applyLook();
// ---- Buscador web (DuckDuckGo / SearXNG sin API key; Ollama / Tavily / Google con API key), raspado y prueba ----
// Las claves se guardan solo en este navegador y viajan con cada búsqueda. Si un campo está vacío,
// el servidor usa lo guardado en la consola de API keys (o las variables de entorno).
const SEARCH_FIELDS = ['searchProvider', 'searxUrl', 'ollamaKey', 'tavilyKey', 'googleKey', 'googleCx'];
// Una sola vez: el buscador por defecto pasa a ser DuckDuckGo (no necesita API key) y se activa la lectura de páginas
if (!localStorage.getItem('searchV2')) { localStorage.setItem('searchProvider', 'duckduckgo'); localStorage.setItem('scrapeOn', '1'); localStorage.setItem('searchV2', '1'); }
SEARCH_FIELDS.forEach(id => {
  const v = localStorage.getItem(id);
  if (v !== null) $(id).value = v;
  $(id).addEventListener('change', () => { localStorage.setItem(id, $(id).value.trim()); showSearchFields(); });
});
$('scrapeOn').checked = localStorage.getItem('scrapeOn') !== '0';
$('scrapeOn').onchange = () => localStorage.setItem('scrapeOn', $('scrapeOn').checked ? '1' : '0');
$('rewriteOn').checked = localStorage.getItem('rewriteOn') !== '0';
$('rewriteOn').onchange = () => localStorage.setItem('rewriteOn', $('rewriteOn').checked ? '1' : '0');
function showSearchFields() {
  document.querySelectorAll('#settingsDlg [data-prov]').forEach(el => { el.hidden = el.dataset.prov !== $('searchProvider').value; });
}
showSearchFields();
const searchCfg = () => ({
  provider: $('searchProvider').value, searx_url: $('searxUrl').value.trim(), key: $('ollamaKey').value.trim(), tavily_key: $('tavilyKey').value.trim(),
  google_key: $('googleKey').value.trim(), google_cx: $('googleCx').value.trim(), scrape: $('scrapeOn').checked,
});
$('testSearch').onclick = async () => {
  const info = $('searchTestInfo'), btn = $('testSearch');
  SEARCH_FIELDS.forEach(id => localStorage.setItem(id, $(id).value.trim()));
  btn.disabled = true; info.className = 'muted'; info.textContent = 'Probando…';
  const t0 = performance.now();
  try {
    const j = await dbApi('websearch', { method: 'POST', headers: JSON_HDR, body: JSON.stringify({ query: 'Ollama', ...searchCfg() }) });
    const n = (j.results || []).length;
    if (!n) throw new Error('El buscador respondió, pero sin resultados');
    info.className = 'ok';
    info.textContent = `✔ Funciona (${j.provider}): ${n} resultado(s) en ${((performance.now() - t0) / 1000).toFixed(1)} s · ${j.results[0].title.slice(0, 40)}`;
  } catch (e) { info.className = 'bad'; info.textContent = '✘ ' + t(e.message); }
  btn.disabled = false;
};
$('sysPrompt').onchange = () => { const c = getChat(); if (c) { c.system = $('sysPrompt').value.trim(); save(); } };
