// Block-96 — машины: типы, габариты, руление и повёрнутые габариты для коллизий. Без DOM, работает и в sim, и в тестах.
// Единицы: мир — px (10 px = 1 м), углы — рад, c.ang — куда смотрит НОС машины. u — вперёд, v — вправо от водителя.
(function (G) {
  'use strict';
  const PX = 10, TAU = Math.PI * 2;
  // dims — метры. wb — колёсная база (от переднего моста до заднего). vmax/acc/brake — px/с (как в прежнем CAR), hp — прочность.
  const TYPES = {
    sedan: { name: 'Жигули (седан)',   L: 4.15, W: 1.62, H: 1.45, wb: 2.42, vmax: 125, acc: 95, brake: 170, rev: 0.35, hp: 140, tank: 39, steer: 0.60, wr: 0.30, w: 0.20 },
    niva:  { name: 'Нива (внедорожник)', L: 3.72, W: 1.68, H: 1.64, wb: 2.20, vmax: 118, acc: 90, brake: 165, rev: 0.35, hp: 150, tank: 42, steer: 0.62, wr: 0.34, w: 0.22 },
    van:   { name: 'Буханка (фургон)',  L: 4.45, W: 1.94, H: 2.06, wb: 2.30, vmax: 105, acc: 80, brake: 150, rev: 0.32, hp: 175, tank: 56, steer: 0.55, wr: 0.34, w: 0.22 },
    truck: { name: 'Грузовик (бортовой)', L: 6.30, W: 2.36, H: 2.25, wb: 3.70, vmax: 92,  acc: 62, brake: 130, rev: 0.30, hp: 230, tank: 90, steer: 0.50, wr: 0.50, w: 0.30 }
  };
  const WEIGHTS = [['sedan', 0.42], ['niva', 0.20], ['van', 0.24], ['truck', 0.14]];
  const hash = (a, b) => { let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
  const typeOf = (c) => TYPES[c && c.vt] || TYPES.sedan;
  const dims = (c) => { const T = typeOf(c); return { L: T.L * PX, W: T.W * PX, hl: T.L * PX / 2, hw: T.W * PX / 2 }; };

  // Выставляет тип/цвет/ливрею, если их ещё нет. rnd() — генератор sim (0..1). slotPx — длина парковочного места: грузовик только в длинное.
  function init(c, rnd, slotPx) {
    const r = rnd || (() => hash(c.id || 1, 77));
    if (!TYPES[c.vt]) {
      let x = r(), t = 'sedan';
      for (const [k, wgt] of WEIGHTS) { if (x < wgt) { t = k; break; } x -= wgt; }
      if (t === 'truck' && slotPx && slotPx < TYPES.truck.L * PX * 0.65) t = 'van';
      if (t === 'van' && slotPx && slotPx < TYPES.van.L * PX * 0.65) t = 'sedan';
      c.vt = t;
    }
    const T = TYPES[c.vt];
    if (c.paint == null) c.paint = Math.floor(r() * 6);
    if (c.livery == null) c.livery = (c.vt === 'sedan' || c.vt === 'van') && r() < 0.07 ? 'ppc' : '';
    if (c.tarp == null) c.tarp = c.vt === 'truck' ? (r() < 0.5 ? 1 : 0) : 0;
    c.maxHp = T.hp; if (c.hp == null || c.hp > T.hp) c.hp = T.hp;
    c.steer = c.steer || 0; c.odo = c.odo || 0; c.vmax = T.vmax;
    return c;
  }

  // ---------- руление (кинематическая «велосипедная» модель) ----------
  // inp: {mx,my} желаемое направление движения в мире (WASD после поворота на экран), mag 0..1. Возвращает новые x,y,ang,v,steer,odo.
  // Отличия от старой: поворот ТОЛЬКО при движении (не вертится на месте), радиус разворота по колёсной базе, колёса поворачиваются плавно,
  // задний ход — если цель позади и скорость мала (нос тогда «смотрит» от цели, как у настоящей машины).
  function drive(c, inp, dt, opt) {
    const T = typeOf(c), fuelOk = !(opt && opt.noFuel), burnK = opt && opt.slow ? opt.slow : 1;
    const mx = inp.mx || 0, my = inp.my || 0, ml = Math.min(1, Math.hypot(mx, my)), vmax = T.vmax;
    let tv = 0, steerT = 0, reverse = false;
    if (inp.thr !== undefined || inp.str !== undefined) { // управление относительно машины: W газ, S тормоз и задний ход, A/D руль (D = вправо от носа)
      const thr = Math.max(-1, Math.min(1, inp.thr || 0)), str = Math.max(-1, Math.min(1, inp.str || 0));
      if (fuelOk) {
        if (thr > 0.05) tv = vmax * thr * burnK;
        else if (thr < -0.05) tv = c.v > 1.5 ? -0.01 : -vmax * T.rev * -thr; // пока едем вперёд, S тормозит; после остановки включается задний ход
        const lim = T.steer * (1 - 0.62 * Math.min(1, Math.abs(c.v) / vmax));
        steerT = str * lim;
      }
      if (thr < -0.05 && c.v > 1.5) c.braking = true; else c.braking = false;
    } else if (ml > 0.1 && fuelOk) {
      let want = Math.atan2(my, mx), d = angDiff(want, c.ang);
      if (Math.abs(d) > Math.PI * 0.62 && c.v < 25) { reverse = true; want += Math.PI; d = angDiff(want, c.ang); tv = -vmax * T.rev * ml; }
      else tv = vmax * ml * burnK;
      const lim = T.steer * (1 - 0.62 * Math.min(1, Math.abs(c.v) / vmax));
      steerT = Math.max(-lim, Math.min(lim, d * 1.8)) * (reverse ? -1 : 1);
    }
    const ks = 3.2 * dt; c.steer = (c.steer || 0) + Math.max(-ks, Math.min(ks, steerT - (c.steer || 0)));
    const rate = tv === 0 ? 70 : (Math.abs(tv) < Math.abs(c.v) || tv * c.v < 0 ? T.brake : T.acc);
    c.v += Math.max(-rate * dt, Math.min(rate * dt, tv - c.v));
    // поворот корпуса: dθ = v / wb · tan(δ); при v→0 поворота нет
    const wbPx = T.wb * PX;
    c.ang += (c.v / wbPx) * Math.tan(c.steer) * dt;
    c.ang = ((c.ang % TAU) + TAU) % TAU;
    // скорость относится к точке между мостами; центр корпуса — на середине базы
    const ux = Math.cos(c.ang), uy = Math.sin(c.ang);
    const nx = c.x + ux * c.v * dt, ny = c.y + uy * c.v * dt;
    c.odo = (c.odo || 0) + c.v * dt / PX; // метры пробега колеса (для вращения спиц)
    return { x: nx, y: ny, ang: c.ang, v: c.v, steer: c.steer, odo: c.odo };
  }

  // ---------- повёрнутый габарит ----------
  // Кружки вдоль оси корпуса для collide(s,e): заменяют два кружка по ±12 px. Радиус = полуширина, шаг ≈ 0.9 радиуса — без щелей.
  function circles(c, x, y, ang) {
    const d = dims(c), r = d.hw * 0.98, half = d.hl - r, n = Math.max(2, Math.ceil(half * 2 / (r * 1.05)) + 1);
    x = x == null ? c.x : x; y = y == null ? c.y : y; ang = ang == null ? c.ang : ang;
    const ux = Math.cos(ang), uy = Math.sin(ang), out = [];
    for (let i = 0; i < n; i++) { const u = -half + (2 * half) * i / (n - 1); out.push({ x: x + ux * u, y: y + uy * u, r }); }
    return out;
  }
  // 4 угла повёрнутого прямоугольника (мир, px), для теней и отладки. grow — px
  function corners(c, grow) {
    const d = dims(c), g = grow || 0, ux = Math.cos(c.ang), uy = Math.sin(c.ang), vx = -uy, vy = ux, a = d.hl + g, b = d.hw + g;
    return [[a, -b], [a, b], [-a, b], [-a, -b]].map(([u, v]) => ({ x: c.x + ux * u + vx * v, y: c.y + uy * u + vy * v }));
  }
  // Стоящая машина в сетке AABB-стен: вдоль оси — один прямоугольник; под углом — цепочка квадратов вдоль корпуса (ступенька вместо раздутого квадрата).
  function wallBoxes(c) {
    const d = dims(c), ux = Math.cos(c.ang), uy = Math.sin(c.ang), ax = Math.abs(ux), ay = Math.abs(uy);
    if (ax > 0.985) return [{ x: c.x - d.hl, y: c.y - d.hw, w: d.L, h: d.W }];
    if (ay > 0.985) return [{ x: c.x - d.hw, y: c.y - d.hl, w: d.W, h: d.L }];
    const s = d.W * 0.78, n = Math.max(2, Math.ceil((d.L - s) / (s * 0.8)) + 1), half = (d.L - s) / 2, out = [];
    for (let i = 0; i < n; i++) { const u = -half + (2 * half) * i / (n - 1); out.push({ x: c.x + ux * u - s / 2, y: c.y + uy * u - s / 2, w: s, h: s }); }
    return out;
  }
  // Точка внутри повёрнутого габарита (px-запас m) — для попаданий пуль/выбора машины
  function inside(c, x, y, m) {
    const d = dims(c), ux = Math.cos(c.ang), uy = Math.sin(c.ang), dx = x - c.x, dy = y - c.y, u = dx * ux + dy * uy, v = -dx * uy + dy * ux, g = m || 0;
    return Math.abs(u) <= d.hl + g && Math.abs(v) <= d.hw + g;
  }
  // Ближайшая к точке дистанция до повёрнутого габарита (0 внутри)
  function distTo(c, x, y) {
    const d = dims(c), ux = Math.cos(c.ang), uy = Math.sin(c.ang), dx = x - c.x, dy = y - c.y, u = dx * ux + dy * uy, v = -dx * uy + dy * ux;
    return Math.hypot(Math.max(Math.abs(u) - d.hl, 0), Math.max(Math.abs(v) - d.hw, 0));
  }
  // Отрезок (пуля) → повёрнутый прямоугольник: t в [0,1] или -1 (метод плит в локальных осях)
  function segHit(c, x0, y0, x1, y1) {
    const d = dims(c), ux = Math.cos(c.ang), uy = Math.sin(c.ang);
    const lx = (x, y) => (x - c.x) * ux + (y - c.y) * uy, ly = (x, y) => -(x - c.x) * uy + (y - c.y) * ux;
    const p0 = [lx(x0, y0), ly(x0, y0)], p1 = [lx(x1, y1), ly(x1, y1)], lo = [-d.hl, -d.hw], hi = [d.hl, d.hw];
    let t0 = 0, t1 = 1;
    for (let k = 0; k < 2; k++) {
      const dv = p1[k] - p0[k];
      if (Math.abs(dv) < 1e-9) { if (p0[k] < lo[k] || p0[k] > hi[k]) return -1; continue; }
      let a = (lo[k] - p0[k]) / dv, b = (hi[k] - p0[k]) / dv; if (a > b) { const t = a; a = b; b = t; }
      t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return -1;
    }
    return t0;
  }
  // Точка рядом с машиной со стороны (для выхода): side -1 левая, +1 правая от водителя
  function exitPoints(c) {
    const d = dims(c), ux = Math.cos(c.ang), uy = Math.sin(c.ang), vx = -uy, vy = ux, out = [];
    for (const [u, v] of [[0.1 * d.hl, -(d.hw + 12)], [0.1 * d.hl, d.hw + 12], [-d.hl - 12, 0], [d.hl + 12, 0]]) out.push({ x: c.x + ux * u + vx * v, y: c.y + uy * u + vy * v });
    return out;
  }
  G.B96_VEH = Object.assign(G.B96_VEH || {}, { TYPES, PX, hash, angDiff, typeOf, dims, init, drive, circles, corners, wallBoxes, inside, distTo, segHit, exitPoints });
  if (typeof module !== 'undefined') module.exports = G.B96_VEH;
})(typeof window !== 'undefined' ? window : globalThis);
