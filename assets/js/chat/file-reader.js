// Lectura de cualquier archivo: texto/código, Office, hojas de cálculo, zip, epub, ipynb, gz...
// (script clásico: comparte ámbito global con el resto de assets/js/chat/; el orden de carga está en index.html)

// ---- Lectura de cualquier archivo legible: texto/código, Office, hojas de cálculo, zip, epub... ----
const NO_LEER = ['exe', 'dll', 'bin', 'iso', 'dmg', 'apk', 'msi', 'so', 'mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'mp4', 'mkv', 'avi', 'mov', 'webm', '7z', 'rar', 'tar', 'bz2', 'xz', 'psd', 'dwg'];
const hasUtf16Bom = b => b.length > 1 && ((b[0] === 0xFF && b[1] === 0xFE) || (b[0] === 0xFE && b[1] === 0xFF));
const looksBinary = b => {
  if (hasUtf16Bom(b)) return false; // UTF-16 (p. ej. .reg, .csv de Excel, logs de Windows) lleva ceros pero es texto
  const n = Math.min(b.length, 8000); let bad = 0;
  for (let i = 0; i < n; i++) { const c = b[i]; if (c === 0) return true; if (c < 9 || (c > 13 && c < 32)) bad++; }
  return n > 0 && bad / n > 0.05;
};
const decodeBytes = b => {
  if (hasUtf16Bom(b)) return new TextDecoder(b[0] === 0xFF ? 'utf-16le' : 'utf-16be').decode(b);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch (e) { return new TextDecoder('windows-1252').decode(b); } };
const xmlText = (x, brk) => x.replace(new RegExp(brk, 'g'), '\n').replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

async function readOther(f) {
  const ext = f.name.split('.').pop().toLowerCase();
  if (f.size > 50e6) throw new Error(t('El archivo supera los 50 MB'));
  if (/^(audio|video)\//.test(f.type) || NO_LEER.includes(ext)) throw new Error(t('Este tipo de archivo no se puede leer (audio, vídeo, programa o comprimido)'));
  if (['doc', 'ppt'].includes(ext)) throw new Error(t('Los .doc y .ppt antiguos no se pueden leer: guárdalo como .docx / .pptx'));
  const buf = await f.arrayBuffer();
  if (['xlsx', 'xlsm', 'xlsb', 'xls', 'ods'].includes(ext)) {
    if (!window.XLSX) throw new Error('SheetJS no cargó (¿sin internet?)');
    const wb = XLSX.read(buf);
    return wb.SheetNames.map(n => `[Sheet: ${n}]\n` + XLSX.utils.sheet_to_csv(wb.Sheets[n])).join('\n\n');
  }
  if (['docx', 'pptx', 'odt', 'odp', 'epub', 'zip'].includes(ext)) {
    if (!window.JSZip) throw new Error('JSZip no cargó (¿sin internet?)');
    const z = await JSZip.loadAsync(buf);
    const get = n => z.file(n) ? z.file(n).async('string') : Promise.resolve('');
    if (ext === 'docx') return xmlText((await get('word/document.xml')).replace(/<w:tab\/>/g, '\t'), '</w:p>');
    if (ext === 'odt' || ext === 'odp') return xmlText(await get('content.xml'), '</text:p>|</text:h>');
    let out = '';
    if (ext === 'pptx') {
      const names = Object.keys(z.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => a.match(/\d+/)[0] - b.match(/\d+/)[0]);
      for (const [i, n] of names.entries()) out += `[Slide ${i + 1}]\n` + xmlText(await get(n), '</a:p>') + '\n\n';
      return out;
    }
    for (const [n, e] of Object.entries(z.files)) {
      if (e.dir || (ext === 'epub' && !/\.(x?html?)$/i.test(n))) continue;
      const b = await e.async('uint8array');
      if (ext === 'epub') out += xmlText(decodeBytes(b), '</p>|</h\\d>|<br\\s*/?>') + '\n\n';
      else out += b.length < 200000 && !looksBinary(b) ? `\n=== ${n} ===\n${decodeBytes(b)}` : `\n=== ${n} === (${b.length} bytes, binary)`;
      if (out.length > MAX_CHARS) break;
    }
    return out;
  }
  let b = new Uint8Array(buf);
  if (ext === 'gz') { // .log.gz, .json.gz, etc.: se descomprime y se lee como texto
    if (!window.DecompressionStream) throw new Error(t('Este navegador no puede descomprimir .gz'));
    b = new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  }
  if (looksBinary(b)) throw new Error(t('No parece un archivo de texto legible'));
  const txt = decodeBytes(b);
  if (ext === 'ipynb') { // Jupyter Notebook: celdas de texto, código y salidas de texto
    try {
      const nb = JSON.parse(txt);
      const src = c => Array.isArray(c) ? c.join('') : (c || '');
      return (nb.cells || []).map((c, i) => {
        if (c.cell_type !== 'code') return `[Celda ${i + 1} · ${c.cell_type}]\n${src(c.source)}`;
        const outs = (c.outputs || []).map(o => src(o.text) || src(o.data?.['text/plain']) || (o.ename ? `${o.ename}: ${o.evalue}` : '')).filter(Boolean).join('\n');
        return `[Celda ${i + 1} · código]\n\`\`\`\n${src(c.source)}\n\`\`\`` + (outs ? `\n[Salida]\n${outs}` : '');
      }).join('\n\n');
    } catch (e) { return txt; }
  }
  if (ext === 'eml') return txt; // correo: cabeceras y cuerpo ya son texto
  return ext === 'rtf' ? txt.replace(/\\par[d]?/g, '\n').replace(/\\'[0-9a-f]{2}/gi, '').replace(/\\[a-z]+-?\d* ?/gi, '').replace(/[{}]/g, '') : txt;
}
