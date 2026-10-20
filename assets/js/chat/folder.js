// Carpeta del proyecto (solo lectura): se conecta a un chat y la IA la explora con herramientas (listar, buscar, leer)
// (script clásico: comparte ámbito global con el resto de assets/js/chat/; el orden de carga está en index.html)

const FOLDER_CTX = 16384; // con carpeta hace falta más contexto: los archivos leídos ocupan mucho
const FOLDER_ROUNDS = 12; // consultas seguidas como máximo en una respuesta

// Herramientas que se le describen al modelo (formato de Ollama / OpenAI)
const FOLDER_TOOLS = [
  { type: 'function', function: {
    name: 'list_files',
    description: 'Lista los archivos y subcarpetas del proyecto (o de una subcarpeta), con su tamaño. Úsala primero para conocer la estructura.',
    parameters: { type: 'object', properties: {
      path: { type: 'string', description: 'Subcarpeta relativa al proyecto; "." es la raíz' },
      depth: { type: 'integer', description: 'Niveles que se muestran, de 1 a 4 (por defecto 2)' },
    }, required: [] } } },
  { type: 'function', function: {
    name: 'read_file',
    description: 'Lee un archivo de texto del proyecto con números de línea, como mucho 400 líneas por vez (usa start_line para seguir).',
    parameters: { type: 'object', properties: {
      path: { type: 'string', description: 'Ruta relativa del archivo, por ejemplo src/app.js' },
      start_line: { type: 'integer', description: 'Primera línea (por defecto 1)' },
      end_line: { type: 'integer', description: 'Última línea' },
    }, required: ['path'] } } },
  { type: 'function', function: {
    name: 'search',
    description: 'Busca un texto (sin distinguir mayúsculas) en todos los archivos del proyecto o de una subcarpeta. Devuelve archivo:línea: texto.',
    parameters: { type: 'object', properties: {
      query: { type: 'string', description: 'Texto a buscar, por ejemplo el nombre de una función' },
      path: { type: 'string', description: 'Subcarpeta o archivo donde buscar (por defecto todo el proyecto)' },
    }, required: ['query'] } } },
];
const TOOL_ACTION = { list_files: 'fs_list', read_file: 'fs_read', search: 'fs_search' };

// ¿El modelo admite herramientas? (si Ollama no informó sus capacidades, se intenta)
const toolsOk = model => { const caps = modelCaps[model] || []; return !caps.length || caps.includes('tools'); };

const folderSys = (c, tree) => `[Carpeta del proyecto]\nTienes acceso de SOLO LECTURA a la carpeta «${c.folder.name}» (${c.folder.root}). ` +
  'Para responder sobre ella usa las herramientas: read_file para leer un archivo (por partes si es largo), search para encontrar en qué archivos aparece una palabra y list_files para ver una subcarpeta. ' +
  'search busca texto literal dentro del código: usa una palabra o identificador corto que aparecería en el código (por ejemplo port, DB_HOST, login, function guardar), no frases ni preguntas. ' +
  'Si una búsqueda no encuentra nada, no te rindas: mira la estructura de abajo y abre con read_file los archivos cuyo nombre parezca relacionado (config, settings, .env, README…). ' +
  'Lee los archivos antes de hablar de su contenido: no inventes nombres, rutas ni código que no hayas visto. Cita los archivos como ruta:línea. ' +
  'No puedes crear ni modificar archivos: si hace falta un cambio, muéstralo como código en tu respuesta.' +
  (tree ? `\n\nEstructura de la carpeta (archivos y tamaños):\n${tree}` : '');

// Mapa inicial de la carpeta (2 niveles) para el prompt de sistema: así el modelo sabe desde el principio qué archivos hay
async function folderTree(c, signal) {
  try {
    const j = await dbApi('fs_list', { method: 'POST', headers: JSON_HDR, signal, body: JSON.stringify({ root: c.folder.root, path: '.', depth: 3 }) });
    const lines = j.result.split('\n');
    return lines.length > 150 ? lines.slice(0, 150).join('\n') + `\n… (${lines.length - 150} entradas más: usa list_files en una subcarpeta)` : j.result;
  } catch (e) { if (signal.aborted) throw e; return ''; }
}

// Ejecuta una llamada del modelo contra el servidor y devuelve {result (para el modelo), summary (para el chat), error}
async function runTool(c, call, signal) {
  const name = call.function?.name || '';
  let args = call.function?.arguments || {};
  if (typeof args === 'string') { try { args = JSON.parse(args); } catch (_) { args = {}; } }
  const act = TOOL_ACTION[name];
  if (!act) return { result: `Herramienta desconocida: ${name}. Usa list_files, read_file o search.`, summary: name, error: true };
  try {
    const j = await dbApi(act, { method: 'POST', headers: JSON_HDR, signal, body: JSON.stringify({ ...args, root: c.folder.root }) });
    return { result: j.result, summary: j.summary };
  } catch (e) {
    if (signal.aborted) throw e;
    return { result: 'Error: ' + e.message, summary: e.message, error: true };
  }
}

// Registro de consultas encima de la respuesta
function toolLogHTML(m) {
  const n = m.tools.length;
  return `<details class="toollog"${controller && !m.content ? ' open' : ''}><summary>${ic('folder-open')}<span>${n} ${n === 1 ? 'consulta' : 'consultas'} a la carpeta</span></summary>` +
    m.tools.map(x => `<div${x.error ? ' class="bad"' : ''}>${ic(x.error ? 'triangle-alert' : /^Ley/.test(x.summary) ? 'file-code' : /^Busc/.test(x.summary) ? 'search' : 'folder')}<span>${esc(x.summary.replace(/^⚠ /, ''))}</span></div>`).join('') + '</details>';
}

// ---- Barra de la carpeta (debajo del modelo) ----
function updateFolderBar() {
  const c = getChat(), bar = $('folderbar');
  if (!c?.folder) { bar.hidden = true; $('folderBtn').classList.remove('on'); return; }
  bar.hidden = false; $('folderBtn').classList.add('on');
  $('folderName').textContent = c.folder.name;
  $('folderName').title = c.folder.root;
  $('folderInfo').textContent = `${c.folder.files} archivos · solo lectura`;
  const m = modelFor(c);
  $('folderWarn').hidden = toolsOk(m);
  $('folderWarn').innerHTML = ic('triangle-alert') + `<span>${esc(m)} no admite herramientas: elige un modelo marcado con «herramientas»</span>`;
}

$('folderBtn').onclick = async () => {
  const c = getChat();
  if (controller || !c) return;
  const root = window.iaDesktop?.pickFolder ? await window.iaDesktop.pickFolder()
    : prompt('Ruta de la carpeta del proyecto (por ejemplo E:\\Documents\\htdocs\\mi-proyecto):', c.folder?.root || '');
  if (!root || !root.trim()) return;
  try {
    const j = await dbApi('fs_check', { method: 'POST', headers: JSON_HDR, body: JSON.stringify({ root: root.trim() }) });
    c.folder = { root: j.root, name: j.name, files: j.files + (j.more ? '+' : '') };
    updateFolderBar(); save();
  } catch (e) { alert('No se pudo abrir la carpeta: ' + e.message); }
};
$('folderClose').onclick = () => { const c = getChat(); if (!c || controller) return; c.folder = null; updateFolderBar(); save(); };
$('model').addEventListener('change', updateFolderBar);
