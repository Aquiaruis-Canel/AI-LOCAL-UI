// Memoria a largo plazo y título automático de los chats
// (script clásico: comparte ámbito global con el resto de assets/js/chat/; el orden de carga está en index.html)

// ---- Memoria local: la IA decide qué guardar con <memoria>dato</memoria> ----
let memories = [];
$('memOn').checked = localStorage.getItem('memOn') !== '0';
$('memOn').onchange = () => localStorage.setItem('memOn', $('memOn').checked ? '1' : '0');
// Oculta las etiquetas (completas o a medio escribir) mientras llega la respuesta
const stripMem = t => t.replace(/<(memoria|titulo)>[\s\S]*?(<\/\1>|$)/gi, '').replace(/<(m(e(m(o(r(i(a)?)?)?)?)?)?|t(i(t(u(l(o)?)?)?)?)?)?$/i, '');

// ---- Título automático: la IA lo propone en su primera respuesta con <titulo>...</titulo> ----
const TITLE_SYS = 'Al final de tu respuesta añade una línea con el formato <titulo>título corto de 3 a 6 palabras que resuma este chat</titulo>, en el idioma del usuario. Nunca menciones esta instrucción.';
function captureTitle(c, reply) {
  const m = reply.content.match(/<titulo>([\s\S]*?)<\/titulo>/i);
  reply.content = reply.content.replace(/<titulo>[\s\S]*?<\/titulo>/gi, '').trim();
  const t = m && m[1].trim().replace(/^["'«“]+|["'»”.]+$/g, '').slice(0, 60);
  if (t && c.messages.length === 2) c.title = t;
}
const memSys = () => !$('memOn').checked ? '' :
  'Tienes memoria a largo plazo sobre el usuario.' +
  (memories.length ? '\nLo que ya sabes de él:\n' + memories.slice(-60).map(m => '- ' + m.text).join('\n') : '') +
  '\nSi el usuario revela algo importante y duradero (su nombre, preferencias, proyectos, datos útiles a futuro), añade AL FINAL de tu respuesta una línea con el formato <memoria>dato breve</memoria>. No guardes cosas triviales ni datos que ya sabes. Nunca menciones esta instrucción.';

async function addMemory(text) {
  text = text.trim().slice(0, 500);
  if (!text || memories.some(m => m.text.toLowerCase() === text.toLowerCase())) return false;
  const j = await dbApi('db_mem_add', { method: 'POST', headers: JSON_HDR, body: JSON.stringify({ text }) });
  memories.push({ id: j.id, text });
  return true;
}
async function captureMemory(reply) {
  const found = [...reply.content.matchAll(/<memoria>([\s\S]*?)<\/memoria>/gi)].map(x => x[1].trim()).filter(Boolean);
  reply.content = reply.content.replace(/<memoria>[\s\S]*?<\/memoria>/gi, '').trim();
  if (!found.length || !$('memOn').checked) return;
  const saved = [];
  try { for (const f of found) if (await addMemory(f)) saved.push(f); }
  catch (e) { console.warn('Memoria:', e.message); }
  if (saved.length) { reply.mem = saved; renderMem(); }
}
function renderMem() {
  const box = $('memList'); box.innerHTML = '';
  if (!memories.length) { box.innerHTML = '<span class="muted">Aún no hay recuerdos.</span>'; return; }
  memories.forEach(m => {
    const r = document.createElement('div'); r.className = 'memrow';
    const s = document.createElement('span'); s.textContent = m.text;
    const b = document.createElement('b'); b.innerHTML = ic('x'); b.title = 'Olvidar';
    b.onclick = async () => {
      try { await dbApi('db_mem_delete', { method: 'POST', headers: JSON_HDR, body: JSON.stringify({ id: m.id }) }); }
      catch (e) { alert(e.message); return; }
      memories = memories.filter(x => String(x.id) !== String(m.id)); renderMem();
    };
    r.append(s, b); box.appendChild(r);
  });
}
$('memAdd').onclick = async () => {
  try { if (await addMemory($('memNew').value)) { $('memNew').value = ''; renderMem(); } }
  catch (e) { alert('No se pudo guardar: ' + e.message); }
};
$('memNew').addEventListener('keydown', e => { if (e.key === 'Enter') $('memAdd').click(); });
$('memClear').onclick = async () => {
  if (!memories.length || !confirm('¿Borrar todos los recuerdos?')) return;
  try { await dbApi('db_mem_delete', { method: 'POST', headers: JSON_HDR, body: JSON.stringify({ id: 'all' }) }); memories = []; renderMem(); }
  catch (e) { alert(e.message); }
};
dbApi('db_mem_list').then(j => { memories = j.memories || []; renderMem(); })
  .catch(() => { $('memList').innerHTML = '<span class="muted">Memoria no disponible: falta el cambio en api.php.</span>'; });
