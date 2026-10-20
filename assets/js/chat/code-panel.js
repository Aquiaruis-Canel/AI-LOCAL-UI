// Panel de código: los bloques largos de la IA se muestran como «archivo» en el chat y se abren en un panel lateral
// (script clásico: comparte ámbito global con el resto de assets/js/chat/; el orden de carga está en index.html)

const CODE_MIN_LINES = 12; // a partir de cuántas líneas un bloque de código pasa a ser un archivo aparte
let mdPlain = false;       // true mientras se exporta (PDF): el código se pinta en línea, sin tarjetas

// Alias de lenguaje → nombre que entiende highlight.js
const LANG_ALIAS = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', node: 'javascript', ts: 'typescript', py: 'python', python3: 'python',
  sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash', yml: 'yaml', 'c#': 'csharp', cs: 'csharp', 'c++': 'cpp', cc: 'cpp', hpp: 'cpp',
  htm: 'html', xhtml: 'html', md: 'markdown', ps: 'powershell', ps1: 'powershell', pwsh: 'powershell', rb: 'ruby', rs: 'rust',
  kt: 'kotlin', golang: 'go', bat: 'dos', cmd: 'dos', batch: 'dos', jsonc: 'json', text: 'plaintext', txt: 'plaintext', plain: 'plaintext',
  docker: 'dockerfile', h: 'c', vb: 'vbnet', 'objective-c': 'objectivec', objc: 'objectivec',
};
// Lenguaje → extensión del archivo
const LANG_EXT = {
  javascript: 'js', typescript: 'ts', jsx: 'jsx', tsx: 'tsx', python: 'py', html: 'html', xml: 'xml', svg: 'svg', css: 'css', scss: 'scss',
  less: 'less', php: 'php', java: 'java', c: 'c', cpp: 'cpp', csharp: 'cs', go: 'go', rust: 'rs', ruby: 'rb', bash: 'sh',
  powershell: 'ps1', dos: 'bat', sql: 'sql', json: 'json', yaml: 'yml', toml: 'toml', ini: 'ini', markdown: 'md', kotlin: 'kt',
  swift: 'swift', dart: 'dart', lua: 'lua', r: 'r', perl: 'pl', vue: 'vue', vbnet: 'vb', objectivec: 'm', scala: 'scala',
  haskell: 'hs', elixir: 'ex', erlang: 'erl', julia: 'jl', matlab: 'm', groovy: 'groovy', makefile: 'mk', plaintext: 'txt',
};
// Nombre por defecto cuando la IA no indica ninguno
const LANG_NAME = {
  html: 'index.html', css: 'styles.css', javascript: 'script.js', typescript: 'index.ts', python: 'main.py', php: 'index.php',
  java: 'Main.java', c: 'main.c', cpp: 'main.cpp', csharp: 'Program.cs', go: 'main.go', rust: 'main.rs', json: 'datos.json',
  sql: 'consulta.sql', bash: 'script.sh', powershell: 'script.ps1', dos: 'script.bat', dockerfile: 'Dockerfile', makefile: 'Makefile',
  yaml: 'config.yml', markdown: 'documento.md', kotlin: 'Main.kt', swift: 'main.swift', dart: 'main.dart', ruby: 'main.rb', vue: 'App.vue',
};
const EXT_LANG = Object.fromEntries(Object.entries(LANG_EXT).map(([l, e]) => [e, l]));
Object.assign(EXT_LANG, { htm: 'html', mjs: 'javascript', cjs: 'javascript', yaml: 'yaml', h: 'c', hpp: 'cpp', txt: 'plaintext', m: 'objectivec' });

const normLang = l => { l = (l || '').toLowerCase(); return LANG_ALIAS[l] || l; };
const isFileName = s => /^[\w.\-\/\\]+\.[A-Za-z0-9]{1,8}$/.test(s) || /^(Dockerfile|Makefile)$/i.test(s);

// Deduce lenguaje, nombre y extensión. Admite ```python main.py, ```js:app.js, ```app.js o un comentario en la 1.ª línea
function codeMeta(code, info) {
  const toks = (info || '').trim().split(/[\s:]+/).filter(Boolean);
  let lang = '', name = '';
  for (const tk of toks) {
    if (!name && isFileName(tk)) name = tk.split(/[\/\\]/).pop();
    else if (!lang) lang = tk;
  }
  if (!name) {
    const first = code.split('\n', 1)[0];
    const m = first.match(/^\s*(?:\/\/|#|--|;|<!--|\/\*|')\s*(?:(?:file(?:name)?|archivo|nombre)\s*:\s*)?([\w.\-\/\\]+\.[A-Za-z0-9]{1,8})\s*(?:-->|\*\/)?\s*$/i);
    if (m) name = m[1].split(/[\/\\]/).pop();
  }
  lang = normLang(lang);
  if (!lang && name) lang = /^dockerfile$/i.test(name) ? 'dockerfile' : /^makefile$/i.test(name) ? 'makefile' : (EXT_LANG[name.split('.').pop().toLowerCase()] || '');
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : (LANG_EXT[lang] || (lang && lang !== 'plaintext' && /^[a-z0-9]{1,6}$/.test(lang) ? lang : 'txt'));
  if (!name) name = LANG_NAME[lang] || 'codigo.' + ext;
  return { lang, name, ext, lines: code.replace(/\n$/, '').split('\n').length };
}

const isBigCode = code => !mdPlain && code.replace(/\n$/, '').split('\n').length >= CODE_MIN_LINES;

// Tarjeta del archivo dentro de la burbuja (la llama el renderer de Markdown).
// x = {name, lang, v (versión), changes, failed, pending} cuando es una versión nueva de un archivo del chat
function codeCard(code, info, x = {}) {
  const m = codeMeta(code, info), name = x.name || m.name, lang = x.lang ?? m.lang;
  const ext = name.includes('.') ? name.split('.').pop() : m.ext;
  const meta = `<span>${m.lines} líneas</span>` + (x.v > 1 ? `<span> · v${x.v}</span>` : '') +
    (x.changes ? `<span> · ${x.changes} ${x.changes === 1 ? 'cambio' : 'cambios'}</span>` : '') +
    (x.failed ? `<span class="cf-bad"> · ${x.failed} sin aplicar</span>` : '') + (x.pending ? '<span> · editando…</span>' : '');
  return `<div class="codefile" data-name="${esc(name)}" data-lang="${esc(lang)}" data-v="${x.v || 1}" title="${esc(name)}">` +
    `<span class="cf-icon">${esc(ext.slice(0, 4).toUpperCase())}</span>` +
    `<span class="cf-info"><b class="cf-name">${esc(name)}</b><span class="cf-meta">${meta}</span></span>` +
    `<button class="cf-open">Abrir</button><button class="cf-dl" title="Descargar" aria-label="Descargar">${ic('download')}</button>` +
    `<pre class="cf-raw">${esc(code)}</pre></div>`;
}

// ---- Vista previa de HTML/SVG ----
// La vista previa (srcdoc) hereda la dirección de la app: un enlace «#», «contacto.html» o un formulario la harían navegar
// a la propia app dentro del panel. Un guardián al inicio del documento intercepta enlaces y formularios:
// «#ancla» se desplaza dentro de la página, http(s) se abre en el navegador y lo demás muestra un aviso.
function previewGuard() {
  const msg = JSON.stringify({ link: t('Este enlace lleva a otra página del sitio: no existe en la vista previa'), form: t('Los formularios no se envían en la vista previa') });
  return `<script>(function(){var M=${msg.replace(/</g, '\\u003c')};
function toast(m){var d=document.createElement('div');d.textContent=m;d.style.cssText='position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483647;background:#1d212c;color:#e6e8ee;border:1px solid #2a2f3d;border-radius:8px;padding:8px 14px;font:13px/1.4 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.35);max-width:90vw';(document.body||document.documentElement).appendChild(d);setTimeout(function(){d.remove()},2600)}
document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a[href],area[href]');if(!a||e.defaultPrevented)return;var h=(a.getAttribute('href')||'').trim();
if(/^javascript:/i.test(h))return;e.preventDefault();
if(h===''||h.charAt(0)==='#'){var id=decodeURIComponent(h.slice(1));var el=id&&(document.getElementById(id)||document.getElementsByName(id)[0]);if(el)el.scrollIntoView({behavior:'smooth'});else if(!id||id==='top')window.scrollTo({top:0,behavior:'smooth'});return}
if(/^(https?:|mailto:|tel:)/i.test(h)){window.open(h,'_blank','noopener');return}
toast(M.link)},true);
document.addEventListener('submit',function(e){e.preventDefault();toast(M.form)},true);})();<\/script>`;
}
function setPreview(code) {
  cp.previewSrc = code;
  cp.previewExpect = true;
  const g = previewGuard(), m = code.match(/<head[^>]*>/i) || code.match(/<html[^>]*>/i);
  $('cpPreview').srcdoc = m ? code.replace(m[0], m[0] + g) : g + code;
}
// Si aun así la página navega (p. ej. con location.href en su JavaScript), se vuelve a cargar la vista previa
$('cpPreview').addEventListener('load', () => {
  if (cp.previewExpect) { cp.previewExpect = false; return; }
  const now = Date.now();
  cp.resets = (cp.resets || []).filter(x => now - x < 5000);
  if (cp.resets.length >= 3 || cp.previewSrc == null) return; // una página que navega sola en bucle: se deja quieta
  cp.resets.push(now);
  setPreview(cp.previewSrc);
});

// ---- Panel lateral ----
const cp = { idx: -1, chat: null, follow: false, dismissed: null, view: 'code', last: '' };
const cpCards = () => [...$('messages').querySelectorAll('.codefile')];
const cardData = el => ({ code: el.querySelector('.cf-raw').textContent, name: el.dataset.name, lang: el.dataset.lang });
const canPreview = d => ['html', 'svg', 'xml'].includes(d.lang) && (d.lang !== 'xml' || /<svg[\s>]/i.test(d.code)) || /\.(html?|svg)$/i.test(d.name);

function downloadCode(d) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([d.code], { type: 'text/plain;charset=utf-8' }));
  a.download = d.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function cpFillList(cards) {
  const sel = $('cpFiles');
  const opts = cards.map((el, i) => `<option value="${i}">${esc(el.dataset.name)}${+el.dataset.v > 1 ? ' (v' + el.dataset.v + ')' : ''}</option>`).join('');
  if (sel.dataset.sig !== opts) { sel.innerHTML = opts; sel.dataset.sig = opts; }
  sel.value = cp.idx;
  sel.disabled = cards.length < 2;
}

function cpShow(force) {
  const cards = cpCards(), el = cards[cp.idx];
  if (!el) return closeCodePanel();
  cards.forEach((c, i) => c.classList.toggle('active', i === cp.idx));
  const d = cardData(el);
  const sig = cp.idx + '|' + d.lang + '|' + d.code + '|' + cp.view;
  cpFillList(cards);
  if (!force && sig === cp.last) return;
  cp.last = sig;
  const m = { lines: d.code.replace(/\n$/, '').split('\n').length, ext: d.name.includes('.') ? d.name.split('.').pop() : d.name };
  $('cpIcon').textContent = m.ext.slice(0, 4).toUpperCase();
  $('cpMeta').textContent = m.lines + ' líneas' + (d.lang && d.lang !== 'plaintext' ? ' · ' + d.lang : '') + (+el.dataset.v > 1 ? ' · v' + el.dataset.v : '');
  const prev = canPreview(d);
  $('cpViews').hidden = !prev;
  if (!prev) cp.view = 'code';
  $('cpViews').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === cp.view));
  const body = $('cpBody'), atBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 40;
  if (cp.view === 'preview') {
    body.hidden = true; $('cpPreview').hidden = false;
    if (cp.previewSrc !== d.code) setPreview(d.code);
  } else {
    body.hidden = false; $('cpPreview').hidden = true;
    const src = d.code.replace(/\n$/, '');
    const h = window.hljs && d.lang && hljs.getLanguage(d.lang) ? hljs.highlight(src, { language: d.lang, ignoreIllegals: true }).value : esc(src);
    $('cpCode').innerHTML = h;
    $('cpGutter').textContent = Array.from({ length: m.lines }, (_, i) => i + 1).join('\n');
    if (cp.follow && controller && atBottom) body.scrollTop = body.scrollHeight; // sigue el código mientras se escribe
  }
}

function openCodePanel(idx, follow = false) {
  cp.idx = idx; cp.chat = current; cp.follow = follow; cp.last = '';
  document.body.classList.add('cp-open');
  $('codePanel').hidden = false;
  if (!follow) $('cpBody').scrollTop = 0;
  cpShow(true);
}
function closeCodePanel() {
  if ($('codePanel').hidden) return;
  if (controller) cp.dismissed = $('messages').lastChild; // no se vuelve a abrir solo en esta respuesta
  $('codePanel').hidden = true;
  document.body.classList.remove('cp-open');
  cpCards().forEach(c => c.classList.remove('active'));
  cp.idx = -1; cp.follow = false;
}

// Mientras la IA escribe: abre el panel con el archivo nuevo y lo va actualizando
function codePanelLive(bubble) {
  const own = [...bubble.querySelectorAll('.codefile')];
  if (!own.length || cp.dismissed === bubble.closest('.msg')) return;
  const idx = cpCards().indexOf(own[own.length - 1]);
  if ($('codePanel').hidden) { if (innerWidth > 900) openCodePanel(idx, true); return; }
  const shown = cpCards()[cp.idx];
  if (!cp.follow && shown && shown.dataset.name === own[own.length - 1].dataset.name && cp.idx !== idx) cp.follow = true; // nueva versión del archivo abierto
  if (cp.follow && cp.idx !== idx) { cp.idx = idx; cp.last = ''; $('cpBody').scrollTop = 0; }
  cpShow();
}
// Tras repintar la lista de mensajes: conserva el archivo abierto o cierra el panel si se cambió de chat
function codePanelRefresh() {
  if (!controller) cp.dismissed = null;
  if ($('codePanel').hidden) return;
  if (cp.chat !== current) return closeCodePanel();
  if (!controller) cp.follow = false;
  cpShow(true);
}

// Clics en las tarjetas del chat
$('messages').addEventListener('click', e => {
  const card = e.target.closest('.codefile');
  if (!card) return;
  if (e.target.closest('.cf-dl')) return downloadCode(cardData(card));
  const idx = cpCards().indexOf(card);
  if (idx === cp.idx && !$('codePanel').hidden && !e.target.closest('.cf-open')) return closeCodePanel();
  openCodePanel(idx);
});
$('cpFiles').onchange = e => { cp.follow = false; cp.idx = +e.target.value; cp.last = ''; $('cpBody').scrollTop = 0; cpShow(true); };
$('cpClose').onclick = closeCodePanel;
$('cpDl').onclick = () => { const el = cpCards()[cp.idx]; if (el) downloadCode(cardData(el)); };
$('cpCopy').onclick = e => {
  const el = cpCards()[cp.idx]; if (!el) return;
  navigator.clipboard?.writeText(cardData(el).code);
  const b = e.currentTarget; b.textContent = 'Copiado'; setTimeout(() => b.textContent = 'Copiar', 1500);
};
$('cpViews').onclick = e => { const v = e.target.closest('button')?.dataset.v; if (v) { cp.view = v; cpShow(true); } };
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('codePanel').hidden && !document.querySelector('dialog[open]')) closeCodePanel();
});

// Ancho del panel: se arrastra desde el borde izquierdo y se recuerda
(() => {
  const set = w => document.documentElement.style.setProperty('--cpw', Math.max(320, Math.min(w, innerWidth - 380)) + 'px');
  const saved = +localStorage.getItem('cpWidth');
  if (saved) set(saved);
  const grip = $('cpResize');
  grip.addEventListener('pointerdown', e => {
    e.preventDefault(); grip.setPointerCapture(e.pointerId);
    document.body.classList.add('cp-resizing');
    const move = ev => set(innerWidth - ev.clientX);
    const up = () => {
      grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up);
      document.body.classList.remove('cp-resizing');
      localStorage.setItem('cpWidth', parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cpw')) || '');
    };
    grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up);
  });
  grip.addEventListener('dblclick', () => { localStorage.removeItem('cpWidth'); document.documentElement.style.removeProperty('--cpw'); });
})();
