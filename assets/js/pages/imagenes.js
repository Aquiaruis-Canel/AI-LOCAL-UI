// Consola de imágenes (imagenes.html). Utilidades comunes en assets/js/common.js.
let ctl = null;

// El registro guarda cada línea sin traducir y se vuelve a pintar al cambiar de idioma
const logLines = [];
function renderLog() {
  const l = $('log');
  l.textContent = logLines.map(x => `[${x.time}] ${t(x.msg)}`).join('\n') + (logLines.length ? '\n' : '');
  l.scrollTop = l.scrollHeight;
}
const log = msg => { logLines.push({ time: new Date().toLocaleTimeString(), msg }); renderLog(); };
document.addEventListener('langchange', renderLog);

async function post(action, body, signal) {
  const r = await fetch(API + '?action=' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || 'HTTP ' + r.status);
  return j;
}

// ---- Ajustes recordados ----
const FIELDS = ['prompt', 'negative', 'model', 'steps', 'guidance', 'width', 'height', 'count', 'seed', 'openvino', 'tiny', 'improve'];
const SIZES = [256, 384, 512, 640, 768, 1024];
['width', 'height'].forEach(id => { $(id).innerHTML = SIZES.map(s => `<option${s === 512 ? ' selected' : ''}>${s}</option>`).join(''); });
FIELDS.forEach(id => {
  const el = $(id), v = localStorage.getItem('img_' + id);
  if (v !== null) { if (el.type === 'checkbox') el.checked = v === '1'; else el.value = v; }
  el.addEventListener('change', () => localStorage.setItem('img_' + id, el.type === 'checkbox' ? (el.checked ? '1' : '0') : el.value));
});

const PRESETS = {
  'rupeshs/sd-turbo-openvino': { steps: 2, size: 512 },
  'rupeshs/sdxs-512-0.9-openvino': { steps: 1, size: 512 },
  'rupeshs/hyper-sd-sdxl-1-step-openvino-int8': { steps: 1, size: 1024 },
  'rupeshs/SDXL-Lightning-2steps-openvino-int8': { steps: 2, size: 1024 },
};
$('model').value = localStorage.getItem('imgModel') || $('model').value;
$('model').addEventListener('change', () => {
  const id = $('model').value.trim();
  localStorage.setItem('imgModel', id);
  const p = PRESETS[id];
  if (p) { $('steps').value = p.steps; $('width').value = p.size; $('height').value = p.size; }
  $('openvino').checked = !id.startsWith('lora:');
});

// ---- Estado de FastSD CPU y modelos de texto ----
async function checkStatus() {
  try {
    const j = await (await fetch(API + '?action=imagestatus')).json();
    if (j.error) throw new Error(j.error);
    $('status').textContent = '● FastSD CPU conectado'; $('status').className = 'ok';
  } catch (e) {
    $('status').textContent = '● FastSD CPU no responde (inicia start-webserver.bat)'; $('status').className = 'bad';
  }
}
async function loadTextModels() {
  try {
    const j = await (await fetch(API + '?action=models')).json();
    $('textModel').innerHTML = (j.models || []).map(m => `<option>${m.name}</option>`).join('');
    const last = localStorage.getItem('model');
    if (last) $('textModel').value = last;
  } catch (e) { /* Ollama apagado: solo afecta a «mejorar prompt» */ }
}

// ---- Galería ----
const dataUrl = b64 => `data:image/${b64.startsWith('/9j') ? 'jpeg' : 'png'};base64,${b64}`;

function addImage(src, prompt, info, id, append) {
  const fig = document.createElement('figure');
  const img = document.createElement('img'); img.src = src; img.alt = prompt; img.loading = 'lazy';
  const cap = document.createElement('figcaption');
  const p = document.createElement('div'); p.textContent = prompt;
  const meta = document.createElement('div'); meta.textContent = info;
  const dl = document.createElement('a'); dl.innerHTML = ic('download') + '<span>Descargar</span>'; dl.href = src;
  dl.download = `imagen-${id || Date.now()}.png`;
  const reuse = document.createElement('button'); reuse.className = 'hbtn'; reuse.textContent = 'Reusar prompt';
  reuse.onclick = () => { $('prompt').value = prompt; $('prompt').focus(); };
  const del = document.createElement('button'); del.className = 'hbtn'; del.innerHTML = ic('trash-2'); del.title = 'Eliminar de la biblioteca';
  del.onclick = async () => {
    if (id && !confirm('¿Eliminar esta imagen de la biblioteca?')) return;
    if (id) await post('gal_delete', { id }).catch(e => log('⚠ ' + e.message));
    fig.remove();
  };
  const row = document.createElement('div'); row.className = 'figrow';
  row.append(dl, reuse, del);
  cap.append(p, meta, row);
  fig.append(img, cap);
  append ? $('gallery').append(fig) : $('gallery').prepend(fig);
}

async function loadLibrary() {
  try {
    const j = await (await fetch(API + '?action=gal_list')).json();
    if (j.error) throw new Error(j.error);
    (j.items || []).forEach(i => addImage(i.url, i.prompt, i.info, i.id, true));
    log(`Biblioteca: ${(j.items || []).length} imagen(es)`);
  } catch (e) { log('⚠ No se pudo cargar la biblioteca: ' + e.message); }
}

$('clear').onclick = () => { $('gallery').innerHTML = ''; };

// ---- Generar ----
async function generate() {
  if (ctl) { ctl.abort(); return; }
  let prompt = $('prompt').value.trim();
  if (!prompt) return;
  ctl = new AbortController();
  $('go').textContent = 'Detener'; $('go').classList.add('stop');
  const t0 = performance.now();
  try {
    if ($('improve').checked && $('textModel').value) {
      const model = $('textModel').value;
      log(`Mejorando el prompt con ${model}…`);
      const known = (() => { try { return JSON.parse(localStorage.getItem('knownThinking') || '[]'); } catch (e) { return []; } })();
      const j = await post('complete', {
        model, think: known.includes(model) ? false : undefined,
        messages: [
          { role: 'system', content: "You write prompts for a text-to-image model. Translate the user's request into English and expand it into one vivid, detailed prompt (subject, style, lighting, composition). Reply with ONLY the prompt: no quotes, no explanations." },
          { role: 'user', content: prompt },
        ],
      }, ctl.signal);
      prompt = (j.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim() || prompt;
      log('Prompt final: ' + prompt);
    }
    log('Generando… (con un modelo nuevo, la primera vez se descarga: el progreso sale en la ventana de FastSD)');
    const req = {
      prompt, negative: $('negative').value.trim(), model: $('model').value.trim(),
      steps: +$('steps').value, guidance: +$('guidance').value,
      width: +$('width').value, height: +$('height').value, count: +$('count').value,
      seed: $('seed').value, openvino: $('openvino').checked, tiny: $('tiny').checked,
    };
    const j = await post('imagegen', req, ctl.signal);
    const info = `${req.model} · ${req.steps} pasos · ${req.width}×${req.height}` + (req.seed !== '' ? ` · semilla ${req.seed}` : '');
    for (const b of j.images) {
  try { const s = await post('gal_save', { image: b, prompt, info }); addImage(s.url, prompt, info, s.id); }
  catch (e) { addImage(dataUrl(b), prompt, info); log('⚠ No se guardó en la biblioteca: ' + e.message); }
}
    log(`Listo: ${j.images.length} imagen(es) en ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  } catch (e) {
    log(e.name === 'AbortError' ? 'Cancelado (FastSD puede terminar la imagen en curso en segundo plano).' : '⚠ ' + e.message);
  }
  ctl = null;
  $('go').textContent = 'Generar'; $('go').classList.remove('stop');
}
$('go').onclick = generate;
$('prompt').addEventListener('keydown', e => { if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); generate(); } });

checkStatus(); loadTextModels(); loadLibrary(); // loadLibrary estaba definida pero nunca se llamaba: la biblioteca no aparecía al abrir la consola
setInterval(() => { if (!ctl) checkStatus(); }, 15000);