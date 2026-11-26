// Block-96 — отрисовка машин из процедурных примитивов (без текстур). 2D-изометрия 3/4 на canvas.
// Машина = набор выпуклых тел (коробки, усечённые призмы, цилиндры-колёса) в локальных осях: u — вперёд (нос), v — вправо от водителя, z — вверх (м).
// Грани отсекаются по нормали, порядок: дальние колёса → корпус/кабина/кузов по глубине → ближние колёса. Спереди видно фары, решётку и лобовое
// стекло; сзади — стоп-сигналы, номер и заднее стекло. Зависит от vehicles-phys.js (TYPES). API: B96_VEH.draw(env, c), B96_VEH.lights(env, c).
(function (G) {
  'use strict';
  const V = G.B96_VEH, PX = V.PX, TYPES = V.TYPES;
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const hex = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const rgb = (c, k, a) => `rgba(${Math.min(255, c[0] * k) | 0},${Math.min(255, c[1] * k) | 0},${Math.min(255, c[2] * k) | 0},${a == null ? 1 : a})`;
  // палитра нулевых: приглушённые краски (серо-зелёный, серо-голубой, бежевый, вишнёвый, тёмно-зелёный, грязно-белый)
  const PAINT = ['#757b69', '#5b6d78', '#8c7d5a', '#703d38', '#46594a', '#a1a39c'].map(hex);
  const SNOW = [228, 238, 246], GLASS = [26, 38, 50], TYRE = [16, 18, 20], RIM = [104, 106, 108], BUMP = [58, 60, 62], CHROME = [150, 154, 156], DARK = [22, 22, 24], RUST = [108, 64, 38];
  const WOOD = [98, 76, 50], WOOD_D = [80, 62, 42];

  // ---- мелкая векторная математика
  const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const avg = (vs) => { const o = [0, 0, 0]; for (const v of vs) { o[0] += v[0]; o[1] += v[1]; o[2] += v[2]; } return [o[0] / vs.length, o[1] / vs.length, o[2] / vs.length]; };
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  // точка на четырёхугольнике [низ-лево, низ-право, верх-право, верх-лево] по (s,t)
  const bil = (q, s, t) => lerp3(lerp3(q[0], q[1], s), lerp3(q[3], q[2], s), t);
  // грань: вершины + нормаль наружу (из центра тела cen), цвет, флаги
  function face(vs, cen, col, o) {
    const n = nrm(cross(sub3(vs[1], vs[0]), sub3(vs[3], vs[0]))), fc = avg(vs);
    if (dot(n, sub3(fc, cen)) < 0) { n[0] = -n[0]; n[1] = -n[1]; n[2] = -n[2]; }
    return Object.assign({ vs, n, col }, o || {});
  }
  const decal = (f, s0, s1, t0, t1, col, o) => { const q = f.vs, vs = [bil(q, s0, t0), bil(q, s1, t0), bil(q, s1, t1), bil(q, s0, t1)]; return Object.assign({ vs, n: f.n, col, dec: 1 }, o || {}); };
  // коробка: возвращает {front, back, left, right, top, list}
  function box(u0, u1, v0, v1, z0, z1, cols) {
    const cen = [(u0 + u1) / 2, (v0 + v1) / 2, (z0 + z1) / 2], c = cols || {}, P = (k, d) => c[k] || c.all || d;
    const B = {
      front: face([[u1, v0, z0], [u1, v1, z0], [u1, v1, z1], [u1, v0, z1]], cen, P('front')),
      back: face([[u0, v1, z0], [u0, v0, z0], [u0, v0, z1], [u0, v1, z1]], cen, P('back')),
      right: face([[u0, v1, z0], [u1, v1, z0], [u1, v1, z1], [u0, v1, z1]], cen, P('right')),
      left: face([[u1, v0, z0], [u0, v0, z0], [u0, v0, z1], [u1, v0, z1]], cen, P('left')),
      top: face([[u0, v0, z1], [u1, v0, z1], [u1, v1, z1], [u0, v1, z1]], cen, P('top'), { top: 1 })
    };
    B.cen = cen; B.list = [B.front, B.back, B.right, B.left, B.top]; return B;
  }
  // усечённая призма: низ b=[u0,u1,v0,v1] на z0, верх t=[...] на z1
  function frus(b, t, z0, z1, cols) {
    const c = cols || {}, P = (k) => c[k] || c.all;
    const V8 = [[b[0], b[2], z0], [b[1], b[2], z0], [b[1], b[3], z0], [b[0], b[3], z0], [t[0], t[2], z1], [t[1], t[2], z1], [t[1], t[3], z1], [t[0], t[3], z1]], cen = avg(V8);
    const F = {
      front: face([[b[1], b[2], z0], [b[1], b[3], z0], [t[1], t[3], z1], [t[1], t[2], z1]], cen, P('front')),
      back: face([[b[0], b[3], z0], [b[0], b[2], z0], [t[0], t[2], z1], [t[0], t[3], z1]], cen, P('back')),
      right: face([[b[0], b[3], z0], [b[1], b[3], z0], [t[1], t[3], z1], [t[0], t[3], z1]], cen, P('right')),
      left: face([[b[1], b[2], z0], [b[0], b[2], z0], [t[0], t[2], z1], [t[1], t[2], z1]], cen, P('left')),
      top: face([[t[0], t[2], z1], [t[1], t[2], z1], [t[1], t[3], z1], [t[0], t[3], z1]], cen, P('top'), { top: 1 })
    };
    F.cen = cen; F.list = [F.front, F.back, F.right, F.left, F.top]; return F;
  }
  const glass = (f, s0, s1, t0, t1, o) => decal(f, s0, s1, t0, t1, GLASS, Object.assign({ glass: 1, sheen: 1 }, o));
  const both = (B, kA, kB) => [B[kA], B[kB]];

  // ---------- сборка геометрии типа (кэшируется по ключу) ----------
  function build(c, wreck, burnK) {
    const vt = c.vt, T = TYPES[vt], P = wreck ? [34, 31, 29] : mix(PAINT[(c.paint | 0) % PAINT.length], [60, 40, 30], burnK * 0.7);
    const ppc = c.livery === 'ppc', body = ppc ? [196, 202, 206] : P, roof = wreck ? [30, 28, 27] : mix(body, SNOW, 0.42), stripe = [36, 74, 150];
    const g = { parts: [], wheels: [], lamps: [], H: T.H }, rn = (k) => V.hash((c.id | 0) * 7 + k, 91);
    const add = (layer, cen, faces) => g.parts.push({ layer, cen, faces });
    const sillRust = (B, zTop) => { // ржавчина по порогам и аркам
      if (wreck) return [];
      const o = []; for (const k of ['left', 'right']) { const f = B[k]; o.push(decal(f, 0, 1, 0, zTop, RUST, { a: 0.42 })); for (let i = 0; i < 3; i++) o.push(decal(f, rn(i + (k === 'left' ? 0 : 9)), Math.min(1, rn(i + 5) + 0.08), 0, zTop * 1.7, RUST, { a: 0.5 })); }
      return o;
    };
    const lamp = (f, s0, s1, t0, t1, kind, w) => { const d = decal(f, s0, s1, t0, t1, wreck ? [24, 22, 20] : [160, 160, 150], { lamp: kind, emw: w }); const q = d.vs; g.lamps.push({ kind, p: avg(q), n: f.n }); return d; };
    const plate = (f, s0, s1, t0, t1) => [decal(f, s0, s1, t0, t1, wreck ? [24, 22, 20] : [196, 200, 190]), decal(f, s0 + (s1 - s0) * 0.08, s1 - (s1 - s0) * 0.08, t0 + (t1 - t0) * 0.28, t1 - (t1 - t0) * 0.28, [34, 34, 38], { a: 0.55 })];
    const crack = (f) => { // трещины по лобовому при повреждении
      const o = []; if (wreck) return o; const dm = 1 - c.hp / c.maxHp; if (dm < 0.35) return o;
      for (let i = 0; i < 3; i++) o.push(decal(f, 0.3 + i * 0.2, 0.34 + i * 0.2, 0.1, 0.9, [210, 220, 228], { a: 0.5 * dm, thin: 1 }));
      return o;
    };
    const wh = (u, v, r, w, front) => g.wheels.push({ u, v, r, w, front });
    // боковые повторители: спереди оранжевый + световой «клин» фары, сзади красный — перед/зад читается и сбоку
    const marks = (B, zl, zh, lenF, lenR) => { const o = []; for (const k of ['left', 'right']) { const f = B[k], sF = k === 'left' ? 0 : 1, d = k === 'left' ? 1 : -1; o.push(decal(f, sF, sF + d * lenF, zl, zh, wreck ? [24, 22, 20] : [226, 170, 70], { a: 0.9 }), decal(f, 1 - sF, 1 - sF - d * lenR, zl, zh, wreck ? [24, 22, 20] : [168, 36, 32], { a: 0.95 })); } return o; };

    if (vt === 'sedan') {
      const B = box(-2.07, 2.07, -0.81, 0.81, 0.30, 0.86, { all: body, top: roof });
      const ch = box(-1.95, 1.95, -0.72, 0.72, 0.18, 0.34, { all: DARK });
      add(-1, [0, 0, 0.26], ch.list);
      const fr = B.front, bk = B.back, fl = [];
      // перед: решётка, фары, поворотники, бампер, номер
      fl.push(decal(fr, 0.2, 0.8, 0.46, 0.80, DARK, { a: 0.92 }), decal(fr, 0.24, 0.76, 0.52, 0.60, CHROME, { a: 0.6 }), decal(fr, 0.24, 0.76, 0.68, 0.74, CHROME, { a: 0.5 }));
      fl.push(lamp(fr, 0.04, 0.19, 0.46, 0.84, 'head', 1), lamp(fr, 0.81, 0.96, 0.46, 0.84, 'head', 1), decal(fr, 0.02, 0.20, 0.12, 0.30, [190, 140, 60], { a: 0.8 }), decal(fr, 0.80, 0.98, 0.12, 0.30, [190, 140, 60], { a: 0.8 }));
      fl.push(...plate(fr, 0.34, 0.66, 0.10, 0.30));
      fl.push(decal(fr, 0, 1, 0, 0.2, BUMP));
      // зад: фонари, номер, бампер
      const rl = [lamp(bk, 0.03, 0.30, 0.42, 0.82, 'tail', 1), lamp(bk, 0.70, 0.97, 0.42, 0.82, 'tail', 1), decal(bk, 0.31, 0.38, 0.5, 0.7, [190, 190, 180], { lamp: 'rev' }), decal(bk, 0.62, 0.69, 0.5, 0.7, [190, 190, 180], { lamp: 'rev' })];
      rl.push(...plate(bk, 0.34, 0.66, 0.40, 0.62), decal(bk, 0, 1, 0, 0.2, BUMP));
      // борта: швы дверей, ручки, ржавчина, ливрея
      const sd = [];
      for (const k of ['left', 'right']) { const f = B[k]; for (const s of [0.28, 0.55, 0.80]) sd.push(decal(f, s, s + 0.012, 0.08, 0.96, [0, 0, 0], { a: 0.5, thin: 1 })); sd.push(decal(f, 0.46, 0.5, 0.78, 0.84, CHROME, { a: 0.7 }), decal(f, 0.7, 0.74, 0.78, 0.84, CHROME, { a: 0.7 })); if (ppc) sd.push(decal(f, 0, 1, 0.38, 0.62, stripe)); }
      add(0, B.cen, [...B.list, ...fl, ...rl, ...sd, ...marks(B, 0.52, 0.70, 0.045, 0.06), ...sillRust(B, 0.12)]);
      // кабина
      const C = frus([-1.50, 0.74, -0.74, 0.74], [-0.92, 0.10, -0.60, 0.60], 0.86, 1.43, { all: body, top: roof });
      const cf = [glass(C.front, 0.07, 0.93, 0.1, 0.9), glass(C.back, 0.08, 0.92, 0.14, 0.86), ...crack(C.front)];
      for (const k of ['left', 'right']) cf.push(glass(C[k], 0.06, 0.45, 0.14, 0.88), glass(C[k], 0.50, 0.94, 0.14, 0.88));
      if (ppc) { const R = box(-0.35, -0.05, -0.28, 0.28, 1.43, 1.52, { all: [60, 64, 70] }); cf.push(...R.list, decal(R.top, 0, 0.5, 0, 1, [40, 70, 190], { fl: 1 }), decal(R.top, 0.5, 1, 0, 1, [200, 50, 40], { fl: 1 })); }
      add(1, C.cen, [...C.list, ...cf]);
      for (const sg of [-1, 1]) { const M = box(0.50, 0.60, sg > 0 ? 0.80 : -0.96, sg > 0 ? 0.96 : -0.80, 0.92, 1.04, { all: wreck ? DARK : mul(body, 0.55) }); add(2, M.cen, M.list); }
      wh(1.28, -0.78, 0.30, 0.20, true); wh(1.28, 0.78, 0.30, 0.20, true); wh(-1.28, -0.78, 0.30, 0.20); wh(-1.28, 0.78, 0.30, 0.20);
    } else if (vt === 'niva') {
      const B = box(-1.86, 1.86, -0.84, 0.84, 0.38, 1.00, { all: body, top: roof });
      add(-1, [0, 0, 0.3], box(-1.7, 1.7, -0.7, 0.7, 0.22, 0.42, { all: DARK }).list);
      const fr = B.front, bk = B.back, fl = [];
      fl.push(decal(fr, 0.18, 0.82, 0.40, 0.76, DARK, { a: 0.92 }), decal(fr, 0.2, 0.8, 0.50, 0.56, CHROME, { a: 0.5 }), decal(fr, 0.2, 0.8, 0.66, 0.72, CHROME, { a: 0.5 }));
      fl.push(lamp(fr, 0.03, 0.17, 0.42, 0.80, 'head', 1), lamp(fr, 0.83, 0.97, 0.42, 0.80, 'head', 1), ...plate(fr, 0.34, 0.66, 0.06, 0.26), decal(fr, 0, 1, 0, 0.22, [34, 36, 38]));
      fl.push(decal(B.top, 0.35, 0.65, 0.38, 0.62, [0, 0, 0], { a: 0.25 }));
      const rl = [lamp(bk, 0.03, 0.18, 0.36, 0.78, 'tail', 1), lamp(bk, 0.82, 0.97, 0.36, 0.78, 'tail', 1), decal(bk, 0.19, 0.24, 0.48, 0.68, [190, 190, 180], { lamp: 'rev' }), decal(bk, 0.76, 0.81, 0.48, 0.68, [190, 190, 180], { lamp: 'rev' }), ...plate(bk, 0.34, 0.66, 0.30, 0.52), decal(bk, 0, 1, 0, 0.2, [34, 36, 38])];
      const sd = [];
      for (const k of ['left', 'right']) { const f = B[k]; for (const s of [0.26, 0.58]) sd.push(decal(f, s, s + 0.012, 0.08, 0.96, [0, 0, 0], { a: 0.5, thin: 1 })); sd.push(decal(f, 0.0, 1, 0.30, 0.36, [20, 22, 24], { a: 0.55 })); }
      add(0, B.cen, [...B.list, ...fl, ...rl, ...sd, ...marks(B, 0.56, 0.78, 0.05, 0.05), ...sillRust(B, 0.14)]);
      const C = frus([-1.84, 0.66, -0.78, 0.78], [-1.76, 0.10, -0.70, 0.70], 1.00, 1.64, { all: body, top: roof });
      const cf = [glass(C.front, 0.06, 0.94, 0.1, 0.9), glass(C.back, 0.08, 0.92, 0.14, 0.88), ...crack(C.front)];
      for (const k of ['left', 'right']) cf.push(glass(C[k], 0.05, 0.40, 0.14, 0.88), glass(C[k], 0.46, 0.80, 0.14, 0.88), glass(C[k], 0.85, 0.96, 0.2, 0.8));
      add(1, C.cen, [...C.list, ...cf]);
      for (const sg of [-1, 1]) { const RK = box(-1.45, 0.0, sg * 0.62 - 0.03, sg * 0.62 + 0.03, 1.64, 1.71, { all: [40, 44, 46] }); add(2, RK.cen, RK.list); }
      wh(1.10, -0.82, 0.34, 0.22, true); wh(1.10, 0.82, 0.34, 0.22, true); wh(-1.10, -0.82, 0.34, 0.22); wh(-1.10, 0.82, 0.34, 0.22);
    } else if (vt === 'van') {
      const B = box(-2.22, 2.22, -0.97, 0.97, 0.36, 1.14, { all: body, top: roof });
      add(-1, [0, 0, 0.3], box(-2.0, 2.0, -0.8, 0.8, 0.22, 0.42, { all: DARK }).list);
      const fr = B.front, bk = B.back, fl = [];
      fl.push(decal(fr, 0.26, 0.74, 0.30, 0.66, DARK, { a: 0.92 }), decal(fr, 0.28, 0.72, 0.38, 0.44, CHROME, { a: 0.5 }), decal(fr, 0.28, 0.72, 0.52, 0.58, CHROME, { a: 0.5 }));
      fl.push(lamp(fr, 0.05, 0.22, 0.52, 0.88, 'head', 1.2), lamp(fr, 0.78, 0.95, 0.52, 0.88, 'head', 1.2), ...plate(fr, 0.36, 0.64, 0.06, 0.22), decal(fr, 0, 1, 0, 0.16, BUMP));
      const rl = [lamp(bk, 0.04, 0.14, 0.34, 0.80, 'tail', 1), lamp(bk, 0.86, 0.96, 0.34, 0.80, 'tail', 1), decal(bk, 0.16, 0.20, 0.5, 0.7, [190, 190, 180], { lamp: 'rev' }), decal(bk, 0.80, 0.84, 0.5, 0.7, [190, 190, 180], { lamp: 'rev' }), decal(bk, 0.495, 0.505, 0.04, 0.96, [0, 0, 0], { a: 0.55, thin: 1 }), ...plate(bk, 0.38, 0.62, 0.20, 0.38), decal(bk, 0, 1, 0, 0.14, BUMP)];
      const sd = [];
      for (const k of ['left', 'right']) { const f = B[k]; sd.push(decal(f, 0.70, 0.712, 0.06, 0.96, [0, 0, 0], { a: 0.5, thin: 1 }), decal(f, 0.34, 0.352, 0.06, 0.96, [0, 0, 0], { a: 0.35, thin: 1 }), decal(f, 0.74, 0.78, 0.50, 0.56, CHROME, { a: 0.7 })); if (ppc) sd.push(decal(f, 0, 1, 0.30, 0.52, stripe)); else sd.push(decal(f, 0, 1, 0.52, 0.56, [0, 0, 0], { a: 0.28 })); }
      add(0, B.cen, [...B.list, ...fl, ...rl, ...sd, ...marks(B, 0.40, 0.62, 0.04, 0.04), ...sillRust(B, 0.12)]);
      const C = frus([-2.22, 1.16, -0.95, 0.95], [-2.22, 0.96, -0.92, 0.92], 1.14, 2.06, { all: body, top: roof });
      const cf = [glass(C.front, 0.05, 0.95, 0.12, 0.90), ...crack(C.front)];
      for (const k of ['left', 'right']) { cf.push(glass(C[k], 0.70, 0.96, 0.18, 0.84)); }
      cf.push(glass(C.back, 0.08, 0.44, 0.44, 0.86), glass(C.back, 0.56, 0.92, 0.44, 0.86));
      if (ppc) { const R = box(0.2, 0.5, -0.30, 0.30, 2.06, 2.15, { all: [60, 64, 70] }); cf.push(...R.list, decal(R.top, 0, 0.5, 0, 1, [40, 70, 190], { fl: 1 }), decal(R.top, 0.5, 1, 0, 1, [200, 50, 40], { fl: 1 })); }
      add(1, C.cen, [...C.list, ...cf]);
      for (const sg of [-1, 1]) { const M = box(0.95, 1.07, sg > 0 ? 0.95 : -1.15, sg > 0 ? 1.15 : -0.95, 1.30, 1.58, { all: DARK }); add(2, M.cen, M.list); }
      wh(1.35, -0.93, 0.34, 0.22, true); wh(1.35, 0.93, 0.34, 0.22, true); wh(-1.25, -0.93, 0.34, 0.22); wh(-1.25, 0.93, 0.34, 0.22);
    } else { // truck: ГАЗ-53 бортовой
      add(-1, [0, 0, 0.7], box(-3.05, 3.05, -0.62, 0.62, 0.55, 0.84, { all: DARK }).list);
      add(-1, [1.6, 0, 0.7], box(0.2, 3.0, -0.98, 0.98, 0.52, 0.93, { all: [18, 18, 20] }).list); // подкапотное/подкабинное пространство: не видно землю насквозь
      // капот + крылья
      const Hd = box(1.62, 3.12, -0.82, 0.82, 0.90, 1.58, { all: body, top: roof }), hf = [];
      hf.push(decal(Hd.front, 0.18, 0.82, 0.14, 0.72, DARK, { a: 0.92 }), decal(Hd.front, 0.2, 0.8, 0.26, 0.31, CHROME, { a: 0.5 }), decal(Hd.front, 0.2, 0.8, 0.46, 0.5, CHROME, { a: 0.5 }), decal(Hd.top, 0.05, 0.95, 0.46, 0.54, [0, 0, 0], { a: 0.3, thin: 1 }));
      const FE = [-1, 1].map(sg => box(1.9, 3.15, sg > 0 ? 0.82 : -1.12, sg > 0 ? 1.12 : -0.82, 0.78, 1.28, { all: body, top: roof }));
      const FL = [];
      for (const [i, sg] of [[0, -1], [1, 1]]) { const F = FE[i], ff = F.front; FL.push(...F.list, lamp(ff, 0.2, 0.8, 0.30, 0.86, 'head', 1.3)); }
      FL.push(decal(Hd.front, 0, 1, 0, 0.1, BUMP));
      const bumpF = box(3.12, 3.28, -1.1, 1.1, 0.62, 0.86, { all: BUMP });
      add(0, Hd.cen, [...Hd.list, ...hf, ...FL, ...bumpF.list, ...plate(bumpF.front, 0.42, 0.58, 0.2, 0.7)]);
      // кабина
      const Cb = frus([0.10, 1.62, -1.05, 1.05], [0.16, 1.46, -1.0, 1.0], 0.92, 2.28, { all: body, top: roof });
      const cf = [glass(Cb.front, 0.05, 0.95, 0.38, 0.92), ...crack(Cb.front), glass(Cb.back, 0.35, 0.65, 0.5, 0.82)];
      for (const k of ['left', 'right']) cf.push(glass(Cb[k], 0.12, 0.88, 0.40, 0.90), decal(Cb[k], 0.5, 0.512, 0.04, 0.38, [0, 0, 0], { a: 0.5, thin: 1 }), decal(Cb[k], 0.6, 0.66, 0.30, 0.34, CHROME, { a: 0.7 }));
      if (!wreck) for (const k of ['left', 'right']) cf.push(decal(Cb[k], 0, 1, 0, 0.1, RUST, { a: 0.45 }));
      add(2, Cb.cen, [...Cb.list, ...cf]);
      // платформа + борта + груз
      const flr = box(-3.15, 0.04, -1.14, 1.14, 0.94, 1.05, { all: WOOD_D, top: WOOD });
      add(0, flr.cen, flr.list);
      const bd = (u0, u1, v0, v1, z1) => { const b = box(u0, u1, v0, v1, 1.05, z1, { all: WOOD, top: mix(WOOD, SNOW, 0.35) }); const dl = []; for (const f of [b.front, b.back, b.left, b.right]) for (let k = 1; k < 4; k++) dl.push(decal(f, 0, 1, k / 4 - 0.008, k / 4 + 0.008, [30, 22, 14], { a: 0.5, thin: 1 })); b.list.push(...dl); b.list.push(decal(b.top, 0, 1, 0.1, 0.9, [255, 255, 255], { a: 0.08 })); return b; };
      const sides = [bd(-3.15, 0.04, -1.14, -1.06, 1.68), bd(-3.15, 0.04, 1.06, 1.14, 1.68), bd(-3.15, -3.07, -1.06, 1.06, 1.68), bd(-0.03, 0.04, -1.06, 1.06, 1.92)];
      for (const b of sides) add(1, b.cen, b.list);
      const rb = sides[2]; // задний борт: фонари и номер
      add(1.5, rb.cen, [lamp(rb.back, 0.04, 0.16, 0.12, 0.44, 'tail', 1), lamp(rb.back, 0.84, 0.96, 0.12, 0.44, 'tail', 1), ...plate(rb.back, 0.4, 0.6, 0.2, 0.46), decal(rb.back, 0.18, 0.22, 0.14, 0.4, [190, 190, 180], { lamp: 'rev' })]);
      if (c.tarp) {
        const tc = wreck ? [30, 28, 26] : [74, 82, 58], T2 = frus([-3.06, -0.12, -1.06, 1.06], [-2.9, -0.28, -0.88, 0.88], 1.68, 2.7, { all: tc, top: mix(tc, SNOW, 0.5) }), td = [];
        for (const f of [T2.left, T2.right, T2.front, T2.back]) for (let k = 1; k < 6; k++) td.push(decal(f, k / 6 - 0.006, k / 6 + 0.006, 0, 1, [0, 0, 0], { a: 0.28, thin: 1 }));
        add(1.8, T2.cen, [...T2.list, ...td]);
      } else if (!wreck) {
        for (const [i, p] of [[0, [-2.5, -0.45]], [1, [-1.9, 0.5]], [2, [-1.0, -0.3]]]) { const sz = 0.7 + rn(i) * 0.25, hz = 0.5 + rn(i + 3) * 0.4, K = box(p[0] - sz / 2, p[0] + sz / 2, p[1] - sz / 2, p[1] + sz / 2, 1.05, 1.05 + hz, { all: [112, 90, 58], top: mix([126, 104, 66], SNOW, 0.3) }); K.list.push(decal(K.front, 0, 1, 0.45, 0.55, [60, 44, 26], { a: 0.5, thin: 1 }), decal(K.right, 0, 1, 0.45, 0.55, [60, 44, 26], { a: 0.5, thin: 1 })); add(1.7, K.cen, K.list); }
      }
      wh(2.40, -0.98, 0.50, 0.28, true); wh(2.40, 0.98, 0.50, 0.28, true);
      for (const s of [-1, 1]) { wh(-1.30, s * 0.88, 0.50, 0.26); wh(-1.30, s * 1.12, 0.50, 0.26); }
    }
    return g;
  }
  const CACHE = new Map();
  function geom(c, wreck, burnK) {
    const dm = c.hp != null && c.maxHp ? Math.floor((1 - c.hp / c.maxHp) * 4) : 0, key = [c.vt, c.paint, c.livery, c.tarp, c.id | 0, wreck ? 1 : 0, Math.round(burnK * 4), dm].join('|');
    let g = CACHE.get(key); if (!g) { if (CACHE.size > 160) CACHE.clear(); g = build(c, wreck, burnK); CACHE.set(key, g); } return g;
  }

  // ---------- отрисовка ----------
  function view(env) { // вектор «к камере» e=(1,1,ez) в метрах и параметры освещения
    const kx = env.SCR(1, 0).x - env.SCR(0, 0).x; return 10 * kx / env.MH(1);
  }
  function draw(env, c) {
    if (!TYPES[c.vt]) V.init(c);
    const ctx = env.ctx, SCRf = env.SCR, MHf = env.MH, ez = view(env), t = env.t || 0;
    const wreck = c.state === 'wreck', burnK = c.state === 'burn' ? 1 : 0, g = geom(c, wreck, burnK), T = TYPES[c.vt];
    const ca = Math.cos(c.ang), sa = Math.sin(c.ang), night = env.night || 0;
    const cull = (n) => (n[0] * ca - n[1] * sa) + (n[0] * sa + n[1] * ca) + n[2] * ez > 0.03;
    const proj = (p) => { const wx = c.x + (p[0] * ca - p[1] * sa) * PX, wy = c.y + (p[0] * sa + p[1] * ca) * PX, s = SCRf(wx, wy); return { x: s.x, y: s.y - MHf(p[2]), d: wx + wy }; };
    const k = (n) => { const nx = n[0] * ca - n[1] * sa, ny = n[0] * sa + n[1] * ca; return 0.5 + 0.26 * Math.max(0, ny) + 0.12 * Math.max(0, nx) + 0.52 * Math.max(0, n[2]); };
    const braking = c.brake || (c.driver != null && c.v != null && c.vPrev != null && Math.abs(c.v) < Math.abs(c.vPrev) - 0.05), rev = (c.v || 0) < -3, lit = (c.driver != null || c.lightsOn) && !wreck && c.fuel !== 0;
    const lampCol = (f) => {
      if (wreck) return [26, 24, 22];
      if (f.lamp === 'head') return lit ? [255, 240, 180] : [172, 172, 160];
      if (f.lamp === 'tail') return braking ? [255, 70, 48] : lit ? [214, 44, 36] : [128, 34, 32];
      if (f.lamp === 'rev') return rev ? [255, 255, 240] : [150, 150, 142];
      return f.col;
    };
    function paint(f, kk) {
      const pts = f.vs.map(proj); ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
      let col = f.col; const em = f.lamp && f.lamp !== 'none' && !wreck && ((f.lamp === 'head' && lit) || (f.lamp === 'tail' && (braking || lit)) || (f.lamp === 'rev' && rev));
      if (f.lamp) col = lampCol(f);
      if (wreck && f.glass) col = [9, 9, 10]; // выбитые, закопчённые стёкла
      if (f.fl) col = Math.sin(t * 12) > 0 ? (f.col[0] > 150 ? [60, 90, 230] : [220, 50, 40]) : mix(f.col, [20, 20, 24], 0.3);
      ctx.fillStyle = rgb(col, em || f.fl ? 1.1 : kk, f.a); ctx.fill();
      if (f.glass && f.sheen && !wreck) { ctx.save(); ctx.clip(); const a = pts[0], b = pts[1], cc = pts[2], d = pts[3], P = (s, tt) => ({ x: (a.x + (b.x - a.x) * s) * (1 - tt) + (d.x + (cc.x - d.x) * s) * tt, y: (a.y + (b.y - a.y) * s) * (1 - tt) + (d.y + (cc.y - d.y) * s) * tt }); ctx.beginPath(); [P(0, 0), P(0.42, 0), P(0.14, 1), P(0, 1)].forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.fillStyle = 'rgba(190,215,230,0.16)'; ctx.fill(); ctx.restore(); }
      if (f.thin) return;
      ctx.lineWidth = f.dec ? 0.6 : 1; ctx.strokeStyle = f.dec ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.38)'; ctx.stroke();
    }
    function part(P) { for (const f of P.faces) { if (!cull(f.n)) continue; paint(f, k(f.n)); } }
    // колесо: 12-гранный цилиндр с осью по v, руление вокруг вертикали, вращение по пробегу
    const N = 12;
    function wheel(w) {
      const st = w.front ? (c.steer || 0) : 0, cs = Math.cos(st), sn = Math.sin(st), spin = ((c.odo || 0) / w.r);
      const P = (a, vv) => { const du = Math.cos(a) * w.r, dz = Math.sin(a) * w.r; return [w.u + du * cs - vv * sn, w.v + du * sn + vv * cs, w.r + dz]; }; // центр на высоте r
      const nWorld = (a, sg) => [Math.cos(a) * cs - sg * 0 * sn, Math.cos(a) * sn, Math.sin(a)];
      const hw = w.w / 2, tyre = wreck ? [10, 10, 10] : TYRE;
      for (let i = 0; i < N; i++) {
        const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2, am = (a0 + a1) / 2, n = [Math.cos(am) * cs, Math.cos(am) * sn, Math.sin(am)];
        if (!cull(n)) continue;
        paint({ vs: [P(a0, -hw), P(a1, -hw), P(a1, hw), P(a0, hw)], n, col: tyre }, 0.45 + 0.7 * k(n) * 0.6);
      }
      const side = w.v > 0 ? 1 : -1, nOut = [-sn * side, cs * side, 0]; // внешний торец
      if (cull(nOut)) {
        const vv = side * hw, ring = []; for (let i = 0; i < N; i++) ring.push(P(i / N * Math.PI * 2, vv));
        paint({ vs: ring, n: nOut, col: wreck ? [14, 14, 14] : [30, 32, 34] }, 1);
        const ri = []; for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2, r2 = 0.62; const p = P(a, vv); ri.push([w.u + (p[0] - w.u) * r2 - 0, w.v + (p[1] - w.v) * r2, w.r + (p[2] - w.r) * r2]); }
        paint({ vs: ri, n: nOut, col: wreck ? [30, 28, 26] : RIM, dec: 1 }, 0.95);
        if (!wreck) for (let b = 0; b < 4; b++) { const a = spin * (side > 0 ? 1 : 1) + b * Math.PI / 2, p = P(a, vv), q = [w.u + (p[0] - w.u) * 0.34, w.v + (p[1] - w.v) * 0.34, w.r + (p[2] - w.r) * 0.34], d = proj(q); ctx.fillStyle = 'rgba(30,30,32,0.9)'; ctx.fillRect(d.x - 1.1, d.y - 1.1, 2.2, 2.2); }
      }
    }
    // контактная тень + ореол под машиной (на земле, до тела)
    const cn = V.corners(c, -2).map(p => SCRf(p.x, p.y));
    ctx.fillStyle = 'rgba(0,0,0,0.42)'; ctx.beginPath(); cn.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.fill();
    const nearSign = (ca - sa) >= 0 ? 1 : -1, wheels = g.wheels.slice();
    const far = wheels.filter(w => (w.v > 0 ? 1 : -1) !== nearSign).sort((a, b) => Math.abs(b.v) - Math.abs(a.v)), near = wheels.filter(w => (w.v > 0 ? 1 : -1) === nearSign).sort((a, b) => Math.abs(a.v) - Math.abs(b.v));
    if (lit && night > 0.15) lights(env, c);
    for (const w of far) wheel(w);
    const ps = g.parts.map(P => ({ P, d: proj(P.cen).d })); ps.sort((a, b) => a.P.layer - b.P.layer || a.d - b.d);
    for (const o of ps) part(o.P);
    for (const w of near) wheel(w);
    // свечение включённых фар/фонарей
    if (!wreck && (lit || braking || rev) && night > 0.1) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const l of g.lamps) { if (!cull(l.n)) continue; const on = (l.kind === 'head' && lit) || (l.kind === 'tail' && (braking || lit)); if (!on) continue; const p = proj(l.p), R = (l.kind === 'head' ? 22 : 15) * (env.zoom || 1) * (braking && l.kind === 'tail' ? 1.3 : 1); const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R); const cc = l.kind === 'head' ? '255,235,170' : '255,50,30'; gr.addColorStop(0, `rgba(${cc},${0.55 * night})`); gr.addColorStop(1, `rgba(${cc},0)`); ctx.fillStyle = gr; ctx.fillRect(p.x - R, p.y - R, R * 2, R * 2); }
      ctx.restore();
    }
  }
  // конус света фар по земле (ночью, когда за рулём)
  function lights(env, c) {
    const ctx = env.ctx, ca = Math.cos(c.ang), sa = Math.sin(c.ang), T = TYPES[c.vt] || TYPES.sedan, night = env.night || 0, f = T.L * PX / 2, w0 = T.W * PX * 0.3, len = 150, w1 = 62;
    const P = (u, v) => env.SCR(c.x + ca * u - sa * v, c.y + sa * u + ca * v);
    const a = P(f, -w0), b = P(f, w0), d = P(f + len, w1), e = P(f + len, -w1), m = P(f, 0), far = P(f + len, 0);
    const gr = ctx.createLinearGradient(m.x, m.y, far.x, far.y); gr.addColorStop(0, `rgba(255,236,170,${0.34 * night})`); gr.addColorStop(1, 'rgba(255,236,170,0)');
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(d.x, d.y); ctx.lineTo(e.x, e.y); ctx.closePath(); ctx.fill(); ctx.restore();
  }
  Object.assign(V, { draw, lights, height: (c) => (TYPES[c.vt] || TYPES.sedan).H });
})(typeof window !== 'undefined' ? window : globalThis);
