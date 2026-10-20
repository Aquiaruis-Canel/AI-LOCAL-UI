// Modelos de Ollama: lista, gestor de descargas/actualizaciones y razonamiento
// (script clásico: comparte ámbito global con el resto de assets/js/chat/; el orden de carga está en index.html)

async function loadModels() {
  try {
    const r = await fetch(API + '?action=models');
    const j = await r.json();
    if (j.error) throw new Error(j.error);
    j.models.forEach(m => modelCaps[m.name] = m.capabilities || []);
    const tags = m => [(m.capabilities || []).includes('vision') && t('visión'), (m.capabilities || []).includes('tools') && t('herramientas')].filter(Boolean);
    $('model').innerHTML = j.models.map(m => `<option value="${m.name}">${m.name}${tags(m).length ? ' · ' + tags(m).join(', ') : ''}</option>`).join('');
    const vms = j.models.filter(m => (m.capabilities || []).includes('vision'));
    $('visionModel').innerHTML = '<option value="">— ninguno —</option>' + vms.map(m => `<option value="${m.name}">${m.name}</option>`).join('');
    $('visionModel').value = localStorage.getItem('visionModel') ?? (vms[0]?.name || '');
    $('defModel').innerHTML = '<option value="">— el último usado —</option>' + j.models.map(m => `<option value="${m.name}">${m.name}</option>`).join('');
const def = localStorage.getItem('defModel');
$('defModel').value = def || '';
const start = def || localStorage.getItem('model');
if (start) $('model').value = start;
    $('status').textContent = '● Ollama conectado'; $('status').className = 'ok';
  } catch (e) {
    $('status').textContent = '● ' + e.message; $('status').className = 'bad';
  }
}
$('defModel').onchange = () => localStorage.setItem('defModel', $('defModel').value);
// «— el último usado —»: se recuerda el modelo elegido en el selector (antes se leía pero nunca se guardaba)
$('model').addEventListener('change', () => localStorage.setItem('model', $('model').value));

const IMG_PRESETS = {
  'rupeshs/sd-turbo-openvino': { steps: 2, size: 512 },
  'rupeshs/sdxs-512-0.9-openvino': { steps: 1, size: 512 },
  'rupeshs/hyper-sd-sdxl-1-step-openvino-int8': { steps: 1, size: 1024 },
  'rupeshs/SDXL-Lightning-2steps-openvino-int8': { steps: 2, size: 1024 },
};
$('imgModel').value = localStorage.getItem('imgModel') || 'rupeshs/sd-turbo-openvino';
$('imgModel').onchange = () => localStorage.setItem('imgModel', $('imgModel').value.trim());

// ---- Gestor de modelos: buscar actualizaciones y descargar ----
let modelInfo = [], updMap = {}, pullCtl = null;
const gbText = b => ((b || 0) / 1e9).toFixed(1) + ' GB';

function renderModelTable() {
  const tb = $('modelTable').querySelector('tbody');
  tb.innerHTML = '';
  modelInfo.forEach(m => {
    const u = updMap[m.name];
    let state = '<span class="muted">sin comprobar</span>';
    if (u) {
      if (u.status === 'ok') state = '<span class="ok">✔ Al día</span>';
      else if (u.status === 'update') state = `<span class="warn" title="Local ${esc(u.local)} · Registro ${esc(u.remote)}">⬆ El registro tiene una versión distinta</span>`;
      else state = `<span class="bad">${esc(u.note || 'No se pudo comprobar')}</span>`;
    }
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><b>${esc(m.name)}</b><div class="muted">${gbText(m.size)} · ${esc((m.digest || '').slice(0, 12))}</div></td><td>${state}</td><td></td>`;
    if (u?.status === 'update') {
      const b = document.createElement('button');
      b.className = 'hbtn primary'; b.textContent = 'Actualizar';
      b.onclick = () => pullModel(m.name);
      tr.lastChild.appendChild(b);
    }
    tb.appendChild(tr);
  });
}

async function loadModelInfo() {
  try { modelInfo = (await dbApi('models')).models || []; renderModelTable(); }
  catch (e) { $('updInfo').textContent = e.message; }
}

async function checkUpdates() {
  $('checkUpd').disabled = true;
  $('updInfo').textContent = 'Consultando registros…';
  try {
    const j = await dbApi('check_updates');
    updMap = {};
    j.models.forEach(x => updMap[x.name] = x);
    modelInfo = j.models;
    const n = j.models.filter(x => x.status === 'update').length;
    const f = j.models.filter(x => x.status === 'error').length;
    $('updInfo').textContent = (n ? t(`${n} modelo(s) con versión distinta`) : t('Todo al día')) + (f ? ' ' + t(`· ${f} sin poder comprobar`) : '');
    renderModelTable();
  } catch (e) { $('updInfo').textContent = '⚠ ' + e.message; }
  $('checkUpd').disabled = false;
}

async function pullModel(name) {
  name = (name || '').trim();
  if (!name) return;
  if (pullCtl) { alert('Ya hay una descarga en curso.'); return; }
  pullCtl = new AbortController();
  const row = document.createElement('div');
  row.className = 'pullrow';
  row.innerHTML = '<span class="pt"></span><progress max="100" value="0"></progress>';
  const cancel = document.createElement('button');
  cancel.className = 'hbtn'; cancel.textContent = 'Cancelar';
  cancel.onclick = () => pullCtl?.abort();
  row.appendChild(cancel);
  $('pullBox').prepend(row);
  const pt = row.querySelector('.pt'), pr = row.querySelector('progress');
  pt.textContent = name + ': iniciando…';
  try {
    const res = await fetch(API + '?action=pull', { method: 'POST', headers: JSON_HDR, body: JSON.stringify({ name }), signal: pullCtl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line) continue;
        const j = JSON.parse(line);
        if (j.error) throw new Error(j.error);
        if (j.total) {
          const pct = Math.round(j.completed / j.total * 100);
          pr.value = pct; pt.textContent = `${name}: ${j.status} ${pct}%`;
        } else pt.textContent = `${name}: ${j.status}`;
      }
    }
    pr.value = 100; pt.textContent = `${name}: ✔ listo`;
    updMap[name] = { status: 'ok' };
    await loadModels();
    await loadModelInfo();
  } catch (e) {
    pt.textContent = `${name}: ` + (e.name === 'AbortError' ? 'cancelado' : '⚠ ' + e.message);
  }
  cancel.remove();
  pullCtl = null;
}

$('dlgClose').onclick = () => $('modelsDlg').close();
$('checkUpd').onclick = checkUpdates;
$('pullBtn').onclick = () => { pullModel($('pullName').value); $('pullName').value = ''; };
$('pullName').addEventListener('keydown', e => { if (e.key === 'Enter') $('pullBtn').click(); });

// ---- Razonamiento: ¿se envía "think" al modelo? ----
// /api/tags no siempre informa de las capacidades, así que se envía "think" igualmente y se aprende de la respuesta:
// si el modelo razona (llega "thinking") se recuerda; si lo rechaza, no se le vuelve a enviar.
const loadSet = k => { try { return new Set(JSON.parse(localStorage.getItem(k) || '[]')); } catch (e) { return new Set(); } };
const knownThinking = loadSet('knownThinking'), noThinkModels = loadSet('noThinkModels');
const rememberThink = () => {
  localStorage.setItem('knownThinking', JSON.stringify([...knownThinking]));
  localStorage.setItem('noThinkModels', JSON.stringify([...noThinkModels]));
};
const canThink = model => (modelCaps[model] || []).includes('thinking') || knownThinking.has(model);
function thinkParam(model, forceOff) {
  if (noThinkModels.has(model)) return undefined;
  const caps = modelCaps[model] || [];
  if (caps.length && !caps.includes('thinking')) return undefined; // capacidades conocidas y sin razonamiento
  return forceOff ? false : MODES[$('mode').value].think;
}
let skipThink = false;
$('skipThink').onclick = () => { if (controller) { skipThink = true; controller.abort(); } };
