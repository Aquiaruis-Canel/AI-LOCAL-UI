// RAG: fragmentos y embeddings de documentos largos
// (script clásico: comparte ámbito global con el resto de assets/js/chat/; el orden de carga está en index.html)

// ---- RAG: fragmentos + embeddings de Ollama guardados con el chat ----
const RAG_MIN = 8000;
const embed = async texts => (await dbApi('embed', { method: 'POST', headers: JSON_HDR,
  body: JSON.stringify({ model: $('embedModel').value.trim() || 'nomic-embed-text', input: texts }) })).embeddings;

async function indexFile(f) {
  const chunks = [], out = [];
  for (let i = 0; i < f.text.length; i += 850) chunks.push(f.text.slice(i, i + 1000));
  try {
    for (let i = 0; i < chunks.length; i += 16) {
      $('status').textContent = `● Indexando ${f.name}: ${i}/${chunks.length}`; $('status').className = '';
      (await embed(chunks.slice(i, i + 16))).forEach((v, k) => out.push({ t: chunks[i + k], v: v.map(x => +x.toFixed(4)) }));
    }
  } finally { $('status').textContent = '● Ollama conectado'; $('status').className = 'ok'; }
  f.chunks = out; f.text = '';
}

async function ragContext(c, query) {
  const all = c.messages.flatMap(m => (m.files || []).filter(f => f.chunks).flatMap(f => f.chunks.map(k => ({ ...k, n: f.name }))));
  if (!all.length || !query) return '';
  const [q] = await embed([query]);
  const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0), nq = Math.sqrt(dot(q, q));
  return all.map(k => ({ k, s: dot(q, k.v) / (nq * Math.sqrt(dot(k.v, k.v)) || 1) }))
    .sort((a, b) => b.s - a.s).slice(0, 5).map(({ k }) => `[${k.n}]\n${k.t}`).join('\n---\n');
}
