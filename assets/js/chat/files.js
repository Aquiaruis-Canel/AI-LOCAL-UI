// Archivos de código del chat: versiones y ediciones BUSCAR/REEMPLAZAR
// Cada bloque de código largo (o con nombre de archivo) de la IA es una versión de un archivo. Un bloque ```edit <archivo>
// solo trae cambios: se aplican a la versión anterior y el resultado completo se muestra en el panel como versión nueva.
// (script clásico: comparte ámbito global con el resto de assets/js/chat/; el orden de carga está en index.html)

let mdFiles = null; // Map nombre → {code, v, lang} mientras se pinta un mensaje (lo usa el renderer de Markdown)

const isEditInfo = info => /^edit\b/i.test((info || '').trim());
const editTarget = info => (info || '').trim().replace(/^edit\b[:\s]*/i, '').trim().split(/\s+/)[0] || '';

// Nombre del archivo existente al que se refiere `name` (exacto, sin mayúsculas, por nombre base, o el único que haya)
function resolveFile(files, name) {
  if (!files || !files.size) return null;
  if (name && files.has(name)) return name;
  const low = (name || '').toLowerCase(), base = low.split(/[\/\\]/).pop();
  for (const k of files.keys()) if (k.toLowerCase() === low || k.toLowerCase() === base) return k;
  return files.size === 1 ? [...files.keys()][0] : null;
}

// ¿Es este bloque una versión de un archivo? (largo, o con nombre de un archivo que ya existe)
function isFileBlock(code, info, files) {
  if (isBigCode(code)) return true;
  if (!files || !files.size) return false;
  const named = (info || '').trim().split(/[\s:]+/).some(isFileName);
  return named && files.has(codeMeta(code, info).name);
}

// Varios bloques edit seguidos del mismo archivo (algunos modelos ponen un cambio por bloque) cuentan como una sola versión
function mergeEdits(text) {
  const re = /```edit[ \t]+(\S+)[ \t]*\n([\s\S]*?)\n```[ \t]*\n\s*```edit[ \t]+\1[ \t]*\n/;
  for (let k = 0; k < 50 && re.test(text); k++) text = text.replace(re, (all, name, body) => '```edit ' + name + '\n' + body + '\n');
  return text;
}

// Cambios dentro de un bloque edit: solo los completos (mientras la IA escribe, el último puede estar a medias)
function parseEdits(text) {
  const out = [];
  const re = /^[ \t]*<{5,}[^\n]*\n([\s\S]*?)^[ \t]*={5,}[ \t]*\n([\s\S]*?)^[ \t]*>{5,}[^\n]*$/gm;
  let m, last = 0;
  while ((m = re.exec(text))) { out.push({ search: m[1].replace(/\n$/, ''), replace: m[2].replace(/\n$/, '') }); last = re.lastIndex; }
  return { edits: out, pending: /<{5,}/.test(text.slice(last)) };
}

// Aplica los cambios: primero coincidencia exacta; si no, línea a línea ignorando espacios al principio y al final
function applyEdits(base, edits) {
  let code = base, ok = 0, failed = 0;
  for (const { search, replace } of edits) {
    if (!search.trim()) { code = code.replace(/\n*$/, '\n') + replace + '\n'; ok++; continue; } // BUSCAR vacío = añadir al final
    const i = code.indexOf(search);
    if (i >= 0) { code = code.slice(0, i) + replace + code.slice(i + search.length); ok++; continue; }
    const lines = code.split('\n'), want = search.split('\n').map(l => l.trim());
    while (want.length && !want.at(-1)) want.pop();
    while (want.length && !want[0]) want.shift();
    let at = -1;
    for (let s = 0; s + want.length <= lines.length && at < 0; s++) {
      let k = 0;
      while (k < want.length && lines[s + k].trim() === want.at(k)) k++;
      if (k === want.length) at = s;
    }
    if (at < 0) { failed++; continue; }
    // conserva la sangría original si la IA la perdió
    const indent = lines[at].match(/^\s*/)[0], rep = replace.split('\n');
    const repIndent = (rep.find(l => l.trim()) || '').match(/^\s*/)[0];
    const fixed = !repIndent && indent ? rep.map(l => (l.trim() ? indent + l : l)) : rep;
    lines.splice(at, want.length, ...fixed);
    code = lines.join('\n'); ok++;
  }
  return { code, ok, failed };
}

// Bloques de código de un texto Markdown, en orden (con caché: el historial no cambia mientras se escribe la respuesta)
const lexCache = new Map();
function codeTokens(text) {
  if (lexCache.has(text)) return lexCache.get(text);
  const out = [];
  const walk = ts => (ts || []).forEach(tk => {
    if (tk.type === 'code') out.push({ raw: tk.raw, text: tk.text, info: tk.lang || '' });
    if (tk.tokens) walk(tk.tokens);
    if (tk.items) walk(tk.items);
  });
  try { walk(window.marked ? marked.lexer(text) : []); } catch (_) {}
  if (lexCache.size > 300) lexCache.clear();
  lexCache.set(text, out);
  return out;
}

// Recorre los mensajes de la IA (hasta `upto`, sin incluirlo) y reconstruye los archivos.
// Devuelve el estado final y, por mensaje, qué bloques eran archivos (para quitarlos del historial que se manda al modelo).
function chatFiles(c, upto = c.messages.length) {
  const files = new Map(), blocks = new Map(), order = [];
  c.messages.slice(0, upto).forEach((m, i) => {
    if (m.role !== 'assistant' || !m.content) return;
    for (const b of codeTokens(mergeEdits(stripMem(m.content)))) {
      let name = null;
      if (isEditInfo(b.info)) {
        name = resolveFile(files, editTarget(b.info));
        if (!name) continue;
        const f = files.get(name), r = applyEdits(f.code, parseEdits(b.text).edits);
        files.set(name, { code: r.code, v: f.v + 1, lang: f.lang });
      } else if (isFileBlock(b.text, b.info, files)) {
        const meta = codeMeta(b.text, b.info), prev = files.get(meta.name);
        name = meta.name;
        files.set(name, { code: b.text, v: prev ? prev.v + 1 : 1, lang: meta.lang });
      } else continue;
      if (!blocks.has(i)) blocks.set(i, []);
      blocks.get(i).push({ raw: b.raw, name, v: files.get(name).v });
      const oi = order.indexOf(name); if (oi >= 0) order.splice(oi, 1); order.push(name);
    }
  });
  return { files, blocks, order };
}

// ---- Lo que ve el modelo ----
// En el historial, el código de los archivos se sustituye por una referencia; la versión actual va en el prompt de sistema
// (así no se repiten versiones viejas ni se gasta contexto). Si no cabe todo, entran los archivos tocados más recientemente.
function filesForModel(c, upto) {
  const st = chatFiles(c, upto);
  if (!st.files.size) return { sys: '', strip: (i, content) => content };
  const budget = Math.max(4000, +$('ctx').value * 3 * 0.45);
  let used = 0;
  const parts = [], names = [];
  for (const name of [...st.order].reverse()) {
    const f = st.files.get(name), lines = f.code.split('\n').length;
    if (used + f.code.length > budget && parts.length) { names.push(`${name} (v${f.v}, ${lines} líneas: no cabe en el contexto)`); continue; }
    used += f.code.length;
    parts.unshift(`### ${name} (versión ${f.v}, ${lines} líneas)\n\`\`\`${f.lang || ''}\n${f.code}\n\`\`\``);
  }
  const sys = `[Archivos de código de este chat — versión actual]\n${parts.join('\n\n')}` + (names.length ? `\nOtros archivos: ${names.join(', ')}.` : '') +
    `\n\n[Cómo modificar estos archivos]\nPara cambiar un archivo existente NO lo vuelvas a escribir entero: responde con un bloque \`\`\`edit seguido del nombre del archivo, con uno o más cambios en este formato:\n` +
    '```edit index.html\n<<<<<<< BUSCAR\n<h1>Título viejo</h1>\n=======\n<h1>Título nuevo</h1>\n>>>>>>> REEMPLAZAR\n```\n' +
    'En BUSCAR copia exactamente las líneas que hay ahora en el archivo (con una o dos líneas de alrededor para que no haya dudas); en REEMPLAZAR, cómo deben quedar. ' +
    'Puedes poner varios cambios seguidos en el mismo bloque. Escribe un archivo completo solo si es nuevo o si cambia casi todo. Después del bloque, explica los cambios en una o dos frases.';
  return {
    sys,
    strip: (i, content) => {
      const bs = st.blocks.get(i);
      if (!bs) return content;
      let out = mergeEdits(content);
      for (const b of bs) out = out.replace(b.raw, `\n[Archivo «${b.name}» versión ${b.v}: su contenido actual está en las instrucciones del sistema]\n`);
      return out;
    },
  };
}

// ---- Lista de archivos del chat (botón de la cabecera) ----
function updateFileList() {
  const c = getChat(), st = c ? chatFiles(c) : { files: new Map(), order: [] };
  $('filesBtn').hidden = !st.files.size;
  $('filesCount').textContent = st.files.size;
  if (!st.files.size) $('filesPop').hidden = true;
  if (!$('filesPop').hidden) renderFilePop(st);
}

function renderFilePop(st) {
  const rows = [...st.order].reverse().map(name => {
    const f = st.files.get(name), lines = f.code.replace(/\n$/, '').split('\n').length;
    const ext = name.includes('.') ? name.split('.').pop() : (f.lang || 'txt');
    return `<div class="fl-row" data-name="${esc(name)}"><span class="cf-icon">${esc(ext.slice(0, 4).toUpperCase())}</span>` +
      `<span class="fl-info"><b>${esc(name)}</b><span class="fl-meta"><span>${lines} líneas</span>${f.v > 1 ? `<span> · v${f.v}</span>` : ''}</span></span>` +
      `<button class="hbtn fl-open" title="Abrir en el panel" aria-label="Abrir en el panel">${ic('file-code')}</button>` +
      `<button class="hbtn fl-dl" title="Descargar" aria-label="Descargar">${ic('download')}</button></div>`;
  }).join('');
  $('filesPop').innerHTML = `<div class="fl-head">${ic('files')}<span>Archivos de este chat</span></div>${rows}` +
    `<button class="hbtn fl-zip"${window.JSZip ? '' : ' hidden'}>${ic('archive')}<span>Descargar todo (.zip)</span></button>`;
}

$('filesBtn').onclick = e => {
  e.stopPropagation();
  const pop = $('filesPop');
  pop.hidden = !pop.hidden;
  if (!pop.hidden) renderFilePop(chatFiles(getChat()));
};
$('filesPop').addEventListener('click', async e => {
  e.stopPropagation();
  const c = getChat(), st = chatFiles(c), row = e.target.closest('.fl-row');
  if (e.target.closest('.fl-zip')) {
    const zip = new JSZip();
    st.files.forEach((f, name) => zip.file(name, f.code));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(await zip.generateAsync({ type: 'blob' }));
    a.download = ((c.title || 'archivos').replace(/[^\p{L}\p{N}\- ]+/gu, '').trim() || 'archivos') + '.zip';
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return;
  }
  if (!row) return;
  const name = row.dataset.name, f = st.files.get(name);
  if (e.target.closest('.fl-dl')) return downloadCode({ code: f.code, name });
  // abrir: la última tarjeta de ese archivo en el chat (su versión más reciente)
  const cards = cpCards(), idx = cards.map(x => x.dataset.name).lastIndexOf(name);
  if (idx >= 0) { $('filesPop').hidden = true; openCodePanel(idx); cards[idx].scrollIntoView({ block: 'center', behavior: 'smooth' }); }
});
document.addEventListener('click', () => { $('filesPop').hidden = true; });
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('filesPop').hidden = true; });
