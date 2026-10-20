// Estado del chat, barra lateral, modos y guardado en la base de datos
// (script clásico: comparte ámbito global con el resto de assets/js/chat/; el orden de carga está en index.html)

let chats = []; // lista de chats; los mensajes se cargan de la base de datos al abrir cada chat
let current = localStorage.getItem('current');
let controller = null;
let modelCaps = {};

// ---- Barra lateral y configuraciones ----
function setSidebar(hidden) {
  document.body.classList.toggle('side-hidden', hidden);
  localStorage.setItem('sidebarHidden', hidden ? '1' : '0');
}
const savedSide = localStorage.getItem('sidebarHidden');
setSidebar(savedSide === null ? innerWidth <= 700 : savedSide === '1');
$('sideToggle').onclick = () => setSidebar(!document.body.classList.contains('side-hidden'));
$('newChat').onclick = () => { newChat(); if (innerWidth <= 700) setSidebar(true); };
$('settingsBtn').onclick = () => { $('sysPrompt').value = getChat()?.system || ''; $('settingsDlg').showModal(); };
$('settingsClose').onclick = () => $('settingsDlg').close();
$('openModels').onclick = () => { $('settingsDlg').close(); $('modelsDlg').showModal(); loadModelInfo(); };

// Modos: think = razonamiento activado/desactivado, temp = temperatura sugerida
const MODES = {
  razonar:  { think: true,  temp: 0.6 },
  rapido:   { think: false, temp: 0.7 },
  preciso:  { think: false, temp: 0.2 },
  creativo: { think: false, temp: 1.0 },
};
function applyMode() {
  $('temp').value = MODES[$('mode').value].temp;
  localStorage.setItem('mode', $('mode').value);
}
let genMode = false;
const modelIsVision = name => (modelCaps[name] || []).includes('vision');
// Si el chat contiene imágenes y hay un modelo de visión elegido, se usa ese; si no, el principal
function modelFor(c) {
  const hasImg = c.messages.some(m => (m.files || []).some(f => f.image));
  const v = $('visionModel').value;
  return hasImg && v ? v : $('model').value;
}
function confirmImages(files) {
  if (!files.some(f => f.image)) return true;
  if ($('visionModel').value || modelIsVision($('model').value)) return true;
  return confirm('No hay ningún modelo con visión disponible, así que la IA no podrá ver las imágenes.\n¿Enviar de todos modos solo con el texto?');
}

// Guarda el chat actual en la base de datos (en cola, para que los guardados no se pisen)
let saving = Promise.resolve();
let searchIds = null;
// El prompt de sistema viaja como primer mensaje especial (sys) para no cambiar la estructura de la base de datos
// …y la carpeta del proyecto conectada al chat viaja en ese mismo mensaje especial
const withSys = c => c.system || c.folder ? [{ role: 'system', sys: true, content: c.system || '', ...(c.folder ? { folder: c.folder } : {}) }, ...c.messages] : c.messages;
const persist = c => {
  if (!c || !c.messages || !c.messages.length) return;
  const body = JSON.stringify({ id: c.id, title: c.title, messages: withSys(c) });
  saving = saving
    .then(() => dbApi('db_save', { method: 'POST', headers: JSON_HDR, body }))
    .catch(e => alert('No se pudo guardar en la base de datos: ' + e.message));
};
const save = () => {
  localStorage.setItem('current', current || '');
  const c = getChat();
  if (!c || !c.messages || !c.messages.length) return;
  const i = chats.indexOf(c);
  if (i > 0) { chats.splice(i, 1); chats.unshift(c); } // el chat más reciente arriba
  persist(c);
};
async function loadMessages(c) {
  const msgs = (await dbApi('db_get', {}, '&id=' + encodeURIComponent(c.id))).messages || [];
  if (msgs[0]?.sys) { c.system = msgs[0].content; c.folder = msgs[0].folder || null; msgs.shift(); }
  c.messages = msgs;
}
