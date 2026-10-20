// Motor de traducción: usa LANGS y TR de translations.js, traduce el DOM, alert/confirm/prompt y lo que la app vaya añadiendo.
let LANG = localStorage.getItem('lang') || 'es';
// Claves con {0}, {1}… se comparan como patrones (las más largas primero)
const PATS = Object.keys(TR).filter(k => k.includes('{')).sort((a, b) => b.length - a.length)
  .map(k => ({ k, re: new RegExp('^' + k.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{\d\}/g, '(.+?)') + '$') }));

function t(s) {
  if (LANG === 'es' || typeof s !== 'string') return s;
  const i = LANGS.indexOf(LANG) - 1;
  if (TR[s]) return TR[s][i];
  for (const p of PATS) {
    const m = s.match(p.re);
    if (m) return TR[p.k][i].replace(/\{(\d)\}/g, (_, n) => t(m[+n + 1]));
  }
  return s;
}

// alert / confirm / prompt también salen traducidos
const _alert = window.alert.bind(window), _confirm = window.confirm.bind(window), _prompt = window.prompt.bind(window);
window.alert = m => _alert(t(m));
window.confirm = m => _confirm(t(m));
window.prompt = (m, d) => _prompt(t(m), d);

// Traduce el DOM (texto y atributos) y todo lo que la app vaya añadiendo; recuerda el texto original en español
const memo = new WeakMap();
const ATTRS = ['placeholder', 'title', 'aria-label', 'label'];
const skipNode = n => {
  const p = n.parentElement;
  if (!p) return true;
  if (p.closest('summary,.cpy,.edit,.empty,.role,.cf-meta,.cf-open')) return false;
  return !!p.closest('.bubble,#chats,.memrow,textarea,script,style');
};
function trText(n) {
  if (skipNode(n)) return;
  const v = n.nodeValue;
  if (!v.trim()) return;
  let r = memo.get(n);
  if (!r || r.out !== v) r = { es: v };
  r.out = v.match(/^\s*/)[0] + t(r.es.trim()) + v.match(/\s*$/)[0];
  memo.set(n, r);
  if (r.out !== v) n.nodeValue = r.out;
}
function trAttr(el, a) {
  const v = el.getAttribute(a);
  if (!v) return;
  let m = memo.get(el); if (!m) memo.set(el, m = {});
  let r = m[a];
  if (!r || r.out !== v) r = { es: v };
  r.out = t(r.es); m[a] = r;
  if (r.out !== v) el.setAttribute(a, r.out);
}
function walk(root) {
  if (root.nodeType === 3) return trText(root);
  if (root.nodeType !== 1) return;
  [root, ...root.querySelectorAll('[placeholder],[title],[aria-label],optgroup[label]')].forEach(el => ATTRS.forEach(a => el.hasAttribute(a) && trAttr(el, a)));
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n; while ((n = w.nextNode())) trText(n);
}
const langObserver = new MutationObserver(ms => ms.forEach(m => {
  if (m.type === 'characterData') trText(m.target);
  else if (m.type === 'attributes') trAttr(m.target, m.attributeName);
  else m.addedNodes.forEach(walk);
}));

function setLang(l) {
  LANG = l; localStorage.setItem('lang', l);
  document.documentElement.lang = l;
  trTitle();
  walk(document.body);
  document.dispatchEvent(new CustomEvent('langchange', { detail: l }));
}
// Si cambias el idioma en otra pestaña (chat, imágenes, claves), esta se actualiza sola
window.addEventListener('storage', e => {
  if (e.key !== 'lang' || !e.newValue || e.newValue === LANG) return;
  if (langSel) langSel.value = e.newValue;
  setLang(e.newValue);
});
// El <title> está en <head>, fuera del alcance de walk(): se traduce aparte, recordando el original en español
const TITLE_ES = document.title;
const trTitle = () => { document.title = t(TITLE_ES); };

// El selector de idioma existe en cada página (id="lang"); el idioma elegido se comparte entre todas vía localStorage
const langSel = document.getElementById('lang');
if (langSel) {
  langSel.value = LANG;
  langSel.onchange = () => setLang(langSel.value);
}
document.documentElement.lang = LANG;
trTitle();
walk(document.body);
langObserver.observe(document.body, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ATTRS });