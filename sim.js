// Block-96 — симуляция. Без DOM и без Math.random: всё состояние в объекте `s`,
// случайность — из сида в s.rng. Сервер в будущем гоняет тот же step(), клиенты шлют команды.
'use strict';
(function () {
  const C = window.WL_CONFIG;
  const D2R = Math.PI / 180;
  const WT = 18; // толщина стен

  // ---------- RNG ----------
  function rnd(s) {
    s.rng = (s.rng + 0x6D2B79F5) | 0;
    let t = s.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const rr = (s, a, b) => a + (b - a) * rnd(s);
  const ri = (s, a, b) => Math.floor(rr(s, a, b + 1));
  const pick = (s, a) => a[Math.floor(rnd(s) * a.length)];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // ---------- геометрия ----------
  function segAABB(x0, y0, x1, y1, r, pad) {
    const rx = r.x - pad, ry = r.y - pad, rw = r.w + pad * 2, rh = r.h + pad * 2;
    const dx = x1 - x0, dy = y1 - y0;
    let tmin = 0, tmax = 1;
    if (Math.abs(dx) < 1e-9) { if (x0 < rx || x0 > rx + rw) return -1; }
    else { let t1 = (rx - x0) / dx, t2 = (rx + rw - x0) / dx; if (t1 > t2) { const q = t1; t1 = t2; t2 = q; } tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); if (tmin > tmax) return -1; }
    if (Math.abs(dy) < 1e-9) { if (y0 < ry || y0 > ry + rh) return -1; }
    else { let t1 = (ry - y0) / dy, t2 = (ry + rh - y0) / dy; if (t1 > t2) { const q = t1; t1 = t2; t2 = q; } tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); if (tmin > tmax) return -1; }
    return tmin;
  }
  function segCircle(x0, y0, x1, y1, cx, cy, r) {
    const dx = x1 - x0, dy = y1 - y0, fx = x0 - cx, fy = y0 - cy;
    const a = dx * dx + dy * dy, b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - r * r;
    if (c <= 0) return 0;
    const disc = b * b - 4 * a * c; if (disc < 0 || a === 0) return -1;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    return t >= 0 && t <= 1 ? t : -1;
  }

  // ---------- сетка стен (производное, не сериализуется) ----------
  const CELL = 160;
  function grid(s) {
    if (s._grid) return s._grid;
    const g = new Map();
    s.map.walls.forEach((w, i) => {
      for (let cx = Math.floor(w.x / CELL); cx <= Math.floor((w.x + w.w) / CELL); cx++)
        for (let cy = Math.floor(w.y / CELL); cy <= Math.floor((w.y + w.h) / CELL); cy++) {
          const k = cx + ',' + cy; if (!g.has(k)) g.set(k, []); g.get(k).push(i);
        }
    });
    Object.defineProperty(s, '_grid', { value: g, enumerable: false, writable: true, configurable: true });
    return g;
  }
  function wallsNear(s, x0, y0, x1, y1) {
    const g = grid(s), out = [], seen = grid.seen && grid.seen.length >= s.map.walls.length ? grid.seen : (grid.seen = new Uint32Array(s.map.walls.length + 64)); grid.stamp = ((grid.stamp || 0) + 1) >>> 0; if (!grid.stamp) { seen.fill(0); grid.stamp = 1; }
    const st = grid.stamp;
    for (let cx = Math.floor(Math.min(x0, x1) / CELL); cx <= Math.floor(Math.max(x0, x1) / CELL); cx++)
      for (let cy = Math.floor(Math.min(y0, y1) / CELL); cy <= Math.floor(Math.max(y0, y1) / CELL); cy++) {
        const l = g.get(cx + ',' + cy); if (l) for (const i of l) if (seen[i] !== st) { seen[i] = st; out.push(s.map.walls[i]); }
      }
    return out;
  }
  function rayWall(s, x0, y0, x1, y1) {
    let best = -1;
    for (const w of wallsNear(s, x0, y0, x1, y1)) {
      if (w.low) continue; // низкие укрытия не блокируют обзор
      const t = segAABB(x0, y0, x1, y1, w, 0);
      if (t >= 0 && (best < 0 || t < best)) best = t;
    }
    return best;
  }
  function rayWallAll(s, x0, y0, x1, y1) {
    let best = -1;
    for (const w of wallsNear(s, x0, y0, x1, y1)) {
      if (w.fly) continue; // пули летят над водой
      const t = segAABB(x0, y0, x1, y1, w, 0);
      if (t >= 0 && (best < 0 || t < best)) best = t;
    }
    return best;
  }
  const los = (s, a, b) => rayWall(s, a.x, a.y, b.x, b.y) < 0;

  function collide(s, e) {
    for (let it = 0; it < 2; it++)
      for (const w of wallsNear(s, e.x - e.r, e.y - e.r, e.x + e.r, e.y + e.r)) {
        const cx = clamp(e.x, w.x, w.x + w.w), cy = clamp(e.y, w.y, w.y + w.h);
        const dx = e.x - cx, dy = e.y - cy, d2 = dx * dx + dy * dy;
        if (d2 >= e.r * e.r) continue;
        if (d2 > 1e-6) { const d = Math.sqrt(d2), p = e.r - d; e.x += dx / d * p; e.y += dy / d * p; }
        else {
          const l = e.x - w.x, r = w.x + w.w - e.x, t = e.y - w.y, b = w.y + w.h - e.y, m = Math.min(l, r, t, b);
          if (m === l) e.x = w.x - e.r; else if (m === r) e.x = w.x + w.w + e.r; else if (m === t) e.y = w.y - e.r; else e.y = w.y + w.h + e.r;
        }
      }
  }
  function freeSpot(s, x, y, r) {
    for (const w of wallsNear(s, x - r, y - r, x + r, y + r))
      if (x + r > w.x && x - r < w.x + w.w && y + r > w.y && y - r < w.y + w.h) return false;
    return x > r && y > r && x < s.map.w - r && y < s.map.h - r;
  }

  // ---------- карта ----------
  // Названия зданий и редкие неоновые вывески (кириллица, быт нулевых): только метки, на геймплей не влияют.
  const NAMES = ['ДОМ 08', 'ТЭЦ-2', 'ГАРАЖИ', 'ДЕПО', 'ДОМ 14', 'СКЛАД 3', 'ШКОЛА 41', 'КОТЕЛЬНАЯ', 'ДОМ 22', 'ПОЧТА', 'ПРОХОДНАЯ', 'ДОМ 31', 'МАСТЕРСКАЯ', 'ДОМ 05', 'БАЗА ОВОЩНАЯ', 'АТС'];
  const SIGNS = ['', 'ЧАЙ 24', '', '', 'АПТЕКА', '', '', '', 'ПИВО', '', 'РЕМОНТ', '', '', 'ВОДА', '', ''];
  function genMap(s) {
    const M = C.MAP, walls = [], blds = [], cont = [];
    const add = (x, y, w, h, kind, col, extra) => walls.push(Object.assign({ x, y, w, h, kind, col }, extra || {}));
    add(-60, -60, M.w + 120, 60, 'border'); add(-60, M.h, M.w + 120, 60, 'border');
    add(-60, 0, 60, M.h, 'border'); add(M.w, 0, 60, M.h, 'border');
    s.map = { w: M.w, h: M.h, walls, blds, spawn: { x: 240, y: M.h / 2 } };
    const sp = s.map.spawn, cols = ['#6e6cff', '#5a8cff', '#ffb36b'];
    const side = (x, y, len, horiz, door, col) => {
      const D = 66;
      if (!door) return horiz ? add(x, y, len, WT, 'wall', col) : add(x, y, WT, len, 'wall', col);
      const p = rr(s, 30, len - 30 - D);
      if (horiz) { add(x, y, p, WT, 'wall', col); add(x + p + D, y, len - p - D, WT, 'wall', col); }
      else { add(x, y, WT, p, 'wall', col); add(x, y + p + D, WT, len - p - D, 'wall', col); }
    };
    let tries = 0;
    while (blds.length < M.buildings && tries++ < 800) {
      const w = ri(s, 220, 440), h = ri(s, 170, 320), x = ri(s, 140, M.w - 140 - w), y = ri(s, 140, M.h - 140 - h);
      if (x < sp.x + 260 && x + w > sp.x - 260 && y < sp.y + 260 && y + h > sp.y - 260) continue;
      if (blds.some(b => x < b.x + b.w + 120 && x + w + 120 > b.x && y < b.y + b.h + 120 && y + h + 120 > b.y)) continue;
      const col = pick(s, cols); blds.push({ x, y, w, h, col, name: NAMES[blds.length % NAMES.length], sign: SIGNS[blds.length % SIGNS.length] });
      const doors = new Set([ri(s, 0, 3)]); if (rnd(s) < 0.6) doors.add(ri(s, 0, 3));
      side(x, y, w, true, doors.has(0), col);
      side(x, y + h - WT, w, true, doors.has(2), col);
      side(x, y + WT, h - 2 * WT, false, doors.has(3), col);
      side(x + w - WT, y + WT, h - 2 * WT, false, doors.has(1), col);
      if (w > 330 && rnd(s) < 0.7) side(x + Math.round(w / 2), y + WT, h - 2 * WT, false, true, col);
    }
    // ворота эвакуации: у восточного края, вдали от старта
    let gate = null;
    for (let t = 0; t < 500 && !gate; t++) {
      const x = ri(s, M.w - 520, M.w - 150), y = ri(s, 200, M.h - 200);
      if (freeSpot(s, x, y, 80) && !blds.some(b => x > b.x - 110 && x < b.x + b.w + 110 && y > b.y - 110 && y < b.y + b.h + 110)) gate = { x, y, r: 48 };
    }
    if (!gate) gate = { x: M.w - 200, y: 200, r: 48 };
    s.map.gate = gate;
    // узлы ОСИ (links.json): точки входа/выхода. n0 открыт с начала, остальные открываются первым касанием (удерживать E).
    const nodes = [{ id: 'n0', name: 'Подвал клиники', x: sp.x, y: sp.y, r: 40, open: true }];
    [['n1', 'Пригород', 0.45, 0.12, 0.2], ['n2', 'Подстанция', 0.6, 0.62, 0.38]].forEach(([id, name, fx, fy]) => {
      let q = null;
      for (let t = 0; t < 400 && !q; t++) { const x = ri(s, M.w * fx - 300, M.w * fx + 300), y = ri(s, M.h * fy + 60, M.h * fy + 500); if (freeSpot(s, x, y, 60) && Math.hypot(x - gate.x, y - gate.y) > 400) q = { x, y }; }
      nodes.push({ id, name, x: (q || { x: M.w * fx }).x, y: (q || { y: M.h * (fy + 0.1) }).y, r: 40, open: false });
    });
    s.map.nodes = nodes;
    const place = (n, fw, fh, kind, extra) => {
      let k = 0, t = 0;
      while (k < n && t++ < n * 60) {
        const vert = rnd(s) < 0.5, w = vert ? fh : fw, h = vert ? fw : fh;
        const x = ri(s, 80, M.w - 80 - w), y = ri(s, 80, M.h - 80 - h);
        if (Math.hypot(x - sp.x, y - sp.y) < 200 || Math.hypot(x + fw / 2 - gate.x, y + fh / 2 - gate.y) < 110) continue;
        if (blds.some(b => x < b.x + b.w + 30 && x + w + 30 > b.x && y < b.y + b.h + 30 && y + h + 30 > b.y)) continue;
        if (walls.some(q => x < q.x + q.w + 40 && x + w + 40 > q.x && y < q.y + q.h + 40 && y + h + 40 > q.y)) continue;
        add(x, y, w, h, kind, null, extra); k++;
      }
    };
    place(M.cars, 76, 36, 'car', { low: true });
    place(M.blocks, 44, 20, 'block', { low: true });
    place(34, 10, 10, 'lamp', { low: true });
    place(46, 16, 16, 'tree', { low: true });
    for (let i = 0; i < 6; i++) { // опоры ЛЭП цепочкой с запада на восток
      for (let t = 0; t < 6; t++) {
        const x = 220 + i * 540 + ri(s, -30, 30), y = 440 + ri(s, -60, 60) + (t ? ri(s, -180, 180) : 0);
        if (x < 60 || x > M.w - 80 || y < 80 || y > M.h - 80) continue;
        if (walls.some(q => x < q.x + q.w + 24 && x + 18 > q.x - 24 && y < q.y + q.h + 24 && y + 18 > q.y - 24)) continue;
        if (blds.some(b => x < b.x + b.w + 30 && x + 18 > b.x - 30 && y < b.y + b.h + 30 && y + 18 > b.y - 30)) continue;
        add(x, y, 18, 18, 'pylon', null, { low: true }); break;
      }
    }
    delete s._grid;
    // контейнеры
    for (const b of blds) {
      const n = ri(s, 1, 3);
      for (let i = 0; i < n; i++) for (let t = 0; t < 30; t++) {
        const x = rr(s, b.x + 40, b.x + b.w - 40), y = rr(s, b.y + 40, b.y + b.h - 40);
        if (freeSpot(s, x, y, 16)) { cont.push(mkCont(s, rnd(s) < 0.5 ? 'locker' : 'crate', x, y)); break; }
      }
    }
    for (const w of walls) if (w.kind === 'car') {
      const x = w.w > w.h ? w.x + w.w / 2 : w.x - 18, y = w.w > w.h ? w.y - 18 : w.y + w.h / 2;
      if (freeSpot(s, x, y, 10)) cont.push(mkCont(s, 'car', x, y, w));
    }
    for (let k = 0, t = 0; k < M.crates && t < 600; t++) {
      const x = rr(s, 80, M.w - 80), y = rr(s, 80, M.h - 80);
      if (Math.hypot(x - sp.x, y - sp.y) < 160 || !freeSpot(s, x, y, 18)) continue;
      cont.push(mkCont(s, 'crate', x, y)); k++;
    }
    // стартовый ящик рядом со спавном
    cont.push(mkCont(s, 'crate', sp.x + 70, sp.y - 40));
    // ключ эвакуации лежит в одном случайном контейнере вдали от старта
    const far = cont.filter(c => Math.hypot(c.x - sp.x, c.y - sp.y) > 700 && Math.hypot(c.x - gate.x, c.y - gate.y) > 160);
    if (far.length) pick(s, far).key = true; else cont[cont.length - 1].key = true;
    s.containers = cont;
  }

  // ---------- город Pavlov Yar (данные уровня window.B96_LEVEL, метры → пиксели) ----------
  function polyRows(poly, step, fn) { // растеризация полигона строками высотой step: fn(yTop, xa, xb)
    let y0 = Infinity, y1 = -Infinity; for (const p of poly) { if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
    for (let y = Math.floor(y0 / step) * step; y < y1; y += step) {
      const yc = y + step / 2, xs = [];
      for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; if ((a.y <= yc && b.y > yc) || (b.y <= yc && a.y > yc)) xs.push(a.x + (yc - a.y) / (b.y - a.y) * (b.x - a.x)); }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) fn(y, xs[k], xs[k + 1]);
    }
  }
  function inPoly(x, y, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) c = !c; }
    return c;
  }
  function distSeg(px, py, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy, t = l2 ? clamp(((px - a.x) * dx + (py - a.y) * dy) / l2, 0, 1) : 0;
    return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
  }
  function canReachInterior(s, p, c) { // контейнер внутри здания не обыскать снаружи, даже через стену (идея из архива «скрытые интерьеры»)
    if (c.inb == null) return true; const CT = s.map.city, b = CT && (CT.buildings[c.inb] && CT.buildings[c.inb].id === c.inb ? CT.buildings[c.inb] : CT.buildings.find(q => q.id === c.inb)); return !!(b && b.inner && inPoly(p.x, p.y, b.inner));
  }
  function zoneAt(s, x, y) { // название района/зоны для HUD
    const zg = s.map.zoneGrid; if (zg) { const i = zg.data[Math.min(zg.h - 1, Math.max(0, Math.floor(y / (zg.MP)))) * zg.w + Math.min(zg.w - 1, Math.max(0, Math.floor(x / zg.MP)))]; return (s.map.zones || []).find(z => z.n === i) || null; }
    for (const z of s.map.zones || []) if (inPoly(x, y, z.poly)) return z;
    return null;
  }
  const hsh01 = (n) => { let h = Math.imul(n | 0, 374761393); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  function mergeLevel(L0, E) { // Pavlov Yar + соседние районы в одной рамке; сдвиг SH делает все координаты положительными
    const SH = E ? [450, 250] : [0, 0], sh = (p) => [p[0] + SH[0], p[1] + SH[1]], shp = (a) => a.map(sh), shr = (r) => ({ w: r.w, type: r.type, pts: shp(r.pts) });
    const X = E || { water: [], districts: [], parks: [], roads: [], streets: [], bridges: [], railways: [], zones: [], buildings: [] };
    return {
      shift: SH, size: E ? [1000, 880] : L0.size, spawn: sh(L0.spawn),
      water: L0.water.concat(X.water).map(shp), district: [L0.district].concat(X.districts).map(shp), parks: L0.parks.concat(X.parks).map(shp),
      roads: L0.roads.concat(X.roads).map(shr), streets: L0.streets.concat(X.streets).map(shr), bridges: L0.bridges.concat(X.bridges).map(shr), railways: L0.railways.concat(X.railways).map(shp),
      buildings: L0.buildings.concat(X.buildings).map(b => [b[0] + SH[0], b[1] + SH[1], b[2], b[3], b[4], b[5], b[6]]),
      zones: (X.zones || []).map(z => ({ id: z.id, name: z.name, poly: shp(z.poly), raiders: z.raiders, ghouls: z.ghouls })),
    };
  }
  function genCity(s) {
    const P = C.PX_PER_M, OFF = C.CITY.marginM, STEP = 10, E = window.B96_EXT, L = mergeLevel(window.B96_LEVEL, E), SH = L.shift;
    const T = (p) => ({ x: (p[0] + OFF) * P, y: (p[1] + OFF) * P }), TP = (arr) => arr.map(T);
    const W = Math.round((L.size[0] + 2 * OFF) * P), H = Math.round((L.size[1] + 2 * OFF) * P);
    const walls = [], cont = [], add = (x, y, w, h, kind, col, extra) => walls.push(Object.assign({ x, y, w, h, kind, col }, extra || {}));
    add(-60, -60, W + 120, 60, 'border'); add(-60, H, W + 120, 60, 'border'); add(-60, 0, 60, H, 'border'); add(W, 0, 60, H, 'border');
    let spawn = T(L.spawn);
    s.map = { w: W, h: H, walls, blds: [], spawn, city: { P, OFF, buildings: [], roads: [], water: L.water.map(TP), parks: L.parks.map(TP), bridges: [], rails: [], district: L.district.map(TP), cars: [] }, zones: [] };
    const M = s.map, CT = M.city;
    // дороги (для разметки, парковки и фонарей)
    for (const r of L.roads) CT.roads.push({ w: r.w * P, pts: TP(r.pts), type: r.type });
    for (const r of L.streets) CT.roads.push({ w: r.w * P, pts: TP(r.pts), type: 'lane' });
    for (const b of L.bridges) CT.bridges.push({ w: b.w * P, pts: TP(b.pts) });
    for (const r of L.railways) CT.rails.push(TP(r));
    const nearRoad = (x, y, m) => { let best = 1e9; for (const r of CT.roads) for (let i = 0; i + 1 < r.pts.length; i++) best = Math.min(best, distSeg(x, y, r.pts[i], r.pts[i + 1]) - r.w / 2); return best < m; };
    // вода (непроходима, пуля летит над ней), мосты вырезаются из воды
    const bridgeRows = {};
    for (const b of CT.bridges) {
      const a = b.pts[0], c = b.pts[1], dx = c.x - a.x, dy = c.y - a.y, l = Math.hypot(dx, dy), nx = -dy / l * b.w / 2, ny = dx / l * b.w / 2;
      polyRows([{ x: a.x + nx, y: a.y + ny }, { x: c.x + nx, y: c.y + ny }, { x: c.x - nx, y: c.y - ny }, { x: a.x - nx, y: a.y - ny }], STEP, (y, xa, xb) => { (bridgeRows[y] = bridgeRows[y] || []).push([xa, xb]); });
    }
    polyRows(CT.water, STEP, (y, xa, xb) => {
      let segs = [[xa, xb]];
      for (const [ba, bb] of bridgeRows[y] || []) { const nxt = []; for (const [a, b] of segs) { if (bb <= a || ba >= b) nxt.push([a, b]); else { if (ba > a) nxt.push([a, ba]); if (bb < b) nxt.push([bb, b]); } } segs = nxt; }
      for (const [a, b] of segs) if (b - a > 2) add(a, y, b - a, STEP, 'water', '#1f3550', { low: true, fly: true });
    });
    // здания: ориентированные прямоугольники → полигон для рендера + строки-прямоугольники для столкновений
    // масштаб объектов относительно игрока (радиус 12 px): здания крупнее, пересекающиеся и вставшие на дорогу отбрасываются; карта не растёт
    const BS = C.CITY.objScale || 1, roadNear = (x, y, m) => { for (const r of CT.roads) for (let i = 0; i + 1 < r.pts.length; i++) if (distSeg(x, y, r.pts[i], r.pts[i + 1]) - r.w / 2 < m) return true; return false; };
    const enterables = [];
    const sc = L.buildings.map((b, i) => ({ i, b: [b[0], b[1], b[2] * BS, b[3] * BS, b[4], b[5], b[6]] })), keep = new Set(), placed = [];
    const satHit = (A, B, gap) => { for (const poly of [A, B]) for (let i = 0; i < 4; i++) { const ex = poly[(i + 1) % 4][0] - poly[i][0], ey = poly[(i + 1) % 4][1] - poly[i][1], l = Math.hypot(ex, ey), nx = -ey / l, ny = ex / l; let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9; for (const p of A) { const d = p[0] * nx + p[1] * ny; a0 = Math.min(a0, d); a1 = Math.max(a1, d); } for (const p of B) { const d = p[0] * nx + p[1] * ny; b0 = Math.min(b0, d); b1 = Math.max(b1, d); } if (a1 + gap < b0 || b1 + gap < a0) return false; } return true; };
    sc.slice().sort((p, q) => (q.b[2] * q.b[3]) - (p.b[2] * p.b[3])).forEach(o => {
      const [cx, cy, bw, bd, , kind, ang] = o.b, a = ang * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux, c = T([cx, cy]);
      const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([k, m]) => [c.x + ux * bw * P / 2 * k + vx * bd * P / 2 * m, c.y + uy * bw * P / 2 * k + vy * bd * P / 2 * m]);
      if (pts.some(p => p[0] < 20 || p[1] < 20 || p[0] > W - 20 || p[1] > H - 20)) return;
      if (kind !== 'barrier' && kind !== 'booth') { if (pts.some(p => roadNear(p[0], p[1], 0)) || placed.some(q => satHit(q, pts, 5))) return; }
      keep.add(o.i); placed.push(pts);
    });
    sc.filter(o => keep.has(o.i)).forEach(({ b, i }) => {
      const [cx, cy, bw, bd, bh, kind, ang, bsub] = b, a = ang * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
      const isHome=(kind==='panel'||kind==='house')&&!Wd.finalFootprints;
      if(isHome){
        CT.placementAudit.expanded++;
        const center=T([cx,cy]),hw0=bw*P/2,hd0=bd*P/2;
        const dirs=[[0,0],[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
        let found=null;
        // Preserve the full 1.5x area. Search nearby ground instead of cropping
        // into the road; no arbitrary city-wide road rerouting at initialization.
        for(const distance of [0,35,70,110,155]){
          for(const [dx,dy] of dirs){if(distance===0&&(dx||dy))continue;
            const tx=center.x+dx*distance,ty=center.y+dy*distance;
            const poly0=homePoly(tx,ty,hw0,hd0,ux,uy,vx,vy);
            if(homeClear(poly0,13)){found={tx,ty,poly0};break;}
          }if(found)break;
        }
        if(found){if(found.tx!==center.x||found.ty!==center.y)CT.placementAudit.moved++;
          b[0]=found.tx/P;b[1]=found.ty/P;reserveHome(found.poly0);
        } else {CT.placementAudit.unresolved++;reserveHome(homePoly(center.x,center.y,hw0,hd0,ux,uy,vx,vy));}
      }
      const c = T([b[0], b[1]]), hw = bw * P / 2, hd = bd * P / 2;
      const poly = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([k, m]) => ({ x: c.x + ux * hw * k + vx * hd * m, y: c.y + uy * hw * k + vy * hd * m }));
      const low = bh < 1.6;
      let inner = null, doorFace = -1;
      if (kind === 'industrial' || kind === 'warehouse') { // входимое здание: стены толщиной ~1,2 м, дверной проём в сторону дороги, внутри пусто до входа
        const T0 = 12, iw = hw - T0, id_ = hd - T0, mk = (kw, kd, ox, oy) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([k, m]) => ({ x: c.x + ox + ux * kw * k + vx * kd * m, y: c.y + oy + uy * kw * k + vy * kd * m }));
        inner = mk(iw, id_, 0, 0);
        let bp = null, bd0 = 1e9; for (const r of CT.roads) for (let q = 0; q + 1 < r.pts.length; q++) { const d = distSeg(c.x, c.y, r.pts[q], r.pts[q + 1]); if (d < bd0) { bd0 = d; bp = r.pts[q]; } }
        const sides = [[-vx * hd, -vy * hd], [ux * hw, uy * hw], [vx * hd, vy * hd], [-ux * hw, -uy * hw]].map((o, k) => ({ k, o, d: bp ? Math.hypot(c.x + o[0] - bp.x, c.y + o[1] - bp.y) : 0 })).sort((p, q) => p.d - q.d);
        doorFace = sides[0].k; const so = sides[0].o, alongU = doorFace % 2 === 0, dcx = c.x + so[0], dcy = c.y + so[1];
        const dw = 18, dd = 14, au = alongU ? [ux, uy] : [vx, vy], an = alongU ? [vx, vy] : [ux, uy];
        const door = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([k, m]) => ({ x: dcx + au[0] * dw * k + an[0] * dd * m, y: dcy + au[1] * dw * k + an[1] * dd * m }));
        const holes = {}; for (const pg of [inner, door]) polyRows(pg, STEP, (y, xa, xb) => { (holes[y] = holes[y] || []).push([xa, xb]); });
        polyRows(poly, STEP, (y, xa, xb) => {
          let segs = [[xa, xb]];
          for (const [ha, hb] of holes[y] || []) { const nx = []; for (const [a0, b0] of segs) { if (hb <= a0 || ha >= b0) nx.push([a0, b0]); else { if (ha > a0) nx.push([a0, ha]); if (hb < b0) nx.push([hb, b0]); } } segs = nx; }
          for (const [a0, b0] of segs) if (b0 - a0 > 1) add(a0, y, b0 - a0, STEP, 'bldg', null, { low, bid: i });
        });
        enterables.push({ id: i, c, ux, uy, vx, vy, iw, id_, dcx, dcy, inner });
      } else polyRows(poly, STEP, (y, xa, xb) => { if (xb - xa > 1) add(xa, y, xb - xa, STEP, 'bldg', null, { low, bid: i }); });
      CT.buildings.push({ id: i, inner, door: doorFace, poly, c, w: bw * P, d: bd * P, h: bh, kind, ang, sub: bsub || null, maxY: Math.max(...poly.map(p => p.y)), minY: Math.min(...poly.map(p => p.y)), minX: Math.min(...poly.map(p => p.x)), maxX: Math.max(...poly.map(p => p.x)) });
    });
    // зоны/районы
    for (const z of C.CITY.zones) {
      let poly;
      if (z.park != null) poly = CT.parks[z.park]; else { const [x0, y0, x1, y1] = z.rect.map((v, i) => v + SH[i % 2]); poly = TP([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]); }
      M.zones.push({ id: z.id, name: z.name, poly, raiders: z.raiders, ghouls: z.ghouls });
    }
    for (const z of L.zones || []) M.zones.push({ id: z.id, name: z.name, poly: TP(z.poly), raiders: z.raiders, ghouls: z.ghouls });
    // блокпост (эвакуация), входы в метро (узлы)
    M.gate = Object.assign(T([C.CITY.gate.at[0] + SH[0], C.CITY.gate.at[1] + SH[1]]), { r: 48, name: C.CITY.gate.name });
    const freeNear = (x, y, rad, r) => { for (let t = 0; t < 400; t++) { const xx = x + rr(s, -rad, rad), yy = y + rr(s, -rad, rad); if (freeSpot(s, xx, yy, r) && !nearRoad(xx, yy, -8)) return { x: xx, y: yy }; } return { x, y }; };
    delete s._grid;
    const tp = freeNear(spawn.x, spawn.y, 40, 14); M.spawn = spawn = { x: tp.x, y: tp.y }; M.spawn = spawn;
    const n1 = freeNear(...Object.values(T([95 + SH[0], 150 + SH[1]])), 300, 60), n2 = freeNear(...Object.values(T([320 + SH[0], 230 + SH[1]])), 300, 60);
    M.nodes = [{ id: 'n0', name: C.CITY.nodes[0][1], x: spawn.x, y: spawn.y, r: 40, open: true }, { id: 'n1', name: C.CITY.nodes[1][1], x: n1.x, y: n1.y, r: 40, open: false }, { id: 'n2', name: C.CITY.nodes[2][1], x: n2.x, y: n2.y, r: 40, open: false }];
    // деревья: парки густо, дворы редко
    const sampleIn = (poly, n, r, kind, extra, tries) => {
      let xs = poly.map(p => p.x), ys = poly.map(p => p.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), k = 0;
      for (let t = 0; t < tries && k < n; t++) { const x = rr(s, x0, x1), y = rr(s, y0, y1); if (!inPoly(x, y, poly) || !freeSpot(s, x, y, r) || nearRoad(x, y, 30)) continue; add(x - 8, y - 8, 16, 16, kind, null, extra); delete s._grid; k++; }
    };
    delete s._grid;
    sampleIn(CT.parks[0], 70, 26, 'tree', { low: true }, 3000); sampleIn(CT.parks[1], 150, 26, 'tree', { low: true }, 6000); if (CT.parks[2]) sampleIn(CT.parks[2], 160, 26, 'tree', { low: true }, 6000);
    delete s._grid;
    for (let k = 0, t = 0; k < (E ? 260 : 90) && t < 9000; t++) { const x = rr(s, 40, W - 40), y = rr(s, 40, H - 40); if (!CT.district.some(d => inPoly(x, y, d)) || !freeSpot(s, x, y, 40) || nearRoad(x, y, 40)) continue; add(x - 8, y - 8, 16, 16, 'tree', null, { low: true }); k++; delete s._grid; }
    // фонари вдоль дорог, припаркованные машины
    const place = (x, y, w, h, kind, extra) => { delete s._grid; if (!freeSpot(s, x + w / 2, y + h / 2, Math.max(w, h) / 2 + 6)) return false; add(x, y, w, h, kind, null, extra); return true; };
    for (const r of CT.roads) {
      if (r.type === 'lane') continue;
      let acc = 0;
      for (let i = 0; i + 1 < r.pts.length; i++) {
        const a = r.pts[i], b = r.pts[i + 1], l = Math.hypot(b.x - a.x, b.y - a.y), ux = (b.x - a.x) / l, uy = (b.y - a.y) / l;
        for (let d = 60 - acc; d < l; d += 380) {
          const side = (Math.floor((d+acc) / 380) % 2 ? 1 : -1);
          const off = r.w/2 + 25; // safely outside carriageway and curb
          const x = a.x+ux*d-uy*off*side, y = a.y+uy*d+ux*off*side;
          if (nearRoad(x,y,7)) continue;
          const vx=uy*side, vy=-ux*side;
          place(x-5,y-5,10,10,'lamp',{
            low:true, renderLayer:'street-objects', collider2D:{shape:'circle',radius:5},
            light2D:{position:{x,y},direction:{x:vx,y:vy},spread_angle:95,
              intensity_distribution:'cosine4',intensity:0.76,range:135}
          });
        }
        acc = (acc + l) % 380;
      }
    }
    for (const r of CT.roads) {
      if (r.type !== 'lane' && r.type !== 'street') continue;
      for (let i = 0; i + 1 < r.pts.length; i++) {
        const a = r.pts[i], b = r.pts[i + 1], l = Math.hypot(b.x - a.x, b.y - a.y); if (l < 120) continue;
        const ux = (b.x - a.x) / l, uy = (b.y - a.y) / l;
        for (let d = 70 + rnd(s) * 60; d < l - 60; d += 250 + rnd(s) * 220) {
          if (rnd(s) < 0.4) continue;
          const side = rnd(s) < 0.5 ? 1 : -1, off = r.w / 2 - 24, x = a.x + ux * d - uy * off * side, y = a.y + uy * d + ux * off * side, horiz = Math.abs(ux) > Math.abs(uy), cw = horiz ? 100 : 46, ch = horiz ? 46 : 100;
          if (walls.some(l => l.kind === 'lamp' && l.x > x - cw / 2 - 26 && l.x < x + cw / 2 + 26 && l.y > y - ch / 2 - 26 && l.y < y + ch / 2 + 26)) continue; // фонарь не стоит вплотную к машине
          if (place(x - cw / 2, y - ch / 2, cw, ch, 'car', { low: true })) CT.cars.push(walls.length - 1);
        }
      }
    }
    // деревянные опоры с проводами вдоль улиц; остановки на главной дороге; вывески киосков
    CT.lines = [];
    for (const r of CT.roads) {
      if (r.type === 'main') continue;
      const line = []; let acc = 0;
      for (let i = 0; i + 1 < r.pts.length; i++) {
        const a = r.pts[i], b = r.pts[i + 1], l = Math.hypot(b.x - a.x, b.y - a.y), ux = (b.x - a.x) / l, uy = (b.y - a.y) / l;
        for (let d = 40 - acc; d < l; d += 380) { const off = r.w / 2 + 28, x = a.x + ux * d + uy * off, y = a.y + uy * d - ux * off; delete s._grid; if (freeSpot(s, x, y, 14)) { add(x - 3, y - 3, 6, 6, 'pole', null, { low: true }); line.push(walls.length - 1); } }
        acc = (acc + l) % 380;
      }
      if (line.length > 1) CT.lines.push(line);
    }
    const mainR = CT.roads.find(r => r.type === 'main');
    if (mainR) for (let i = 0; i + 1 < mainR.pts.length; i++) {
      const a = mainR.pts[i], b = mainR.pts[i + 1], l = Math.hypot(b.x - a.x, b.y - a.y), ux = (b.x - a.x) / l, uy = (b.y - a.y) / l;
      if (l < 600) continue;
      for (const f of [0.35, 0.8]) { const side = f > 0.5 ? -1 : 1, off = mainR.w / 2 + 30, x = a.x + ux * l * f - uy * off * side, y = a.y + uy * l * f + ux * off * side, horiz = Math.abs(ux) > Math.abs(uy); delete s._grid; if (freeSpot(s, x, y, 30)) add(x - (horiz ? 28 : 8), y - (horiz ? 8 : 28), horiz ? 56 : 16, horiz ? 16 : 56, 'stop', null, { low: true, horiz }); }
    }
    for (const b of CT.buildings) if (b.kind === 'booth') b.sign = ['ПРОДУКТЫ', 'ПИВО', 'ЧАЙ 24', 'ТАБАК'][Math.floor(hsh01(b.id) * 4)];
    // ЛЭП вдоль главной дороги
    const main = CT.roads.find(r => r.type === 'main');
    if (main) { let acc = 0; for (let i = 0; i + 1 < main.pts.length; i++) { const a = main.pts[i], b = main.pts[i + 1], l = Math.hypot(b.x - a.x, b.y - a.y), ux = (b.x - a.x) / l, uy = (b.y - a.y) / l; for (let d = 100 - acc; d < l; d += 640) { const off = main.w / 2 + 50, x = a.x + ux * d + uy * off, y = a.y + uy * d - ux * off; place(x - 9, y - 9, 18, 18, 'pylon', { low: true }); } acc = (acc + l) % 640; } }
    // контейнеры: подъезды, гаражи, баки, багажники
    const nearest = (x, y) => { let best = 1e9, bp = null; for (const r of CT.roads) for (let i = 0; i + 1 < r.pts.length; i++) { const d = distSeg(x, y, r.pts[i], r.pts[i + 1]); if (d < best) { best = d; bp = r.pts[i]; } } return bp; };
    delete s._grid;
    for (const b of CT.buildings) {
      if (b.kind === 'barrier') continue;
      const a = b.ang * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux, rp = nearest(b.c.x, b.c.y);
      // сторона, ближайшая к дороге
      const sides = [[0, -1], [0, 1], [1, 0], [-1, 0]].map(([k, m]) => ({ x: b.c.x + (k * ux * (b.w / 2 + 22)) + m * vx * (b.d / 2 + 22), y: b.c.y + k * uy * (b.w / 2 + 22) + m * vy * (b.d / 2 + 22), k, m }));
      sides.sort((p, q) => Math.hypot(p.x - rp.x, p.y - rp.y) - Math.hypot(q.x - rp.x, q.y - rp.y));
      const sd = sides[0], count = b.kind === 'panel' ? 2 : 1;
      for (let n = 0; n < count; n++) {
        const off = count === 1 ? 0 : (n ? 1 : -1) * (sd.m ? b.w / 4 : b.d / 4), x = sd.x + (sd.m ? ux * off : vx * off), y = sd.y + (sd.m ? uy * off : vy * off);
        const kindC = b.kind === 'garage_row' ? 'garage' : b.kind === 'panel' ? 'entrance' : 'crate'; // «подъезд» (почтовые ящики) только у квартирных домов
        if (b.kind === 'shed' && rnd(s) < 0.5) continue;
        if (kindC === 'entrance') continue; // новая карта: без ящиков на фасадах
        if (Wd.finalFootprints && kindC === 'crate') continue; // баки и ящики расставляет генератор карты по логике
        if (kindC === 'entrance' && b.poly && b.door != null) { // ящики висят на фасаде у двери подъезда, а не на земле
          const A = b.poly[b.door], B2 = b.poly[(b.door + 1) % 4], mx = (A.x + B2.x) / 2, my = (A.y + B2.y) / 2, tl = Math.hypot(B2.x - A.x, B2.y - A.y) || 1, tx = (B2.x - A.x) / tl, ty = (B2.y - A.y) / tl;
          let nx = mx - b.c.x, ny = my - b.c.y; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
          const side = n ? -1 : 1, px = mx + nx * 9 + tx * 17 * side, py = my + ny * 9 + ty * 17 * side;
          if (freeSpot(s, px, py, 4)) { const k = mkCont(s, 'entrance', px, py); k.ang = Math.atan2(ty, tx); cont.push(k); }
          continue;
        }
        if (freeSpot(s, x, y, 7)) cont.push(mkCont(s, kindC, x, y));
      }
    }
    for (const i of CT.cars) { const w = walls[i], x = w.w > w.h ? w.x + w.w / 2 : w.x - 10, y = w.w > w.h ? w.y - 10 : w.y + w.h / 2; if (freeSpot(s, x, y, 6)) cont.push(mkCont(s, 'car', x, y)); }
    for (let k = 0, t = 0; !Wd.finalFootprints && CT.buildings.length && k < 40 && t < 1500; t++) { const b = CT.buildings[ri(s, 0, CT.buildings.length - 1)]; if (b.kind === 'barrier') continue; const x = b.c.x + rr(s, -b.w / 2 - 40, b.w / 2 + 40), y = b.c.y + rr(s, -b.d / 2 - 40, b.d / 2 + 40); if (freeSpot(s, x, y, 26)) { cont.push(mkCont(s, rnd(s) < 0.65 ? 'bin' : 'crate', x, y)); k++; } }
    for (const E_ of enterables) { // внутренности: стеллажи рядами, ящики, лут; рисуются только когда игрок внутри
      const { c, ux, uy, vx, vy, iw, id_ } = E_; let nr = 0;
      for (let a = -iw + 30; a < iw - 30; a += 42) for (let b2 = -id_ + 26; b2 < id_ - 26; b2 += 52) {
        const x = c.x + ux * a + vx * b2, y = c.y + uy * a + vy * b2; if (Math.hypot(x - E_.dcx, y - E_.dcy) < 45) continue;
        delete s._grid; const r0 = rnd(s);
        if (r0 < 0.5 && freeSpot(s, x, y, 26)) { add(x - 22, y - 7, 44, 14, 'rack', null, { low: false, inb: E_.id }); }
        else if (r0 < 0.75 && freeSpot(s, x, y, 18)) { add(x - 10, y - 10, 20, 20, 'crate', null, { low: true, inb: E_.id }); }
        else if (nr < 3 && freeSpot(s, x, y, 8)) { const k = mkCont(s, 'crate', x, y); k.inb = E_.id; cont.push(k); nr++; }
      }
      delete s._grid;
    }
    cont.push(mkCont(s, 'crate', spawn.x + 70, spawn.y - 40));
    const far = cont.filter(c => Math.hypot(c.x - spawn.x, c.y - spawn.y) > 900 && Math.hypot(c.x - spawn.x, c.y - spawn.y) < 3200 && Math.hypot(c.x - M.gate.x, c.y - M.gate.y) > 160);
    if (far.length) pick(s, far).key = true; else cont[cont.length - 1].key = true;
    s.containers = cont; delete s._grid;
  }
  // ---------- город 15 районов (window.B96_WORLD из tools/build_world.py, метры → пиксели) ----------
  function setDoorCells(b, open) { b.doorOpen = open ? 1 : 0; for (const w of b.doorCells || []) { if (open) { if (w.w) { w._w = w.w; w._h = w.h; w.w = 0; w.h = 0; } } else if (!w.w && w._w) { w.w = w._w; w.h = w._h; } } }
  function genWorld(s) {
    if(window.B96_ROAD_NETWORK)window.B96_ROAD_NETWORK.reset();
    const Wd = window.B96_WORLD, P = C.PX_PER_M, K = Wd.mPerPx, MP = P * K, STEP = 10; // MP — пикселей мира на пиксель карты
    const W = Math.round(Wd.w * MP), H = Math.round(Wd.h * MP), T = (m) => ({ x: m[0] * P, y: m[1] * P });
    const walls = [], cont = [];
    const M = s.map = { w: W, h: H, walls, blds: [], spawn: { x: 0, y: 0 }, city: null, zones: [] };
    const CT = M.city = { P, OFF: 0, world: Wd, MP, buildings: [], roads: [], water: [], parks: [], bridges: [], rails: [], district: [], cars: [], lines: [] };
    const add = (x, y, w, h, kind, col, extra) => { const o = Object.assign({ x, y, w, h, kind, col }, extra || {}); walls.push(o); if (s._grid) gridAdd(s, walls.length - 1); return o; };
    add(-60, -60, W + 120, 60, 'border'); add(-60, H, W + 120, 60, 'border'); add(-60, 0, 60, H, 'border'); add(W, 0, 60, H, 'border');
    // маски карты
    const runs = (rows, f) => rows.forEach((r, y) => { for (let i = 0; i + 1 < r.length; i += 2) f(y, r[i], r[i + 1]); });
    const roadW = Wd.roadRle.length ? Wd.roadRle[0] && 0 : 0; void roadW;
    const rw = Math.ceil(Wd.w / 2), rh = Math.ceil(Wd.h / 2), roadG = new Uint8Array(rw * rh), parkG = new Uint8Array(rw * rh);
    runs(Wd.roadRle, (y, a, b) => { for (let x = a; x < b; x++) roadG[y * rw + x] = 1; });
    runs(Wd.parkRle, (y, a, b) => { for (let x = a; x < b; x++) parkG[y * rw + x] = 1; });
    const cellPx = MP * 2;
    CT.nearRoad = M.nearRoad = (x, y, m) => { const r = Math.ceil(m / cellPx), cx = Math.floor(x / cellPx), cy = Math.floor(y / cellPx); for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) { const xx = cx + i, yy = cy + j; if (xx >= 0 && yy >= 0 && xx < rw && yy < rh && roadG[yy * rw + xx]) return true; } return false; };
    const zg = new Uint8Array(Wd.w * Wd.h); { let o = 0; for (const [v, l] of Wd.districtRle) { zg.fill(v, o, o + l); o += l; } }
    M.zoneGrid = { data: zg, w: Wd.w, h: Wd.h, MP };
    // вода (непроходима, пули летят над ней); мосты уже вырезаны из маски
    { let prev = null; const emit = (y, a, b, hRows) => add(a * MP, y * MP, (b - a) * MP, hRows * MP, 'water', '#1f3550', { low: true, fly: true });
      const open = new Map(); // ключ "a,b" → начало (y)
      for (let y = 0; y <= Wd.h; y++) {
        const cur = new Map(); if (y < Wd.h) { const r = Wd.waterRle[y]; for (let i = 0; i + 1 < r.length; i += 2) cur.set(r[i] + ',' + r[i + 1], 1); }
        for (const [k, y0] of open) if (!cur.has(k)) { const [a, b] = k.split(',').map(Number); emit(y0, a, b, y - y0); open.delete(k); }
        for (const k of cur.keys()) if (!open.has(k)) open.set(k, y);
      } void prev; }
    for (const b of Wd.bridges) CT.bridges.push({ w: b.w * P, pts: b.pts.map(T) });
    if (window.WL_BRIDGES && WL_BRIDGES.railWalls) for (const r of WL_BRIDGES.railWalls()) add(r[0], r[1], r[2], r[3], 'water', '#1f3550', { low: true, fly: true });
    // ближайшая точка дорог (хеш по осевым точкам)
    const RS = Wd.roadSamples.map(q => ({ x: q[0] * P, y: q[1] * P, a: q[2], w: q[3] * P })), RG = new Map(), RC = 400;
    RS.forEach((q, i) => { const k = Math.floor(q.x / RC) + ',' + Math.floor(q.y / RC); if (!RG.has(k)) RG.set(k, []); RG.get(k).push(i); });
    const nearestRoad = (x, y) => { let best = null, bd = 1e18; const cx = Math.floor(x / RC), cy = Math.floor(y / RC); for (let r = 0; r < 6 && !best; r++) for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) { if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue; const l = RG.get((cx + i) + ',' + (cy + j)); if (l) for (const n of l) { const q = RS[n], d = (q.x - x) ** 2 + (q.y - y) ** 2; if (d < bd) { bd = d; best = q; } } } return best; };
    // Land-use clearance for expanded residential footprints. All geometry downstream
    // (outer walls, interiors, collisions) shares the adjusted centre and dimensions.
    // Road raster is authoritative: do not merely hide overlapping road pixels.
    const placedHome = new Map(), HOME_CELL = 250;
    function homePoly(cx, cy, hw, hd, ux, uy, vx, vy) {
      return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>({x:cx+ux*hw*a+vx*hd*b,y:cy+uy*hw*a+vy*hd*b}));
    }
    function homeClear(poly, pad) {
      const minX=Math.min(...poly.map(q=>q.x))-pad,maxX=Math.max(...poly.map(q=>q.x))+pad;
      const minY=Math.min(...poly.map(q=>q.y))-pad,maxY=Math.max(...poly.map(q=>q.y))+pad;
      if(minX<30||minY<30||maxX>W-30||maxY>H-30)return false;
      // Raster samples, slightly inflated clearance. Road covers traffic lanes;
      // extra pad preserves a shoulder/sidewalk next to the building.
      const inside=(x,y)=>{let v=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){
        const a=poly[i],b=poly[j];if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)v=!v;
      }return v;};
      const stride=Math.max(12,cellPx*1.5);
      for(let y=minY;y<=maxY;y+=stride)for(let x=minX;x<=maxX;x+=stride){
        if(!inside(x,y)&&!poly.some(q=>Math.hypot(q.x-x,q.y-y)<pad))continue;
        const ix=Math.floor(x/cellPx),iy=Math.floor(y/cellPx);
        for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++){
          const xx=ix+i,yy=iy+j;if(xx>=0&&yy>=0&&xx<rw&&yy<rh&&roadG[yy*rw+xx])return false;
        }
      }
      const ix0=Math.floor(minX/HOME_CELL),iy0=Math.floor(minY/HOME_CELL);
      const ix1=Math.floor(maxX/HOME_CELL),iy1=Math.floor(maxY/HOME_CELL);
      const seen=new Set();for(let iy=iy0;iy<=iy1;iy++)for(let ix=ix0;ix<=ix1;ix++){
        for(const other of placedHome.get(ix+','+iy)||[]){
          if(seen.has(other))continue;seen.add(other);
          if(maxX>other.minX&&minX<other.maxX&&maxY>other.minY&&minY<other.maxY)return false;
        }
      }
      return true;
    }
    function reserveHome(poly) {
      const o={minX:Math.min(...poly.map(q=>q.x))-12,maxX:Math.max(...poly.map(q=>q.x))+12,
        minY:Math.min(...poly.map(q=>q.y))-12,maxY:Math.max(...poly.map(q=>q.y))+12};
      for(let y=Math.floor(o.minY/HOME_CELL);y<=Math.floor(o.maxY/HOME_CELL);y++)
      for(let x=Math.floor(o.minX/HOME_CELL);x<=Math.floor(o.maxX/HOME_CELL);x++){
        const k=x+','+y;if(!placedHome.has(k))placedHome.set(k,[]);placedHome.get(k).push(o);
      }
    }
    CT.placementAudit={moved:0,unresolved:0,expanded:0};
    // здания
    const enterables = [];
    Wd.buildings.forEach((sourceBuilding, i) => {
      // Residential area = 1.5x; all collision, facade, and interior geometry use same dimensions.
      const b = sourceBuilding.slice();
      if (!Wd.finalFootprints && (b[5] === 'panel' || b[5] === 'house')) { const growth = Math.sqrt(1.5); b[2] *= growth; b[3] *= growth; }
      const [cx, cy, bw, bd, bh, kind, ang, bsub] = b, a = ang * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
      const isHome=(kind==='panel'||kind==='house')&&!Wd.finalFootprints;
      if(isHome){
        CT.placementAudit.expanded++;
        const center=T([cx,cy]),hw0=bw*P/2,hd0=bd*P/2;
        const dirs=[[0,0],[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
        let found=null;
        // Preserve the full 1.5x area. Search nearby ground instead of cropping
        // into the road; no arbitrary city-wide road rerouting at initialization.
        for(const distance of [0,35,70,110,155]){
          for(const [dx,dy] of dirs){if(distance===0&&(dx||dy))continue;
            const tx=center.x+dx*distance,ty=center.y+dy*distance;
            const poly0=homePoly(tx,ty,hw0,hd0,ux,uy,vx,vy);
            if(homeClear(poly0,13)){found={tx,ty,poly0};break;}
          }if(found)break;
        }
        if(found){if(found.tx!==center.x||found.ty!==center.y)CT.placementAudit.moved++;
          b[0]=found.tx/P;b[1]=found.ty/P;reserveHome(found.poly0);
        } else {CT.placementAudit.unresolved++;reserveHome(homePoly(center.x,center.y,hw0,hd0,ux,uy,vx,vy));}
      }
      const c = T([b[0], b[1]]), hw = bw * P / 2, hd = bd * P / 2;
      const poly = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([k, m]) => ({ x: c.x + ux * hw * k + vx * hd * m, y: c.y + uy * hw * k + vy * hd * m }));
      const low = bh < 1.6; let inner = null, doorFace = -1;
      const HS = window.WL_HOUSES_SIM, ind = kind === 'industrial' || kind === 'warehouse', ent = HS ? HS.isEnterable(kind, bw, bd) : (ind || ((kind === 'house' || kind === 'panel') && bw >= 7 && bd >= 6)); let doorCells = null, hsInt = null;
      if (ent && HS) { // modules/houses: exact AABB shell with door/window openings, rooms, furniture
        const T0 = HS.wallT(kind) * P, mk = (kw, kd) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([k, m]) => ({ x: c.x + ux * kw * k + vx * kd * m, y: c.y + uy * kw * k + vy * kd * m }));
        inner = mk(hw - T0, hd - T0);
        const bp = nearestRoad(c.x, c.y), sides = [[-vx * hd, -vy * hd], [ux * hw, uy * hw], [vx * hd, vy * hd], [-ux * hw, -uy * hw]].map((o, k) => ({ k, d: bp ? Math.hypot(c.x + o[0] - bp.x, c.y + o[1] - bp.y) : 0 })).sort((p, q) => p.d - q.d);
        doorFace = sides[0].k;
        hsInt = HS.build(s, { id: i, c, ux, uy, vx, vy, kind, ang, w: bw * P, d: bd * P, h: bh, doorFace }, { add, mkCont: (k, x, y) => { const o = mkCont(s, k, x, y); cont.push(o); return o; } });
      } else if (ent) {
        const T0 = ind ? 12 : 5, iw = hw - T0, id_ = hd - T0, mk = (kw, kd) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([k, m]) => ({ x: c.x + ux * kw * k + vx * kd * m, y: c.y + uy * kw * k + vy * kd * m }));
        inner = mk(iw, id_);
        const bp = nearestRoad(c.x, c.y);
        const sides = [[-vx * hd, -vy * hd], [ux * hw, uy * hw], [vx * hd, vy * hd], [-ux * hw, -uy * hw]].map((o, k) => ({ k, o, d: bp ? Math.hypot(c.x + o[0] - bp.x, c.y + o[1] - bp.y) : 0 })).sort((p, q) => p.d - q.d);
        doorFace = sides[0].k; const so = sides[0].o, alongU = doorFace % 2 === 0, dcx = c.x + so[0], dcy = c.y + so[1];
        const dw = ind ? 18 : 10, dd = T0 + 2, au = alongU ? [ux, uy] : [vx, vy], an = alongU ? [vx, vy] : [ux, uy];
        const door = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([k, m]) => ({ x: dcx + au[0] * dw * k + an[0] * dd * m, y: dcy + au[1] * dw * k + an[1] * dd * m }));
        const holes = {}; for (const pg of [inner, door]) polyRows(pg, STEP, (y, xa, xb) => { (holes[y] = holes[y] || []).push([xa, xb]); });
        { const sl = Math.hypot(so[0], so[1]) || 1, ix = -so[0] / sl, iy = -so[1] / sl, ccx = dcx + ix * T0 / 2, ccy = dcy + iy * T0 / 2, hdp = T0 / 2 + 0.5;
          const dpoly = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([k, m]) => ({ x: ccx + au[0] * dw * k + an[0] * hdp * m, y: ccy + au[1] * dw * k + an[1] * hdp * m }));
          doorCells = []; polyRows(dpoly, 4, (y, xa, xb) => { if (xb - xa > 1) doorCells.push(add(xa, y, xb - xa, 4, 'door', null, { bid: i, low: false })); }); }
        polyRows(poly, STEP, (y, xa, xb) => {
          let segs = [[xa, xb]];
          for (const [ha, hb] of holes[y] || []) { const nx = []; for (const [a0, b0] of segs) { if (hb <= a0 || ha >= b0) nx.push([a0, b0]); else { if (ha > a0) nx.push([a0, ha]); if (hb < b0) nx.push([hb, b0]); } } segs = nx; }
          for (const [a0, b0] of segs) if (b0 - a0 > 1) add(a0, y, b0 - a0, STEP, 'bldg', null, { low, bid: i });
        });
        enterables.push({ id: i, c, ux, uy, vx, vy, iw, id_, dcx, dcy, inner, kind, ang });
      } else polyRows(poly, STEP, (y, xa, xb) => { if (xb - xa > 1) add(xa, y, xb - xa, STEP, 'bldg', null, { low, bid: i }); });
      CT.buildings.push({ id: i, int: hsInt, inner, door: doorFace, doorCells, doorOpen: 1, locked: false, poly, c, w: bw * P, d: bd * P, h: bh, kind, ang, sub: bsub || null, maxY: Math.max(...poly.map(p => p.y)), minY: Math.min(...poly.map(p => p.y)), minX: Math.min(...poly.map(p => p.x)), maxX: Math.max(...poly.map(p => p.x)) });
      if (hsInt) window.WL_HOUSES_SIM.init(s, hsInt, CT.buildings[CT.buildings.length - 1]);
    });
    // v72: road network is authoritative and shared by every district.
    // Re-route ONLY road cells blocked by the finalized footprints. Build a
    // navigable detour around the obstacle while preserving road-raster topology.
    // This is a local raster edit; all other roads retain original coordinates.
    {const occupied=new Uint8Array(rw*rh), overlaps=[];
      for(const b of CT.buildings){
        const px=b.poly, aabb={x0:Math.max(0,Math.floor(b.minX/cellPx)-1),x1:Math.min(rw-1,Math.ceil(b.maxX/cellPx)+1),
          y0:Math.max(0,Math.floor(b.minY/cellPx)-1),y1:Math.min(rh-1,Math.ceil(b.maxY/cellPx)+1)};
        // Fast exact polygon test for footprint, plus one-cell building margin.
        for(let y=aabb.y0;y<=aabb.y1;y++)for(let x=aabb.x0;x<=aabb.x1;x++){
          const cx=(x+.5)*cellPx,cy=(y+.5)*cellPx;
          if(inPoly(cx,cy,px)) occupied[y*rw+x]=1;
        }
      }
      // Groups of conflicting road cells, grouped per building AABB;
      // sidewalk gap is retained by routing at least two cells from building.
      for(const b of CT.buildings){
        const x0=Math.max(0,Math.floor(b.minX/cellPx)),x1=Math.min(rw-1,Math.ceil(b.maxX/cellPx));
        const y0=Math.max(0,Math.floor(b.minY/cellPx)),y1=Math.min(rh-1,Math.ceil(b.maxY/cellPx));
        let conflict=false;
        for(let y=y0;y<=y1&&!conflict;y++)for(let x=x0;x<=x1;x++)
          if(roadG[y*rw+x]&&occupied[y*rw+x]){conflict=true;break;}
        if(conflict)overlaps.push({b,x0,x1,y0,y1});
      }
      let removed=0,added=0;
      for(let i=0;i<roadG.length;i++)if(roadG[i]&&occupied[i]){roadG[i]=0;removed++;}
      // Make a U-shaped diversion on the nearest free side of each conflicting
      // footprint. Existing road endpoints are joined to the detour ring.
      for(const {b,x0,x1,y0,y1} of overlaps){
        const sides=[];const PAD=3;
        for(let side=0;side<4;side++){
          let cells=[];
          for(let t=-PAD;t<=(side<2?x1-x0:y1-y0)+PAD;t++){
            const x=side===0?x0+t:side===1?x0+t:side===2?x0-PAD:x1+PAD;
            const y=side===0?y0-PAD:side===1?y1+PAD:y0+t;
            if(x<2||y<2||x>=rw-2||y>=rh-2)continue;
            if(!occupied[y*rw+x])cells.push([x,y]);
          }
          sides.push(cells);
        }
        // Connect a rectangular bypass around the former crossing. Do not
        // overwrite another building; intersections retain their original mask.
        const edges=sides.flat();
        for(const [x,y] of edges){for(let ox=-1;ox<=1;ox++)for(let oy=-1;oy<=1;oy++){
          const xx=x+ox,yy=y+oy;if(xx<0||yy<0||xx>=rw||yy>=rh)continue;
          const ix=yy*rw+xx;
          if(!occupied[ix]&&!roadG[ix]){roadG[ix]=1;added++;}
        }}
      }
      if(overlaps.length){
        Wd.roadRle=Array.from({length:rh},(_,y)=>{const row=[],off=y*rw;let a=-1;
          for(let x=0;x<=rw;x++){const on=x<rw&&roadG[off+x];if(on&&a<0)a=x;
            if(!on&&a>=0){row.push(a,x);a=-1;}}return row;});
        // Also update streetlight/road sampling for the newly routed footprint.
        for(const {x0,x1,y0,y1} of overlaps){
          for(let y=Math.max(0,y0-5);y<=Math.min(rh-1,y1+5);y+=3)
            for(let x=Math.max(0,x0-5);x<=Math.min(rw-1,x1+5);x+=3)
              if(roadG[y*rw+x]&&!occupied[y*rw+x]) RS.push({x:(x+.5)*cellPx,y:(y+.5)*cellPx,a:0,w:cellPx*2});
        }
        // Existing samples inside buildings are invalid for lighting/vehicle spawns.
        for(let i=RS.length-1;i>=0;i--){const x=Math.floor(RS[i].x/cellPx),y=Math.floor(RS[i].y/cellPx);
          if(x>=0&&y>=0&&x<rw&&y<rh&&occupied[y*rw+x])RS.splice(i,1);}
        // Replace hash so nearestRoad uses the new road centerline samples.
        RG.clear();RS.forEach((q,i)=>{const k=Math.floor(q.x/RC)+','+Math.floor(q.y/RC);
          if(!RG.has(k))RG.set(k,[]);RG.get(k).push(i);});
        Wd.roadSamples=RS.map(q=>[q.x/P,q.y/P,q.a,q.w/P]);
      }
      CT.roadAudit={conflictingBuildings:overlaps.length,removedCells:removed,detourCells:added,
        unresolvedBuildings:CT.placementAudit.unresolved};
    }
    // районы
    for (const z of Wd.districts) M.zones.push({ id: z.id, name: z.name, n: z.n, poly: z.poly.map(T), raiders: 0, ghouls: 0 });
    CT.zoneName = (n) => (Wd.districts.find(z => z.n === n) || {}).name;
    for (const b of CT.buildings) if (b.doorCells) { const h = hsh01(b.id * 3 + 11); b.locked = b.kind !== 'industrial' && b.kind !== 'warehouse' && h > 0.82; b.doorOpen = b.locked ? 0 : (b.kind === 'industrial' || b.kind === 'warehouse' || h < 0.5) ? 1 : 0; setDoorCells(b, b.doorOpen); }
    // блокпост эвакуации — ближайший к Павлову Яру (с севера), старт — на улице рядом с ним
    const pav = Wd.districts.find(z => z.id === (s.startId || 'pavlov_yar')), pa = T(pav.anchor); // район старта (выбор игрока, WL_START)
    let gp = Wd.blockposts[0]; for (const q of Wd.blockposts) if (Math.hypot(q[0] * P - pa.x, q[1] * P - pa.y) < Math.hypot(gp[0] * P - pa.x, gp[1] * P - pa.y)) gp = q;
    M.gate = Object.assign(T(gp), { r: 48, name: C.CITY.gate.name });
    M.gates = Wd.blockposts.map(q => T(q));
    const freeNear = (x, y, rad, r) => { for (let t = 0; t < 600; t++) { const xx = x + rr(s, -rad, rad), yy = y + rr(s, -rad, rad); if (freeSpot(s, xx, yy, r) && !CT.nearRoad(xx, yy, 0)) return { x: xx, y: yy }; } return { x, y }; };
    grid(s);
    let sp0 = nearestRoad(pa.x, pa.y + (s.startId ? 0 : 300)) || pa;
    { const zh = s.startId && M.zones.find(z => z.id === s.startId); // старт строго внутри выбранного района: ближайший к центру участок дороги в его полигоне
      if (zh && !inPoly(sp0.x, sp0.y, zh.poly)) { let bd = 1e18; for (const q of RS) if (inPoly(q.x, q.y, zh.poly)) { const d = Math.hypot(q.x - pa.x, q.y - pa.y); if (d < bd) { bd = d; sp0 = q; } } } }
    const spawn = freeNear(sp0.x, sp0.y, 120, 14); M.spawn = spawn;
    const nodeAt = (n, name) => { const z = Wd.districts.find(q => q.n === n), q = T(z.anchor), r0 = nearestRoad(q.x, q.y) || q, f = freeNear(r0.x, r0.y, 160, 40); return { id: 'n' + (n === 4 ? 0 : n === 7 ? 1 : 2), name, x: f.x, y: f.y, r: 40, open: n === 4 }; };
    M.nodes = [nodeAt(4, C.CITY.nodes[0][1]), nodeAt(7, C.CITY.nodes[1][1]), nodeAt(5, C.CITY.nodes[2][1])];
    M.nodes[0].x = spawn.x; M.nodes[0].y = spawn.y;
    // деревья: парки густо
    { let k = 0; for (let t = 0; t < 40000 && k < 3200; t++) { const cx = ri(s, 0, rw - 1), cy = ri(s, 0, rh - 1); if (!parkG[cy * rw + cx]) continue; const x = (cx + rnd(s)) * cellPx, y = (cy + rnd(s)) * cellPx; if (!freeSpot(s, x, y, 22)) continue; add(x - 2.5, y - 2.5, 5, 5, 'tree', null, { low: true }); k++; } }
    // фонари вдоль дорог, припаркованные машины
    const place = (x, y, w, h, kind, extra) => { if (!freeSpot(s, x + w / 2, y + h / 2, Math.max(w, h) / 2 + 6)) return false; add(x - 0, y - 0, w, h, kind, null, extra); return true; };
    const lampCells = new Map(), lampCellSize = 160;
    const lampKey = (cx, cy) => cx + ',' + cy;
    const lampNearby = (x, y) => {
      const cx = Math.floor(x / lampCellSize), cy = Math.floor(y / lampCellSize);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const cell = lampCells.get(lampKey(cx + dx, cy + dy));
        if (cell && cell.some(p => (p.x-x)**2 + (p.y-y)**2 < 160*160)) return true;
      }
      return false;
    };
    const lampRemember = (x, y) => {
      const key = lampKey(Math.floor(x / lampCellSize), Math.floor(y / lampCellSize));
      if (!lampCells.has(key)) lampCells.set(key, []);
      lampCells.get(key).push({x,y});
    };
    RS.forEach((q, i) => {
      const a = q.a * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), half = Math.max(q.w, 60) / 2;
      if (i % 9 === 0 && q.w > 70) {
        const side = (i % 2 ? 1 : -1), off = half+27;
        const x=q.x-uy*off*side,y=q.y+ux*off*side;
        // Validate a pavement/roadside anchor and avoid nearby lights.
        const duplicate=lampNearby(x,y);
        if (!duplicate && !CT.nearRoad(x,y,0)) {
          const vx=uy*side,vy=-ux*side;
          if (place(x-3,y-3,6,6,'lamp',{
            low:true,renderLayer:'street-objects',collider2D:{shape:'circle',radius:3},
            light2D:{position:{x,y},direction:{x:vx,y:vy},spread_angle:105,
              intensity_distribution:i%3===0?'wide':'cosine4',intensity:0.72,range:130}
          })) lampRemember(x,y);
        }
      }
      else if (i % 23 === 1 && q.w > 60 && q.w < 220) {
        const side = rnd(s) < 0.5 ? 1 : -1, off = half - 9, horiz = Math.abs(ux) > Math.abs(uy), cw = horiz ? 45 : 18, ch = horiz ? 18 : 45, x = q.x - uy * off * side, y = q.y + ux * off * side;
        if (place(x - cw / 2, y - ch / 2, cw, ch, 'car', { low: true })) CT.cars.push(walls.length - 1);
      }
    });
    // деревянные опоры вдоль улиц
    RS.forEach((q, i) => { if (i % 31 === 2 && q.w > 60 && q.w < 200) { const a = q.a * Math.PI / 180, off = Math.max(q.w, 60) / 2 + 28; place(q.x + Math.sin(a) * off - 1.5, q.y - Math.cos(a) * off - 1.5, 3, 3, 'pole', { low: true }); } });
    for (const b of CT.buildings) if (b.kind === 'booth') b.sign = ['ПРОДУКТЫ', 'ПИВО', 'ЧАЙ 24', 'ТАБАК'][Math.floor(hsh01(b.id) * 4)];
    // внутренности входимых зданий
    for (const E_ of enterables) {
      const { c, ux, uy, vx, vy, iw, id_ } = E_; let nr = 0;
      if (E_.kind === 'house' || E_.kind === 'panel') { // жилые: комнаты (перегородки с дверным проёмом) и шкафы / ящики
        const alongU = iw >= id_, Lh = alongU ? iw : id_, Wh = alongU ? id_ : iw, au = alongU ? [ux, uy] : [vx, vy], an = alongU ? [vx, vy] : [ux, uy];
        const aligned = Math.abs(((E_.ang % 90) + 90) % 90) < 6 || Math.abs(((E_.ang % 90) + 90) % 90 - 90) < 6;
        const nroom = Math.max(1, Math.min(E_.kind === 'panel' ? 8 : 3, Math.round(Lh * 2 / (E_.kind === 'panel' ? 70 : 55))));
        for (let k = 0; k < nroom; k++) {
          const t0 = -Lh + k * (2 * Lh / nroom), t1 = t0 + 2 * Lh / nroom, tm = (t0 + t1) / 2;
          if (k > 0 && aligned) { // перегородка на t0 с проёмом
            const g = rr(s, -Wh * 0.5, Wh * 0.5);
            for (const [s0, s1] of [[-Wh, g - 6], [g + 6, Wh]]) {
              if (s1 - s0 < 4) continue;
              const pp = [[t0 - 1.5, s0], [t0 + 1.5, s0], [t0 + 1.5, s1], [t0 - 1.5, s1]].map(([a, b]) => ({ x: c.x + au[0] * a + an[0] * b, y: c.y + au[1] * a + an[1] * b }));
              const x0 = Math.min(...pp.map(q => q.x)), x1 = Math.max(...pp.map(q => q.x)), y0 = Math.min(...pp.map(q => q.y)), y1 = Math.max(...pp.map(q => q.y));
              add(x0, y0, x1 - x0, y1 - y0, 'wall', null, { low: false, inb: E_.id, part: true });
            }
          }
          if (rnd(s) < 0.8) { // мебель-контейнер в комнате
            const off = rr(s, -Wh * 0.7, Wh * 0.7), x = c.x + au[0] * tm + an[0] * off, y = c.y + au[1] * tm + an[1] * off;
            if (Math.hypot(x - E_.dcx, y - E_.dcy) > 30 && freeSpot(s, x, y, 7)) { const kc = mkCont(s, rnd(s) < 0.6 ? 'locker' : 'crate', x, y); kc.inb = E_.id; cont.push(kc); }
          }
        }
        continue;
      }
      for (let a = -iw + 30; a < iw - 30; a += 42) for (let b2 = -id_ + 26; b2 < id_ - 26; b2 += 52) {
        const x = c.x + ux * a + vx * b2, y = c.y + uy * a + vy * b2; if (Math.hypot(x - E_.dcx, y - E_.dcy) < 45) continue;
        const r0 = rnd(s);
        if (r0 < 0.5 && freeSpot(s, x, y, 16)) add(x - 13, y - 4.5, 27, 9, 'rack', null, { low: false, inb: E_.id });
        else if (r0 < 0.75 && freeSpot(s, x, y, 10)) add(x - 6, y - 6, 12, 12, 'crate', null, { low: true, inb: E_.id });
        else if (nr < 3 && freeSpot(s, x, y, 8)) { const k = mkCont(s, 'crate', x, y); k.inb = E_.id; cont.push(k); nr++; }
      }
    }
    // контейнеры: подъезды, гаражи, багажники, баки
    for (const b of CT.buildings) {
      if (b.kind === 'barrier') continue;
      const a = b.ang * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux, rp = nearestRoad(b.c.x, b.c.y) || b.c;
      const sides = [[0, -1], [0, 1], [1, 0], [-1, 0]].map(([k, m]) => ({ x: b.c.x + (k * ux * (b.w / 2 + 22)) + m * vx * (b.d / 2 + 22), y: b.c.y + k * uy * (b.w / 2 + 22) + m * vy * (b.d / 2 + 22), k, m }));
      sides.sort((p, q) => Math.hypot(p.x - rp.x, p.y - rp.y) - Math.hypot(q.x - rp.x, q.y - rp.y));
      const sd = sides[0], count = b.kind === 'panel' ? 2 : 1;
      if (b.kind === 'house' && rnd(s) < 0.45) continue;
      for (let n = 0; n < count; n++) {
        const off = count === 1 ? 0 : (n ? 1 : -1) * (sd.m ? b.w / 4 : b.d / 4), x = sd.x + (sd.m ? ux * off : vx * off), y = sd.y + (sd.m ? uy * off : vy * off);
        const kindC = b.kind === 'garage_row' ? 'garage' : b.kind === 'booth' || b.kind === 'shed' ? 'crate' : 'entrance';
        if (b.kind === 'shed' && rnd(s) < 0.5) continue;
        if (freeSpot(s, x, y, 7)) cont.push(mkCont(s, kindC, x, y));
      }
    }
    for (const i of CT.cars) { const w = walls[i], x = w.w > w.h ? w.x + w.w / 2 : w.x - 10, y = w.w > w.h ? w.y - 10 : w.y + w.h / 2; if (freeSpot(s, x, y, 6)) cont.push(mkCont(s, 'car', x, y)); }
    // objects drawn in the map editor / generated yards (metres): trees, parked cars, containers and bins
    for (const o of Wd.userObjs || []) {
      const x = o[1] * P, y = o[2] * P;
      if (o[0] === 'tree') { if (freeSpot(s, x, y, 10)) add(x - 2.5, y - 2.5, 5, 5, 'tree', null, { low: true }); }
      else if (o[0] === 'car') { const hz = Math.abs(Math.cos((o[3] || 0) * Math.PI / 180)) > 0.7, cw = hz ? 45 : 18, ch = hz ? 18 : 45; if (place(x - cw / 2, y - ch / 2, cw, ch, 'car', { low: true })) CT.cars.push(walls.length - 1); }
      else if (o[0] === 'container' || o[0] === 'bin') cont.push(mkCont(s, o[0] === 'bin' ? 'bin' : 'crate', x, y));
    }
    for (let k = 0, t = 0; !Wd.finalFootprints && CT.buildings.length && k < 400 && t < 4000; t++) { const b = CT.buildings[ri(s, 0, CT.buildings.length - 1)]; if (b.kind === 'barrier') continue; const x = b.c.x + rr(s, -b.w / 2 - 40, b.w / 2 + 40), y = b.c.y + rr(s, -b.d / 2 - 40, b.d / 2 + 40); if (freeSpot(s, x, y, 26)) { cont.push(mkCont(s, rnd(s) < 0.65 ? 'bin' : 'crate', x, y)); k++; } }
    cont.push(mkCont(s, 'crate', spawn.x + 70, spawn.y - 40));
    const far = cont.filter(c => { const d = Math.hypot(c.x - spawn.x, c.y - spawn.y); return d > 900 && d < 4200 && Math.hypot(c.x - M.gate.x, c.y - M.gate.y) > 160 && c.inb == null; });
    if (far.length) pick(s, far).key = true; else cont[cont.length - 1].key = true;
    s.containers = cont;
    sealPerimeter(s);
  }
  function gridAdd(s, i) {
    const w = s.map.walls[i], g = s._grid;
    for (let cx = Math.floor(w.x / CELL); cx <= Math.floor((w.x + w.w) / CELL); cx++)
      for (let cy = Math.floor(w.y / CELL); cy <= Math.floor((w.y + w.h) / CELL); cy++) { const k = cx + ',' + cy; let l = g.get(k); if (!l) g.set(k, l = []); l.push(i); }
  }
  function mkCont(s, kind, x, y) { return { id: s.nextId++, kind, x, y, searched: false }; }

  // ---------- мир ----------
  function newWorld(seed, entry, openIds, startId, fac) {
    const s = { seed, rng: seed >>> 0, t: 0, tick: 0, nextId: 1, players: {}, enemies: [], bullets: [], containers: [], events: [], spawnTimer: C.SPAWN.every, map: null };
    if (fac) s.playerFac = fac; // v61: gang chosen before the raid ('none' = no gang); enemies.js stanceOf reads it
    if (startId) { s.startId = startId; s.homeZone = startId; s.homeDistrict = startId; } // homeZone: свои для WL_START.friendly()
    if (window.B96_WORLD) genWorld(s); else if (window.B96_LEVEL) genCity(s); else genMap(s);
    for (const n of s.map.nodes) if (openIds && openIds.includes(n.id)) n.open = true;
    const en = !startId && s.map.nodes.find(n => n.id === entry && n.open); if (en) s.map.spawn = { x: en.x, y: en.y };
    if (s.map.zones && s.map.zones.length) {
      for (const z of s.map.zones) { for (let i = 0; i < z.raiders; i++) spawnEnemy(s, 'raider', null, 0, z); for (let i = 0; i < z.ghouls; i++) spawnEnemy(s, 'ghoul', null, 0, z); }
    } else {
      for (let i = 0; i < C.SPAWN.raiders; i++) spawnEnemy(s, 'raider');
      for (let i = 0; i < C.SPAWN.ghouls; i++) spawnEnemy(s, 'ghoul');
    }
    for (let i = 0; i < C.EXTRACTION.guards; i++) spawnEnemy(s, i % 3 === 2 ? 'ghoul' : 'raider', s.map.gate, 360);
    return s;
  }
  // ---------- база «Убежище» (hub/base.json): участок 30×50 м, дом 10×10 м; отдельная локация без врагов ----------
  function newBase(seed) {
    const P = C.PX_PER_M, W = 30 * P, H = 50 * P;
    const s = { seed, rng: seed >>> 0, t: 0, tick: 0, nextId: 1, mode: 'base', players: {}, enemies: [], bullets: [], containers: [], events: [], spawnTimer: 1e9, map: null };
    const walls = [], add = (x, y, w, h, kind, col, extra) => walls.push(Object.assign({ x, y, w, h, kind, col }, extra || {}));
    add(-60, -60, W + 120, 60, 'border'); add(-60, H, W + 120, 60, 'border'); add(-60, 0, 60, H, 'border'); add(W, 0, 60, H, 'border');
    // забор из плит по периметру; ворота участка (12–18 м, y 0–3) оставлены открытыми
    add(0, 0, 12 * P, 12, 'block', '#6e6cff', { low: true }); add(18 * P, 0, 12 * P, 12, 'block', '#6e6cff', { low: true });
    add(0, H - 12, W, 12, 'block', '#6e6cff', { low: true }); add(0, 12, 12, H - 24, 'block', '#6e6cff', { low: true }); add(W - 12, 12, 12, H - 24, 'block', '#6e6cff', { low: true });
    // дом 10×10 м (x 10–20, y 34–44), дверь с севера
    const hx = 10 * P, hy = 34 * P, hw = 10 * P, hh = 10 * P, col = '#5a8cff', D = 40;
    add(hx, hy, 30, WT, 'wall', col); add(hx + 30 + D, hy, hw - 30 - D, WT, 'wall', col);
    add(hx, hy + hh - WT, hw, WT, 'wall', col); add(hx, hy + WT, WT, hh - 2 * WT, 'wall', col); add(hx + hw - WT, hy + WT, WT, hh - 2 * WT, 'wall', col);
    // фонари, мёртвые деревья и ржавая «копейка» для обжитости
    for (const [x, y] of [[4, 8], [26, 8], [4, 30], [26, 30]]) add(x * P - 5, y * P - 5, 10, 10, 'lamp', '#ffb36b');
    for (const [x, y] of [[6, 20], [24, 22], [5, 46], [25, 47], [20, 14]]) add(x * P - 8, y * P - 8, 16, 16, 'tree', '#3b4a40');
    add(22 * P, 26 * P, 38, 78, 'car', '#7a4a3a');
    s.map = { w: W, h: H, walls, blds: [{ x: hx, y: hy, w: hw, h: hh, col, name: 'УБЕЖИЩЕ', sign: '' }], spawn: { x: 15 * P, y: 6 * P }, gate: { x: 15 * P, y: 1.5 * P, r: 30 },
      points: [{ id: 'trader', x: 20 * P, y: 19 * P, name: 'Торговец', r: 40 }, { id: 'stash', x: 18 * P, y: 42 * P, name: 'Склад', r: 36 }, { id: 'terminal', x: 15 * P, y: 35.8 * P, name: 'Консоль ОСИ', r: 36 }] };
    return s;
  }
  function spawnEnemy(s, type, near, radius, zone) {
    const def = C.ENEMIES[type];
    let zb = null; if (zone) { const xs = zone.poly.map(p => p.x), ys = zone.poly.map(p => p.y); zb = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; }
    for (let t = 0; t < 400; t++) {
      const x = near ? near.x + rr(s, -radius, radius) : zb ? rr(s, zb[0], zb[2]) : rr(s, 60, s.map.w - 60), y = near ? near.y + rr(s, -radius, radius) : zb ? rr(s, zb[1], zb[3]) : rr(s, 60, s.map.h - 60);
      if (zone && !inPoly(x, y, zone.poly)) continue;
      if (zone && s.map.zoneGrid && zoneAt(s, x, y) !== zone) continue; // растр районов точнее полигона: не ставим мобов за периметр
      if (!freeSpot(s, x, y, def.r + 2)) continue;
      if (near && Math.hypot(x - near.x, y - near.y) < 90) continue; // не в самих воротах
      const far = Object.values(s.players).every(p => Math.hypot(p.x - x, p.y - y) > C.SPAWN.minDistFromPlayer);
      if (!far || Math.hypot(x - s.map.spawn.x, y - s.map.spawn.y) < C.SPAWN.minDistFromPlayer) continue;
      const e = { id: s.nextId++, type, x, y, r: def.r, hp: def.hp, maxHp: def.hp, faction: 'mutants', ang: rr(s, 0, 6.28), wander: rr(s, 0, 6.28), wt: rr(s, 1, 3), alert: 0, lx: x, ly: y, cool: rr(s, 0.5, 1.5), mag: 0, strafe: 1, st: 0, hitFlash: 0, rp: 0, dk: 0, direct: false, path: null, pi: 0, gx: -1e9, gy: -1e9, mode: 'advance', mt: 0, ct: 0, cover: null, peek: null, fled: false, wgoal: null, sk: 0.5, sx: x, sy: y };
      if (type === 'raider') { e.faction = 'raiders'; e.mag = def.gun.mag; }
      s.enemies.push(e); return e;
    }
  }

  // ---------- игрок ----------
  const derived = (p) => {
    const st = p.stats, sk = p.skills;
    return {
      maxHp: 70 + st.end * 10,
      stamMax: C.STAMINA.base + st.end * C.STAMINA.perEnd,
      carry: 20 + st.str * 5,
      speed: 26.4 * (1 + 0.03 * st.agi),
      reloadMul: 1 - 0.04 * st.agi,
      rangeMul: 1 + 0.04 * (st.per - 3),
      spreadMul: Math.max(0.3, (1 - 0.08 * sk.shoot) * (1 - 0.03 * (st.per - 3))),
      needMul: 1 - 0.04 * st.end,
      searchMul: 1 - 0.12 * sk.scav,
      healMul: 1 + 0.2 * sk.med,
      melee: C.MELEE.dmg + st.str * 2,
    };
  };
  // load (необязательно): { char:{level,xp,stats,skills,statPts,skillPts}, inv:[[id,n]], weapons:[{id,att}] } — из убежища
  function addPlayer(s, id, name, load) {
    const sp = s.map.spawn;
    const p = { id, name, x: sp.x, y: sp.y, r: 3.5, faction: 'players', hp: 1, hunger: 100, thirst: 100,
      stats: { str: C.STATS.base, agi: C.STATS.base, per: C.STATS.base, end: C.STATS.base }, skills: { shoot: 0, scav: 0, med: 0 },
      statPts: 0, skillPts: 0, level: 1, xp: 0, inv: [], weapons: [], cur: 0, cool: 0, reload: 0, bloom: 0, melee: 0,
      search: null, adren: 0, adrenCd: 0, dead: false, ax: sp.x + 100, ay: sp.y, moving: false, kills: 0, looted: 0, hitFlash: 0,
      stam: 100, tired: false, stamDelay: 0, sprinting: false, extract: 0, extracted: false, nag: 0 };
    const L = load || { inv: C.START.inv, weapons: C.START.weapons.map(id => ({ id })) };
    if (L.char) { p.level = L.char.level; p.xp = L.char.xp; p.stats = Object.assign({}, L.char.stats); p.skills = Object.assign({}, L.char.skills); p.statPts = L.char.statPts; p.skillPts = L.char.skillPts; }
    L.inv.forEach(([i, n]) => invAdd(p, i, n));
    L.weapons.slice(0, 3).forEach(w => p.weapons.push({ id: w.id, mag: 0, att: Object.assign({}, w.att || {}) }));
    for (const w of p.weapons) { const def = C.WEAPONS[w.id]; w.mag = invTake(p, def.ammo, def.mag); }
    const d = derived(p); p.hp = d.maxHp; p.stam = d.stamMax;
    if (s.playerFac) p.style = s.playerFac === 'none' ? 'drifter' : 'g_' + s.playerFac; // outfit (modules/characters.js STYLES)
    s.players[id] = p; return p;
  }
  const invCount = (p, id) => p.inv.reduce((a, it) => a + (it.id === id ? it.n : 0), 0);
  function invAdd(p, id, n) { const it = p.inv.find(i => i.id === id); if (it) it.n += n; else p.inv.push({ id, n }); }
  function invTake(p, id, n) {
    let need = n;
    for (const it of p.inv) if (it.id === id && need > 0) { const k = Math.min(it.n, need); it.n -= k; need -= k; }
    p.inv = p.inv.filter(i => i.n > 0); return n - need;
  }
  const invWeight = (p) => p.inv.reduce((a, it) => a + C.ITEMS[it.id].w * it.n, 0) + p.weapons.reduce((a, w) => a + C.ITEMS[w.id].w, 0);
  const xpNeed = (l) => C.XP.levelBase + l * l * C.XP.levelSq;
  function addXp(s, p, n) {
    p.xp += n;
    while (p.xp >= xpNeed(p.level)) { p.xp -= xpNeed(p.level); p.level++; p.statPts++; p.skillPts++; s.events.push({ t: 'level', pid: p.id, level: p.level }); }
  }
  // Навесное меняет множители: eff, max (дальность), spread, bloom, kick, dmg, noise.
  function attachMods(w) {
    const m = { eff: 1, max: 1, spread: 1, bloom: 1, kick: 1, dmg: 1, noise: 1 };
    for (const slot in (w.att || {})) { const a = C.ATTACH[w.att[slot]]; if (a) for (const k in a.mod) m[k] *= a.mod[k]; }
    return m;
  }
  function weaponStats(p) {
    const w = p.weapons[p.cur]; if (!w) return null;
    const def = C.WEAPONS[w.id], d = derived(p), m = attachMods(w);
    return { w, def, m, eff: def.eff * d.rangeMul * m.eff, max: def.max * d.rangeMul * m.max, d };
  }

  function rollLoot(s, kind, p) {
    const def = C.CONTAINERS[kind], out = [];
    let rolls = ri(s, def.rolls[0], def.rolls[1]);
    if (p && rnd(s) < 0.15 * p.skills.scav) rolls++;
    const total = def.table.reduce((a, r) => a + r[3], 0);
    for (let i = 0; i < rolls; i++) {
      let x = rnd(s) * total;
      for (const r of def.table) { x -= r[3]; if (x <= 0) { out.push([r[0], ri(s, r[1], r[2])]); break; } }
    }
    return out;
  }
  function giveLoot(s, p, list) {
    for (const [id, n] of list) {
      if (C.ITEMS[id].kind === 'weapon') {
        if (p.weapons.some(w => w.id === id)) { invAdd(p, 'scrap', 2); s.events.push({ t: 'toast', pid: p.id, text: `${C.ITEMS[id].name} → разобран: +2 ${C.ITEMS.scrap.name}` }); continue; }
        if (p.weapons.length < 3) { p.weapons.push({ id, mag: 0 }); s.events.push({ t: 'toast', pid: p.id, text: `Оружие: ${C.ITEMS[id].name} (слот ${p.weapons.length})`, hot: true }); continue; }
      }
      invAdd(p, id, n);
      s.events.push({ t: 'toast', pid: p.id, text: `+${n} ${C.ITEMS[id].name}` });
    }
  }

  // ---------- стрельба ----------
  function fire(s, sh, gun, aimAng, spreadDeg, eff, max, extra) {
    const b0 = { faction: sh.faction, owner: sh.id, dmg: gun.dmg, eff, max, minDmg: gun.minDmg, color: gun.color };
    for (let i = 0; i < gun.pellets; i++) {
      const a = aimAng + (rnd(s) + rnd(s) - 1) * spreadDeg * 0.5 * D2R;
      const sp = gun.speed * (gun.pellets > 1 ? rr(s, 0.9, 1.1) : 1);
      s.bullets.push(Object.assign({ x: sh.x + Math.cos(aimAng) * (sh.r + 6), y: sh.y + Math.sin(aimAng) * (sh.r + 6), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, sp, dist: 0 }, b0));
    }
    s.events.push({ t: 'shot', x: sh.x, y: sh.y, a: aimAng, color: gun.color, sound: gun.sound || 700, by: sh.faction, owner: sh.id, quiet: !!(extra && extra.quiet), kick: extra ? extra.kick : undefined });
  }
  function noise(s, x, y, r) {
    for (const e of s.enemies) if (Math.hypot(e.x - x, e.y - y) < r) { e.alert = Math.max(e.alert, 5); e.lx = x; e.ly = y; }
  }
  function damage(s, target, amount, src) {
    if (target.dead) return;
    target.hp -= amount; target.hitFlash = 0.12; if (target.faction === 'players') { target.evacLock = 60; target.nodeT = 0; }
    s.events.push({ t: 'hit', x: target.x, y: target.y, amount: Math.round(amount), player: target.faction === 'players', sx: src ? src.x : undefined, sy: src ? src.y : undefined, why: src ? (src.type || 'player') : 'env', tt: target.type, tid: target.id });
    if (target.faction !== 'players') { target.alert = 6; if (src) { target.lx = src.x; target.ly = src.y; } }
    if (target.hp > 0) return;
    if (target.faction === 'players') { target.dead = true; target.hp = 0; s.events.push({ t: 'death', pid: target.id }); return; }
    s.enemies = s.enemies.filter(e => e !== target);
    s.events.push({ t: 'kill', x: target.x, y: target.y, type: target.type });
    if (src && s.players[src.id]) { const p = s.players[src.id]; p.kills++; addXp(s, p, C.ENEMIES[target.type].xp); }
    if (rnd(s) < (target.type === 'raider' ? 0.85 : 0.4)) s.containers.push(mkCont(s, 'body', target.x, target.y));
  }

  function stepPlayer(s, p, cmd, dt) {
    if (p.dead || p.extracted) return;
    const d = derived(p), A = C.ABILITIES.adrenaline;
    p.adren = Math.max(0, p.adren - dt); p.adrenCd = Math.max(0, p.adrenCd - dt);
    p.hitFlash = Math.max(0, p.hitFlash - dt); p.evacLock = Math.max(0, (p.evacLock || 0) - dt);
    if (cmd.ability && p.adrenCd <= 0) { p.adren = A.dur; p.adrenCd = A.cd; s.events.push({ t: 'ability', pid: p.id }); }
    // движение
    let mx = cmd.mx || 0, my = cmd.my || 0; const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    const over = invWeight(p) > d.carry, ST = C.STAMINA;
    // бег: Shift тратит выносливость; при нуле — усталость, пока не восстановится порог
    const wantSprint = !!cmd.sprint && ml > 0.1 && !p.search && !p.tired && p.stam > 0;
    p.sprinting = wantSprint;
    if (wantSprint) { p.stam = Math.max(0, p.stam - ST.drain * dt); p.stamDelay = ST.regenDelay; if (p.stam <= 0) p.tired = true; }
    else { p.stamDelay = Math.max(0, p.stamDelay - dt); if (p.stamDelay <= 0) p.stam = Math.min(d.stamMax, p.stam + ST.regen * (ml > 0.1 ? 0.6 : 1) * dt); if (p.tired && p.stam >= ST.recover) p.tired = false; }
    const speed = d.speed * (over ? 0.6 : 1) * (p.adren > 0 ? A.speed : 1) * (wantSprint ? ST.sprintMul : 1) * (p.search ? 0.0 : 1);
    // лёгкая инерция: скорость подтягивается к целевой (разгон ~0.1 с, торможение ~0.07 с), упор в стену гасит скорость
    const tvx = mx * speed, tvy = my * speed, k = Math.min(1, (ml > 0.05 ? 11 : 15) * dt);
    p.vx = (p.vx || 0) + (tvx - (p.vx || 0)) * k; p.vy = (p.vy || 0) + (tvy - (p.vy || 0)) * k;
    const px0 = p.x, py0 = p.y; p.x += p.vx * dt; p.y += p.vy * dt; collide(s, p);
    if (dt > 0) { const rx = (p.x - px0) / dt, ry = (p.y - py0) / dt; if (Math.abs(rx) < Math.abs(p.vx) * 0.5) p.vx = rx; if (Math.abs(ry) < Math.abs(p.vy) * 0.5) p.vy = ry; }
    p.moving = ml > 0.1 && !p.search;
    p.ax = cmd.ax ?? p.ax; p.ay = cmd.ay ?? p.ay;
    // оружие
    if (cmd.slot != null && p.weapons[cmd.slot] && cmd.slot !== p.cur) { p.cur = cmd.slot; p.reload = 0; p.cool = Math.max(p.cool, 0.25); }
    const ws = weaponStats(p);
    p.cool -= dt; p.melee = Math.max(0, p.melee - dt);
    p.bloom = Math.max(0, p.bloom - dt * 6);
    if (ws) {
      const { w, def } = ws;
      const reserve = invCount(p, def.ammo);
      if (cmd.reload && p.reload <= 0 && w.mag < def.mag && reserve > 0) p.reload = def.reload * d.reloadMul * (p.adren > 0 ? A.reload : 1);
      if (p.reload > 0) {
        p.reload -= dt;
        if (p.reload <= 0) { const k = invTake(p, def.ammo, def.mag - w.mag); w.mag += k; p.reload = 0; }
      } else if (cmd.fire && p.cool <= 0 && !p.search) {
        if (w.mag > 0) {
          const ang = Math.atan2(p.ay - p.y, p.ax - p.x);
          const m = ws.m, spread = (def.spread + (p.moving ? def.moveSpread : 0) + (p.sprinting ? C.STAMINA.spreadAdd : 0) + p.bloom) * d.spreadMul * m.spread;
          fire(s, p, m.dmg === 1 ? def : Object.assign({}, def, { dmg: def.dmg * m.dmg }), ang, spread, ws.eff, ws.max, { quiet: m.noise < 0.6, kick: def.kick * m.kick });
          w.mag--; p.cool = def.rof; p.bloom = Math.min(p.bloom + def.bloom * m.bloom, 12);
          noise(s, p.x, p.y, 650 * m.noise * (p.sprinting ? C.STAMINA.noiseMul : 1));
        } else if (reserve > 0) { p.reload = def.reload * d.reloadMul; }
        else { p.cool = 0.4; s.events.push({ t: 'empty', pid: p.id }); }
      }
    }
    // ближний бой (второстепенный)
    if (cmd.melee && p.melee <= 0) {
      p.melee = C.MELEE.cooldown;
      const ang = Math.atan2(p.ay - p.y, p.ax - p.x);
      s.events.push({ t: 'melee', x: p.x, y: p.y, a: ang });
      for (const e of [...s.enemies]) {
        const dx = e.x - p.x, dy = e.y - p.y, dist = Math.hypot(dx, dy);
        let da = Math.abs(Math.atan2(dy, dx) - ang); if (da > Math.PI) da = 2 * Math.PI - da;
        if (dist < C.MELEE.range + e.r + p.r && da < C.MELEE.arc * D2R / 2) {
          damage(s, e, d.melee, p);
          if (s.enemies.includes(e)) { e.x += dx / dist * 22; e.y += dy / dist * 22; collide(s, e); }
        }
      }
    }
    // обыск (удерживать E)
    if (cmd.interact) {
      let best = null, bd = 20;
      for (const c of s.containers) if (!c.searched && canReachInterior(s, p, c)) { const dd = Math.hypot(c.x - p.x, c.y - p.y); if (dd < bd) { bd = dd; best = c; } }
      if (best && (!p.search || p.search.id !== best.id)) p.search = { id: best.id, t: 0, need: C.CONTAINERS[best.kind].time * d.searchMul + (best.locked ? 3.5 : 0) };
      if (!best) p.search = null;
      const G = s.map.gate, atGate = Math.hypot(p.x - G.x, p.y - G.y) < G.r;
      if (s.mode === 'base') { if (atGate) { p.extract += dt; if (p.extract >= 1) { p.extract = 0; s.events.push({ t: 'depart', pid: p.id }); } } else p.extract = 0; }
      else if (!best && atGate) { // ворота: нужен ключ, потом удерживать E
        if (invCount(p, C.EXTRACTION.keyItem) > 0) {
          p.extract += dt;
          if (p.extract >= C.EXTRACTION.holdTime) { p.extracted = true; s.events.push({ t: 'extract', pid: p.id }); }
        } else { p.nag -= dt; if (p.nag <= 0) { p.nag = 3; s.events.push({ t: 'toast', pid: p.id, text: 'Ворота заперты: найди ключ эвакуации' }); } }
      } else p.extract = 0;
      const nd = s.mode === 'base' ? null : s.map.nodes.find(n => Math.hypot(n.x - p.x, n.y - p.y) < n.r);
      if (!best && nd && !atGate) { // узел ОСИ: открыть касанием (3 с) или аварийно эвакуироваться (канал 15 с, прерывается уроном, 60 с запрета после урона)
        if (!nd.open) { p.nodeT = (p.nodeT || 0) + dt; if (p.nodeT >= 3) { nd.open = true; p.nodeT = 0; s.events.push({ t: 'node', pid: p.id, id: nd.id, name: nd.name }); } }
        else if (p.evacLock > 0) { p.nodeT = 0; p.nag -= dt; if (p.nag <= 0) { p.nag = 3; s.events.push({ t: 'toast', pid: p.id, text: `Узел заблокирован после урона: ещё ${Math.ceil(p.evacLock)} с` }); } }
        else { p.nodeT = (p.nodeT || 0) + dt; if (p.nodeT >= 15) { p.extracted = true; s.events.push({ t: 'extract', pid: p.id, node: nd.id }); } }
      } else p.nodeT = 0;
      if (p.search) {
        p.search.t += dt;
        if (p.search.t >= p.search.need) {
          const c = s.containers.find(q => q.id === p.search.id); c.searched = true; p.search = null; p.looted++;
          const loot = c.loot || rollLoot(s, c.kind, p);
          if (!loot.length) s.events.push({ t: 'toast', pid: p.id, text: `${C.CONTAINERS[c.kind].name}: пусто` });
          if (c.locked) { c.locked = false; const car = s.cars && s.cars.find(q => q.id === c.carId); if (car) car.locked = false; s.events.push({ t: 'msg', pid: p.id, text: 'Замок вскрыт' }); } giveLoot(s, p, loot); addXp(s, p, C.XP.container); s.events.push({ t: 'found', pid: p.id, name: C.CONTAINERS[c.kind].name, items: loot.map(([id, n]) => [C.ITEMS[id].name, n]) });
          if (c.key) { invAdd(p, C.EXTRACTION.keyItem, 1); s.events.push({ t: 'toast', pid: p.id, text: `Найдено: ${C.ITEMS[C.EXTRACTION.keyItem].name}. Иди к воротам`, hot: true }); s.events.push({ t: 'key', pid: p.id }); }
          if (c.kind === 'body') s.containers = s.containers.filter(q => q !== c);
        }
      }
    } else { p.search = null; p.extract = 0; p.nodeT = 0; }
    // нужды (в базе не тратятся)
    if (s.mode === 'base') return;
    const N = C.NEEDS;
    p.hunger = Math.max(0, p.hunger - N.hunger * d.needMul * dt);
    p.thirst = Math.max(0, p.thirst - N.thirst * d.needMul * dt);
    if (p.hunger <= 0 || p.thirst <= 0) damage(s, p, N.starve * dt, null);
    else if (p.hunger > N.regenAbove && p.thirst > N.regenAbove) p.hp = Math.min(d.maxHp, p.hp + N.regen * dt);
  }

  // UI-действия игрока — тоже команды (по сети уйдут так же)
  function applyAction(s, p, a) {
    if (!p || p.dead) return;
    const d = derived(p);
    if (a.type === 'veh') { toggleCar(s, p); return; }
    if (a.type === 'use') {
      const it = p.inv[a.idx]; if (!it) return; const def = C.ITEMS[it.id];
      if (def.kind === 'heal') { p.hp = Math.min(d.maxHp, p.hp + def.heal * d.healMul); invTake(p, it.id, 1); s.events.push({ t: 'toast', pid: p.id, text: `${def.name}: +${Math.round(def.heal * d.healMul)} HP` }); }
      else if (def.kind === 'food') { if (def.food) p.hunger = Math.min(100, p.hunger + def.food); if (def.water) p.thirst = Math.min(100, p.thirst + def.water); invTake(p, it.id, 1); }
    } else if (a.type === 'drop') {
      const it = p.inv[a.idx]; if (it) invTake(p, it.id, it.n);
    } else if (a.type === 'equip') {
      const it = p.inv[a.idx]; if (!it || C.ITEMS[it.id].kind !== 'weapon') return;
      invTake(p, it.id, 1);
      const old = p.weapons[p.cur]; p.weapons[p.cur] = { id: it.id, mag: 0 }; p.reload = 0;
      if (old) { invAdd(p, C.WEAPONS[old.id].ammo, old.mag); invAdd(p, old.id, 1); }
    } else if (a.type === 'attach') { // установить найденное навесное на оружие в руках
      const it = p.inv[a.idx], w = p.weapons[p.cur]; if (!it || !w || C.ITEMS[it.id].kind !== 'attach') return;
      const slot = C.ATTACH[it.id].slot; w.att = w.att || {};
      invTake(p, it.id, 1); if (w.att[slot]) invAdd(p, w.att[slot], 1); w.att[slot] = it.id;
    } else if (a.type === 'detach') {
      const w = p.weapons[p.cur]; if (!w || !w.att || !w.att[a.key]) return;
      invAdd(p, w.att[a.key], 1); delete w.att[a.key];
    } else if (a.type === 'stat') {
      if (s.mode === 'base' && p.statPts > 0 && p.stats[a.key] < C.STATS.max) { const before = d.maxHp; p.stats[a.key]++; p.statPts--; p.hp += derived(p).maxHp - before; }
    } else if (a.type === 'skill') {
      if (s.mode === 'base' && p.skillPts > 0 && p.skills[a.key] < C.SKILLS.max) { p.skills[a.key]++; p.skillPts--; }
    }
  }

  // ---------- враги ----------
  // ---------- ИИ врагов: путь по навигационной сетке (nav.js), укрытия, дистанция ----------
  const NAVR = 11;
  function nfree(s) {
    if (!s._free) Object.defineProperty(s, '_free', { value: (x, y) => freeSpot(s, x, y, NAVR), enumerable: false, writable: true });
    return s._free;
  }
  const hyp = Math.hypot;

  // Вектор к цели по пути. Прямая видимость с клиренсом — идём напрямую; иначе A* (перепланирование
  // раз в ~1 с или если цель сместилась). Возвращает {x,y,done} либо null (пути нет).
  function navDir(s, e, gx, gy, dt, bud) {
    const NAV = window.WL_NAV, free = nfree(s);
    e.rp -= dt; e.dk -= dt;
    if (e.dk <= 0) { e.dk = 0.2; e.direct = hyp(gx - e.x, gy - e.y) < 700 && NAV.lineFree(e.x, e.y, gx, gy, free); }
    const dx0 = gx - e.x, dy0 = gy - e.y, d0 = hyp(dx0, dy0);
    if (e.direct) { e.path = null; return d0 < 6 ? { x: 0, y: 0, done: true } : { x: dx0 / d0, y: dy0 / d0, done: false }; }
    const shifted = hyp(gx - e.gx, gy - e.gy) > 60;
    if ((!e.path || e.rp <= 0 || shifted) && bud.n > 0) {
      bud.n--; e.path = NAV.find(s, e.x, e.y, gx, gy, free, 6000); e.pi = 0; e.gx = gx; e.gy = gy;
      e.rp = 0.8 + ((e.id * 7) % 10) / 20;
    }
    if (!e.path) return null;
    while (e.pi < e.path.length && hyp(e.path[e.pi].x - e.x, e.path[e.pi].y - e.y) < 14) e.pi++;
    if (e.pi >= e.path.length) return { x: 0, y: 0, done: true };
    const w = e.path[e.pi], dx = w.x - e.x, dy = w.y - e.y, d = hyp(dx, dy) || 1;
    return { x: dx / d, y: dy / d, done: false };
  }

  // Точка, из которой цель (tx,ty) не видна: за стеной, машиной или блоком.
  function findCover(s, e, tx, ty, far) {
    const free = nfree(s), NAV = window.WL_NAV, td = hyp(e.x - tx, e.y - ty);
    let best = null, bs = 1e9;
    for (let k = 0; k < 24; k++) {
      const a = rr(s, 0, 6.2832), r = rr(s, 50, 230), x = e.x + Math.cos(a) * r, y = e.y + Math.sin(a) * r;
      if (!free(x, y) || rayWallAll(s, x, y, tx, ty) < 0) continue;
      const dT = hyp(x - tx, y - ty);
      let sc = r + (far ? -dT * 0.5 : Math.max(0, td - dT) * 0.8);
      if (!NAV.lineFree(e.x, e.y, x, y, free)) sc += 150; // нужен обход — менее выгодно
      if (sc < bs) { bs = sc; best = { x, y }; }
    }
    return best;
  }

  function stepEnemies(s, dt) {
    const players = Object.values(s.players).filter(p => !p.dead && !p.extracted), bud = { n: 4 }, free = nfree(s);
    for (const e of s.enemies) {
      const def = C.ENEMIES[e.type], ai = def.ai || {};
      e.hitFlash = Math.max(0, e.hitFlash - dt); e.alert = Math.max(0, e.alert - dt); e.cool -= dt; e.st -= dt;
      let tgt = null, td = 1e9;
      for (const p of players) { const dd = hyp(p.x - e.x, p.y - e.y); if (dd < td) { td = dd; tgt = p; } }
      const sees = tgt && td < def.sight && los(s, e, tgt);
      if (sees) { e.alert = 4; e.lx = tgt.x; e.ly = tgt.y; }
      let mx = 0, my = 0, sp = def.speed, want = false;
      const go = (gx, gy) => { const v = navDir(s, e, gx, gy, dt, bud); if (v) { mx += v.x; my += v.y; want = !v.done; return v; } return null; };

      if (e.alert > 0) {
        e.wgoal = null;
        e.ang = Math.atan2((sees ? tgt.y : e.ly) - e.y, (sees ? tgt.x : e.lx) - e.x);
        if (e.type === 'raider') {
          const g = def.gun, hpPct = e.hp / e.maxHp;
          if (ai.cover && !e.fled && hpPct < ai.fleeHp && e.mode !== 'flee') { e.mode = 'flee'; e.mt = 5; e.cover = null; e.ct = 0; }
          e.ct -= dt; e.mt -= dt;
          if (e.mode === 'flee' || e.mode === 'cover') {
            const far = e.mode === 'flee';
            if (!e.cover || e.ct <= 0) { e.cover = findCover(s, e, e.lx, e.ly, far); e.ct = 2.5; }
            let inCover = !sees;
            if (e.cover) { const v = go(e.cover.x, e.cover.y); if (v && v.done) inCover = true; }
            if (e.mode === 'flee') { sp *= 1.1; if (e.mt <= 0 && !sees) { e.mode = 'advance'; e.fled = true; } }
            else if (inCover && e.mag > 0 && e.cool <= 0) {
              if (e.peek == null) e.peek = rr(s, ai.peek[0], ai.peek[1]);
              e.peek -= dt; if (e.peek <= 0) { e.peek = null; e.mode = 'advance'; e.cover = null; }
            }
            if (sees && e.mode === 'cover' && !e.cover && td < 140) e.mode = 'shoot'; // прижали и укрыться некуда
          } else if (e.mode === 'shoot') {
            if (!sees || td > ai.keep + 120) e.mode = 'advance';
            else {
              if (e.st <= 0) { e.strafe = rnd(s) < 0.5 ? -1 : 1; e.st = rr(s, 0.8, 2); }
              const dx = tgt.x - e.x, dy = tgt.y - e.y;
              if (td < ai.keep - 70) { mx -= dx / td; my -= dy / td; want = true; }
              mx += -dy / td * e.strafe * 0.6; my += dx / td * e.strafe * 0.6; sp *= 0.7;
              if (e.mt <= 0 && ai.cover && rnd(s) < 0.4) { e.mode = 'cover'; e.cover = null; e.ct = 0; }
            }
          } else { // advance: идём по пути, пока не появится огневая позиция
            if (sees && td <= ai.keep + 50) { e.mode = 'shoot'; e.mt = rr(s, 2.5, 5); }
            else go(e.lx, e.ly);
          }
          if (e.mag <= 0 && e.cool <= 0) e.mag = g.mag;
          if (sees && e.cool <= 0 && e.mag > 0 && td < g.max * 0.95 && (e.mode === 'shoot' || e.mode === 'advance')) {
            fire(s, e, g, e.ang, g.spread, g.eff, g.max); e.mag--;
            e.cool = e.mag <= 0 ? g.reload : g.rof * rr(s, 0.8, 1.4);
            if (e.mag <= 0 && ai.cover && e.mode !== 'flee') { e.mode = 'cover'; e.cover = null; e.ct = 0; e.peek = null; }
          }
        } else { // гуль: преследует по пути, к последнему известному положению цели
          sp *= 1;
          const tx = sees ? tgt.x : e.lx, ty = sees ? tgt.y : e.ly;
          if (!(sees && td < e.r + tgt.r + def.bite.range + 6)) go(tx, ty);
          if (tgt && td < e.r + tgt.r + def.bite.range && e.cool <= 0) { damage(s, tgt, def.bite.dmg, e); e.cool = def.bite.cd; s.events.push({ t: 'bite', x: tgt.x, y: tgt.y }); }
        }
      } else {
        // блуждание по пути к случайной точке неподалёку
        e.mode = 'advance'; e.peek = null; e.cover = null;
        e.wt -= dt;
        if (!e.wgoal || e.wt <= 0) {
          e.wgoal = null; e.wt = rr(s, 3, 7);
          for (let k = 0; k < 8 && !e.wgoal; k++) { const a = rr(s, 0, 6.2832), r = rr(s, 100, 260), x = e.x + Math.cos(a) * r, y = e.y + Math.sin(a) * r; if (free(x, y)) e.wgoal = { x, y }; }
        }
        if (e.wgoal) { const v = go(e.wgoal.x, e.wgoal.y); if (!v || v.done) { e.wgoal = null; e.wt = Math.min(e.wt, 1); } }
        sp *= 0.35; if (want) e.ang = Math.atan2(my, mx);
      }

      // движение + проверка застревания
      const ml = hyp(mx, my); if (ml > 1) { mx /= ml; my /= ml; }
      e.x += mx * sp * dt; e.y += my * sp * dt; collide(s, e);
      e.sk -= dt;
      if (e.sk <= 0) {
        e.sk = 0.5;
        if (want && hyp(e.x - e.sx, e.y - e.sy) < sp * 0.5 * 0.25) { e.rp = 0; e.dk = 0; e.direct = false; e.path = null; e.wgoal = null; }
        e.sx = e.x; e.sy = e.y;
      }
    }
    // раздвинуть врагов друг от друга
    for (let i = 0; i < s.enemies.length; i++) for (let j = i + 1; j < s.enemies.length; j++) {
      const a = s.enemies[i], b = s.enemies[j], dx = b.x - a.x, dy = b.y - a.y, d = hyp(dx, dy), m = a.r + b.r;
      if (d > 0 && d < m) { const k = (m - d) / 2 / d; a.x -= dx * k; a.y -= dy * k; b.x += dx * k; b.y += dy * k; }
    }
  }

  function stepBullets(s, dt) {
    const keep = [];
    const actors = () => [...Object.values(s.players).filter(p => !p.dead && !p.extracted), ...s.enemies];
    for (const b of s.bullets) {
      const step = b.sp * dt, nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
      let best = 1.01, hitA = null;
      const tw = rayWallAll(s, b.x, b.y, nx, ny);
      if (tw >= 0) best = tw; // стены и низкие укрытия (машины, блоки) держат пулю
      let hitCar = null;
      if (s.cars) for (const c of s.cars) {
        if (Math.abs(c.x - b.x) > 90 && Math.abs(c.x - nx) > 90 || Math.abs(c.y - b.y) > 90 && Math.abs(c.y - ny) > 90) continue;
        if (c.driver != null && c.driver === b.owner) continue;
        const t = B96_VEH.segHit(c, b.x, b.y, nx, ny); if (t >= 0 && t <= best) { best = t; hitCar = c; }
      }
      for (const a of actors()) {
        if (a.faction === b.faction || (a.faction !== 'players' && b.faction !== 'players')) continue; // мутанты и рейдеры друг в друга не стреляют
        const t = segCircle(b.x, b.y, nx, ny, a.x, a.y, a.r);
        if (t >= 0 && t < best) { best = t; hitA = a; }
      }
      if (best <= 1) {
        const dist = b.dist + step * best, hx = b.x + (nx - b.x) * best, hy = b.y + (ny - b.y) * best;
        if (hitA) {
          const k = dist <= b.eff ? 1 : 1 - (1 - b.minDmg) * Math.min(1, (dist - b.eff) / (b.max - b.eff));
          const src = s.players[b.owner] || s.enemies.find(e => e.id === b.owner) || null;
          damage(s, hitA, b.dmg * k, src);
        } else { s.events.push({ t: 'spark', x: hx, y: hy, color: b.color });
          if (hitCar) { const src = s.players[b.owner] || s.enemies.find(e => e.id === b.owner) || null; if (hitCar.locked && rnd(s) < 0.3) { hitCar.locked = false; const k = s.containers.find(q => q.id === hitCar.cont); if (k) k.locked = false; s.events.push({ t: 'unlock', x: hitCar.x, y: hitCar.y }); } damageCar(s, hitCar, b.dmg * (b.dist <= b.eff ? 1 : 0.6), src); } }
        continue;
      }
      b.x = nx; b.y = ny; b.dist += step;
      if (b.dist >= b.max) { s.events.push({ t: 'drop', x: b.x, y: b.y }); continue; }
      keep.push(b);
    }
    s.bullets = keep;
  }


  // ---------- периметр: город запечатан по границе 16 районов ----------
  function sealPerimeter(s) {
    if (!(window.WL_CONFIG && WL_CONFIG.SEAL_PERIMETER)) return; // по решению пользователя (25.11): границы района на карте нет; включается только флагом SEAL_PERIMETER
    const M = s.map, zg = M.zoneGrid; if (!zg || !M.zones || !M.zones.length) return;
    const W = zg.w, H = zg.h, MP = zg.MP, ids = new Set(M.zones.map(z => z.n)), ins = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) ins[i] = ids.has(zg.data[i]) ? 1 : 0;
    const out = new Uint8Array(W * H), st = [];
    const push = (x, y) => { const i = y * W + x; if (!ins[i] && !out[i]) { out[i] = 1; st.push(i); } };
    for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); } for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
    while (st.length) { const i = st.pop(), x = i % W, y = (i / W) | 0; if (x > 0) push(x - 1, y); if (x < W - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < H - 1) push(x, y + 1); }
    const R = 2, band = new Uint8Array(W * H); // полоса толщиной 2 клетки (~3,8 м) снаружи от края районов
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!out[i]) continue; let near = false; for (let dy = -R; dy <= R && !near; dy++) for (let dx = -R; dx <= R; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H && ins[yy * W + xx]) { near = true; break; } } if (near) band[i] = 1; }
    let n = 0;
    for (let y = 0; y < H; y++) { let x = 0; while (x < W) { if (!band[y * W + x]) { x++; continue; } let x2 = x; while (x2 < W && band[y * W + x2]) x2++; M.walls.push({ x: x * MP, y: y * MP, w: (x2 - x) * MP, h: MP, kind: 'border', col: null, perim: true }); n++; x = x2; } }
    delete s._grid; M.perimWalls = n;
  }

  // ---------- машины: физические объекты ----------
  const CAR = { hw: 22.5, hh: 9, vmax: 125, acc: 95, brake: 170, turn: 2.8, hp: 140, boomR: 78 };
  const angDiff = (a, b) => { let d = (a - b) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };
  function carRect(c) { const hz = Math.abs(Math.cos(c.ang)) >= Math.abs(Math.sin(c.ang)), hw = hz ? CAR.hw : CAR.hh, hh = hz ? CAR.hh : CAR.hw; return { x: c.x - hw, y: c.y - hh, w: hw * 2, h: hh * 2 }; }
  function syncWall(s, c, parked) {
    const walls = s.map.walls, ids = c.wis || (c.wis = [c.wi]);
    if (!parked) { for (const i of ids) { const w = walls[i]; if (w) { w.x = -1e5; w.y = -1e5; } } return; }
    const bx = B96_VEH.wallBoxes(c);
    while (ids.length < bx.length) { walls.push({ x: -1e5, y: -1e5, w: 1, h: 1, kind: 'car', col: null, low: true, carId: c.id }); ids.push(walls.length - 1); }
    grid(s);
    ids.forEach((i, k) => { const w = walls[i], b = bx[k]; if (!w) return; if (b) { w.x = b.x; w.y = b.y; w.w = b.w; w.h = b.h; w.wreck = c.state === 'wreck'; w.carId = c.id; gridAdd(s, i); } else { w.x = -1e5; w.y = -1e5; w.w = 1; w.h = 1; } });
  }
  function initCars(s) {
    s.cars = []; const CT = s.map.city; if (!CT || !CT.cars) return;
    for (const i of CT.cars) {
      const w = s.map.walls[i]; if (!w || w.kind !== 'car') continue;
      const hz = w.w >= w.h, c = { id: s.nextId++, wi: i, x: w.x + w.w / 2, y: w.y + w.h / 2, ang: (hz ? 0 : Math.PI / 2) + (rnd(s) < 0.5 ? Math.PI : 0), v: 0, hp: CAR.hp, maxHp: CAR.hp, fuel: 25 + rnd(s) * 75, locked: rnd(s) < 0.55, state: 'ok', driver: null, cont: null, burnT: 0, fl: rnd(s) < 0.5, moving: false };
      let bk = null, bd = 34; for (const k of s.containers) if (k.kind === 'car') { const d = Math.hypot(k.x - c.x, k.y - c.y); if (d < bd) { bd = d; bk = k; } }
      if (bk) { c.cont = bk.id; bk.locked = c.locked; bk.carId = c.id; }
      w.carId = c.id; B96_VEH.init(c, () => rnd(s), Math.max(w.w, w.h)); c.hp = c.maxHp; c.wis = [i]; s.cars.push(c); syncWall(s, c, true);
    }
  }
  const carById = (s, id) => (s.cars || []).find(c => c.id === id);
  function explode(s, c, src) {
    c.state = 'wreck'; c.moving = false; c.v = 0; c.hp = 0; c.burnT = 0; c.smokeT = 25;
    const R = CAR.boomR; s.events.push({ t: 'boom', x: c.x, y: c.y, r: R }); noise(s, c.x, c.y, 1100);
    if (c.driver != null) { const dp = s.players[c.driver]; if (dp) { dp.drive = null; dp.x += 0; damage(s, dp, 70, null); } c.driver = null; }
    syncWall(s, c, true);
    if (c.cont != null) { const k = s.containers.find(q => q.id === c.cont); if (k) k.searched = true; } // груз сгорел
    for (const p of Object.values(s.players)) { if (p.dead || p.extracted) continue; const d = Math.hypot(p.x - c.x, p.y - c.y); if (d < R) damage(s, p, 10 + 55 * (1 - d / R), null); }
    for (const e of s.enemies.slice()) { const d = Math.hypot(e.x - c.x, e.y - c.y); if (d < R) damage(s, e, 20 + 110 * (1 - d / R), src && s.players[src.id] ? src : null); }
    for (const o of s.cars) { if (o === c || o.state === 'wreck') continue; const d = Math.hypot(o.x - c.x, o.y - c.y); if (d < R * 1.1) damageCar(s, o, 75 * (1 - d / (R * 1.1)), src); }
  }
  function damageCar(s, c, amt, src) {
    if (c.state === 'wreck') return;
    c.hp -= amt; s.events.push({ t: 'carhit', x: c.x, y: c.y });
    if (c.driver != null) { const dp = s.players[c.driver]; if (dp && src !== dp) damage(s, dp, amt * 0.18, src); }
    if (c.hp <= 0) { if (c.state !== 'burn') { c.state = 'burn'; c.burnT = 0.9; } else c.burnT = Math.min(c.burnT, 0.9); }
    else if (c.hp < c.maxHp * 0.35 && c.state === 'ok') { c.state = 'burn'; c.burnT = 5 + rnd(s) * 3; if (c.driver != null) { s.events.push({ t: 'msg', pid: c.driver, text: 'Машина горит — выходи (F)!' }); } }
    c._src = src;
  }
  function stepCars(s, dt) {
    if (!s.cars) return;
    for (const c of s.cars) {
      if (c.state === 'burn') { c.burnT -= dt; if (c.burnT <= 0) explode(s, c, c._src); }
      else if (c.state === 'wreck' && c.smokeT > 0) c.smokeT -= dt;
    }
  }
  function stepDriving(s, p, c, cmd, dt) {
    p.hitFlash = Math.max(0, (p.hitFlash || 0) - dt); p.evacLock = Math.max(0, (p.evacLock || 0) - dt);
    const mx = cmd.mx || 0, my = cmd.my || 0, ml = Math.min(1, Math.hypot(mx, my));
    if (cmd.reload && !p._rl && c.fuel < 100 && invCount(p, 'fuel') > 0) { invTake(p, 'fuel', 1); c.fuel = Math.min(100, c.fuel + 50); s.events.push({ t: 'msg', pid: p.id, text: 'Залита канистра: топливо ' + Math.round(c.fuel) + '%' }); } else if (cmd.reload && !p._rl && c.fuel < 100) s.events.push({ t: 'msg', pid: p.id, text: 'Нет канистры' });
    p._rl = !!cmd.reload;
    const fuelOk = c.fuel > 0 && c.state !== 'wreck';
    c.vPrev = c.v; c.brake = false;
    const T = B96_VEH.typeOf(c), r0 = B96_VEH.drive(c, cmd.thr !== undefined || cmd.str !== undefined ? { thr: cmd.thr, str: cmd.str } : { mx, my }, dt, { noFuel: !fuelOk, slow: c.state === 'burn' ? 0.8 : 1 });
    c.brake = Math.abs(c.v) < Math.abs(c.vPrev) - 0.3;
    if (fuelOk) c.fuel = Math.max(0, c.fuel - (0.03 + 0.22 * Math.abs(c.v) / T.vmax) * dt);
    const ux = Math.cos(c.ang), uy = Math.sin(c.ang); let nx = r0.x, ny = r0.y, push = 0;
    for (let it = 0; it < 2; it++) for (const cc of B96_VEH.circles(c, nx, ny, c.ang)) { const e = { x: cc.x, y: cc.y, r: cc.r }, ex = e.x, ey = e.y; collide(s, e); const dx = e.x - ex, dy = e.y - ey; nx += dx; ny += dy; push += Math.hypot(dx, dy); }
    c.x = nx; c.y = ny;
    if (push > 0.8 && Math.abs(c.v) > 12) { const imp = Math.abs(c.v); if (imp > 35) { damageCar(s, c, (imp - 35) * 0.4, null); s.events.push({ t: 'crash', x: c.x, y: c.y, v: imp }); noise(s, c.x, c.y, 500); } c.v *= -0.15; }
    else if (push > 0.3) c.v *= 0.9;
    if (Math.abs(c.v) > 35) for (const e of s.enemies.slice()) { // наезд
      if ((e._runT || 0) > s.t) continue; if (B96_VEH.distTo(c, e.x, e.y) < 3 + e.r) { e._runT = s.t + 0.5; damage(s, e, Math.abs(c.v) * 0.7, p); e.x += ux * 14; e.y += uy * 14; collide(s, e); damageCar(s, c, 2, null); }
    }
    c.moving = true; p.x = c.x; p.y = c.y; p.vx = p.vy = 0; p.moving = false; p.search = null; p.carAng = c.ang;
    p.nodeT = 0; p.extract = 0;
  }
  function toggleCar(s, p) {
    if (p.dead) return;
    if (p.drive != null) { // выйти
      const c = carById(s, p.drive); p.drive = null; if (!c) return; c.driver = null; c.v = 0; c.moving = false;
      let placed = false;
      for (const q of B96_VEH.exitPoints(c)) if (!placed && freeSpot(s, q.x, q.y, p.r + 1)) { p.x = q.x; p.y = q.y; placed = true; }
      syncWall(s, c, true); return;
    }
    let best = null, bd = 44;
    for (const c of s.cars || []) { const d = B96_VEH.distTo(c, p.x, p.y); if (d < 26 && d < bd) { bd = d; best = c; } }
    if (!best) return;
    if (best.state === 'wreck') { s.events.push({ t: 'msg', pid: p.id, text: 'Сгоревший остов' }); return; }
    if (best.locked) { s.events.push({ t: 'msg', pid: p.id, text: 'Заперто: вскрой замок (держи E) или разбей стекло выстрелом' }); return; }
    if (best.fuel <= 0) { s.events.push({ t: 'msg', pid: p.id, text: 'Бак пуст' }); return; }
    if (best.driver != null) return;
    p.drive = best.id; best.driver = p.id; best.moving = true; p.search = null; syncWall(s, best, false);
    s.events.push({ t: 'msg', pid: p.id, text: 'За рулём. W газ, S тормоз и назад, A/D руль, F — выйти' });
  }

  // ---------- главный шаг ----------
  // inputs: { [playerId]: cmd }, actions: [{pid, type, ...}]
  function step(s, inputs, actions, dt) {
    s.tick++; s.t += dt;
    s.hour = ((s.t / 2.5 + (s.h0 == null ? 600 : s.h0 * 60)) / 60) % 24; // игровые сутки: 1 игровая минута = 2,5 с (24:1 по TDD, день 15 мин, сутки 60 мин); старт 15:00
    for (const a of actions) applyAction(s, s.players[a.pid], a);
    // Точки подключения модулей (см. README): если модуль задал свою функцию, она заменяет встроенную; встроенная доступна как WL_SIM.builtin.*
    const MP = window.WL_PLAYER, ME = window.WL_ENEMIES;
    if (s.cars === undefined && s.map && s.map.city) initCars(s);
    for (const id in s.players) { const p = s.players[id], cmd = inputs[id] || {}; p.aiming = !!(cmd.aim || cmd.fire); /* weapon raised (trigger held): ППС / Coalition warn first, see enemies.js weaponOut */ if (p.drive != null && !p.dead) { const dc = carById(s, p.drive); if (dc && dc.state !== 'wreck') { stepDriving(s, p, dc, cmd, dt); continue; } p.drive = null; } if (MP && MP.step) MP.step(s, p, cmd, dt, API); else stepPlayer(s, p, cmd, dt); }
    if (ME && ME.step) ME.step(s, dt, API); else stepEnemies(s, dt);
    stepBullets(s, dt); stepCars(s, dt);
    s.spawnTimer -= dt;
    if (s.spawnTimer <= 0) {
      s.spawnTimer = C.SPAWN.every;
      for (let i = 0; i < C.SPAWN.batch && s.enemies.length < C.SPAWN.cap; i++) spawnEnemy(s, rnd(s) < 0.45 ? 'raider' : 'ghoul');
    }
  }

  // API для модулей enemies.js / player.js: только эти функции, без доступа к внутренностям файла
  const API = { initCars, carById, toggleCar, damageCar, setDoorCells, damage, collide, freeSpot, los: (s, a, b) => los(s, a, b), rayWall, rayWallAll, wallsNear, fire, spawnEnemy, derived, weaponStats, attachMods, invCount, invAdd, invTake, rnd, rr, ri, clamp, zoneAt, builtin: null };
  window.WL_SIM = { API, zoneAt, newWorld, newBase, addPlayer, step, derived, weaponStats, attachMods, invWeight, invCount, xpNeed, segAABB, rayWallAll, WT };
  API.builtin = WL_SIM.builtin = { stepPlayer, stepEnemies };
})();
