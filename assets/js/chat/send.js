// Envío de mensajes con streaming, RAG y búsqueda web
// (script clásico: comparte ámbito global con el resto de assets/js/chat/; el orden de carga está en index.html)

// Reglas para usar los resultados de la búsqueda web (mismo texto que web_rules() en server/lib/search.php)
const webRules = hoy => `Instrucciones para usar los resultados: hoy es ${hoy}. Responde con la información de los resultados, no con lo que recuerdes. ` +
  'Fíjate en la fecha de cada fuente y en las fechas que mencionan: si hay datos contradictorios, quédate con la fuente más reciente; ' +
  'si algo ya pasó respecto a hoy, no lo presentes como futuro ni como «próximo». Descarta fuentes viejas o de relleno. ' +
  'Si los resultados no responden la pregunta, dilo claramente en vez de inventar. Cita las fuentes con [n].';

// Quita de un mensaje de la IA la lista de fuentes que va delante de la respuesta
const stripSources = txt => {
  txt = String(txt || '').replace(/<think>[\s\S]*?<\/think>/g, '');
  const i = txt.indexOf('\n\n---\n\n');
  return i >= 0 && /\]\(https?:/.test(txt.slice(0, i)) && /^(🌐 )?\*\*/.test(txt) ? txt.slice(i + 7) : txt;
};

// Pregunta corta al modelo del chat (ya está en memoria) sin streaming; devuelve la primera línea de la respuesta
async function quickAsk(model, sys, user, signal, numPredict) {
  const ctl = new AbortController(), stop = () => ctl.abort();
  signal.addEventListener('abort', stop);
  const timer = setTimeout(stop, 45000); // la primera vez el modelo puede tardar en cargarse
  try {
    const j = await dbApi('complete', { method: 'POST', headers: JSON_HDR, signal: ctl.signal, body: JSON.stringify({
      model, think: canThink(model) ? false : undefined, keep_alive: '10m', num_predict: numPredict, temperature: 0, num_ctx: 2048,
      messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] }) });
    return (j.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').split('\n').map(x => x.trim()).find(Boolean) || '';
  } finally { clearTimeout(timer); signal.removeEventListener('abort', stop); }
}
const prevTurns = c => c.messages.slice(0, -2).filter(m => !m.gen && !m.genImage && m.content).slice(-4)
  .map(m => `${m.role === 'user' ? 'Usuario' : 'IA'}: ${stripSources(m.content).replace(/\s+/g, ' ').slice(0, 400)}`).join('\n');
const withPrev = (c, text) => { const p = prevTurns(c); return (p ? `Conversación previa:\n${p}\n\n` : '') + `Último mensaje del usuario: ${text.slice(0, 1000)}`; };

// Palabras que casi siempre piden algo actual: si el modelo dijo NO pero aparecen, se busca igual (red de seguridad)
const CURRENT_RE = /\b(hoy|ayer|mañana|actual(es|mente)?|últim[oa]s?|reciente(s|mente)?|ahora mismo|esta semana|este (mes|año)|próxim[oa]s?|precio|cuesta|cotizaci[oó]n|d[oó]lar|euro|clima|tiempo hará|pron[oó]stico|noticias?|resultado|marcador|partido|elecciones|presidente|alcalde|gobernador|ministr[oa]|ceo|versi[oó]n|lanzamiento|estreno|busca(r|me)?|investiga|googlea|20(2[4-9]|3\d)|today|latest|current|price|news|weather|search)\b/i;
const MAKE_RE = /^\s*(escrib|crea|haz|hazme|genera|redacta|traduc|programa|corrig|cambia|modifica|explica|resume|resúme|dibuja|inventa|write|create|make|translate|fix|change|explain)/i;

// Modo «Automática»: ¿hace falta internet para responder? (SÍ/NO con ejemplos; ante la duda, SÍ)
async function needsWeb(c, text, model, signal) {
  const hoy = new Date().toLocaleDateString('es', { dateStyle: 'full' });
  const local = [c.folder && 'Este chat tiene conectada una carpeta de proyecto: las preguntas sobre sus archivos o su código NO necesitan internet.',
    chatFiles(c).files.size && 'En este chat hay archivos de código: pedir cambios o explicaciones sobre ellos NO necesita internet.',
    (c.messages.at(-2)?.files || []).length && 'El usuario adjuntó archivos a su mensaje: si pregunta por ellos, NO necesita internet.'].filter(Boolean);
  const sys = `Clasifica si para responder bien el último mensaje del usuario hace falta buscar en internet. Hoy es ${hoy}. ` +
    'Tu conocimiento se quedó en tu fecha de entrenamiento: no sabes nada de lo que pasó después, ni precios, resultados, noticias, cargos o versiones actuales.\n' +
    'Responde SÍ si pide algo actual o que cambia con el tiempo (noticias, precios, clima, resultados, partidos, fechas de eventos, horarios, quién ocupa un cargo, ' +
    'últimas versiones o lanzamientos), datos concretos verificables, algo que no conoces bien, o si pide buscar.\n' +
    'Responde NO si es un saludo, conversación, opinión, escritura creativa, programación, explicar un concepto general, matemáticas, traducir o resumir un texto dado. ' +
    local.join(' ') + '\nAnte la duda, responde SÍ.\n' +
    'Ejemplos:\n«hola, ¿qué tal?» → NO\n«explícame qué es la fotosíntesis» → NO\n«escribe una función en Python que ordene una lista» → NO\n' +
    '«¿quién ganó el último clásico?» → SÍ\n«¿cuánto cuesta un iPhone?» → SÍ\n«¿quién es el alcalde de Bogotá?» → SÍ\n«¿cuál es la última versión de Node.js?» → SÍ\n' +
    'Responde solo SÍ o NO.';
  let yes = false;
  try { yes = /^(s[ií]|yes)\b/i.test(await quickAsk(model, sys, withPrev(c, text), signal, 8)); }
  catch (e) { if (signal.aborted) throw e; }
  return yes || (!local.length && !MAKE_RE.test(text) && CURRENT_RE.test(text));
}

// Convierte la pregunta (y el contexto del chat) en una consulta corta para el buscador: «¿y a qué hora?» no sirve como búsqueda.
// Si algo falla o tarda, se busca con el texto tal cual.
async function searchQuery(c, text, model, signal, force = false) {
  if (!force && !$('rewriteOn').checked) return text;
  const hoy = new Date().toLocaleDateString('es', { dateStyle: 'full' });
  try {
    let q = await quickAsk(model, `Eres un generador de consultas para un buscador web. Hoy es ${hoy}. Escribe UNA consulta corta (máximo 12 palabras) para encontrar en internet la respuesta a la última pregunta del usuario. Usa la conversación previa para aclarar a qué se refiere (pronombres, «eso», «¿y a qué hora?»). Incluye nombres propios, lugares y el año cuando importen. Escribe en el idioma de la pregunta. Responde solo con la consulta, sin comillas ni explicaciones.`,
      withPrev(c, text), signal, 60);
    q = q.replace(/^(consulta|query|búsqueda|busqueda)\s*:\s*/i, '').replace(/^["'«“`*]+|["'»”`*.]+$/g, '').replace(/^(¿?)\s*(y|and|e)\s+/i, '$1').trim();
    return q && q.length <= 200 ? q : text;
  } catch (e) {
    if (signal.aborted) throw e; // el usuario pulsó «Detener»
    return text;
  }
}

// Una petición de chat con streaming: va pintando la respuesta y devuelve las herramientas que pida el modelo
async function streamChat(body, reply, bubble, model) {
  const res = await fetch(API, { method: 'POST', headers: JSON_HDR, signal: controller.signal, body: JSON.stringify(body) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const reader = res.body.getReader(), dec = new TextDecoder(), calls = [];
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
      if (j.message?.thinking) { reply.thinking += j.message.thinking; knownThinking.add(model); }
      if (j.message?.content) reply.content += j.message.content;
      if (j.message?.tool_calls?.length) calls.push(...j.message.tool_calls);
      if (j.done) {
        const gen = (reply.stats?.gen || 0) + (j.eval_count || 0);
        reply.stats = {
          prompt: j.prompt_eval_count || 0,
          gen,
          tps: j.eval_duration ? ((j.eval_count || 0) / (j.eval_duration / 1e9)).toFixed(1) : '-',
        };
        updateCtx();
      }
      paint(bubble, reply);
      $('skipThink').hidden = !(reply.thinking && !reply.content);
      $('messages').scrollTop = $('messages').scrollHeight;
    }
  }
  return calls;
}

// ---- Envío de mensajes (streaming) ----
async function send(override) {
  if (controller) { controller.abort(); return; }
  const text = override ? override.text : $('input').value.trim();
  const gen = override ? !!override.gen : genMode;
  const noThink = !!override?.noThink;
  const files = gen ? [] : (override ? override.files : pending);
  if (!text && !files.length) return;
  if (!override && !confirmImages(files)) return;
  const c = getChat();
  if (!c) return; // la app aún está arrancando (init() no ha terminado de cargar los chats)
  c.messages.push({ role: 'user', content: text, files, gen });
  if (c.messages.length === 1) c.title = (text || files[0].name).slice(0, 40);
  if (!override) {
    pending = []; renderPending();
    $('input').value = ''; $('input').style.height = 'auto';
  }
  if (gen) return generate(c, text);
  const reply = { role: 'assistant', content: '', thinking: '' };
  c.messages.push(reply);
  render();
  const bubble = $('messages').lastChild.querySelector('.bubble');
  bubble.textContent = '…';

  const model = modelFor(c);
  reply.model = model;
  controller = new AbortController();
  $('send').textContent = 'Detener'; $('send').classList.add('stop');

  let thinkSent, restart = false, webSys = '';
  try {
    await unloadOthers([model]); // un solo modelo en memoria: si se cambió de IA, la anterior sale de la RAM/VRAM
    thinkSent = thinkParam(model, noThink);
    // Archivos de código del chat: su versión actual va en el sistema y en el historial se sustituyen por una referencia
    const ff = filesForModel(c, c.messages.length - 1);
    const msgs = c.messages.slice(0, -1).map((m, i) => ({ m, i })).filter(({ m }) => !m.gen && !m.genImage).map(({ m, i }) => {
      const fs = m.files || [];
      const msg = {
        role: m.role,
        content: (m.role === 'assistant' ? ff.strip(i, m.content || '') : (m.content || '')) + fs.filter(f => !f.image && !f.chunks).map(f => `\n\n--- Archivo: ${f.name} ---\n${f.text}\n--- Fin de ${f.name} ---`).join(''),
      };
      const imgs = fs.filter(f => f.image).map(f => f.image);
      if (imgs.length && modelIsVision(model)) msg.images = imgs;
      return msg;
    });
    const rag = await ragContext(c, text);
    if (rag) msgs[msgs.length - 1].content += '\n\nFragmentos relevantes de los documentos adjuntos:\n' + rag;
    const webMode = $('webMode').value; // auto | always | never
    let query = null;
    if (text && webMode !== 'never') {
      bubble.innerHTML = ic('search') + `<span>${esc(t(webMode === 'auto' ? 'Comprobando si hace falta buscar en la web…' : 'Preparando la búsqueda…'))}</span>`;
      if (webMode === 'always' || await needsWeb(c, text, model, controller.signal)) {
        bubble.innerHTML = ic('search') + `<span>${esc(t('Preparando la búsqueda…'))}</span>`;
        query = await searchQuery(c, text, model, controller.signal, webMode === 'auto');
      } else bubble.textContent = '…';
    }
    if (query) {
  try {
    bubble.innerHTML = ic('globe') + `<span>${esc(t(`Buscando: «${query}»…`))}</span>`;
    const w = await fetch(API + '?action=websearch', {
      method: 'POST', headers: JSON_HDR, signal: controller.signal,
      body: JSON.stringify({ query: query.slice(0, 300), ...searchCfg() }),
    }).then(async r => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || 'HTTP ' + r.status);
      return j;
    });
    if (w.results?.length) {
      // Orden pensado para modelos pequeños: primero los resultados (con su fecha), luego las reglas y al final la pregunta
      const hoy = new Date().toLocaleDateString('es', { dateStyle: 'full' });
      const last = msgs[msgs.length - 1];
      const fuentes = w.results.map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\nFecha de la fuente: ${r.date || 'desconocida'}\n${r.content}`).join('\n\n');
      last.content = `[Resultados de búsqueda web]\n${fuentes}\n\n[${webRules(hoy)}]\n\n[Pregunta del usuario]\n${last.content}`;
      webSys = webRules(hoy);
      const fmt = d => d ? ' · ' + new Date(d + 'T12:00:00').toLocaleDateString(LANG === 'es' ? 'es' : LANG, { dateStyle: 'medium' }) : '';
      reply.content += t(`**Fuentes consultadas** para «${query.replace(/[*_[\]`]/g, '')}»:`) + '\n' + w.results.map((r, i) => `${i + 1}. [${r.title}](${r.url})${fmt(r.date)}`).join('\n') + '\n\n---\n\n';
    }
  } catch (e) {
    reply.content += t('⚠ Búsqueda web no disponible: ' + e.message) + '\n\n';
  }
}
    // Carpeta del proyecto: herramientas de solo lectura si el modelo las admite
    const useTools = !!c.folder && toolsOk(model);
    if (c.folder && !useTools) reply.content += '⚠ ' + t(`${model} no admite herramientas, así que no puede consultar la carpeta. Elige un modelo marcado con «herramientas».`) + '\n\n';
    const sys = [c.system, memSys(), webSys, ff.sys, useTools ? folderSys(c, await folderTree(c, controller.signal)) : '', c.messages.length === 2 ? TITLE_SYS : ''].filter(Boolean).join('\n\n');
    if (sys) msgs.unshift({ role: 'system', content: sys });
    // Bucle: el modelo responde o pide herramientas; se ejecutan, se le devuelve el resultado y sigue
    for (let round = 0; ; round++) {
      const start = reply.content.length;
      const calls = await streamChat({
        model,
        think: thinkSent,
        num_ctx: useTools ? Math.max(+$('ctx').value, FOLDER_CTX) : +$('ctx').value,
        temperature: +$('temp').value,
        messages: msgs,
        tools: useTools ? FOLDER_TOOLS : undefined,
      }, reply, bubble, model);
      if (!calls.length || !useTools) break;
      if (round >= FOLDER_ROUNDS) { reply.content += '\n\n⚠ ' + t('Demasiadas consultas seguidas: la IA se detuvo. Pídele que responda con lo que ya leyó.'); break; }
      msgs.push({ role: 'assistant', content: reply.content.slice(start), tool_calls: calls });
      for (const call of calls) {
        const x = await runTool(c, call, controller.signal);
        (reply.tools ||= []).push({ summary: x.summary, error: !!x.error });
        paint(bubble, reply);
        msgs.push({ role: 'tool', content: String(x.result).slice(0, 14000), tool_name: call.function?.name });
      }
    }
  } catch (e) {
    if (e.name === 'AbortError') { /* detenido por el usuario o por «Respuesta rápida» */ }
    else if (thinkSent !== undefined && /think/i.test(e.message)) { noThinkModels.add(model); restart = true; } // el modelo no admite "think": se reintenta sin él
    else if (/does not support tools/i.test(e.message)) reply.content += '\n\n⚠ ' + t(`${model} no admite herramientas, así que no puede consultar la carpeta. Elige un modelo marcado con «herramientas».`);
    else reply.content += '\n\n⚠ ' + t(e.message);
  }
  $('skipThink').hidden = true;
  rememberThink();
  if (restart || skipThink) { // reinicia la respuesta sin razonamiento
    const forceOff = skipThink; skipThink = false;
    c.messages = c.messages.slice(0, -2);
    controller = null;
    return send({ text, files, gen: false, noThink: forceOff });
  }
  captureTitle(c, reply);
  await captureMemory(reply);
  if (!reply.content && !reply.thinking) reply.content = t('(sin respuesta)');
  bubble.innerHTML = bubbleHTML(reply);
  controller = null;
  $('send').textContent = genMode ? 'Generar' : 'Enviar'; $('send').classList.remove('stop');
  save(); renderSidebar(); renderMessages();
  refreshLoaded();
}
