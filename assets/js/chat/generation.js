// Modo imagen del chat (FastSD CPU)
// (script clásico: comparte ámbito global con el resto de assets/js/chat/; el orden de carga está en index.html)

// ---- Generación de imágenes ----
async function generate(c, text) {
  const reply = { role: 'assistant', content: '', genImage: null };
  c.messages.push(reply);
  render();
  const bubble = $('messages').lastChild.querySelector('.bubble');
  controller = new AbortController();
  const signal = controller.signal;
  $('send').textContent = 'Detener'; $('send').classList.add('stop');
  const post = (action, body) => fetch(API + '?action=' + action, {
    method: 'POST', headers: JSON_HDR, signal, body: JSON.stringify(body),
  }).then(async r => {
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error || 'HTTP ' + r.status);
    return j;
  });
  try {
    let prompt = text;
    await unloadOthers($('genAI').checked ? [$('model').value] : []); // un solo modelo en memoria
    if ($('genAI').checked) {
      bubble.textContent = t('Preparando el prompt en inglés…');
      const model = $('model').value;
      const j = await post('complete', {
        model,
        think: canThink(model) ? false : undefined,
        keep_alive: 0, // al terminar el prompt, el modelo de texto sale de la memoria y la deja libre al generador de imágenes
        messages: [
          { role: 'system', content: "You write prompts for a text-to-image model. Translate the user's request into English and expand it into one vivid, detailed prompt (subject, style, lighting, composition). Reply with ONLY the prompt: no quotes, no explanations." },
          { role: 'user', content: text },
        ],
      });
      prompt = (j.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim() || text;
    }
    bubble.textContent = t('Generando imagen… (en CPU puede tardar desde segundos hasta un par de minutos)');
const imgModel = $('imgModel').value.trim() || 'rupeshs/sd-turbo-openvino';
const pre = IMG_PRESETS[imgModel] || { steps: 4 };
const size = +$('imgSize').value;
const j = await post('imagegen', {
  prompt, model: imgModel, steps: pre.steps, guidance: 1, width: size, height: size,
  count: 1, seed: '', openvino: !imgModel.startsWith('lora:'), tiny: true,
});
reply.genImage = j.images[0]; reply.genPrompt = prompt;
  } catch (e) {
    reply.content = e.name === 'AbortError' ? '(cancelado)' : '⚠ ' + e.message;
  }
  bubble.innerHTML = bubbleHTML(reply);
  controller = null;
  $('send').textContent = genMode ? 'Generar' : 'Enviar'; $('send').classList.remove('stop');
  save(); renderSidebar(); renderMessages();
  refreshLoaded();
}
