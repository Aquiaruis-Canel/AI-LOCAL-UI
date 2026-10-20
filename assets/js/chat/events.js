// Eventos del pie: enviar, adjuntar, pegar, arrastrar archivos
// (script clásico: comparte ámbito global con el resto de assets/js/chat/; el orden de carga está en index.html)

// ---- Eventos del pie y ajustes ----
$('send').onclick = () => send();
$('visionModel').onchange = () => localStorage.setItem('visionModel', $('visionModel').value);
$('pdfPages').value = localStorage.getItem('pdfPages') || 8;
$('pdfPages').onchange = () => localStorage.setItem('pdfPages', $('pdfPages').value);
$('genToggle').onclick = () => {
  genMode = !genMode;
  $('genToggle').classList.toggle('on', genMode);
  $('genopts').style.display = genMode ? 'flex' : 'none';
  $('input').placeholder = genMode ? 'Describe la imagen que quieres generar…' : 'Escribe un mensaje… (Enter envía, Shift+Enter nueva línea)';
  if (!controller) $('send').textContent = genMode ? 'Generar' : 'Enviar';
};
$('mode').value = localStorage.getItem('mode') || 'razonar';
$('mode').onchange = applyMode;
applyMode();
// Ctrl+V: pega capturas o archivos copiados directamente
document.addEventListener('paste', e => {
  const files = [...(e.clipboardData?.files || [])];
  if (files.length) { e.preventDefault(); addFiles(files); }
});
$('attach').onclick = () => $('fileInput').click();
$('fileInput').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
const foot = document.querySelector('footer');
foot.addEventListener('dragover', e => { e.preventDefault(); foot.classList.add('drag'); });
foot.addEventListener('dragleave', () => foot.classList.remove('drag'));
foot.addEventListener('drop', e => { e.preventDefault(); foot.classList.remove('drag'); addFiles([...e.dataTransfer.files]); });
$('input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});
$('input').addEventListener('input', e => {
  e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px';
});
