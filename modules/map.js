// Block-96: карта города (клавиша M). Схема всего города + координатная сетка (шаг 100 м),
// ЛКМ по схеме — крупный вид участка (как карта местности в Sacred), колесо — масштаб, перетаскивание — сдвиг.
// На игровом экране — постоянные координаты игрока в той же системе (метры от северо-западного угла карты, X вправо, Y вниз).
// Миникарты нет. Весь рисунок строится из window.B96_WORLD (векторные слои), картинки не нужны.
// Подключение: <script src="modules/map.js"></script> после enemies.js/start.js, до game.js. Опционально: WL_MAP.tick(s, p, active) из кадра.
(function () {
  'use strict';
  const Wd = window.B96_WORLD;
  if (!Wd) return; // старые уровни без карты 16 районов
  const K = Wd.mPerPx, UP = Wd.up || 4, VK = K / UP;         // вектор слоёв (1/UP пикселя карты) → метры
  const WM = Wd.w * K, HM = Wd.h * K;                          // размер города, м (≈2918×1946)
  const CH = Wd.chunk * K;                                     // сторона чанка слоёв, м
  const PX_PER_M = (window.WL_CONFIG && WL_CONFIG.PX_PER_M) || 10; // пикселей мира в метре

  const FAC = { admin: ['#2b6a86', 'Администрация'], coalition: ['#8a6a1e', 'Торговая коалиция'], gangs: ['#7a2a5a', 'Банды'], unclaimed: ['#3a3556', 'Не захвачены'] };
  const KIND_COL = { panel: '#5d5a73', house: '#4b4660', industrial: '#44505a', warehouse: '#4a4a52', shed: '#3d3a50', garage_row: '#3b4048' };

  // ---------- подготовка векторов (один раз) ----------
  let prep = null;
  function build() {
    if (prep) return prep;
    const layers = {}, bounds = (key) => { const [cx, cy] = key.split(',').map(Number); return { x0: cx * CH, y0: cy * CH, x1: (cx + 1) * CH, y1: (cy + 1) * CH }; };
    for (const name of ['park', 'water', 'road', 'rail']) {
      layers[name] = [];
      const src = Wd[name] || {};
      for (const key in src) {
        const path = new Path2D();
        for (const poly of src[key]) { for (let i = 0; i + 1 < poly.length; i += 2) { const x = poly[i] * VK, y = poly[i + 1] * VK; i ? path.lineTo(x, y) : path.moveTo(x, y); } path.closePath(); }
        layers[name].push(Object.assign(bounds(key), { path }));
      }
    }
    const blds = {};
    for (const b of Wd.buildings || []) { const k = Math.floor(b[0] / CH) + ',' + Math.floor(b[1] / CH); (blds[k] || (blds[k] = [])).push(b); }
    const dist = (Wd.districts || []).map((d) => { const path = new Path2D(); d.poly.forEach((q, i) => i ? path.lineTo(q[0], q[1]) : path.moveTo(q[0], q[1])); path.closePath(); return Object.assign({ path }, d); });
    return (prep = { layers, blds, dist });
  }
  const hit = (a, v) => a.x1 >= v.x0 && a.x0 <= v.x1 && a.y1 >= v.y0 && a.y0 <= v.y1;
  function inPoly(poly, x, y) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
  function districtAt(x, y) { for (const d of build().dist) if (inPoly(d.poly, x, y)) return d; return null; }
  function facOf(id) { try { const f = window.WL_ENEMIES && WL_ENEMIES.districtFaction ? WL_ENEMIES.districtFaction(id) : 'unclaimed'; return FAC[f] ? f : 'unclaimed'; } catch (e) { return 'unclaimed'; } }

  // ---------- отрисовка схемы/детального вида: v = {cx, cy (центр, м), sc (px/м), w, h (px)} ----------
  function paint(g, v, o) {
    const P = build(), sc = v.sc, x0 = v.cx - v.w / 2 / sc, y0 = v.cy - v.h / 2 / sc, vis = { x0, y0, x1: x0 + v.w / sc, y1: y0 + v.h / sc };
    g.save(); g.fillStyle = '#05050a'; g.fillRect(0, 0, v.w, v.h);
    g.translate(-x0 * sc, -y0 * sc); g.scale(sc, sc); g.lineJoin = 'round';
    const seam = 0.8 / sc; // тонкая обводка того же цвета скрывает швы между чанками
    g.fillStyle = '#15131f'; g.fillRect(0, 0, WM, HM); // подложка: между районами нет чёрных щелей
    for (const d of P.dist) { g.fillStyle = FAC[facOf(d.id)][0]; g.globalAlpha = o.detail ? 0.28 : 0.5; g.fill(d.path); }
    g.globalAlpha = 1; g.fillStyle = '#05050a'; g.save(); g.beginPath(); g.rect(0, 0, WM, HM); g.rect(-1e5, -1e5, 2e5, 2e5); g.clip('evenodd'); g.fillRect(-1e5, -1e5, 2e5, 2e5); g.restore(); // всё вне города — тьма
    const lay = (name, fill, stroke) => { g.fillStyle = fill; g.strokeStyle = stroke || fill; g.lineWidth = seam; for (const c of P.layers[name]) if (hit(c, vis)) { g.fill(c.path); g.stroke(c.path); } };
    lay('park', '#1f3a22'); lay('water', '#12365a'); lay('road', o.detail ? '#2b2a3c' : '#3b3a52'); lay('rail', '#7d6a3e');
    if (o.detail && sc >= 1.6) { // здания
      for (let cy = Math.floor(vis.y0 / CH); cy <= Math.floor(vis.y1 / CH); cy++) for (let cx = Math.floor(vis.x0 / CH); cx <= Math.floor(vis.x1 / CH); cx++) for (const b of P.blds[cx + ',' + cy] || []) {
        g.save(); g.translate(b[0], b[1]); g.rotate((b[6] || 0) * Math.PI / 180); g.fillStyle = KIND_COL[b[5]] || '#4b4660'; g.strokeStyle = '#8f88ad'; g.lineWidth = 0.5 / sc; g.fillRect(-b[2] / 2, -b[3] / 2, b[2], b[3]); if (sc >= 3) g.strokeRect(-b[2] / 2, -b[3] / 2, b[2], b[3]); g.restore();
      }
    }
    // границы районов
    g.lineWidth = (o.detail ? 1.2 : 1.6) / sc; g.strokeStyle = 'rgba(236,233,255,.55)'; g.setLineDash([6 / sc, 4 / sc]); for (const d of P.dist) g.stroke(d.path); g.setLineDash([]);
    // мосты, блокпосты
    g.lineCap = 'butt'; g.strokeStyle = '#c9b98a'; for (const b of Wd.bridges || []) { g.lineWidth = Math.max(b.w || 8, 3 / sc); g.beginPath(); g.moveTo(b.pts[0][0], b.pts[0][1]); for (let i = 1; i < b.pts.length; i++) g.lineTo(b.pts[i][0], b.pts[i][1]); g.stroke(); }
    g.restore();
    // сетка и подписи — в пикселях экрана
    grid(g, v, vis, o);
    // блокпосты, названия районов
    const X = (m) => (m - x0) * sc, Y = (m) => (m - y0) * sc;
    g.save(); g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const q of Wd.blockposts || []) { const x = X(q[0]), y = Y(q[1]); if (x < -20 || y < -20 || x > v.w + 20 || y > v.h + 20) continue; g.fillStyle = '#ff4d5e'; g.fillRect(x - 4, y - 4, 8, 8); if (o.detail) { g.fillStyle = '#ff4d5e'; g.font = '600 11px sans-serif'; g.fillText('БЛОКПОСТ', x, y - 12); } }
    for (const d of Wd.districts) {
      const x = X(d.anchor[0]), y = Y(d.anchor[1]); if (x < -150 || y < -40 || x > v.w + 150 || y > v.h + 40) continue;
      g.font = o.detail ? '700 15px sans-serif' : '700 ' + Math.max(10, Math.min(15, sc * 22)) + 'px sans-serif'; g.lineWidth = 3; g.strokeStyle = 'rgba(5,5,10,.9)'; g.fillStyle = '#ece9ff';
      const t = d.n + ' · ' + d.name.toUpperCase(); g.strokeText(t, x, y); g.fillText(t, x, y);
    }
    g.restore();
    if (o.you) marker(g, o.you.x, o.you.y, o.you.a, X, Y, o.detail);
    if (o.cursor && o.cursor.x != null) { g.save(); g.strokeStyle = 'rgba(61,242,255,.7)'; g.lineWidth = 1; g.setLineDash([3, 3]); const x = X(o.cursor.x), y = Y(o.cursor.y); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, v.h); g.moveTo(0, y); g.lineTo(v.w, y); g.stroke(); g.restore(); }
  }
  function marker(g, mx, my, ang, X, Y, big) {
    const x = X(mx), y = Y(my), r = big ? 11 : 8; g.save(); g.translate(x, y);
    g.fillStyle = 'rgba(182,255,61,.22)'; g.beginPath(); g.arc(0, 0, r * 2.2, 0, 7); g.fill();
    g.rotate(ang); g.fillStyle = '#b6ff3d'; g.strokeStyle = '#05050a'; g.lineWidth = 2; g.beginPath(); g.moveTo(r, 0); g.lineTo(-r * 0.8, r * 0.75); g.lineTo(-r * 0.4, 0); g.lineTo(-r * 0.8, -r * 0.75); g.closePath(); g.stroke(); g.fill();
    g.rotate(-ang); g.font = '700 12px sans-serif'; g.textAlign = 'center'; g.lineWidth = 3; g.strokeText('ВЫ', 0, -r * 1.9); g.fillStyle = '#b6ff3d'; g.fillText('ВЫ', 0, -r * 1.9); g.restore();
  }
  function grid(g, v, vis, o) {
    const sc = v.sc, steps = [10, 20, 50, 100, 200, 500], minor = steps.find((s) => s * sc >= (o.detail ? 22 : 38)) || 500, major = minor * (minor === 10 || minor === 50 || minor === 100 ? 5 : minor === 20 ? 5 : 5), lab = steps.find((s) => s * sc >= 58 && s % minor === 0) || major;
    g.save(); g.font = '600 11px ui-monospace, Consolas, monospace'; g.textBaseline = 'top';
    for (let m = Math.ceil(Math.max(0, vis.x0) / minor) * minor; m <= Math.min(WM, vis.x1); m += minor) { const x = Math.round((m - vis.x0) * sc) + 0.5, mj = m % major === 0; g.strokeStyle = mj ? 'rgba(61,242,255,.32)' : 'rgba(143,136,173,.14)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, Math.max(0, (0 - vis.y0) * sc)); g.lineTo(x, Math.min(v.h, (HM - vis.y0) * sc)); g.stroke(); if (m % lab === 0) { g.fillStyle = '#3df2ff'; g.textAlign = 'center'; g.fillText(String(m), x, 2); } }
    for (let m = Math.ceil(Math.max(0, vis.y0) / minor) * minor; m <= Math.min(HM, vis.y1); m += minor) { const y = Math.round((m - vis.y0) * sc) + 0.5, mj = m % major === 0; g.strokeStyle = mj ? 'rgba(61,242,255,.32)' : 'rgba(143,136,173,.14)'; g.lineWidth = 1; g.beginPath(); g.moveTo(Math.max(0, (0 - vis.x0) * sc), y); g.lineTo(Math.min(v.w, (WM - vis.x0) * sc), y); g.stroke(); if (m % lab === 0) { g.fillStyle = '#3df2ff'; g.textAlign = 'left'; g.fillText(String(m), 3, y + 2); } }
    g.strokeStyle = 'rgba(255,178,61,.8)'; g.lineWidth = 2; g.strokeRect((0 - vis.x0) * sc, (0 - vis.y0) * sc, WM * sc, HM * sc); g.restore();
  }

  // ---------- интерфейс ----------
  let me_, root, cv, g, hdr, hint, back, coord, open = false, mode = 'city', view = { cx: WM / 2, cy: HM / 2, sc: 0.4, w: 800, h: 600 }, fit = 0.4, cur = null, drag = null, dirty = true, last = null, lastDrawT = 0, ready = false;
  const css = `#b96map{position:fixed;inset:0;z-index:9;background:#05050a;display:grid;grid-template-rows:auto 1fr auto;font-family:var(--f-display,system-ui,sans-serif);color:#ece9ff;user-select:none}#b96map[hidden]{display:none}
#b96map header{display:flex;gap:14px;align-items:center;padding:8px 14px;border-bottom:1px solid #2b2442;background:rgba(13,10,22,.96);font-size:13px;flex-wrap:wrap}
#b96map header b{letter-spacing:.14em;color:#ffb23d}#b96map header .leg{display:flex;gap:10px;font-size:11px;color:#8f88ad}#b96map header .leg i{display:inline-block;width:10px;height:10px;margin-right:4px;vertical-align:-1px}
#b96map button{font:inherit;color:#3df2ff;background:rgba(61,242,255,.08);border:1px solid #3df2ff;padding:5px 12px;cursor:pointer}#b96map .sp{flex:1}
#b96map .cv{position:relative;min-height:0}#b96map canvas{position:absolute;inset:0;width:100%;height:100%;cursor:crosshair}
#b96map footer{padding:6px 14px;font-size:12px;color:#8f88ad;border-top:1px solid #2b2442;background:rgba(13,10,22,.96)}
#b96coord{position:fixed;top:calc(46px + env(safe-area-inset-top,0px));right:calc(14px + env(safe-area-inset-right,0px));z-index:2;pointer-events:none;font:600 12px var(--f-mono,ui-monospace,Consolas,monospace);color:#3df2ff;background:rgba(10,8,18,.7);border:1px solid #2b2442;padding:4px 10px;text-align:right;line-height:1.5;white-space:nowrap}#b96coord small{color:#8f88ad;font-weight:400}#b96coord[hidden]{display:none}`;
  function mount() {
    if (ready) return; ready = true;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    root = document.createElement('div'); root.id = 'b96map'; root.hidden = true;
    root.innerHTML = '<header><b>КАРТА ГОРОДА</b><span id="b96t"></span><span class="sp"></span><span class="leg">' + Object.values(FAC).map((f) => '<span><i style="background:' + f[0] + '"></i>' + f[1] + '</span>').join('') + '</span><button type="button" id="b96me" hidden>⌖ Где я</button><button type="button" id="b96back" hidden>← Вся карта</button><button type="button" id="b96x">Закрыть · M</button></header><div class="cv"><canvas></canvas></div><footer id="b96h"></footer>';
    document.body.appendChild(root);
    coord = document.createElement('div'); coord.id = 'b96coord'; coord.hidden = true; document.body.appendChild(coord);
    cv = root.querySelector('canvas'); g = cv.getContext('2d'); hdr = root.querySelector('#b96t'); hint = root.querySelector('#b96h'); back = root.querySelector('#b96back');
    root.querySelector('#b96x').onclick = close; me_ = root.querySelector('#b96me'); me_.onclick = () => { const m = you(); if (m) { toZoom(m.x, m.y); } }; back.onclick = toCity;
    cv.addEventListener('mousemove', (e) => { const m = toM(e); cur = m; if (drag) { if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 4) drag.moved = true; if (mode === 'zoom' && drag.moved) { view.cx = drag.cx - (e.clientX - drag.sx) / view.sc; view.cy = drag.cy - (e.clientY - drag.sy) / view.sc; clampView(); } } dirty = true; });
    cv.addEventListener('mouseleave', () => { cur = null; dirty = true; });
    cv.addEventListener('mousedown', (e) => { if (e.button === 0) drag = { sx: e.clientX, sy: e.clientY, cx: view.cx, cy: view.cy, moved: false }; });
    window.addEventListener('mouseup', (e) => { if (!drag || e.button !== 0) return; const d = drag; drag = null; if (!d.moved && open && mode === 'city') { const m = toM(e); if (m && m.x >= 0 && m.y >= 0 && m.x <= WM && m.y <= HM) toZoom(m.x, m.y); } });
    cv.addEventListener('contextmenu', (e) => { e.preventDefault(); if (mode === 'zoom') toCity(); else close(); });
    cv.addEventListener('wheel', (e) => { if (mode !== 'zoom') return; e.preventDefault(); const m = toM(e), f = e.deltaY < 0 ? 1.25 : 0.8, ns = Math.max(1.2, Math.min(16, view.sc * f)); view.cx = m.x - (m.x - view.cx) * view.sc / ns; view.cy = m.y - (m.y - view.cy) * view.sc / ns; view.sc = ns; clampView(); dirty = true; }, { passive: false });
    window.addEventListener('resize', () => { if (open) { size(); dirty = true; } });
    window.addEventListener('keydown', onKey, true);
  }
  function size() {
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = Math.max(2, Math.round(r.width * dpr)); cv.height = Math.max(2, Math.round(r.height * dpr)); view.w = r.width; view.h = r.height; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    fit = Math.min((view.w - 56) / WM, (view.h - 28) / HM); if (mode === 'city') { view.sc = fit; view.cx = WM / 2; view.cy = HM / 2; }
  }
  function toM(e) { const r = cv.getBoundingClientRect(); return { x: view.cx + (e.clientX - r.left - view.w / 2) / view.sc, y: view.cy + (e.clientY - r.top - view.h / 2) / view.sc }; }
  function clampView() { view.cx = Math.max(0, Math.min(WM, view.cx)); view.cy = Math.max(0, Math.min(HM, view.cy)); }
  function toZoom(x, y) { mode = 'zoom'; me_.hidden = false; view.cx = x; view.cy = y; view.sc = 4; clampView(); back.hidden = false; dirty = true; }
  function toCity() { mode = 'city'; back.hidden = true; me_.hidden = true; size(); dirty = true; }
  function openMap() { if (!active()) return; mount(); open = true; root.hidden = false; mode = 'city'; back.hidden = true; me_.hidden = true; size(); dirty = true; }
  function close() { if (!ready || !open) return; open = false; root.hidden = true; drag = null; try { document.getElementById('game').focus(); } catch (e) { /* без фокуса */ } }
  function toggle() { open ? close() : openMap(); }
  function onKey(e) {
    if (e.code === 'KeyM' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) { if (!open && !active()) return; e.stopImmediatePropagation(); e.preventDefault(); if (!e.repeat) toggle(); return; } // Shift+M — прежний «звук»
    if (!open) return;
    if (e.code === 'Escape' || e.code === 'Backspace') { e.stopImmediatePropagation(); e.preventDefault(); if (mode === 'zoom') toCity(); else close(); return; }
    if (mode === 'zoom' && (e.code === 'Equal' || e.code === 'NumpadAdd' || e.code === 'Minus' || e.code === 'NumpadSubtract')) { view.sc = Math.max(1.2, Math.min(16, view.sc * (e.code === 'Equal' || e.code === 'NumpadAdd' ? 1.25 : 0.8))); dirty = true; }
    if (!/^F\d+$/.test(e.code)) e.stopImmediatePropagation(); // пока карта открыта, игра не получает нажатий (отпускание клавиш доходит)
  }

  // ---------- состояние игры ----------
  let S = null, P = null, play = false;
  const active = () => !!(play && P && !P.dead && S && S.map && S.map.city);
  function you() { return P ? { x: P.x / PX_PER_M, y: P.y / PX_PER_M, a: Math.atan2((P.ay || P.y) - P.y, (P.ax || P.x + 1) - P.x) } : null; }
  function tick(s, p, activeFlag) {
    S = s; P = p; play = activeFlag !== false && !!(s && s.map && s.map.city) && !!p;
    if (!ready && !play) return; mount();
    if (!play) { coord.hidden = true; if (open) close(); return; }
    if (p.dead && open) close();
    const me = you(), now = performance.now(); coord.hidden = !!p.dead;
    if (now - lastDrawT > 100) {
      lastDrawT = now; const d = districtAt(me.x, me.y), gx = Math.floor(me.x / 100) + 1, gy = Math.floor(me.y / 100) + 1;
      coord.innerHTML = 'X ' + String(Math.round(me.x)).padStart(4, '0') + ' · Y ' + String(Math.round(me.y)).padStart(4, '0') + ' м<br><small>кв. ' + gx + '-' + gy + ' · ' + (d ? d.name : 'вне районов') + ' · [M] карта</small>';
      if (open) dirty = true;
    }
    if (open && dirty) render();
  }
  function render() {
    dirty = false; const me = you(), o = { detail: mode === 'zoom', you: me, cursor: cur };
    paint(g, view, o);
    const d = cur ? districtAt(cur.x, cur.y) : null, inside = cur && cur.x >= 0 && cur.y >= 0 && cur.x <= WM && cur.y <= HM;
    hdr.textContent = mode === 'zoom' ? 'участок · масштаб ' + view.sc.toFixed(1) + ' пикс/м' : 'вся схема · сетка 100 м';
    const dd = inside ? Math.round(Math.hypot(cur.x - me.x, cur.y - me.y)) : 0;
    hint.textContent = (inside ? 'Курсор: X ' + Math.round(cur.x) + ' · Y ' + Math.round(cur.y) + ' м · ' + (d ? d.name : 'вне районов') + ' · от вас ' + dd + ' м   |   ' : '') + (mode === 'city' ? 'ЛКМ — приблизить участок · ПКМ / Esc / M — закрыть' : 'колесо — масштаб · перетаскивание — сдвиг · ПКМ / Esc — вся карта');
  }
  // запасное подключение без правок game.js: читает состояние из WL_DEBUG, пока никто не вызывает tick()
  let ticked = 0;
  const _tick = tick; const wrapped = (s, p, a) => { ticked = performance.now(); _tick(s, p, a); };
  function poll() { requestAnimationFrame(poll); if (performance.now() - ticked < 500) return; const D = window.WL_DEBUG; if (!D || !D.s) return; const s = D.s, p = s.players && s.players.p1; const screens = document.querySelector('.screen:not([hidden])'); _tick(s, p, !screens && !!(s.map && s.map.city)); }
  requestAnimationFrame(poll);

  window.WL_MAP = { tick: wrapped, toggle, open: openMap, close, isOpen: () => open, toWorld: (x, y) => ({ x: x / PX_PER_M, y: y / PX_PER_M }), size: { w: WM, h: HM }, districtAt: (x, y) => { const d = districtAt(x, y); return d ? d.id : null; } };
})();
