/* Safe DOM helpers (WL_DOM). Rule: data never reaches innerHTML as a plain string.
 *  html`<b>${x}</b>` — tagged template: every interpolated value is escaped, nested html`` fragments and arrays of them pass through.
 *  setHtml(el, frag) — the only sanctioned innerHTML writer; a plain string is escaped (shown as text), never parsed.
 *  h(tag, attrs, ...children) — element builder using createElement / textContent.
 * tests/dom-save.test.js scans the sources and fails on any other innerHTML assignment. */
(function (root) {
  'use strict';
  class Safe { constructor(s) { this.s = s; } toString() { return this.s; } }
  const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"'`]/g, (c) => MAP[c]);
  const part = (v) => (v instanceof Safe ? v.s : Array.isArray(v) ? v.map(part).join('') : esc(v));
  function html(strs, ...vals) { let o = strs[0]; for (let i = 0; i < vals.length; i++) o += part(vals[i]) + strs[i + 1]; return new Safe(o); }
  const trusted = (s) => new Safe(String(s)); // только для литералов, написанных в коде (не для данных)
  function setHtml(el, frag) { el.innerHTML = frag instanceof Safe ? frag.s : esc(frag); }
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const k of Object.keys(attrs)) { const v = attrs[k]; if (v == null || v === false) continue; if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v); else el.setAttribute(k, v === true ? '' : v); }
    for (const c of kids.flat()) if (c != null && c !== false) el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    return el;
  }
  const API = { esc, html, trusted, setHtml, h, Safe };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.WL_DOM = API;
})(typeof window !== 'undefined' ? window : globalThis);
