// Lista de chats: crear, abrir, borrar, importar los antiguos e iniciar la app
// (script clásico: comparte ámbito global con el resto de assets/js/chat/; el orden de carga está en index.html)

// ---- Chats ----
function newChat() {
  const empty = chats.find(x => x.messages && !x.messages.length); // reutiliza un chat vacío
  if (empty) { current = empty.id; render(); return; }
  const c = { id: Date.now().toString(), title: 'Nuevo chat', messages: [] };
  chats.unshift(c); current = c.id; localStorage.setItem('current', current); render();
}

async function selectChat(id) {
  if (controller) return;
  const c = chats.find(x => x.id === id);
  if (!c) return;
  if (!c.messages) {
    try { await loadMessages(c); }
    catch (e) { alert('No se pudo cargar el chat: ' + e.message); return; }
  }
  current = id; localStorage.setItem('current', id); render();
  if (innerWidth <= 700) setSidebar(true);
}

async function removeChat(id) {
  if (controller) return;
  if (!confirm('¿Borrar este chat de forma permanente?')) return;
  try { await dbApi('db_delete', { method: 'POST', headers: JSON_HDR, body: JSON.stringify({ id }) }); }
  catch (e) { alert('No se pudo borrar: ' + e.message); return; }
  chats = chats.filter(x => x.id !== id);
  if (current === id) {
    current = null;
    if (chats.length) await selectChat(chats[0].id);
    if (!current) newChat();
  } else renderSidebar();
}

// Importa los chats antiguos que estaban en el navegador (localStorage) a la base de datos
async function migrateOld() {
  if (localStorage.getItem('skipMigrate')) return;
  let old = [];
  try { old = JSON.parse(localStorage.getItem('chats') || '[]'); } catch (e) {}
  old = old.filter(c => c.messages?.length);
  if (!old.length) return;
  if (!confirm(`Hay ${old.length} chat(s) guardados en este navegador.\n¿Importarlos a la base de datos?`)) {
    localStorage.setItem('skipMigrate', '1'); return;
  }
  for (const c of old) {
    try {
      await dbApi('db_save', { method: 'POST', headers: JSON_HDR, body: JSON.stringify({ id: c.id, title: c.title, messages: c.messages }) });
      if (!chats.some(x => x.id === c.id)) chats.push({ id: c.id, title: c.title, messages: null });
    } catch (e) { alert(`No se pudo importar "${c.title}": ${e.message}`); return; }
  }
  localStorage.removeItem('chats');
}

async function init() {
  try {
    const j = await dbApi('db_list');
    chats = j.chats.map(x => ({ id: x.id, title: x.title, messages: null }));
  } catch (e) {
    alert('No se pudo abrir la base de datos:\n' + e.message);
  }
  await migrateOld();
  const want = localStorage.getItem('current');
  await selectChat(chats.some(x => x.id === want) ? want : chats[0]?.id);
  // «current» viene de localStorage: si apunta a un chat vacío que nunca se guardó (y no hay otros), hay que crear uno nuevo
  if (!chats.some(x => x.id === current)) newChat();
  loadModels();
}

function renderSidebar() {
  $('chats').innerHTML = '';
  chats.filter(c => !searchIds || searchIds.has(c.id)).forEach(c => {
    const d = document.createElement('div');
    d.className = 'chat-item' + (c.id === current ? ' active' : '');
    d.innerHTML = `<span></span><i title="Renombrar">${ic('pencil')}</i><b title="Borrar">${ic('x')}</b>`;
    d.querySelector('i').onclick = e => { e.stopPropagation(); renameChat(c.id); };
    d.querySelector('span').textContent = t(c.title); // «Nuevo chat» se muestra en el idioma elegido
    d.onclick = () => selectChat(c.id);
    d.querySelector('b').onclick = e => { e.stopPropagation(); removeChat(c.id); };
    $('chats').appendChild(d);
  });
}
