// Modelos en memoria: indicador en la cabecera y «un solo modelo cargado» (al cambiar de IA, la anterior sale de la RAM/VRAM)
// (script clásico: comparte ámbito global con el resto de assets/js/chat/; el orden de carga está en index.html)

const ollamaName = m => { m = String(m || '').trim().toLowerCase(); return !m || m.includes(':') ? m : m + ':latest'; };
const embedModelName = () => $('embedModel').value.trim() || 'nomic-embed-text';
const gb = n => (n / 1073741824).toLocaleString(LANG === 'es' ? 'es' : LANG, { maximumFractionDigits: 1 }) + ' GB';

$('oneModel').checked = localStorage.getItem('oneModel') !== '0';
$('oneModel').onchange = () => { localStorage.setItem('oneModel', $('oneModel').checked ? '1' : '0'); if ($('oneModel').checked) unloadOthers([$('model').value]); };

function showLoaded(list) {
  const el = $('loaded');
  const ms = (list || []).filter(m => m.name);
  el.hidden = false;
  $('unloadAll').hidden = !ms.length;
  if (!ms.length) { el.innerHTML = ic('memory-stick') + '<span>Memoria libre</span>'; el.title = 'No hay ningún modelo cargado en memoria'; return; }
  const total = ms.reduce((s, m) => s + (m.size || 0), 0), vram = ms.reduce((s, m) => s + (m.vram || 0), 0);
  el.innerHTML = ic('memory-stick') + `<span>${esc(ms.map(m => m.name.replace(/:latest$/, '')).join(' + '))} · ${gb(total)}</span>`;
  el.title = ms.map(m => `${m.name}: ${gb(m.size)}` + (m.vram ? ` (${gb(m.vram)} en GPU)` : ' (CPU)')).join('\n')
    + (vram && vram < total ? `\n${gb(total - vram)} en RAM` : '');
}

async function refreshLoaded() {
  try { showLoaded((await dbApi('ps')).loaded); } catch (_) { $('loaded').hidden = true; $('unloadAll').hidden = true; }
}

// Descarga de la memoria todos los modelos salvo los de `keep` (y el de embeddings del RAG, que es pequeño).
// No hace nada si la opción «Mantener solo un modelo en memoria» está desactivada, salvo con force (botón ⏏).
async function unloadOthers(keep, force = false) {
  if (!force && !$('oneModel').checked) return;
  const k = force ? keep : [...keep, embedModelName()];
  try {
    const j = await dbApi('unload', { method: 'POST', headers: JSON_HDR, body: JSON.stringify({ keep: k.filter(Boolean).map(ollamaName) }) });
    showLoaded(j.loaded);
  } catch (_) { /* Ollama apagado: nada que liberar */ }
}

// Cambiar de modelo en el selector libera el anterior al instante
$('model').addEventListener('change', () => { if (!controller) unloadOthers([$('model').value]); });
$('unloadAll').onclick = async () => {
  if (controller) return;
  $('unloadAll').disabled = true;
  await unloadOthers([], true);
  $('unloadAll').disabled = false;
};
// Ollama descarga solo los modelos inactivos tras unos minutos: el indicador se pone al día de vez en cuando
setInterval(() => { if (!controller && !document.hidden) refreshLoaded(); }, 30000);
refreshLoaded();
