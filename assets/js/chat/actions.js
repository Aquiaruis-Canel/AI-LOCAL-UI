// Copiar código, exportar a .md/PDF, regenerar, resumir, buscar/renombrar chats y atajos
// (script clásico: comparte ámbito global con el resto de assets/js/chat/; el orden de carga está en index.html)

// ---- Copiar código, exportar, resumir ----
$('messages').addEventListener('click', e => {
  if (!e.target.classList.contains('cpy')) return;
  navigator.clipboard?.writeText(e.target.nextElementSibling.innerText);
  e.target.textContent = 'Copiado'; setTimeout(() => e.target.textContent = 'Copiar', 1500);
});
$('exportMd').onclick = exportMd;
$('exportPdf').onclick = exportPdf;
$('summarize').onclick = summarize;

function exportMd() {
  const c = getChat(); if (!c?.messages?.length) return;
  const t = (c.system ? `> **Sistema:** ${c.system}\n\n` : '') + c.messages.map(m =>
    `## ${m.role === 'user' ? 'Tú' : 'IA'}\n\n${m.content || ''}` + (m.genPrompt ? `\n\n*(imagen generada: ${m.genPrompt})*` : '')).join('\n\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([t], { type: 'text/markdown' }));
  a.download = (c.title || 'chat').replace(/[^\w\- ]+/g, '') + '.md';
  a.click();
}

function exportPdf() {
  const c = getChat(); if (!c?.messages?.length) return;
  const w = window.open('', '_blank');
  if (!w) { alert('El navegador bloqueó la ventana emergente.'); return; }
  const body = c.messages.map(m => `<h3>${m.role === 'user' ? 'Tú' : 'IA'}</h3>` +
    (m.role === 'user' ? `<p style="white-space:pre-wrap">${esc(m.content || '')}</p>` : md(stripMem(m.content || ''), true)) +
    (m.genImage ? `<img style="max-width:100%" src="data:image/jpeg;base64,${m.genImage}">` : '')).join('');
  w.document.write(`<!DOCTYPE html><meta charset="utf-8"><title>${esc(c.title)}</title><style>body{font:14px/1.6 system-ui,sans-serif;max-width:800px;margin:20px auto;padding:0 16px}pre{background:#f3f4f7;padding:10px;white-space:pre-wrap}.cpy{display:none}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}</style><h2>${esc(c.title)}</h2>${body}`);
  w.document.close();
  setTimeout(() => w.print(), 400);
}

function regenerate(idx) {
  if (controller) return;
  const c = getChat(), u = c.messages[idx - 1];
  if (!u || u.role !== 'user') return;
  c.messages = c.messages.slice(0, idx - 1);
  send({ text: u.content, files: u.files || [], gen: u.gen });
}

async function summarize() {
  const c = getChat();
  if (controller || !c?.messages?.length) return;
  if (!confirm('Se reemplazará este chat por un resumen para liberar contexto (los archivos adjuntos no entran en el resumen). ¿Continuar?')) return;
  const model = $('model').value, btn = $('summarize');
  btn.disabled = true; btn.textContent = 'Resumiendo…';
  try {
    const conv = c.messages.filter(m => !m.genImage).map(m => `${m.role === 'user' ? 'Usuario' : 'IA'}: ${m.content}`).join('\n\n');
    const j = await dbApi('complete', { method: 'POST', headers: JSON_HDR, body: JSON.stringify({
      model, num_ctx: +$('ctx').value,
      think: canThink(model) ? false : undefined,
      messages: [
        { role: 'system', content: 'Resume la siguiente conversación en español, conservando datos, decisiones, código y el contexto necesario para continuarla. Responde solo con el resumen.' },
        { role: 'user', content: conv },
      ] }) });
    const s = (j.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    if (!s) throw new Error('El modelo devolvió un resumen vacío');
    c.messages = [{ role: 'user', content: 'Resumen de la conversación anterior:\n\n' + s, files: [] }];
    save(); render();
  } catch (e) { alert('No se pudo resumir: ' + e.message); }
  btn.disabled = false; btn.textContent = 'Resumir y continuar';
}

// ---- Búsqueda, renombrar y atajos ----
let searchTimer;
$('search').addEventListener('input', e => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  if (!q) { searchIds = null; renderSidebar(); return; }
  searchTimer = setTimeout(async () => {
    try { searchIds = new Set((await dbApi('db_search', {}, '&q=' + encodeURIComponent(q))).ids); }
    catch (_) { const l = q.toLowerCase(); searchIds = new Set(chats.filter(c => c.title.toLowerCase().includes(l)).map(c => c.id)); }
    renderSidebar();
  }, 250);
});

async function renameChat(id) {
  const c = chats.find(x => x.id === id);
  if (!c || controller) return;
  const t = prompt('Nuevo título del chat:', c.title);
  if (t === null || !t.trim()) return;
  if (!c.messages) { try { await loadMessages(c); } catch (e) { alert(e.message); return; } }
  c.title = t.trim().slice(0, 255);
  persist(c); renderSidebar();
}

document.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (e.ctrlKey && k === ',') { e.preventDefault(); $('settingsBtn').click(); }
  else if (e.ctrlKey && k === 'b') { e.preventDefault(); $('sideToggle').click(); }
  else if (e.ctrlKey && k === 'k') { e.preventDefault(); setSidebar(false); $('search').focus(); }
  else if (e.altKey && k === 'n') { e.preventDefault(); $('newChat').click(); }
});
