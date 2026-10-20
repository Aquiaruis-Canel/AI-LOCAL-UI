// Adjuntar archivos: PDF escaneado a imágenes, imágenes, lista de pendientes
// (script clásico: comparte ámbito global con el resto de assets/js/chat/; el orden de carga está en index.html)

// ---- Archivos adjuntos ----
const MAX_CHARS = 200000;
let pending = [];

// PDF escaneado (sin texto): se convierte cada página en imagen para que un modelo de visión la lea
async function pdfToImages(pdf, name) {
  const max = Math.min(pdf.numPages, Math.max(1, +$('pdfPages').value || 8));
  const out = [];
  for (let i = 1; i <= max; i++) {
    const page = await pdf.getPage(i);
    const v0 = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: 1280 / Math.max(v0.width, v0.height) });
    const cv = document.createElement('canvas');
    cv.width = Math.round(viewport.width); cv.height = Math.round(viewport.height);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    out.push({ name: `${name} (p.${i})`, text: '', image: cv.toDataURL('image/jpeg', 0.85).split(',')[1] });
  }
  if (pdf.numPages > max) alert(`${name}: es un PDF escaneado, solo se procesaron las primeras ${max} páginas de ${pdf.numPages}. Puedes subir el límite en Configuraciones → «Páginas de PDF escaneado».`);
  const est = max * 1100; // estimación aproximada de tokens por página (varía según el modelo)
  if (est > +$('ctx').value) alert(`${name}: ${max} páginas ocupan aprox. ${est} tokens y el contexto actual es ${$('ctx').value}. Sube el «Contexto» en Configuraciones o el modelo olvidará las primeras páginas.`);
  return out;
}

function readImage(f) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 1280 / Math.max(img.width, img.height)); // reduce a máx. 1280px
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      const name = f.name && f.name !== 'image.png' ? f.name : 'captura.png';
      resolve({ name, text: '', image: cv.toDataURL('image/jpeg', 0.85).split(',')[1] });
    };
    img.onerror = () => reject(new Error('No se pudo leer la imagen'));
    img.src = url;
  });
}

async function readFile(f) {
  if (f.type.startsWith('image/') && !/svg/.test(f.type)) return readImage(f);
  let text;
  if (f.name.toLowerCase().endsWith('.pdf')) {
    if (!window.pdfjsLib) throw new Error('pdf.js no cargó (¿sin internet?)');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/vendor/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument({ data: await f.arrayBuffer() }).promise;
    text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      text += `[Página ${i}]\n` + tc.items.map(x => x.str).join(' ') + '\n\n';
    }
    if (text.replace(/\[Página \d+\]|\s/g, '').length < 40 * pdf.numPages) return pdfToImages(pdf, f.name);
  } else {
    text = await readOther(f);
  }
  if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS) + '\n[... recortado ...]';
  return { name: f.name, text };
}

async function addFiles(list) {
  for (const f of list) {
    try {
      for (const item of [].concat(await readFile(f))) {
        if ($('ragOn').checked && !item.image && item.text.length > RAG_MIN) await indexFile(item);
        pending.push(item);
      }
    } catch (e) { alert(f.name + ': ' + e.message); }
  }
  renderPending();
}

function renderPending() {
  $('attached').innerHTML = '';
  pending.forEach((f, i) => {
    const c = document.createElement('span');
    c.className = 'chip';
    c.innerHTML = ic(f.image ? 'image' : 'paperclip') + `<span>${esc(f.name)}${f.image ? '' : f.chunks ? ' (' + f.chunks.length + ' fragmentos)' : ' (' + Math.round(f.text.length / 1000) + 'k)'}</span>`;
    const x = document.createElement('b'); x.innerHTML = ic('x'); x.title = 'Quitar';
    x.onclick = () => { pending.splice(i, 1); renderPending(); };
    c.appendChild(x);
    $('attached').appendChild(c);
  });
}
const getChat = () => chats.find(c => c.id === current);
