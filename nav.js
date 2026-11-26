// Block-96 — навигация врагов: сетка проходимости + A* + спрямление пути.
// Без DOM и Math.random. Сетка — производные данные, в состояние мира не пишется.
'use strict';
(function () {
  const CELL = (window.WL_CONFIG && window.WL_CONFIG.BUILD_CELL_PX) || 20, CLEAR = 6; // размер клетки и запас от стен (радиус врага 11–12 + 1–2 px)

  function build(s) {
    if (s._nav) return s._nav;
    const gw = Math.ceil(s.map.w / CELL), gh = Math.ceil(s.map.h / CELL);
    const blocked = new Uint8Array(gw * gh);
    for (const w of s.map.walls) {
      const i0 = Math.max(0, Math.floor((w.x - CLEAR) / CELL)), i1 = Math.min(gw - 1, Math.floor((w.x + w.w + CLEAR) / CELL));
      const j0 = Math.max(0, Math.floor((w.y - CLEAR) / CELL)), j1 = Math.min(gh - 1, Math.floor((w.y + w.h + CLEAR) / CELL));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const cx = (i + 0.5) * CELL, cy = (j + 0.5) * CELL;
        if (cx > w.x - CLEAR && cx < w.x + w.w + CLEAR && cy > w.y - CLEAR && cy < w.y + w.h + CLEAR) blocked[j * gw + i] = 1;
      }
    }
    const n = gw * gh;
    const nav = { gw, gh, blocked, g: new Float32Array(n), par: new Int32Array(n), stamp: new Uint32Array(n), open: new Uint32Array(n), cur: 0, heap: [] };
    Object.defineProperty(s, '_nav', { value: nav, enumerable: false, writable: true });
    return nav;
  }

  const cellOf = (nav, x, y) => {
    const i = Math.max(0, Math.min(nav.gw - 1, Math.floor(x / CELL))), j = Math.max(0, Math.min(nav.gh - 1, Math.floor(y / CELL)));
    return j * nav.gw + i;
  };
  const cx = (nav, c) => ((c % nav.gw) + 0.5) * CELL, cy = (nav, c) => (Math.floor(c / nav.gw) + 0.5) * CELL;

  // ближайшая свободная клетка (спираль до радиуса 8)
  function snap(nav, x, y) {
    const c0 = cellOf(nav, x, y);
    if (!nav.blocked[c0]) return c0;
    const i0 = c0 % nav.gw, j0 = Math.floor(c0 / nav.gw);
    let best = -1, bd = 1e9;
    for (let r = 1; r <= 8 && best < 0; r++)
      for (let j = j0 - r; j <= j0 + r; j++) for (let i = i0 - r; i <= i0 + r; i++) {
        if (i < 0 || j < 0 || i >= nav.gw || j >= nav.gh || nav.blocked[j * nav.gw + i]) continue;
        const d = (i - i0) ** 2 + (j - j0) ** 2; if (d < bd) { bd = d; best = j * nav.gw + i; }
      }
    return best;
  }

  // бинарная куча по f
  function push(h, f, c) { h.push(f, c); let i = h.length / 2 - 1; while (i > 0) { const p = (i - 1) >> 1; if (h[p * 2] <= h[i * 2]) break; swap(h, p, i); i = p; } }
  function swap(h, a, b) { let t = h[a * 2]; h[a * 2] = h[b * 2]; h[b * 2] = t; t = h[a * 2 + 1]; h[a * 2 + 1] = h[b * 2 + 1]; h[b * 2 + 1] = t; }
  function pop(h) {
    const c = h[1], n = h.length / 2 - 1;
    h[0] = h[n * 2]; h[1] = h[n * 2 + 1]; h.length -= 2;
    let i = 0;
    for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < n && h[l * 2] < h[m * 2]) m = l; if (r < n && h[r * 2] < h[m * 2]) m = r; if (m === i) break; swap(h, i, m); i = m; }
    return c;
  }

  const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];

  // Возвращает массив точек [{x,y}] без стартовой, либо null. maxNodes ограничивает стоимость запроса.
  // free(x, y) — точная проверка «тут может стоять враг» (из sim), нужна для спрямления.
  function find(s, x0, y0, x1, y1, free, maxNodes) {
    const nav = build(s), start = snap(nav, x0, y0), goal = snap(nav, x1, y1);
    if (start < 0 || goal < 0) return null;
    if (start === goal) return [{ x: x1, y: y1 }];
    const gw = nav.gw, gx = goal % gw, gy = Math.floor(goal / gw);
    const stamp = ++nav.cur, h = nav.heap; h.length = 0;
    nav.g[start] = 0; nav.par[start] = -1; nav.stamp[start] = stamp; push(h, 0, start);
    let nodes = 0, found = false;
    while (h.length) {
      const c = pop(h);
      if (nav.open[c] === stamp) continue; nav.open[c] = stamp;
      if (c === goal) { found = true; break; }
      if (++nodes > (maxNodes || 6000)) break;
      const ci = c % gw, cj = (c - ci) / gw;
      for (const [dx, dy, cost] of DIRS) {
        const ni = ci + dx, nj = cj + dy;
        if (ni < 0 || nj < 0 || ni >= gw || nj >= nav.gh) continue;
        const n = nj * gw + ni; if (nav.blocked[n]) continue;
        if (dx && dy && (nav.blocked[cj * gw + ni] || nav.blocked[nj * gw + ci])) continue; // без срезания углов
        const g = nav.g[c] + cost;
        if (nav.stamp[n] === stamp && g >= nav.g[n]) continue;
        nav.stamp[n] = stamp; nav.g[n] = g; nav.par[n] = c;
        const ox = Math.abs(ni - gx), oy = Math.abs(nj - gy);
        push(h, g + (ox + oy) - 0.586 * Math.min(ox, oy), n);
      }
    }
    if (!found) return null;
    const raw = [];
    for (let c = goal; c >= 0 && c !== start; c = nav.par[c]) raw.push({ x: cx(nav, c), y: cy(nav, c) });
    raw.reverse(); raw[raw.length - 1] = { x: x1, y: y1 };
    if (!free(x1, y1)) raw.pop(); // цель внутри стены (труп у стены): остановиться у последней клетки
    return smooth(raw, x0, y0, free);
  }

  // Спрямление: из текущей точки прыгаем к самой дальней видимой (с проверкой клиренса).
  function smooth(raw, x0, y0, free) {
    const out = []; let px = x0, py = y0, i = 0;
    while (i < raw.length) {
      let j = Math.min(raw.length - 1, i + 14);
      while (j > i && !lineFree(px, py, raw[j].x, raw[j].y, free)) j--;
      out.push(raw[j]); px = raw[j].x; py = raw[j].y; i = j + 1;
    }
    return out;
  }

  function lineFree(x0, y0, x1, y1, free) {
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy), n = Math.ceil(len / 8);
    for (let k = 1; k <= n; k++) { const t = k / n; if (!free(x0 + dx * t, y0 + dy * t)) return false; }
    return true;
  }

  window.WL_NAV = { build, find, lineFree, snap, cellOf, CELL };
})();
