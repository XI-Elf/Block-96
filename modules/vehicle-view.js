// Owner: поток «Сделать обзор из машины и зеркало». Обзор водителя + зеркало заднего вида.
// Подключается ПОСЛЕ modules/vision.js, ДО game.js. Ничего не правит в game.js/sim.js: оборачивает методы WL_VISION
// (playerSees / entAlpha / drawFog), которые game.js вызывает через window.WL_VISION в момент кадра.
// Правила (проект): обзор КОНУСОМ; вне конуса местность серая («как видели»), живые цели вне обзора не рисуются.
//  • Пеший: конус по курсору (modules/vision.js). За рулём (p.drive != null): конус по ходу НОСА машины, не по курсору.
//  • Фронт: 80° / 45 м днём (пешком 120° / 35 м: дальше, но уже). Ночью без света 22 м; фары добавляют луч 32° / 42 м.
//  • Бока: два конуса по 40°, центры ±80° от носа, дальность 12 м (короче фронта). Вплотную круг 6 м.
//  • Задний ход (c.v < -3): короткий задний конус 64° / 16 м (+ зеркало).
//  • Зеркало заднего вида: окошко-DOM canvas в углу HUD, свой мини-рендер ~14 к/с: земля по маскам карты, здания,
//    машины, мобы/NPC позади в 1..22 м (только в пределах прямой видимости, ночью — 14 м, освещённые стоп-сигналами).
'use strict';
(function () {
  const V = window.WL_VISION, C = window.WL_CONFIG || {};
  if (!V || V._vehView) return;
  const D2R = Math.PI / 180, TAU = Math.PI * 2;
  const VV = Object.assign({
    front: { half: 40, range: 450, rangeNight: 220 },   // px (10 px = 1 м)
    beam: { half: 16, range: 420 },                      // фары: ночью, пока есть топливо и машина цела
    side: { half: 20, range: 120, off: 80 },
    rear: { half: 32, range: 160 },                      // только на заднем ходу
    near: 60,                                            // круг вплотную, 6 м
    mirror: { on: true, fps: 14, w: 240, h: 96, nearM: 1.5, farM: 22, nightM: 14 },
  }, C.VEHVIEW || {});

  const nightK = (h) => (h >= 17 || h < 9) ? 1 : h >= 16 ? (h - 16) : h >= 9 && h < 10 ? (10 - h) : 0;
  const carOf = (s, p) => p && p.drive != null && s && s.cars ? s.cars.find(q => q.id === p.drive) : null;

  // Список секторов обзора водителя. face — рад, range/near — px.
  function regions(s, c) {
    const f = c.ang, R = [], nk = nightK(s.hour == null ? 10 : s.hour), lights = nk > 0.3 && c.state !== 'wreck' && c.state !== 'burn' && c.fuel > 0;
    R.push({ face: f, half: VV.front.half, range: nk > 0.3 ? VV.front.rangeNight : VV.front.range, near: VV.near });
    if (lights) R.push({ face: f, half: VV.beam.half, range: VV.beam.range, near: 0 });
    R.push({ face: f - VV.side.off * D2R, half: VV.side.half, range: VV.side.range, near: 0 });
    R.push({ face: f + VV.side.off * D2R, half: VV.side.half, range: VV.side.range, near: 0 });
    if (c.v < -3) R.push({ face: f + Math.PI, half: VV.rear.half, range: VV.rear.range, near: 0 });
    return R;
  }
  function seesVeh(s, c, t, API) {
    API = API || window.WL_SIM.API;
    let ok = false;
    for (const r of regions(s, c)) if (V.inCone(c.x, c.y, r.face, { half: r.half, range: r.range, near: r.near }, t.x, t.y, t.r || 0)) { ok = true; break; }
    return ok && API.los(s, { x: c.x, y: c.y }, t);
  }

  // ---------- обёртки WL_VISION ----------
  const origSees = V.playerSees, origFog = V.drawFog;
  V.playerSees = function (s, p, t, API) { const c = carOf(s, p); return c ? seesVeh(s, c, t, API) : origSees(s, p, t, API); };
  V.entAlpha = function (s, p, e, dt) {
    const vis = V.playerSees(s, p, e) ? 1 : 0;
    if (e._va == null) e._va = vis;
    e._va += (vis - e._va) * Math.min(1, dt * V.VIS.fade);
    if (Math.abs(vis - e._va) < 0.02) e._va = vis;
    return e._va;
  };

  let ov = null, octx = null;
  function polygonsOf(s, c, API) {
    const polys = [];
    const ray = (a, R) => { const dx = Math.cos(a), dy = Math.sin(a), t = API.rayWall(s, c.x, c.y, c.x + dx * R, c.y + dy * R), f = t >= 0 ? Math.min(1, t + 4 / R) : 1; return { x: c.x + dx * R * f, y: c.y + dy * R * f }; };
    for (const r of regions(s, c)) {
      const half = r.half * D2R, n = Math.max(8, Math.ceil(half * 2 / (1.5 * D2R))), poly = [{ x: c.x, y: c.y }];
      for (let i = 0; i <= n; i++) poly.push(ray(r.face - half + half * 2 * i / n, r.range));
      polys.push(poly);
    }
    const circ = []; for (let i = 0; i < 28; i++) circ.push(ray(i / 28 * TAU, VV.near)); polys.push(circ);
    return polys;
  }
  V.drawFog = function (ctx, s, p, W) {
    const c = carOf(s, p);
    if (!c) return origFog(ctx, s, p, W);
    if (!s.map || s.mode === 'base' || p.dead || p.extracted) return;
    const API = window.WL_SIM.API, cv = ctx.canvas; if (!cv.width || !cv.height) return;
    if (!ov || ov.width !== cv.width || ov.height !== cv.height) { ov = document.createElement('canvas'); ov.width = cv.width; ov.height = cv.height; octx = ov.getContext('2d'); }
    const polys = polygonsOf(s, c, API), tr = ctx.getTransform();
    octx.setTransform(1, 0, 0, 1, 0, 0); octx.globalCompositeOperation = 'source-over'; octx.clearRect(0, 0, ov.width, ov.height);
    octx.fillStyle = V.VIS.greyTone; octx.fillRect(0, 0, ov.width, ov.height);
    octx.setTransform(tr); octx.globalCompositeOperation = 'destination-out'; octx.fillStyle = '#000';
    for (const poly of polys) { octx.beginPath(); poly.forEach((q, i) => i ? octx.lineTo(q.x - W.cam.x, q.y - W.cam.y) : octx.moveTo(q.x - W.cam.x, q.y - W.cam.y)); octx.closePath(); octx.fill(); }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'saturation'; ctx.drawImage(ov, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = V.VIS.greyVeil; ctx.drawImage(ov, 0, 0);
    ctx.restore();
    mirrorTick(s, p, c, API);
  };

  // ---------- зеркало заднего вида ----------
  const M = { el: null, cv: null, cx: null, img: null, last: 0, grid: null, gw: 0, gh: 0, gS: null, ms: 0, frames: 0, vis: false };
  function ensureDom() {
    if (M.el) return;
    const el = document.createElement('div'); el.id = 'vehMirror';
    el.style.cssText = 'position:fixed;top:30px;right:14px;z-index:20;pointer-events:none;display:none;padding:3px;border-radius:10px;background:#0b1015;border:1px solid rgba(120,200,230,.45);box-shadow:0 0 14px rgba(40,200,255,.25),inset 0 0 6px #000';
    const cv = document.createElement('canvas'); cv.width = VV.mirror.w; cv.height = VV.mirror.h; cv.style.cssText = `display:block;width:${VV.mirror.w}px;height:${VV.mirror.h}px;border-radius:7px;image-rendering:auto`;
    const lb = document.createElement('div'); lb.textContent = 'ЗАДНИЙ ВИД'; lb.style.cssText = 'position:absolute;left:10px;top:5px;font:9px/1 monospace;letter-spacing:.12em;color:rgba(160,220,240,.65);text-shadow:0 0 3px #000';
    el.appendChild(cv); el.appendChild(lb); document.body.appendChild(el);
    M.el = el; M.cv = cv; M.cx = cv.getContext('2d'); M.img = M.cx.createImageData(cv.width, cv.height);
  }
  function buildGrid(s) { // 1 байт на пиксель карты: 1 дорога, 2 парк, 3 вода (мосты уже вырезаны из маски воды)
    const Wd = s.map.city.world, w = Wd.w, h = Wd.h, g = new Uint8Array(w * h);
    const runs = (rows, k, sc) => rows.forEach((r, y) => { for (let i = 0; i + 1 < r.length; i += 2) for (let yy = 0; yy < sc; yy++) { const row = (y * sc + yy) * w; if (row >= g.length) continue; for (let x = r[i] * sc; x < r[i + 1] * sc && x < w; x++) g[row + x] = k; } });
    runs(Wd.parkRle, 2, 2); runs(Wd.roadRle, 1, 2); runs(Wd.waterRle, 3, 1);
    M.grid = g; M.gw = w; M.gh = h; M.gS = s;
  }
  // перспективная развёртка: t=0 верх (далеко), t=1 низ (близко). d — метры позади машины, lat — метры вправо.
  const NEAR = () => VV.mirror.nearM, FAR = () => VV.mirror.farM, wide = (d) => 3.4 + 0.36 * d;
  const tOfD = (d) => 1 - Math.pow((d - NEAR()) / (FAR() - NEAR()), 1 / 1.6);
  const dOfT = (t) => NEAR() + (FAR() - NEAR()) * Math.pow(1 - t, 1.6);
  function mirrorTick(s, p, c, API) {
    const mc = VV.mirror; if (!mc.on) { if (M.el) M.el.style.display = 'none'; return; }
    M.seen = performance.now(); ensureDom(); if (!M.vis) { M.el.style.display = 'block'; M.vis = true; }
    const now = performance.now(); if (now - M.last < 1000 / mc.fps) return; M.last = now;
    const t0 = performance.now();
    if (M.gS !== s) buildGrid(s);
    const cvs = M.cv, W = cvs.width, H = cvs.height, MP = s.map.city.MP, ux = Math.cos(c.ang), uy = Math.sin(c.ang), rx = -uy, ry = ux;
    const hour = s.hour == null ? 10 : s.hour, nk = nightK(hour), lit = 1 - 0.58 * nk;
    // 1) земля: попиксельная выборка масок карты
    const d32 = new Uint32Array(M.img.data.buffer), g = M.grid, gw = M.gw, gh = M.gh;
    const col = (r, gg, b) => (255 << 24) | (Math.round(b * lit) << 16) | (Math.round(gg * lit) << 8) | Math.round(r * lit);
    const C0 = col(96, 108, 118), C1 = col(54, 62, 70), C2 = col(62, 100, 72), C3 = col(50, 88, 132), CL = col(150, 160, 168);
    for (let my = 0; my < H; my++) {
      const t = my / (H - 1), d = dOfT(t), half = wide(d), row = my * W;
      for (let mx = 0; mx < W; mx++) {
        const lat = (mx / (W - 1) * 2 - 1) * half, wx = c.x - ux * d * 10 + rx * lat * 10, wy = c.y - uy * d * 10 + ry * lat * 10;
        const gx = (wx / MP) | 0, gy = (wy / MP) | 0; let v = 0;
        if (gx >= 0 && gy >= 0 && gx < gw && gy < gh) v = g[gy * gw + gx];
        d32[row + mx] = v === 1 ? C1 : v === 2 ? C2 : v === 3 ? C3 : C0;
      }
    }
    M.cx.putImageData(M.img, 0, 0);
    const cx = M.cx, toM = (wx, wy) => { const dx = wx - c.x, dy = wy - c.y, u = dx * ux + dy * uy, v = dx * rx + dy * ry; return { d: -u / 10, lat: v / 10 }; };
    const px = (d, lat) => ({ x: (lat / wide(d) + 1) / 2 * (W - 1), y: tOfD(d) * (H - 1) });
    const poly = (pts, fill, stroke) => { // отсечение по полосе d∈[near, far], затем в пиксели
      let a = pts.map(q => toM(q.x, q.y));
      const clip = (arr, f, k) => { const out = []; for (let i = 0; i < arr.length; i++) { const A = arr[i], B = arr[(i + 1) % arr.length], ia = f(A) >= 0, ib = f(B) >= 0; if (ia) out.push(A); if (ia !== ib) { const q = f(A) / (f(A) - f(B)); out.push({ d: A.d + (B.d - A.d) * q, lat: A.lat + (B.lat - A.lat) * q }); } } return out; };
      a = clip(a, q => q.d - NEAR()); if (a.length < 3) return; a = clip(a, q => FAR() - q.d); if (a.length < 3) return;
      cx.beginPath(); a.forEach((q, i) => { const z = px(q.d, q.lat); i ? cx.lineTo(z.x, z.y) : cx.moveTo(z.x, z.y); }); cx.closePath();
      if (fill) { cx.fillStyle = fill; cx.fill(); } if (stroke) { cx.strokeStyle = stroke; cx.lineWidth = 1; cx.stroke(); }
    };
    // 2) здания и препятствия в полосе
    const rng = FAR() * 10 + 120, bl = s.map.city.buildings;
    const roof = nk > 0.3 ? '#2a3036' : '#8a929a', roofS = nk > 0.3 ? '#171b20' : '#2b3036';
    for (const b of bl) { if (Math.abs(b.c.x - c.x) > rng + b.w * 5 || Math.abs(b.c.y - c.y) > rng + b.d * 5) continue; poly(b.poly, roof, roofS); }
    for (const q of s.cars || []) { if (q === c) continue; if (Math.hypot(q.x - c.x, q.y - c.y) > rng) continue; poly(B96_VEH.corners(q), q.state === 'wreck' ? '#2b2420' : q.state === 'burn' ? '#d2642b' : '#60707a', '#101418'); }
    // 3) живые: только позади, в пределах обзора зеркала и прямой видимости
    const lim = nk > 0.3 ? mc.nightM : FAR();
    const act = (e, colr, hh, ww) => {
      const m = toM(e.x, e.y); if (m.d < NEAR() || m.d > lim || Math.abs(m.lat) > wide(m.d)) return; if (!API.los(s, { x: c.x, y: c.y }, e)) return;
      const z = px(m.d, m.lat), k = (W - 1) / 2 / wide(m.d) / 2.0; // px на метр по ширине
      cx.fillStyle = 'rgba(0,0,0,.45)'; cx.beginPath(); cx.ellipse(z.x, z.y, ww * k * 0.9, ww * k * 0.35, 0, 0, TAU); cx.fill();
      cx.fillStyle = colr; cx.fillRect(z.x - ww * k / 2, z.y - hh * k, ww * k, hh * k);
      cx.beginPath(); cx.arc(z.x, z.y - hh * k, ww * k * 0.35, 0, TAU); cx.fill();
    };
    for (const e of s.enemies || []) {
      if (e.dead || e.hp <= 0) continue; const dog = e.type === 'dog' || e.type === 'hound';
      act(e, e.alert > 0.5 || e.m === 'attack' ? '#ff5a4a' : dog ? '#ffb23d' : '#cdd6dc', dog ? 0.8 : 1.8, dog ? 0.9 : 0.55);
    }
    // 4) стоп-огни/фары позади, ночная тонировка и рамка «багажника»
    if (nk > 0.01) { cx.fillStyle = `rgba(4,9,30,${0.35 * nk})`; cx.fillRect(0, 0, W, H); }
    const gl = cx.createLinearGradient(0, H, 0, H - 26); gl.addColorStop(0, c.brake || c.v < -3 ? 'rgba(255,40,30,.55)' : 'rgba(255,40,30,.18)'); gl.addColorStop(1, 'rgba(255,40,30,0)');
    cx.fillStyle = gl; cx.fillRect(0, H - 26, W, 26);
    cx.fillStyle = '#0d1115'; cx.fillRect(0, H - 4, W, 4);
    const vg = cx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.4)'); cx.fillStyle = vg; cx.fillRect(0, 0, W, H);
    M.ms = performance.now() - t0; M.frames++;
  }
  // скрыть зеркало, когда вышли из машины (drawFog не зовётся / нет машины)
  const hide = () => { if (M.vis && M.el) { M.el.style.display = 'none'; M.vis = false; } };
  setInterval(() => { if (M.vis && performance.now() - (M.seen || 0) > 300) hide(); }, 200);

  V._vehView = true;
  window.WL_VEHVIEW = { VV, regions, carOf, seesVeh, M, hide, setMirror(on) { VV.mirror.on = !!on; if (!on) hide(); } };
})();
