// Pintar mensajes: Markdown, burbujas, edición y contador de contexto
// (script clásico: comparte ámbito global con el resto de assets/js/chat/; el orden de carga está en index.html)

// ---- Mensajes ----
function mdUser(text) {
  let parts = text.split(/```/);
  return parts.map((p, i) => {
    if (i % 2 === 1) return '<pre><code>' + esc(p.replace(/^[\w+-]*\n/, '')) + '</code></pre>';
    return esc(p).replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
  }).join('');
}

if (window.marked) marked.use({ renderer: {
  code(code, lang) {
    if (!mdPlain && mdFiles && isEditInfo(lang)) { // cambios a un archivo del chat: se aplican y se muestra la versión nueva
      const name = resolveFile(mdFiles, editTarget(lang));
      if (name) {
        const f = mdFiles.get(name), p = parseEdits(code), r = applyEdits(f.code, p.edits);
        mdFiles.set(name, { code: r.code, v: f.v + 1, lang: f.lang });
        return codeCard(r.code, f.lang, { name, lang: f.lang, v: f.v + 1, changes: r.ok, failed: r.failed, pending: p.pending });
      }
    }
    if (!mdPlain && isFileBlock(code, lang, mdFiles)) { // bloques largos: archivo aparte (panel lateral), con su número de versión
      const m = codeMeta(code, lang), prev = mdFiles?.get(m.name), v = prev ? prev.v + 1 : 1;
      mdFiles?.set(m.name, { code, v, lang: m.lang });
      return codeCard(code, lang, { v });
    }
    const l = normLang((lang || '').split(/[\s:]/)[0]);
    const h = window.hljs && l && hljs.getLanguage(l) ? hljs.highlight(code, { language: l }).value : esc(code);
    return `<div class="codewrap"><button class="cpy">Copiar</button><pre><code class="hljs">${h}</code></pre></div>`;
  },
  link(href, title, text) { return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`; },
} });
// plain = true: el código va siempre en línea (exportar a PDF)
function md(text, plain = false) {
  if (!window.marked || !window.DOMPurify) return mdUser(text); // sin internet: formato básico
  mdPlain = plain;
  try { return DOMPurify.sanitize(marked.parse(text, { breaks: true, gfm: true }), { ADD_ATTR: ['target'] }); }
  finally { mdPlain = false; }
}

function bubbleHTML(m) {
  let h = '';
  if (m.files?.length) h += '<div class="files">' + m.files.map(f => f.image ? `<img class="thumb" alt="${esc(f.name)}" src="data:image/jpeg;base64,${f.image}">` : `<span class="chip">${ic('paperclip')}${esc(f.name)}</span>`).join('') + '</div>';
  if (m.thinking) h += `<details class="think"${!m.content && controller ? ' open' : ''}><summary>Razonamiento</summary>${esc(m.thinking)}</details>`;
  if (m.genImage) {
    const src = 'data:image/jpeg;base64,' + m.genImage;
    h += `<img class="genimg" src="${src}" alt="Imagen generada"><div class="stats"><a download="imagen.jpg" href="${src}">${ic('download')}<span>Descargar</span></a> · Prompt: ${esc(m.genPrompt || '')}</div>`;
  }
  if (m.role === 'user') h += mdUser(m.content || '');
  else { // los archivos del chat antes de este mensaje: sus bloques edit se aplican sobre ellos
    const c = getChat(), i = c ? c.messages.indexOf(m) : -1;
    mdFiles = c ? chatFiles(c, i < 0 ? c.messages.length : i).files : new Map();
    try { h += md(mergeEdits(stripMem(m.content || ''))); } finally { mdFiles = null; }
  }
  if (m.tools?.length) h = toolLogHTML(m) + h;
  if (m.stats) h += `<div class="stats">${m.model ? esc(m.model) + ' · ' : ''}Prompt: ${m.stats.prompt} · Generados: ${m.stats.gen} · Total: ${m.stats.prompt + m.stats.gen} tokens · ${m.stats.tps} tok/s</div>`;
  if (m.mem?.length) h += `<div class="stats">${ic('brain')}<span>Guardado en memoria: ${esc(m.mem.join(' · '))}</span></div>`;
  return h;
}

// Repinta la burbuja sin recrear el <details> del razonamiento: así se puede abrir y leer mientras llega
function paint(bubble, m) {
  const old = bubble.querySelector('details.think');
  const tmp = document.createElement('div');
  tmp.innerHTML = bubbleHTML(m);
  const nw = tmp.querySelector('details.think');
  if (old && nw) {
    if (old.childNodes[1]) old.childNodes[1].textContent = m.thinking;
    nw.replaceWith(old);
  }
  bubble.replaceChildren(...tmp.childNodes);
  codePanelLive(bubble);
}

function renderMessages() {
  const box = $('messages'); box.innerHTML = '';
  const c = getChat();
  if (!c.messages.length) box.innerHTML = '<div class="empty"><h2>Local AI UI</h2><p>Habla con tu modelo de Ollama.</p></div>';
  else c.messages.forEach((m, i) => box.appendChild(msgEl(m, i)));
  box.scrollTop = box.scrollHeight;
  codePanelRefresh();
}

function startEdit(idx, el) {
  if (controller) return;
  const c = getChat(), m = c.messages[idx];
  const bubble = el.querySelector('.bubble');
  bubble.innerHTML = '';
  const ta = document.createElement('textarea');
  ta.value = m.content; ta.style.width = '100%';
  ta.rows = Math.min(10, m.content.split('\n').length + 1);
  const row = document.createElement('div'); row.className = 'editbtns';
  const ok = document.createElement('button'); ok.className = 'go'; ok.textContent = 'Guardar y reenviar';
  const no = document.createElement('button'); no.textContent = 'Cancelar';
  ok.onclick = () => {
    const t = ta.value.trim(), files = m.files || [];
    if (!t && !files.length) return;
    if (!confirmImages(files)) return;
    c.messages = c.messages.slice(0, idx); // se descartan este mensaje y todo lo posterior
    send({ text: t, files, gen: m.gen });
  };
  no.onclick = () => renderMessages();
  row.append(ok, no);
  bubble.append(ta, row);
  ta.focus();
}

function msgEl(m, idx) {
  const d = document.createElement('div');
  d.className = 'msg ' + m.role;
  d.innerHTML = `<div class="role">${m.role === 'user' ? 'Tú' : 'IA'}</div><div class="bubble"></div>`;
  d.querySelector('.bubble').innerHTML = bubbleHTML(m);
  const act = (icon, label, fn) => {
    const b = document.createElement('span');
    b.className = 'edit'; b.innerHTML = ic(icon) + `<span>${label}</span>`; b.onclick = () => fn(b);
    d.querySelector('.role').appendChild(b);
  };
  if (m.role === 'user') act('pencil', 'Editar', () => startEdit(idx, d));
  if (m.content) act('copy', 'Copiar', b => { navigator.clipboard?.writeText(m.content); b.innerHTML = ic('check') + '<span>Copiado</span>'; });
  if (m.role === 'assistant' && idx === getChat().messages.length - 1) act('rotate-ccw', 'Regenerar', () => regenerate(idx));
  return d;
}

function updateCtx() {
  const last = [...getChat().messages].reverse().find(m => m.stats);
  const max = +$('ctx').value;
  if (!last) { $('ctxinfo').textContent = `Contexto: 0 / ${max}`; $('ctxinfo').className = ''; $('ctxwarn').hidden = true; return; }
  const used = last.stats.prompt + last.stats.gen;
  const pct = Math.round(used / max * 100);
  $('ctxinfo').textContent = `Contexto: ${used} / ${max} (${pct}%)`;
  $('ctxinfo').className = pct > 85 ? 'bad' : '';
  $('ctxwarn').hidden = pct <= 85;
}
$('ctx').addEventListener('input', updateCtx);

function render() { renderSidebar(); renderMessages(); updateCtx(); updateFolderBar(); updateFileList(); }
