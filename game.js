// Block-96 — клиент: ввод → команды, рендер состояния, HUD. Сим не трогает напрямую,
// кроме чтения s и передачи команд в WL_SIM.step (в сети тут будет отправка на сервер).
'use strict';
(function () {
  const C = window.WL_CONFIG, S = window.WL_SIM;
  const TICK = 1 / 60, LOCAL = 'p1';
  const cv = document.getElementById('game'), ctx = cv.getContext('2d');
  const $ = (id) => document.getElementById(id);
  let W = 0, H = 0, DPR = 1, zoom = 1, VW = 0, VH = 0, SC = 38, Kx = 2.7, VMh = 33, shx = 0, shy = 0;
  let s, ground, cam = { x: 0, y: 0 }, started = false, ended = false, fx = [], floaters = [];
  let touchMode = false;

  // ---------- убежище: склад, персонаж и статистика переживают рейды (localStorage; без него просто сбрасывается) ----------
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const { html: hx, setHtml, h: el_ } = window.WL_DOM; // безопасные шаблоны: данные в innerHTML только через них
  // формат, миграции, резервная копия и восстановление — modules/save.js (WL_SAVE); ключ localStorage прежний
  const SV = window.WL_SAVE, freshSave = () => SV.fresh(C);
  const store = (() => { try { return window.localStorage; } catch (e) { return null; } })();
  const loaded = SV.load(store, C, C.META.saveKey), saveState = { writable: loaded.writable };
  let save = loaded.save, lastSaveErr = 0;
  function persist() {
    const r = SV.persist(store, save, C.META.saveKey, saveState);
    if (!r.ok && performance.now() - lastSaveErr > 8000) { lastSaveErr = performance.now(); toast(r.error === 'write-disabled' ? 'Сохранение выключено: файл создан более новой версией игры. Прогресс этой сессии не запишется.' : 'Не удалось сохранить прогресс (' + r.error + '). Проверь место в браузере и приватный режим.', true); }
    return r.ok;
  }
  function saveNotice() {
    const T = { migrated: 'Сохранение обновлено до нового формата. Копия старого — в резерве.', recovered: 'Сохранение было повреждено: восстановлено из резервной копии.', corrupt: 'Сохранение нечитаемо: начата новая игра, старые данные не удалены (резерв в браузере).', newer: 'Сохранение от более новой версии: запись отключена, чтобы не испортить его.', unavailable: 'Хранилище браузера недоступно: прогресс не сохранится.' };
    if (T[loaded.status]) toast(T[loaded.status], true);
    if (loaded.notes.some(n => n.startsWith('dropped:'))) toast('В сохранении были неизвестные предметы: они убраны, исходник — в резервной копии.', true);
  }

  setTimeout(saveNotice, 500);

  // ---------- контрольные сцены: ?seed=N (мир), ?at=x,y (метры, старт рейда), ?hour=H; без параметров поведение прежнее ----------
  const QS = (() => { const r = { seed: null, at: null }; try { const q = new URLSearchParams(location.search), sd = q.get('seed'), at = q.get('at');
    if (sd != null && sd !== '' && Number.isFinite(+sd)) r.seed = (Math.abs(Math.trunc(+sd)) % 2147483647) | 0;
    if (at) { const a = at.split(',').map(Number); if (a.length === 2 && a.every(Number.isFinite)) r.at = a; } } catch (_) { /* нет location */ } return r; })();
  function rngFor(seed) { let a = (seed ^ 0x9e3779b9) >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  // ---------- мир ----------
  let mode = 'base'; // 'base' — отдельная локация-убежище; 'raid' — карта города
  function boot(load, base, entry) {
    mode = base ? 'base' : 'raid';
    const seed = QS.seed != null ? QS.seed : (Date.now() % 2147483647) | 0, sel = !base && window.WL_START && WL_START.resolve ? WL_START.resolve(seed) : null; // выбор банды: район, фракция
    s = base ? S.newBase(seed) : S.newWorld(seed, entry, Object.keys(save.nodes).filter(k => save.nodes[k]), sel && sel.district, sel && sel.fac);
    if (!base) { s.h0 = sel ? sel.hour : 0; s.hour = s.h0; } // рейд стартует в 00:00: все банды в активной фазе
    try { const hq = new URLSearchParams(location.search).get('hour'); if (hq != null && hq !== '' && !isNaN(+hq)) { s.h0 = +hq; s.hour = +hq; } } catch (_) { /* ?hour=22 — старт рейда в заданный час, для проверки ночи */ }
    S.addPlayer(s, LOCAL, 'Странник', load);
    const p = s.players[LOCAL];
    if (!base && QS.at) { const ax = QS.at[0] * C.PX_PER_M, ay = QS.at[1] * C.PX_PER_M; if (ax > 0 && ay > 0 && ax < s.map.w && ay < s.map.h) { p.x = ax; p.y = ay; p.ax = ax + 100; p.ay = ay; } } // точка старта: проверка проходимости — на вызывающем
    cam.x = p.x - VW / 2; cam.y = p.y - VH / 2;
    initBuildingIndex(s);
    ground = buildGround(s); fx = []; floaters = []; if (window.WL_FEEL) WL_FEEL.reset();
    $('dead').hidden = true; lastPanel = ''; prints.length = 0; corpses.length = 0; prevEn = []; decals.length = 0;
  }

  function resize() {
    DPR = Math.min(1.5, window.devicePixelRatio || 1); // потолок 1,5: на 4K/Retina заливка экрана иначе съедает FPS
    W = window.innerWidth; H = window.innerHeight;
    cv.width = W * DPR; cv.height = H * DPR; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    zoom = 1; SC = Math.max(26, Math.min(64, W / 34)); Kx = 0.0707 * SC; VMh = 0.866 * SC; VW = VH = ((W / 2 + H) / (2 * Kx) + 40) * 2; // изометрия: фигура 1,8 м ≈ 60 px
    if (window.WL_ENEMIES && WL_ENEMIES.setView) WL_ENEMIES.setView(W, H, Kx);
  }
  window.addEventListener('resize', resize); resize();

  // ---------- земля: ночной двор под снегом (косметика; детерминирована сидом мира) ----------
  const mulberry = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const hsh = (a, b) => { let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  let visWalls = [];
  // v65: пространственный индекс зданий. До этого каждый кадр обходил весь город
  // трижды (тени, фасады, вывески), даже если на экране один квартал.
  const BUILD_CELL = 640;
  let buildingIndex = null, visibleBuildings = [];
  function initBuildingIndex(state) {
    const ct = state.map.city;
    buildingIndex = null; visibleBuildings = [];
    if (!ct || !ct.buildings) return;
    const cells = new Map();
    for (const b of ct.buildings) {
      const x0 = b.minX == null ? b.c.x - b.w / 2 : b.minX;
      const x1 = b.maxX == null ? b.c.x + b.w / 2 : b.maxX;
      const y0 = b.minY == null ? b.c.y - b.d / 2 : b.minY;
      const y1 = b.maxY == null ? b.c.y + b.d / 2 : b.maxY;
      for (let x = Math.floor(x0 / BUILD_CELL); x <= Math.floor(x1 / BUILD_CELL); x++)
        for (let y = Math.floor(y0 / BUILD_CELL); y <= Math.floor(y1 / BUILD_CELL); y++) {
          const key = x + ',' + y;
          let list = cells.get(key); if (!list) cells.set(key, list = []);
          list.push(b);
        }
    }
    buildingIndex = { cells, mark: new Set() };
  }
  function getVisibleBuildings() {
    if (!buildingIndex) return [];
    const index = buildingIndex, found = [], seen = index.mark;
    seen.clear();
    // Небольшой запас для высоких домов, длинных фасадов и изометрической проекции.
    const x0 = cam.x - 480, y0 = cam.y - 480;
    const x1 = cam.x + VW + 480, y1 = cam.y + VH + 480;
    for (let x = Math.floor(x0 / BUILD_CELL); x <= Math.floor(x1 / BUILD_CELL); x++)
      for (let y = Math.floor(y0 / BUILD_CELL); y <= Math.floor(y1 / BUILD_CELL); y++) {
        const list = index.cells.get(x + ',' + y); if (!list) continue;
        for (const b of list) {
          if (seen.has(b)) continue;
          seen.add(b);
          if (b.maxX >= x0 && b.minX <= x1 && b.maxY >= y0 && b.minY <= y1) found.push(b);
        }
      }
    return found;
  }

  let GS = 1; // масштаб запечённой земли (город запекается вдвое грубее, чтобы поместиться в память телефона)
  function buildGroundCity(s) {
    const CT = s.map.city, R = mulberry(s.seed ^ 0x51ed270b); GS = s.map.w * s.map.h > 5e7 ? 0.35 : 0.5;
    const g = document.createElement('canvas'); g.width = Math.round(s.map.w * GS); g.height = Math.round(s.map.h * GS);
    const c = g.getContext('2d'); c.scale(GS, GS);
    const W = s.map.w, H = s.map.h, AK = W * H / 7680000, poly = (pts) => { c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.closePath(); };
    const line = (pts, w, col, cap) => { c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.lineWidth = w; c.strokeStyle = col; c.lineCap = cap || 'round'; c.lineJoin = 'round'; c.stroke(); };
    c.fillStyle = '#26323b'; c.fillRect(0, 0, W, H); // окраина: серый снег
    for (let i = 0; i < 9000 * AK; i++) { c.fillStyle = R() > 0.5 ? 'rgba(190,212,226,0.07)' : 'rgba(10,20,30,0.13)'; c.fillRect(R() * W, R() * H, 1 + R() * 14, 1 + R() * 3); }
    for (const d of CT.district) { poly(d); c.fillStyle = '#2d3a44'; c.fill(); } // застроенная часть чуть светлее
    for (const pk of CT.parks) { poly(pk); c.fillStyle = '#222f2b'; c.fill(); c.save(); poly(pk); c.clip(); for (let i = 0; i < 2600; i++) { c.fillStyle = R() > 0.55 ? 'rgba(160,190,170,0.06)' : 'rgba(10,28,22,0.2)'; c.fillRect(R() * W, R() * H, 2 + R() * 22, 1 + R() * 4); } c.restore(); }
    // река: тёмная вода, лёд пятнами, течение
    const wpath = () => { c.beginPath(); for (const w of CT.water) { w.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.closePath(); } }; wpath(); c.fillStyle = '#1d3248'; c.fill(); c.save(); wpath(); c.clip();
    for (let i = 0; i < 700; i++) { const x = R() * W, y = R() * H, rx = 20 + R() * 90; c.fillStyle = R() > 0.4 ? 'rgba(170,200,222,0.10)' : 'rgba(8,20,34,0.22)'; c.beginPath(); c.ellipse(x, y, rx, rx * 0.22, 0.9 + R() * 0.5, 0, 7); c.fill(); }
    c.restore(); wpath(); c.lineWidth = 16; c.strokeStyle = 'rgba(205,224,236,0.16)'; c.stroke(); // снежный берег
    // дороги: тротуар, асфальт, разметка, колея
    const roads = CT.roads.slice().sort((a, b) => b.w - a.w);
    for (const r of roads) line(r.pts, r.w + 34, '#3b4852');
    for (const r of roads) line(r.pts, r.w + 8, '#242f38');
    for (const r of roads) line(r.pts, r.w, r.type === 'lane' ? '#1e2832' : '#18222b');
    for (const r of roads) {
      if (r.type === 'lane') continue;
      c.setLineDash([26, 30]); line(r.pts, 2.5, 'rgba(200,214,222,0.28)', 'butt'); c.setLineDash([]);
      for (const o of [-0.28, 0.28]) { c.save(); c.translate(0, 0); line(r.pts.map(p => ({ x: p.x + (o > 0 ? 3 : -3), y: p.y })), 3, 'rgba(6,12,18,0.3)'); c.restore(); }
    }
    for (let i = 0; i < 900 * AK; i++) { const r = roads[Math.floor(R() * roads.length)], k = Math.floor(R() * (r.pts.length - 1)), a = r.pts[k], b = r.pts[k + 1], t = R(); c.fillStyle = 'rgba(200,218,230,0.10)'; c.fillRect(a.x + (b.x - a.x) * t + (R() - 0.5) * r.w, a.y + (b.y - a.y) * t + (R() - 0.5) * r.w, 2 + R() * 10, 1 + R() * 3); }
    // железная дорога: балласт, шпалы, рельсы
    for (const rl of CT.rails) { line(rl, 46, '#2a2724'); c.setLineDash([5, 12]); line(rl, 26, '#3b322b', 'butt'); c.setLineDash([]); for (const o of [-9, 9]) line(rl.map(p => ({ x: p.x, y: p.y + o })), 3, '#6d7480'); }
    // мосты: настил и ограждение
    for (const b of CT.bridges) { line(b.pts, b.w + 10, '#2c333b', 'butt'); line(b.pts, b.w, '#4a4f58', 'butt'); line(b.pts, 3, 'rgba(255,255,255,0.12)', 'butt'); }
    // основание зданий: тёмная кромка и отмостка
    for (const b of CT.buildings) { poly(b.poly); c.lineWidth = 26; c.strokeStyle = 'rgba(10,16,22,0.30)'; c.lineJoin = 'round'; c.stroke(); poly(b.poly); c.fillStyle = '#1c252d'; c.fill(); }
    c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 1.5; // трещины и наледь
    for (let i = 0; i < 260 * AK; i++) { let x = R() * W, y = R() * H; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (R() - 0.5) * 50; y += (R() - 0.5) * 50; c.lineTo(x, y); } c.stroke(); }
    return g;
  }
  // ---------- земля большого города: плитки 2048 px мира, запекаются по мере появления в кадре ----------
  // ---------- текстуры v03 (assets/*.png): наложение режимом overlay, привязано к мировым координатам ----------
  const TEX = {}; for (const n of ['asphalt', 'concrete', 'earth', 'roof', 'rust', 'floor', 'wall', 'pave', 'wall_panel_grey', 'wall_panel_ochre', 'wall_brick', 'wall_stucco', 'floor_linoleum', 'floor_parquet', 'floor_tile']) { const im = new Image(); im.onload = () => { TEX[n] = im; }; im.src = (window.B96_ASSET_BASE || 'assets/') + n + '.png'; }
  const texReady = () => ['asphalt', 'concrete', 'earth', 'roof'].every(n => TEX[n]);
  // заливает текущий путь текстурой: sc — масштаб (мировые px на px текстуры), M — матрица мир->канвас (или null, если ctx уже в мировых координатах)
  const TEXMEAN = { asphalt: [66, 73, 72], concrete: [134, 139, 130], earth: [69, 76, 62], roof: [75, 84, 81], wall: [120, 116, 105], pave: [50, 52, 50], floor: [128, 128, 128], wall_panel_grey: [119,119,114], wall_panel_ochre: [139,124,103], wall_brick: [111,77,66], wall_stucco: [135,128,117], floor_linoleum: [120,115,105], floor_parquet: [107,86,68], floor_tile: [125,128,127] };
  // base: цвет (#rrggbb), который текстура должна «нести»: текстура кладётся целиком и умножается на base/среднее -> видна фактура и сохраняется цвет
  function texFill(c, name, alpha, sc, M, rule, ox, oy, base, gain) {
    const im = TEX[name]; if (!im) return; const pat = c.createPattern(im, 'repeat'); c.save();
    if (M) { c.clip(rule || 'nonzero'); c.setTransform(M[0], M[1], M[2], M[3], M[4], M[5]); } else c.clip(rule || 'nonzero');
    pat.setTransform(new DOMMatrix().translate(ox || 0, oy || 0).scale(sc, sc)); c.fillStyle = pat;
    const R = M ? [-1e5, -1e5, 2e5, 2e5] : [-1e6, -1e6, 2e6, 2e6];
    if (base) {
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.fillRect(R[0], R[1], R[2], R[3]);
      const m = TEXMEAN[name] || [128, 128, 128], gn = gain || 1.1, rgb = base[0] === '#' ? [parseInt(base.slice(1, 3), 16), parseInt(base.slice(3, 5), 16), parseInt(base.slice(5, 7), 16)] : base.match(/\d+/g).map(Number);
      const ch = (s, i) => Math.min(255, Math.round(rgb[i] / m[i] * 255 * gn));
      c.globalCompositeOperation = 'multiply'; c.fillStyle = `rgb(${ch(0, 0)},${ch(0, 1)},${ch(0, 2)})`; c.fillRect(R[0], R[1], R[2], R[3]);
    } else { c.globalCompositeOperation = 'overlay'; c.globalAlpha = alpha; c.fillRect(R[0], R[1], R[2], R[3]); }
    c.restore();
  }
  const _wallPatterns = {}; function wallPat(name = 'wall') { const im = TEX[name] || TEX.wall; if (!im) return null; if (!_wallPatterns[name]) _wallPatterns[name] = ctx.createPattern(im, 'repeat'); return _wallPatterns[name]; }
  let _pt = null; // плиты тротуара v03, подкрашенные под ночную палитру (один раз)
  function paveTint() { if (_pt) return _pt; const im = TEX.pave, cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height; const x = cv.getContext('2d'); x.drawImage(im, 0, 0); x.globalCompositeOperation = 'multiply'; x.fillStyle = 'rgb(230,255,255)'; x.fillRect(0, 0, cv.width, cv.height); x.globalCompositeOperation = 'lighter'; x.fillStyle = 'rgb(40,52,60)'; x.fillRect(0, 0, cv.width, cv.height); return (_pt = cv); }
  // матрица мира (с высотой h в экранных px) для патерна на крыше/фасаде: x,y мировые px -> экран
  const worldM = (hPx) => { const o = SCR(0, 0), px = SCR(1, 0), py = SCR(0, 1); return [px.x - o.x, px.y - o.y, py.x - o.x, py.y - o.y, o.x, o.y - hPx]; };
  // спрайт-лист v03: props (4x2); у каждой ячейки берётся рамка по альфа-каналу
  const SPR = {};
  const BOX = { props: [[66,9,322,427],[610,10,195,425],[938,42,342,382],[1382,70,360,339],[30,461,387,425],[470,484,402,368],[1042,449,150,427],[1434,446,235,434]] };
  function loadSheet(name) {
    const im = new Image(); im.onload = () => { SPR[name] = { im, cells: BOX[name].map(b => ({ sx: b[0], sy: b[1], sw: b[2], sh: b[3] })) }; };
    im.src = (window.B96_ASSET_BASE || 'assets/') + name + '.png';
  }
  loadSheet('props'); // спрайты машин убраны: машины рисует modules/vehicles-draw.js из примитивов
  // рисует ячейку листа: низ-центр в (x, y), заданная ширина или высота (px экрана); возвращает размеры или null, если лист не загружен
  // спрайт, у которого дальняя половина опущена вниз (перекос): колёса встают на землю в нашей проекции. dir=-1: опускается левый край, +1: правый; sag — доля высоты
  const SHC = new Map(); // кэш перекошенных спрайтов: один drawImage вместо 28 срезов на машину
  function sprSheared(name, idx, x, y, wPx, dir, sag) {
    const S = SPR[name]; if (!S) return null; const c = S.cells[idx], wq = Math.round(wPx / 4) * 4, key = name + idx + '_' + wq + '_' + dir + '_' + sag; let e = SHC.get(key);
    if (!e) {
      const k = wq / c.sw, w = wq, h = c.sh * k, N = 28, dw = c.sw / N, pad = Math.ceil(sag * h) + 2, cv = document.createElement('canvas'); cv.width = Math.ceil(w) + 2; cv.height = Math.ceil(h) + pad; const g2 = cv.getContext('2d');
      for (let i = 0; i < N; i++) { const t = dir < 0 ? 1 - (i + 0.5) / N : (i + 0.5) / N, dy = sag * h * t * t; g2.drawImage(S.im, c.sx + i * dw, c.sy, dw + 0.6, c.sh, i * dw * k, dy, dw * k + 0.7, h); }
      e = { cv, w, h }; SHC.set(key, e);
    }
    ctx.drawImage(e.cv, x - e.w / 2, y - e.h); return { w: e.w, h: e.h };
  }
  function spr(name, idx, x, y, wPx, hPx) {
    const S = SPR[name]; if (!S) return null; const c = S.cells[idx], k = wPx ? wPx / c.sw : hPx / c.sh, w = c.sw * k, h = c.sh * k;
    ctx.drawImage(S.im, c.sx, c.sy, c.sw, c.sh, x - w / 2, y - h, w, h); return { w, h };
  }
  // v65: 600x600 вместо 1000x1000 на тайл: в 2.78 раза меньше пикселей
  // запекания и около 64% экономии памяти на каждый тайл.
  const TS = 400, TG = 1.5;
  // Terrain v62: отдельные материалы для пустырей, грунта, зелёных зон,
  // дорог и поднятых тротуаров. Все декоративные элементы запекаются в тайл.
  function bakeTile(tx, ty) {
    const CT = s.map.city, Wd = CT.world, MP = CT.MP;
    const g = document.createElement('canvas'); g.width = g.height = TS * TG;
    const c = g.getContext('2d'); c.scale(TG, TG); c.translate(-tx * TS, -ty * TS);
    const R = mulberry((tx * 7919 + ty * 104729) ^ 0x51ed270b);
    const x0 = tx * TS, y0 = ty * TS;
    const cs = Wd.chunk * MP, k0x = Math.floor(x0 / cs), k1x = Math.floor((x0 + TS) / cs);
    const k0y = Math.floor(y0 / cs), k1y = Math.floor((y0 + TS) / cs), sc = MP / 4;
    const path = polys => { c.beginPath(); for (const p of polys) { c.moveTo(p[0]*sc,p[1]*sc); for(let i=2;i<p.length;i+=2)c.lineTo(p[i]*sc,p[i+1]*sc);c.closePath(); } };
    const each = (layer, fn) => { if (!Wd[layer]) return; for(let ky=k0y;ky<=k1y;ky++)for(let kx=k0x;kx<=k1x;kx++){const pl=Wd[layer][kx+','+ky];if(pl)fn(pl);}};
    // Неровная основа старого двора: земля + плотный утрамбованный грунт.
    c.fillStyle = '#666661'; c.fillRect(x0,y0,TS,TS);
    c.beginPath();c.rect(x0,y0,TS,TS);
    texFill(c,'earth',1,0.2,null,'nonzero',0,0,'#6d6c65',1.04);
    for(let i=0;i<135;i++){
      const x=x0+R()*TS,y=y0+R()*TS,rx=4+R()*30;
      c.fillStyle=R()<0.52?'rgba(45,48,49,0.16)':'rgba(170,158,119,0.11)';
      c.beginPath();c.ellipse(x,y,rx,rx*(0.28+R()*0.35),R()*Math.PI,0,Math.PI*2);c.fill();
    }
    // Вытоптанные участки дворов и пыльный бетон, не на проезжей части.
    for(let i=0;i<25;i++){
      const x=x0+R()*TS,y=y0+R()*TS,rx=12+R()*54;
      c.fillStyle=R()>0.5?'rgba(111,107,91,0.20)':'rgba(68,68,65,0.19)';
      c.beginPath();c.ellipse(x,y,rx,rx*(0.3+R()*0.38),R()*Math.PI,0,Math.PI*2);c.fill();
    }
    // Парк и газон: самостоятельный зелёный слой, не просто окрашенный бетон.
    each('park', pl=>{
      path(pl);c.fillStyle='#666b65';c.fill('evenodd');
      texFill(c,'earth',1,0.19,null,'evenodd',0,0,'#727571',1.13);
      c.save();path(pl);c.clip('evenodd');
      for(let i=0;i<185;i++){
        const x=x0+R()*TS,y=y0+R()*TS,rr=3+R()*22;
        c.fillStyle=R()<0.45?'rgba(59,58,54,0.22)':'rgba(185,188,186,0.18)';
        c.beginPath();c.ellipse(x,y,rr,rr*(0.4+R()*0.5),R()*3,0,Math.PI*2);c.fill();
      }
      c.restore();
    });
    // Травинки и низкие кусты: размещаются до дорог, чтобы не расти на асфальте.
    const grass=['#827b6b','#777063','#a5a097','#58534e','#bbb4a0'];
    for(let i=0;i<340;i++){
      const x=x0+R()*TS,y=y0+R()*TS,thick=R()<0.13;
      const rr=thick?7+R()*10:2+R()*4,nb=thick?17:4;
      c.fillStyle='rgba(33,36,38,0.20)';c.beginPath();c.ellipse(x,y,rr*0.8,rr*0.36,0,0,7);c.fill();
      for(let k=0;k<nb;k++){
        const a=R()*6.283, len=rr*(0.35+R()*0.8);
        c.strokeStyle=grass[(R()*grass.length)|0];c.lineWidth=thick?0.85:0.6;
        c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(x+Math.cos(a)*len*.5,y+Math.sin(a)*len*.3,x+Math.cos(a)*len,y+Math.sin(a)*len);c.stroke();
      }
      if(thick){c.fillStyle='rgba(183,182,174,0.35)';c.beginPath();c.arc(x-rr*.2,y-rr*.15,rr*.33,0,7);c.fill();}
    }
    // Открытая вода перекрывает растительность.
    each('water',pl=>{path(pl);c.fillStyle='#243c4b';c.fill('evenodd');c.lineWidth=11;c.strokeStyle='rgba(160,188,189,0.22)';c.stroke();});
    // Под асфальтом явно выступает светлый тротуар. Граница и бордюр —
    // отдельные полосы, затем клипованная текстура дороги.
    each('road',pl=>{
      c.save();c.lineJoin='round';
      path(pl);c.lineWidth=94;c.strokeStyle='rgba(16,20,24,0.65)';c.stroke(); // кромка вокруг плит
      path(pl);c.lineWidth=85;c.strokeStyle='#9c9e9f';c.stroke();
      // Плиточная поверхность; рисунок не зависит от направления дороги.
      if(TEX.pave){const pt=c.createPattern(TEX.pave,'repeat');pt.setTransform(new DOMMatrix().scale(.105,.105));path(pl);c.lineWidth=80;c.strokeStyle=pt;c.stroke();}
      // Сетка швов и дефекты покрытия в пределах полосы тротуара.
      path(pl);c.lineWidth=69;c.strokeStyle='rgba(180,183,187,0.22)';c.stroke();
      path(pl);c.lineWidth=12;c.strokeStyle='#373a3d';c.stroke(); // вертикальная грань бордюра
      path(pl);c.lineWidth=5;c.strokeStyle='#c6c9cc';c.stroke(); // светлый верх бордюра
      c.restore();
    });
    each('road',pl=>{
      // Основная дорога темнее тротуара и грунта, сохраняет собственную фактуру.
      path(pl);c.fillStyle='#242b32';c.fill('evenodd');
      texFill(c,'asphalt',1,.16,null,'evenodd',0,0,'#343b42',1.08);
      c.save();path(pl);c.clip('evenodd');
      // Мелкий щебень, заплатки, наледь и износ без повторяющихся крупных деталей.
      for(let i=0;i<50;i++){
        const x=x0+R()*TS,y=y0+R()*TS,r=1+R()*9;
        c.fillStyle=R()<.68?'rgba(12,19,22,0.12)':'rgba(164,170,161,0.12)';
        c.beginPath();c.ellipse(x,y,r*(1+R()),r*.25,R()*6.28,0,6.28);c.fill();
      }
      c.restore();
    });
    if(Wd.rail){each('rail',pl=>{path(pl);c.fillStyle='#34383c';c.fill('evenodd');c.lineWidth=1.25;c.strokeStyle='rgba(103,110,114,0.22)';c.stroke();});}
    for(const b of CT.bridges){const a=b.pts[0],d=b.pts[1];if(Math.max(a.x,d.x)<x0-120||Math.min(a.x,d.x)>x0+TS+120||Math.max(a.y,d.y)<y0-120||Math.min(a.y,d.y)>y0+TS+120)continue;(window.WL_BRIDGES?WL_BRIDGES.paint(c,b):paintBridge(c,b));}
    g._plain = !texReady();
    return g;
  }
  // мост: опоры и тень на воде, полотно, бордюры/перила, разметка (рисуется в запечённый тайл c)
  function paintBridge(c, b) {
    const a = b.pts[0], d = b.pts[1], dx = d.x - a.x, dy = d.y - a.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux, hw = b.w / 2;
    const quad = (o, hh, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(a.x + nx * hh + o.x, a.y + ny * hh + o.y); c.lineTo(d.x + nx * hh + o.x, d.y + ny * hh + o.y); c.lineTo(d.x - nx * hh + o.x, d.y - ny * hh + o.y); c.lineTo(a.x - nx * hh + o.x, a.y - ny * hh + o.y); c.closePath(); c.fill(); };
    quad({ x: 16, y: 22 }, hw + 6, 'rgba(0,0,0,0.38)'); // тень на воде
    const np = Math.max(1, Math.round(L / 150)); // опоры: бетонные быки поперёк течения под полотном, видны по краям
    for (let i = 0; i <= np; i++) { const t = (i + 0.5) / (np + 1) * L, px = a.x + ux * t, py = a.y + uy * t; c.fillStyle = '#2a3139'; c.beginPath(); c.moveTo(px + nx * (hw + 10) - ux * 7, py + ny * (hw + 10) - uy * 7); c.lineTo(px + nx * (hw + 10) + ux * 7, py + ny * (hw + 10) + uy * 7); c.lineTo(px - nx * (hw + 10) + ux * 7, py - ny * (hw + 10) + uy * 7); c.lineTo(px - nx * (hw + 10) - ux * 7, py - ny * (hw + 10) - uy * 7); c.closePath(); c.fill(); }
    quad({ x: 0, y: 0 }, hw + 7, '#66717c'); // парапеты / ограждение
    quad({ x: 0, y: 0 }, hw - 3, '#2f3942'); // асфальт
    quad({ x: 0, y: 0 }, hw - 3 - Math.min(26, hw * 0.28), '#39444e'); // проезжая часть
    c.lineCap = 'butt'; c.strokeStyle = '#d9c46a'; c.lineWidth = 3; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(d.x, d.y); c.stroke(); // осевая
    c.strokeStyle = 'rgba(235,235,235,0.55)'; c.lineWidth = 2; c.setLineDash([22, 26]);
    for (const o of [-hw * 0.5, hw * 0.5]) { c.beginPath(); c.moveTo(a.x + nx * o, a.y + ny * o); c.lineTo(d.x + nx * o, d.y + ny * o); c.stroke(); }
    c.setLineDash([]); c.strokeStyle = '#8b97a3'; c.lineWidth = 2; // перила: линия и стойки
    for (const o of [-hw - 3, hw + 3]) { c.beginPath(); c.moveTo(a.x + nx * o, a.y + ny * o); c.lineTo(d.x + nx * o, d.y + ny * o); c.stroke(); for (let t = 0; t <= L; t += 40) { c.fillStyle = '#8b97a3'; c.fillRect(a.x + ux * t + nx * o - 2, a.y + uy * t + ny * o - 2, 4, 4); } }
  }
  function drawGroundWorld() {
    const gr = ground, W = s.map.w, H = s.map.h; let baked = 0;
    for (let ty = Math.max(0, Math.floor(cam.y / TS)); ty <= Math.min(Math.floor((H - 1) / TS), Math.floor((cam.y + VH) / TS)); ty++)
      for (let tx = Math.max(0, Math.floor(cam.x / TS)); tx <= Math.min(Math.floor((W - 1) / TS), Math.floor((cam.x + VW) / TS)); tx++) {
        const key = tx + ',' + ty; let t = gr.tiles.get(key);
        if (!t) { if (baked >= 1 && gr.tiles.size > 0) { ctx.fillStyle = '#1f2a33'; ctx.fillRect(tx * TS - cam.x, ty * TS - cam.y, TS, TS); continue; } t = bakeTile(tx, ty); baked++; if (t._plain) { ctx.drawImage(t, tx * TS - cam.x, ty * TS - cam.y, TS, TS); continue; } gr.tiles.set(key, t); if (gr.tiles.size > 12) gr.tiles.delete(gr.tiles.keys().next().value); }
        else { gr.tiles.delete(key); gr.tiles.set(key, t); }
        ctx.drawImage(t, tx * TS - cam.x, ty * TS - cam.y, TS, TS);
      }
  }
  function buildGround(s) {
    if (s.map.city && s.map.city.world) return { world: true, tiles: new Map(), s };
    if (s.map.city) return buildGroundCity(s);
    GS = 1;
    const g = document.createElement('canvas'); g.width = s.map.w; g.height = s.map.h;
    const c = g.getContext('2d'), R = mulberry(s.seed ^ 0x9e3779b9);
    c.fillStyle = '#2b3944'; c.fillRect(0, 0, g.width, g.height);
    const AK = g.width * g.height / 7680000;
    for (let i = 0; i < Math.max(300, 9000 * AK | 0); i++) { // снежная крупа
      c.fillStyle = R() > 0.5 ? 'rgba(190,212,226,0.07)' : 'rgba(10,20,30,0.13)';
      c.fillRect(R() * g.width, R() * g.height, 1 + R() * 14, 1 + R() * 3);
    }
    for (let i = 0; i < Math.max(10, 240 * AK | 0); i++) { // сугробы
      const x = R() * g.width, y = R() * g.height, r = 30 + R() * 90, gr = c.createRadialGradient(x, y, 2, x, y, r);
      gr.addColorStop(0, 'rgba(205,224,236,0.10)'); gr.addColorStop(1, 'rgba(205,224,236,0)');
      c.fillStyle = gr; c.beginPath(); c.ellipse(x, y, r, r * 0.55, R() * 3, 0, 7); c.fill();
    }
    const roadY = s.mode === 'base' ? [] : [s.map.spawn.y - 40, 600, 1800], roadX = s.mode === 'base' ? [] : [900, 2100];
    c.fillStyle = '#1b2630';
    roadY.forEach(y => c.fillRect(0, y, g.width, 80)); roadX.forEach(x => c.fillRect(x, 0, 80, g.height));
    c.fillStyle = 'rgba(205,224,236,0.16)'; // валы снега по краям дорог
    roadY.forEach(y => { c.fillRect(0, y - 5, g.width, 6); c.fillRect(0, y + 79, g.width, 6); });
    roadX.forEach(x => { c.fillRect(x - 5, 0, 6, g.height); c.fillRect(x + 79, 0, 6, g.height); });
    c.strokeStyle = 'rgba(200,214,222,0.22)'; c.lineWidth = 3; c.setLineDash([26, 30]);
    roadY.forEach(y => { c.beginPath(); c.moveTo(0, y + 40); c.lineTo(g.width, y + 40); c.stroke(); });
    roadX.forEach(x => { c.beginPath(); c.moveTo(x + 40, 0); c.lineTo(x + 40, g.height); c.stroke(); });
    c.setLineDash([]); c.strokeStyle = 'rgba(8,16,24,0.35)'; c.lineWidth = 2; // колея
    roadY.forEach(y => { for (const o of [22, 58]) { c.beginPath(); c.moveTo(0, y + o); c.lineTo(g.width, y + o + (R() - 0.5) * 6); c.stroke(); } });
    roadX.forEach(x => { for (const o of [22, 58]) { c.beginPath(); c.moveTo(x + o, 0); c.lineTo(x + o + (R() - 0.5) * 6, g.height); c.stroke(); } });
    c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 1.5; // трещины
    for (let i = 0; i < Math.max(8, 260 * AK | 0); i++) { let x = R() * g.width, y = R() * g.height; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (R() - 0.5) * 50; y += (R() - 0.5) * 50; c.lineTo(x, y); } c.stroke(); }
    for (let i = 0; i < Math.max(4, 90 * AK | 0); i++) { // наледь
      const x = R() * g.width, y = R() * g.height, rx = 14 + R() * 40;
      c.fillStyle = 'rgba(140,180,200,0.10)'; c.beginPath(); c.ellipse(x, y, rx, rx * 0.5, R() * 3, 0, 7); c.fill();
    }
    for (const b of s.map.blds) { // полы внутри зданий
      c.fillStyle = '#202b34'; c.fillRect(b.x, b.y, b.w, b.h);
      c.strokeStyle = 'rgba(255,255,255,0.04)'; c.lineWidth = 1;
      for (let x = b.x; x < b.x + b.w; x += 24) { c.beginPath(); c.moveTo(x, b.y); c.lineTo(x, b.y + b.h); c.stroke(); }
      for (let y = b.y; y < b.y + b.h; y += 24) { c.beginPath(); c.moveTo(b.x, y); c.lineTo(b.x + b.w, y); c.stroke(); }
      for (let i = 0; i < 40; i++) { c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(b.x + R() * b.w, b.y + R() * b.h, 2 + R() * 10, 1 + R() * 3); }
    }
    return g;
  }

  // ---------- ввод ----------
  const keys = new Set(); const edge = { reload: false, ability: false, slot: null, melee: false };
  let mouse = { x: W / 2, y: H / 2, down: false, look: false }, actions = [], lookK = 0;
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Tab') e.preventDefault();
    if (e.repeat) { keys.add(e.code); return; }
    keys.add(e.code);
    if (!started) return;
    if (e.code === 'KeyR') edge.reload = true;
    if (e.code === 'KeyQ') edge.ability = true;
    if (e.code === 'KeyV') edge.melee = true;
    if (e.code === 'Digit4') quickUse();
    if (e.code === 'Digit1') edge.slot = 0; if (e.code === 'Digit2') edge.slot = 1; if (e.code === 'Digit3') edge.slot = 2;
    if (e.code === 'Tab' || e.code === 'KeyI') togglePanel('inv');
    if (e.code === 'KeyC') togglePanel('char');
    if (e.code === 'KeyH') $('help').hidden = !$('help').hidden;
    if (e.code === 'KeyE') { baseInteract(); tryUse(); }
    if (e.code === 'KeyF' && mode === 'raid') actions.push({ pid: LOCAL, type: 'veh' });
    if (e.code === 'KeyN' && mode === 'base') cycleNode();
    if (e.code === 'Escape') { $('prep').hidden = true; refocus(); }
    if (e.code === 'KeyP') debugNav = !debugNav;
    if (e.code === 'KeyM') { muted = !muted; toast(muted ? 'Звук выключен' : 'Звук включён'); }
    if (e.code === 'Escape') { $('inv').hidden = true; $('char').hidden = true; refocus(); }
  });
  // хотбар: переключение по нажатию (pointerdown, пока элемент не перерисован), колесо мыши листает слоты
  function quickUse() { if (!started) return; const p = s.players[LOCAL], i = p.inv.findIndex(it => C.ITEMS[it.id].kind === 'heal'); if (i >= 0) actions.push({ pid: LOCAL, type: 'use', idx: i }); else toast('Нет аптечек и бинтов'); }
  $('slots').addEventListener('pointerdown', (e) => { const sl = e.target.closest('.slot[data-slot]'); if (sl && started && mode === 'raid') { e.preventDefault(); +sl.dataset.slot === 3 ? quickUse() : (edge.slot = +sl.dataset.slot); } });
  window.addEventListener('wheel', (e) => { if (!started || mode !== 'raid' || !$('inv').hidden || !$('char').hidden) return; const p = s.players[LOCAL], n = p.weapons.length; if (n < 2) return; edge.slot = (p.cur + (e.deltaY > 0 ? 1 : n - 1)) % n; }, { passive: true });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); mouse.down = false; });
  window.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
  cv.addEventListener('mousedown', () => refocus());
  cv.addEventListener('mousedown', (e) => { if (e.button === 0) mouse.down = true; if (e.button === 2) mouse.look = true; });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('mouseup', (e) => { if (e.button === 0) mouse.down = false; if (e.button === 2) mouse.look = false; });
  window.addEventListener('blur', () => { mouse.look = false; });

  // сенсорное управление: левый стик — движение (до упора — бег), правый — прицел и огонь, кнопка обыска
  const tMove = { x: 0, y: 0, id: null }, tAim = { x: 0, y: 0, id: null, ang: 0 }; let searchTouch = false;
  function enableTouch() { if (touchMode) return; touchMode = true; document.documentElement.classList.add('touch'); $('touch').hidden = false; }
  if (window.matchMedia && matchMedia('(pointer: coarse)').matches) enableTouch();
  window.addEventListener('touchstart', enableTouch, { passive: true, once: true });
  function setupStick(id, st) {
    const el = $(id), knob = el.querySelector('i');
    const pos = (e) => { const r = el.getBoundingClientRect(), lim = r.width * 0.32, x = e.clientX - r.x - r.width / 2, y = e.clientY - r.y - r.height / 2, d = Math.max(lim, Math.hypot(x, y)); st.x = x / d; st.y = y / d; knob.style.transform = `translate(${st.x * lim}px,${st.y * lim}px)`; };
    el.addEventListener('pointerdown', (e) => { if (st.id !== null) return; e.preventDefault(); st.id = e.pointerId; try { el.setPointerCapture(e.pointerId); } catch (_) {} pos(e); if (!ac) audioInit(); });
    el.addEventListener('pointermove', (e) => { if (st.id === e.pointerId) pos(e); });
    const end = (e) => { if (st.id !== e.pointerId) return; st.id = null; st.x = 0; st.y = 0; knob.style.transform = ''; };
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(t, end);
  }
  setupStick('stickL', tMove); setupStick('stickR', tAim);
  $('tReload').onclick = () => { edge.reload = true; }; $('tMelee').onclick = () => { edge.melee = true; }; $('tBoost').onclick = () => { edge.ability = true; };
  $('tSearch').addEventListener('pointerdown', (e) => { e.preventDefault(); if (!ac) audioInit(); baseInteract(); tryUse(); try { $("tSearch").setPointerCapture(e.pointerId); } catch (_) {} searchTouch = true; });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) $('tSearch').addEventListener(t, () => { searchTouch = false; });
  document.querySelectorAll('[data-panel]').forEach(b => { b.onclick = () => togglePanel(b.dataset.panel); });
  // точка прицела в мировых координатах и на экране; один вид, без цветов дальности
  function aimWorld(p) {
    if (touchMode) { const ws = S.weaponStats(p), D = (ws ? ws.eff : 300) * 0.72; return { x: p.x + Math.cos(tAim.ang) * D, y: p.y + Math.sin(tAim.ang) * D }; }
    return screenToWorld(mouse.x, mouse.y);
  }
  function readCmd() {
    const k = (a, b) => keys.has(a) || keys.has(b), p = s.players[LOCAL];
    const tm = Math.hypot(tMove.x, tMove.y), ta = Math.hypot(tAim.x, tAim.y);
    if (ta > 0.13) tAim.ang = Math.atan2(tAim.y, tAim.x);
    const A = aimWorld(p);
    const sxk = (k('KeyD', 'ArrowRight') ? 1 : 0) - (k('KeyA', 'ArrowLeft') ? 1 : 0) + tMove.x, syk = (k('KeyS', 'ArrowDown') ? 1 : 0) - (k('KeyW', 'ArrowUp') ? 1 : 0) + tMove.y;
    const cmd = {
      // экранные оси (вправо / вниз по экрану) -> мировые через обратную изометрию: вправо = (+x,-y), вниз = (+x,+y)
      mx: (sxk + syk) * Math.SQRT1_2, my: (syk - sxk) * Math.SQRT1_2,
      thr: Math.max(-1, Math.min(1, -syk)), str: Math.max(-1, Math.min(1, sxk)), // в машине: W/S газ-тормоз, A/D руль относительно носа
      ax: A.x, ay: A.y,
      fire: mouse.down || ta > 0.23, interact: keys.has('KeyE') || searchTouch,
      sprint: k('ShiftLeft', 'ShiftRight') || tm > 0.95,
      reload: edge.reload, ability: edge.ability, slot: edge.slot, melee: edge.melee,
    };
    edge.reload = edge.ability = edge.melee = false; edge.slot = null;
    return cmd;
  }

  // ---------- звук ----------
  let ac = null, muted = false, noiseBuf = null;
  function audioInit() {
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); const n = ac.sampleRate * 0.4; noiseBuf = ac.createBuffer(1, n, ac.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2); } catch (e) { ac = null; }
  }
  function sfx(freq, vol, dur) {
    if (!ac || muted || vol < 0.01) return;
    const src = ac.createBufferSource(); src.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
    const g = ac.createGain(); g.gain.setValueAtTime(vol, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    src.connect(f); f.connect(g); g.connect(ac.destination); src.start(); src.stop(ac.currentTime + dur);
  }

  // ---------- события сима → эффекты ----------
  // попадание пули в здание: след на стене, возможно разбитое окно
  function markBuildingHit(x, y) {
    const CT = s.map.city; if (!CT) return;
    if (window.WL_HOUSES && WL_HOUSES.onHit && WL_HOUSES.onHit(x, y, Object.assign(hookEnv(), { fx, sfx }))) return;
    let best = null, bd = 14;
    for (const b of CT.buildings) {
      if (x < b.minX - 14 || x > b.maxX + 14 || y < b.minY - 14 || y > b.maxY + 14) continue;
      for (let i = 0; i < 4; i++) { const a = b.poly[i], c = b.poly[(i + 1) % 4], ex = c.x - a.x, ey = c.y - a.y, L2 = ex * ex + ey * ey, t = Math.max(0, Math.min(1, ((x - a.x) * ex + (y - a.y) * ey) / L2)), d = Math.hypot(x - (a.x + ex * t), y - (a.y + ey * t)); if (d < bd) { bd = d; best = { b, i, u: t * Math.sqrt(L2), wl: Math.sqrt(L2) }; } }
    }
    if (!best) return; const { b, i, u, wl } = best, h = 0.9 + Math.random() * 1.9; b.decals = b.decals || []; b.brk = b.brk || {};
    if ((b.kind === 'house' || b.kind === 'panel') && wl > 20) {
      const gm = winGeo(b, wl), fi = Math.floor(h / FLH), k = Math.floor((u - gm.off) / gm.bay), y0 = fi * FLH + 0.84;
      if (k >= 0 && k < gm.nb && u - gm.off - k * gm.bay < gm.ww && h > y0 && h < y0 + 1.26 && !(fi === 0 && i === b.door && Math.abs(gm.off + k * gm.bay + gm.ww / 2 - wl / 2) < 14)) { const key = i + ':' + fi + ':' + k; if (!b.brk[key]) { b.brk[key] = 1; sfx(3200, 0.22, 0.12); for (let j = 0; j < 4; j++) fx.push({ k: 'chip', x, y, vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.5) * 120, life: 0.5, max: 0.5 }); return; } }
    }
    b.decals.push({ i, u, h }); if (b.decals.length > 30) b.decals.shift();
  }
  // E (нажатие): дверь / окно; удержание E по-прежнему обыскивает контейнеры
  function tryUse() {
    const p = s.players[LOCAL], CT = s.map.city; if (!p || p.dead || !CT || !ents || p.drive != null) return false;
    if (window.WL_HOUSES && WL_HOUSES.use && WL_HOUSES.use(p, Object.assign(hookEnv(), { toast, sfx, ptIn, insideId }))) return true;
    for (const c of s.containers) if (!c.searched && (c.inb == null || c.inb === insideId) && Math.hypot(c.x - p.x, c.y - p.y) < 20) return false;
    let best = null, bd = 34;
    for (const b of CT.buildings) {
      if (!b.doorCells || Math.abs(b.c.x - p.x) > 600 || Math.abs(b.c.y - p.y) > 600) continue;
      const a = b.poly[b.door], c2 = b.poly[(b.door + 1) % 4], mx = (a.x + c2.x) / 2, my = (a.y + c2.y) / 2, d = Math.hypot(mx - p.x, my - p.y);
      if (d < bd) { bd = d; best = b; }
    }
    if (best) { if (best.locked) { toast('Заперто. Через окно: разбей стекло выстрелом и влезь (E)'); sfx(300, 0.2, 0.1); return true; } WL_SIM.API.setDoorCells(best, !best.doorOpen); sfx(best.doorOpen ? 520 : 380, 0.2, 0.12); toast(best.doorOpen ? 'Дверь открыта' : 'Дверь закрыта'); return true; }
    // окно: только разбитое, на первом этаже жилого дома
    let win = null, wd = 26;
    for (const b of CT.buildings) {
      if (!b.brk || !b.inner || Math.abs(b.c.x - p.x) > 400 || Math.abs(b.c.y - p.y) > 400) continue;
      for (const key in b.brk) { const [i, fi, k] = key.split(':').map(Number); if (fi !== 0) continue; const a = b.poly[i], c2 = b.poly[(i + 1) % 4], wl = Math.hypot(c2.x - a.x, c2.y - a.y), gm = winGeo(b, wl), u = gm.off + k * gm.bay + gm.ww / 2, t = u / wl, wx = a.x + (c2.x - a.x) * t, wy = a.y + (c2.y - a.y) * t, d = Math.hypot(wx - p.x, wy - p.y); if (d < wd) { wd = d; win = { b, wx, wy }; } }
    }
    if (win) { const inside = ptIn(p.x, p.y, win.b.inner), nx = win.b.c.x - win.wx, ny = win.b.c.y - win.wy, nl = Math.hypot(nx, ny) || 1, sg = inside ? -1 : 1; p.x = win.wx + sg * nx / nl * 16; p.y = win.wy + sg * ny / nl * 16; p.vx = p.vy = 0; sfx(260, 0.2, 0.15); toast(inside ? 'Вылез через окно' : 'Влез через окно'); return true; }
    return false;
  }
  function consumeEvents() {
    const p = s.players[LOCAL];
    const feelApi = { p, sfx, shake: (n) => { shake = Math.max(shake, n); }, local: LOCAL };
    for (const ev of s.events) {
      if (window.WL_FEEL) WL_FEEL.onEvent(ev, feelApi);
      const vol = (x, y) => Math.max(0, 1 - Math.hypot(x - p.x, y - p.y) / 1400);
      if (ev.t === 'shot') {
        const role = ev.by === 'players' ? '#22f2ff' : '#ff2bd6', mx = ev.x + Math.cos(ev.a) * 20, my = ev.y + Math.sin(ev.a) * 20;
        fx.push({ k: 'flash', x: mx, y: my, a: ev.a, color: role, life: 0.07, max: 0.07 });
        fx.push({ k: 'light', x: mx, y: my, color: role, life: 0.09, max: 0.09 });
        for (let i = 0; i < 3; i++) fx.push({ k: 'smoke', x: mx, y: my, vx: Math.cos(ev.a) * 30 + (Math.random() - 0.5) * 30, vy: Math.sin(ev.a) * 30 + (Math.random() - 0.5) * 30, r: 3, grow: 14, a0: 0.22, life: 0.7, max: 0.7 });
        const sa = ev.a + Math.PI / 2 + (Math.random() - 0.5) * 0.6;
        fx.push({ k: 'casing', x: ev.x, y: ev.y, vx: Math.cos(sa) * (60 + Math.random() * 50), vy: Math.sin(sa) * (60 + Math.random() * 50), life: 0.5, max: 0.5 });
        if (ev.owner === LOCAL) { const kk = (ev.kick || 2) * 1.6; kick.x -= Math.cos(ev.a) * kk; kick.y -= Math.sin(ev.a) * kk; }
        if (ev.by !== 'players' && !p.dead) { const vis = window.WL_VISION ? WL_VISION.playerSees(s, p, { x: ev.x, y: ev.y, r: 0 }) : true; if (!vis && Math.hypot(ev.x - p.x, ev.y - p.y) < 1100) dirMarks.push({ x: ev.x, y: ev.y, t: 0.8, max: 0.8, hit: false }); } // выстрел из-за конуса обзора: показываем направление
        sfx(ev.sound, (ev.owner === LOCAL ? 0.35 : 0.25) * vol(ev.x, ev.y) * (ev.quiet ? 0.3 : 1), ev.quiet ? 0.1 : 0.18);
        if (ev.owner === LOCAL) shake = Math.max(shake, ev.kick || 2);
      } else if (ev.t === 'spark') {
        markBuildingHit(ev.x, ev.y);
        for (let i = 0; i < 2; i++) fx.push({ k: 'smoke', x: ev.x, y: ev.y, vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40 - 10, r: 4, grow: 16, a0: 0.28, life: 0.8, max: 0.8 });
        for (let i = 0; i < 3; i++) fx.push({ k: 'chip', x: ev.x, y: ev.y, vx: (Math.random() - 0.5) * 200, vy: (Math.random() - 0.5) * 200, life: 0.4, max: 0.4 });
        for (let i = 0; i < 5; i++) fx.push({ k: 'spark', x: ev.x, y: ev.y, vx: (Math.random() - 0.5) * 220, vy: (Math.random() - 0.5) * 220, color: ev.color, life: 0.25, max: 0.25 }); }
      else if (ev.t === 'hit') {
        for (let k = 0; k < 4; k++) decals.push({ x: ev.x + (Math.random() - 0.5) * 22, y: ev.y + (Math.random() - 0.5) * 22, r: 1.5 + Math.random() * (k ? 3 : 6), rot: Math.random() * 3, col: ev.player ? '#7a1a22' : '#6d1217', a: 0.55 + Math.random() * 0.25 }); while (decals.length > 320) decals.shift(); // кровь: красные брызги
        floaters.push({ x: ev.x, y: ev.y - 20, text: '-' + ev.amount, color: ev.player ? '#ff4d4d' : '#ffffff', life: 0.8 });
        for (let i = 0; i < 6; i++) fx.push({ k: 'spark', x: ev.x, y: ev.y, vx: (Math.random() - 0.5) * 160, vy: (Math.random() - 0.5) * 160, color: ev.player ? '#ff3b3b' : '#ff2bd6', life: 0.3, max: 0.3 });
        if (ev.player) { hurt = 0.35; sfx(200, 0.3, 0.15); if (ev.sx != null) dirMarks.push({ x: ev.sx, y: ev.sy, t: 1.3, max: 1.3, hit: true }); else if (ev.why === 'env') floaters.push({ x: ev.x, y: ev.y - 36, text: 'взрыв/огонь', color: '#ffb23d', life: 1.0 }); }
      } else if (ev.t === 'kill') {
        for (let k = 0; k < 9; k++) { const a = Math.random() * 6.3, d = Math.random() * 18; decals.push({ x: ev.x + Math.cos(a) * d, y: ev.y + Math.sin(a) * d, r: 2 + Math.random() * (k < 2 ? 9 : 4), rot: Math.random() * 3, col: '#5e0f14', a: 0.6 }); } while (decals.length > 320) decals.shift(); // лужа и брызги под убитым
        fx.push({ k: 'ring', x: ev.x, y: ev.y, life: 0.4, max: 0.4, color: '#ff2bd6' });
        for (let i = 0; i < 6; i++) fx.push({ k: 'smoke', x: ev.x, y: ev.y, vx: (Math.random() - 0.5) * 70, vy: (Math.random() - 0.5) * 70, r: 6, grow: 22, a0: 0.3, life: 1.0, max: 1.0 });
      }
      else if (ev.t === 'drop') { fx.push({ k: 'smoke', x: ev.x, y: ev.y, vx: 0, vy: -8, r: 3, grow: 8, a0: 0.18, life: 0.5, max: 0.5 }); }
      else if (ev.t === 'boom') { shake = Math.max(shake, 14); sfx(70, 0.5, 0.6); fx.push({ k: 'boom', x: ev.x, y: ev.y, r: ev.r, life: 0.7, max: 0.7 }); fx.push({ k: 'light', x: ev.x, y: ev.y, color: 'rgba(255,170,70,0.9)', life: 0.5, max: 0.5 }); for (let i = 0; i < 16; i++) fx.push({ k: 'spark', x: ev.x, y: ev.y, vx: (Math.random() - 0.5) * 420, vy: (Math.random() - 0.5) * 420, color: i % 2 ? '#ffb23d' : '#ff6b2b', life: 0.6, max: 0.6 }); for (let i = 0; i < 10; i++) fx.push({ k: 'smoke', x: ev.x, y: ev.y, vx: (Math.random() - 0.5) * 70, vy: (Math.random() - 0.5) * 70 - 20, r: 8, grow: 30, a0: 0.5, life: 2.2, max: 2.2 }); for (let k = 0; k < 6; k++) decals.push({ x: ev.x + (Math.random() - 0.5) * 60, y: ev.y + (Math.random() - 0.5) * 40, r: 8 + Math.random() * 14, rot: Math.random() * 3, col: '#0c0c0c', a: 0.5 }); }
      else if (ev.t === 'crash') { shake = Math.max(shake, Math.min(10, ev.v / 12)); sfx(110, 0.3, 0.2); }
      else if (ev.t === 'unlock') { sfx(900, 0.15, 0.15); }
      else if (ev.t === 'carhit') { sfx(520, 0.12, 0.05); }
      else if (ev.t === 'melee') { fx.push({ k: 'arc', x: ev.x, y: ev.y, a: ev.a, life: 0.15, max: 0.15 }); sfx(160, 0.25, 0.1); }
      else if (ev.t === 'bite') { sfx(140, 0.3, 0.12); }
      else if (ev.pid === LOCAL) {
        if (ev.t === 'toast') toast(ev.text, ev.hot);
        if (ev.t === 'msg') toast(ev.text);
        if (ev.t === 'found') showFound(ev);
        if (ev.t === 'level') { toast(`Уровень ${ev.level}! +1 очко характеристик, +1 очко навыков (C)`, true); sfx(1400, 0.2, 0.4); }
        if (ev.t === 'ability') { toast('Адреналин: быстрее бег и перезарядка', true); sfx(1800, 0.15, 0.3); }
        if (ev.t === 'empty') { toast('Нет патронов к этому оружию'); }
        if (ev.t === 'death') finishRaid(false);
        if (ev.t === 'extract') finishRaid(true);
        if (ev.t === 'key') sfx(1500, 0.18, 0.35);
        if (ev.t === 'depart') startRaid();
        if (ev.t === 'node') { save.nodes[ev.id] = true; persist(); toast(`Вход в метро открыт: ${ev.name}. Теперь отсюда можно выходить в рейд и аварийно эвакуироваться`, true); sfx(1500, 0.18, 0.35); }
      }
    }
    s.events.length = 0;
  }

  // ---------- рендер ----------
  let shake = 0, hurt = 0, debugNav = false; const kick = { x: 0, y: 0 };
  const WALL_H = { wall: 18, border: 30, car: 9, block: 8, lamp: 34, tree: 40, pylon: 110, pole: 60, stop: 15, rack: 14, crate: 6 };
  // Свет сверху-слева: тени падают вправо-вниз. Длина тени зависит от высоты объекта.
  const LIGHT = { x: 0.7, y: 0.42 };
  function hull(pts) { // выпуклая оболочка (цепочка Эндрю)
    const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y), cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x), lo = [], up = [];
    for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    lo.pop(); up.pop(); return lo.concat(up);
  }
  // ---------- интерьеры: стены и крыши непрозрачны снаружи; внутри виден только конус обзора (лучи до стен) ----------
  const ptIn = (x, y, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) c = !c; } return c; };
  let ents = null, fadeOf = {}, insideId = -1;
  function updateInside(p) {
    const CT = s.map.city; if (!CT) return;
    if (!ents || ents.src !== s) { ents = CT.buildings.filter(b => b.inner); ents.src = s; fadeOf = {}; }
    insideId = -1;
    for (const b of ents) { const inn = !p.dead && ptIn(p.x, p.y, b.inner); if (inn) insideId = b.id; b.fade = (b.fade || 0) + ((inn ? 1 : 0) - (b.fade || 0)) * 0.18; if (b.fade < 0.01) b.fade = 0; fadeOf[b.id] = b.fade; }
  }
  const innerShown = (id) => (fadeOf[id] || 0) > 0.3;
  function drawFog(p) { // всё, что персонаж не видит из помещения, закрыто тьмой
    if (insideId < 0) return;
    const R = 760, N = 260, pts = [], near = WL_SIM.API.wallsNear(s, p.x - R, p.y - R, p.x + R, p.y + R).filter(w => !w.low && !w.fly && w.kind !== 'rack' && w.kind !== 'crate');
    for (let i = 0; i < N; i++) {
      const a = i / N * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a); let best = 1;
      for (const w of near) { const t = WL_SIM.segAABB(p.x, p.y, p.x + dx * R, p.y + dy * R, w, 0); if (t >= 0 && t < best) best = t; }
      pts.push({ x: p.x + dx * R * best, y: p.y + dy * R * best });
    }
    const f = fadeOf[insideId] || 0; ctx.save(); ctx.beginPath(); ctx.rect(cam.x - 40 - cam.x, cam.y - 40 - cam.y, VW + 80, VH + 80);
    pts.forEach((q, i) => i ? ctx.lineTo(q.x - cam.x, q.y - cam.y) : ctx.moveTo(q.x - cam.x, q.y - cam.y)); ctx.closePath();
    ctx.fillStyle = `rgba(3,6,9,${0.52 * f})`; ctx.fill('evenodd'); ctx.restore(); // невидимая часть помещения слабо затемнена: планировка читается, как в референсе
    { const ibb = ents.find(b => b.id === insideId); if (ibb) { // вне здания — тьма: прямоугольник минус контур внутренности
      ctx.save(); ctx.beginPath(); ctx.rect(-40, -40, VW + 80, VH + 80); ibb.inner.forEach((q, i) => i ? ctx.lineTo(q.x - cam.x, q.y - cam.y) : ctx.moveTo(q.x - cam.x, q.y - cam.y)); ctx.closePath(); ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = `rgba(128,128,128,${f})`; ctx.fill('evenodd'); // вне здания — серая карта без цвета
      ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = `rgba(14,16,20,${0.22 * f})`; ctx.fill('evenodd'); // лёгкое затемнение, но не тьма
      ctx.beginPath(); ibb.inner.forEach((q, i) => i ? ctx.lineTo(q.x - cam.x, q.y - cam.y) : ctx.moveTo(q.x - cam.x, q.y - cam.y)); ctx.closePath(); ctx.clip();
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(150,92,46,${0.30 * f})`; ctx.fillRect(-40, -40, VW + 80, VH + 80); // тёплая подсветка всего помещения: планировка читается и вне прямой видимости
      ctx.restore(); } }
    // освещённое помещение: видимая из позиции игрока область заметно светлее (тёплый свет, «lighter»)
    const ps = { x: p.x - cam.x, y: p.y - cam.y }; ctx.save(); ctx.beginPath();
    pts.forEach((q, i) => i ? ctx.lineTo(q.x - cam.x, q.y - cam.y) : ctx.moveTo(q.x - cam.x, q.y - cam.y)); ctx.closePath(); ctx.clip();
    const ib = ents.find(b => b.id === insideId); if (ib) { ctx.beginPath(); ib.inner.forEach((q, i) => i ? ctx.lineTo(q.x - cam.x, q.y - cam.y) : ctx.moveTo(q.x - cam.x, q.y - cam.y)); ctx.closePath(); ctx.clip(); } // свет только внутри самого помещения
    ctx.globalCompositeOperation = 'lighter'; const lg = ctx.createRadialGradient(ps.x, ps.y, 20, ps.x, ps.y, R); lg.addColorStop(0, `rgba(255,190,120,${0.40 * f})`); lg.addColorStop(0.6, `rgba(250,170,100,${0.30 * f})`); lg.addColorStop(1, `rgba(230,150,90,${0.20 * f})`);
    ctx.fillStyle = lg; ctx.fillRect(ps.x - R, ps.y - R, R * 2, R * 2); ctx.restore();
  }
  // ---------- дальний фон за границей карты: панельные дома, ТЭЦ с дымом ----------
  const prints = [], decals = []; let lastPrint = { x: 0, y: 0, n: 0 };
  const flurries = (() => { const R = QS.seed != null ? rngFor(QS.seed) : Math.random; return Array.from({ length: 150 }, () => [R(), R(), R()]); })(); // с ?seed= метель одинакова
  function drawCarFx(dt, p) { // огонь и дым горящих и сгоревших машин, подсказки вблизи
    const t = performance.now() / 1000;
    for (const c of s.cars || []) {
      if (c.x < cam.x - 120 || c.x > cam.x + VW + 120 || c.y < cam.y - 160 || c.y > cam.y + VH + 160) continue;
      const burn = c.state === 'burn', smoke = c.state === 'wreck' && c.smokeT > 0; if (!burn && !smoke) continue;
      const q = SCR(c.x, c.y); ctx.save(); ctx.globalCompositeOperation = burn ? 'lighter' : 'source-over';
      for (let i = 0; i < (burn ? 5 : 3); i++) { const ph = (t * (burn ? 2.2 : 0.7) + i * 0.37) % 1, ox = Math.sin(t * 7 + i * 2.1) * 8, rr = burn ? 12 + 8 * (1 - ph) : 10 + 16 * ph, yy = q.y - MH(1.1) - ph * MH(burn ? 2.2 : 4.5);
        if (burn) { const g2 = ctx.createRadialGradient(q.x + ox, yy, 0, q.x + ox, yy, rr); g2.addColorStop(0, `rgba(255,220,120,${0.8 * (1 - ph)})`); g2.addColorStop(0.5, `rgba(255,110,30,${0.5 * (1 - ph)})`); g2.addColorStop(1, 'rgba(255,60,10,0)'); ctx.fillStyle = g2; }
        else ctx.fillStyle = `rgba(40,40,44,${0.28 * (1 - ph) * Math.min(1, c.smokeT / 6)})`;
        ctx.beginPath(); ctx.arc(q.x + ox, yy, rr, 0, 7); ctx.fill(); }
      ctx.restore();
    }
  }
  const dirMarks = [];
  function drawDirMarks(p, dt) { // красные дуги вокруг персонажа: откуда стреляли или попали
    if (!dirMarks.length) return; const c0 = SCR(p.x, p.y), cy = c0.y - MH(0.9);
    ctx.save(); ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    for (let i = dirMarks.length - 1; i >= 0; i--) {
      const m = dirMarks[i]; m.t -= dt; if (m.t <= 0) { dirMarks.splice(i, 1); continue; }
      const q = SCR(m.x, m.y), a0 = Math.atan2(q.y - c0.y + MH(0.9), q.x - c0.x), a = Math.atan2(Math.sin(a0) / 0.8, Math.cos(a0) / 1.5), k = m.t / m.max, R = m.hit ? 78 : 96;
      ctx.strokeStyle = m.hit ? `rgba(255,50,60,${0.9 * k})` : `rgba(255,140,60,${0.55 * k})`; ctx.lineWidth = m.hit ? 7 : 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.ellipse(c0.x, cy, R * 1.5, R * 0.8, 0, a - 0.28, a + 0.28); ctx.stroke();
    }
    ctx.restore();
  }
  function carHint(p) { // текст у машины / за рулём
    ctx.save(); ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.textAlign = 'center'; ctx.font = '600 13px "IBM Plex Mono", monospace';
    if (p.drive != null) { const c = (s.cars || []).find(q => q.id === p.drive); if (c) { const kmh = Math.round(Math.abs(c.v) / 10 * 3.6); ctx.fillStyle = 'rgba(8,10,14,0.7)'; ctx.fillRect(W / 2 - 230, H - 190, 460, 26); ctx.fillStyle = c.state === "burn" ? "#ff7a3d" : "#e6ecf2"; ctx.fillText(`${kmh} км/ч · топливо ${Math.round(c.fuel)}% · прочность ${Math.max(0, Math.round(c.hp / c.maxHp * 100))}% · R — канистра · F — выйти`, W / 2, H - 172); } }
    else for (const c of s.cars || []) { if (c.state === 'wreck' || B96_VEH.distTo(c, p.x, p.y) > 26) continue; const q = SCR(c.x, c.y); ctx.fillStyle = 'rgba(8,10,14,0.7)'; const tx = c.locked ? '[E] вскрыть и обыскать · выстрел разбивает стекло' : '[F] сесть · [E] обыскать'; const w = ctx.measureText(tx).width + 16; ctx.fillRect(q.x - w / 2, q.y - MH(3.2) - 16, w, 22); ctx.fillStyle = c.locked ? '#ffb23d' : '#3df2ff'; ctx.fillText(tx, q.x, q.y - MH(3.2)); break; }
    ctx.restore();
  }
  function drawGroundMarks(dt) {
    for (const d of decals) { // пятна от попаданий
      const x = d.x - cam.x, y = d.y - cam.y; if (x < -40 || y < -40 || x > VW + 40 || y > VH + 40) continue;
      ctx.fillStyle = d.col; ctx.globalAlpha = d.a; ctx.beginPath(); ctx.ellipse(x, y, d.r, d.r * 0.6, d.rot, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (let i = prints.length - 1; i >= 0; i--) {
      const f = prints[i]; f.age += dt; if (f.age > 16) { prints.splice(i, 1); continue; }
      const x = f.x - cam.x, y = f.y - cam.y; if (x < -10 || y < -10 || x > VW + 10 || y > VH + 10) continue;
      ctx.save(); ctx.translate(x, y); ctx.rotate(f.a); ctx.fillStyle = 'rgba(8,18,28,' + (0.38 * (1 - f.age / 16)) + ')'; ctx.beginPath(); ctx.ellipse(0, f.side, 4, 2, 0, 0, 7); ctx.fill(); ctx.restore();
    }
  }
  // свет фонарей: рисуется в отдельный слой по мере прохода списка глубин; здания впереди лампы вырезают её свет (painter), поэтому за домом лампа не светит
  let lightCv = null, lctx = null, lightScaleX = 1, lightScaleY = 1;
  function lightBegin() {
    const cv = ctx.canvas;
    const naturalScale = Math.min(1, (cv.clientWidth || cv.width) / cv.width);
    const scale = Math.max(0.5, Math.min(1, Number.isFinite(window.B96_LIGHT_SCALE) ? window.B96_LIGHT_SCALE : naturalScale));
    const width = Math.max(1, Math.round(cv.width * scale)), height = Math.max(1, Math.round(cv.height * scale));
    if (!lightCv || lightCv.width !== width || lightCv.height !== height) { lightCv = document.createElement('canvas'); lightCv.width = width; lightCv.height = height; lctx = lightCv.getContext('2d'); }
    lightScaleX = lightCv.width / cv.width; lightScaleY = lightCv.height / cv.height;
    lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.globalCompositeOperation = 'source-over'; lctx.globalAlpha = 1; lctx.clearRect(0, 0, lightCv.width, lightCv.height);
  }
  // Canvas Light2D equivalent: independent sprite, 2D collider and photometric light per lamp.
  // The lamp arm is part of the sprite, light position is the luminaire head, not the pole top.
  // v67: the emitter is located at the actual bulb in props.png, not above the pole.
  // Bulb centre in the original 195x425 sprite crop is approx (160,50).
  function lampLight(w) {
    if (!lctx) return;
    const nk = nightK(s.hour == null ? 10 : s.hour);
    if (nk < 0.02) return;
    const spec = w.light2D || {};
    const position = spec.position || {x:w.x+w.w/2,y:w.y+w.h/2};
    const direction = spec.direction || {x:0,y:1};
    const angle = Math.max(28, Math.min(155,spec.spread_angle || 100));
    const profile = spec.intensity_distribution || 'cosine4';
    const power = Math.max(0, Math.min(1.5, spec.intensity == null ? 0.9 : spec.intensity));
    const range = spec.range || 130;
    const base = SCR(position.x, position.y);
    const height = MH(7.5);
    // Coordinates measured from props.png: lamp sprite rect [610,10,195,425].
    // Sprite anchor is bottom-centre, so source maps exactly to the displayed fixture.
    const headX = SPR.props ? (151/195 - 0.5) * height * (195/425) : MH(0.72);
    const headY = SPR.props ? (1 - 49/425) * height : height;
    const hx = base.x + headX;
    const hy = base.y - headY;
    const dl = Math.hypot(direction.x,direction.y)||1;
    const dx = direction.x/dl, dy=direction.y/dl;
    // Point on ground: offset towards the lane, taking the real head overhang into account.
    const aim = SCR(position.x+dx*range*0.34,position.y+dy*range*0.34);
    const gx=aim.x+headX*0.4, gy=aim.y;
    const spread = Math.tan(angle*Math.PI/360);
    const radius=Math.max(25,Math.min(165,range*spread*0.64*Kx));
    if (hx < -210 || hx > W+210 || hy > H+210 || gy < -210 || gy > H+210) return;
    lctx.save();
    lctx.setTransform(DPR * lightScaleX,0,0,DPR * lightScaleY,0,0);
    lctx.globalCompositeOperation='lighter';
    // Photometric footprint: layered radial distribution, elliptical due to ground projection.
    // No quadrilateral/triangle geometry: beam has no visible hard edges in clear winter air.
    const vx=gx-hx,vy=gy-hy;
    lctx.save();
    lctx.translate(gx,gy);
    lctx.rotate(Math.atan2((dx+dy)*0.5,dx-dy));
    lctx.scale(profile==='wide'?1.55:1.32,profile==='narrow'?0.50:0.68);
    const ground=lctx.createRadialGradient(0,0,0,0,0,radius);
    ground.addColorStop(0,`rgba(255,215,145,${Math.min(.68,.63*power*nk)})`);
    ground.addColorStop(0.2,`rgba(255,195,118,${.39*power*nk})`);
    ground.addColorStop(0.53,`rgba(252,171,95,${.16*power*nk})`);
    ground.addColorStop(0.82,`rgba(245,158,83,${.04*power*nk})`);
    ground.addColorStop(1,'rgba(242,152,80,0)');
    lctx.fillStyle=ground;lctx.beginPath();lctx.arc(0,0,radius,0,Math.PI*2);lctx.fill();
    lctx.restore();
    // Extremely faint fog/haze within the light path; broad, radial, and non-geometric.
    const midX=hx+vx*0.38,midY=hy+vy*0.38;
    const hazeR=Math.min(66,Math.max(22,Math.hypot(vx,vy)*0.3));
    const haze=lctx.createRadialGradient(midX,midY,0,midX,midY,hazeR);
    haze.addColorStop(0,`rgba(255,197,121,${.047*power*nk})`);
    haze.addColorStop(1,'rgba(255,180,110,0)');
    lctx.fillStyle=haze;lctx.beginPath();lctx.arc(midX,midY,hazeR,0,Math.PI*2);lctx.fill();
    // Bulb glow is only a tiny halo centered on the physical glass.
    const bloom=lctx.createRadialGradient(hx,hy,0,hx,hy,15);
    bloom.addColorStop(0,`rgba(255,236,194,${.78*nk})`);
    bloom.addColorStop(.23,`rgba(255,218,160,${.31*nk})`);
    bloom.addColorStop(1,'rgba(255,183,115,0)');
    lctx.fillStyle=bloom;lctx.beginPath();lctx.ellipse(hx,hy,10,6,0,0,Math.PI*2);lctx.fill();
    lctx.restore();
  }
  function lightOcclude(b) { // дом, нарисованный позже лампы, закрывает её свет
    if (!lctx || b._Hm == null) return; const bp = b.poly.map(r => SCR(r.x, r.y)), Hf = MH(b._Hm), hl = hull(bp.concat(bp.map(r => ({ x: r.x, y: r.y - Hf }))));
    lctx.setTransform(DPR * lightScaleX, 0, 0, DPR * lightScaleY, 0, 0); lctx.globalCompositeOperation = 'destination-out'; lctx.globalAlpha = 1; lctx.fillStyle = '#000'; lctx.beginPath(); hl.forEach((q, i) => i ? lctx.lineTo(q.x, q.y) : lctx.moveTo(q.x, q.y)); lctx.closePath(); lctx.fill();
  }
  function flushLampLight() { if (!lightCv) return; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(lightCv, 0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore(); }
const nightK = (h) => (h >= 17 || h < 9) ? 1 : h >= 16 ? (h - 16) : h >= 9 && h < 10 ? (10 - h) : 0; // день 10–16, сумерки 16–17, рассвет 9–10
  function drawLights() {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const pool = (x, y, r, col, a) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.globalAlpha = a; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); };
    // уличные фонари: тёплое пятно света на земле (круг радиусом ~17 м, плоский слой -> эллипс), яркое ядро под лампой и мягкий край
    const lampPool = (x, y) => { const R = 175, g = ctx.createRadialGradient(x, y, 0, x, y, R); g.addColorStop(0, 'rgba(255,200,120,0.9)'); g.addColorStop(0.2, 'rgba(255,170,90,0.5)'); g.addColorStop(0.55, 'rgba(255,140,60,0.18)'); g.addColorStop(1, 'rgba(255,120,40,0)'); ctx.globalAlpha = 0.06 + 0.34 * nightK(s.hour == null ? 10 : s.hour); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.fill(); };
    for (const b of s.map.blds) { const x = b.x + b.w / 2 - cam.x, y = b.y + b.h + 14 - cam.y; if (x > -200 && y > -200 && x < VW + 200 && y < VH + 200) pool(x, y, Math.min(170, b.w * 0.55), b.col, 0.14); }
    ctx.restore(); ctx.globalAlpha = 1;
  }

  // Ворота эвакуации: тусклые без ключа, бирюзовые с ключом; кольцо — прогресс удержания E. Цвет — роль «союзник/цель», не дальность.
  // Точки базы: склад (сундук) и консоль ОСИ. Подсвечиваются, когда игрок рядом.
  // Стрелка-компас на край экрана, когда цель вне поля зрения.

  const ringE = (R) => [R * Kx * 1.414, R * Kx * 0.707];
  function drawNodes(p) { // вход в метро: кольцо на земле + арка + подпись
    if (s.mode === 'base') return; const t = performance.now() / 1000;
    for (const n of s.map.nodes) {
      const q = SCR(n.x, n.y); if (q.x < -160 || q.x > W + 160 || q.y < -120 || q.y > H + 260) continue;
      const near = Math.hypot(n.x - p.x, n.y - p.y) < n.r, R = Math.max(26, n.r * 0.55), [rx, ry] = ringE(R); ctx.save(); ctx.translate(q.x, q.y);
      ctx.strokeStyle = n.open ? '#b6ff3d' : '#6b7893'; ctx.shadowColor = '#b6ff3d'; ctx.shadowBlur = n.open ? 12 + Math.sin(t * 3) * 4 : 0; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.ellipse(0, 0, rx * 0.55, ry * 0.55, 0, 0, 7); ctx.stroke(); ctx.shadowBlur = 0;
      const ah = MH(3.2); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-SC * 0.9, 0); ctx.lineTo(-SC * 0.9, -ah); ctx.lineTo(SC * 0.9, -ah); ctx.lineTo(SC * 0.9, 0); ctx.stroke();
      if (p.nodeT > 0 && near) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, -ah / 2, 14, -1.57, -1.57 + 6.283 * Math.min(1, p.nodeT / (n.open ? 15 : 3))); ctx.stroke(); }
      ctx.font = '700 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = n.open ? '#b6ff3d' : '#6b7893'; ctx.fillText('ВХОД В МЕТРО · ' + n.name + (n.open ? '' : ' (закрыт)'), 0, -ah - 8); ctx.restore();
    }
  }
  function drawGate(p) {
    const G = s.map.gate, q = SCR(G.x, G.y), base = s.mode === 'base', has = base || S.invCount(p, C.EXTRACTION.keyItem) > 0, t = performance.now() / 1000;
    if (q.x < -200 || q.x > W + 200 || q.y < -120 || q.y > H + 300) return;
    const [rx, ry] = ringE(G.r); ctx.save(); ctx.translate(q.x, q.y);
    ctx.fillStyle = 'rgba(4,8,14,0.45)'; ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = has ? '#22f2ff' : '#4a566c'; ctx.shadowColor = '#22f2ff'; ctx.shadowBlur = has ? 14 + Math.sin(t * 4) * 5 : 0; ctx.lineWidth = 2;
    ctx.setLineDash([10, 7]); ctx.lineDashOffset = -t * 14; ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    const gh = MH(3.4); ctx.shadowBlur = has ? 10 : 0; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-SC * 1.4, 0); ctx.lineTo(-SC * 1.4, -gh); ctx.moveTo(SC * 1.4, 0); ctx.lineTo(SC * 1.4, -gh); ctx.moveTo(-SC * 1.4, -gh); ctx.lineTo(SC * 1.4, -gh); ctx.stroke();
    ctx.shadowBlur = 0; ctx.font = '700 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = has ? '#22f2ff' : '#6b7893'; ctx.fillText(base ? 'В РЕЙД' : 'БЛОКПОСТ', 0, -gh - 8);
    if (p.extract > 0) { ctx.strokeStyle = '#b6ff3d'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, -gh / 2, 22, -1.57, -1.57 + 6.283 * Math.min(1, p.extract / (base ? 1 : C.EXTRACTION.holdTime))); ctx.stroke(); }
    ctx.restore();
  }
  function drawPoints(p) {
    if (!s.map.points) return; const t = performance.now() / 1000;
    for (const pt of s.map.points) {
      const q = SCR(pt.x, pt.y), near = Math.hypot(pt.x - p.x, pt.y - p.y) < pt.r, col = pt.id === 'stash' || pt.id === 'trader' ? '#ffb23d' : '#3df2ff';
      ctx.save(); ctx.translate(q.x, q.y); ctx.fillStyle = '#10161d'; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.shadowColor = col; ctx.shadowBlur = near ? 14 : 4;
      if (pt.id === 'stash') { ctx.fillRect(-18, -MH(1), 36, MH(1)); ctx.strokeRect(-18, -MH(1), 36, MH(1)); }
      else if (pt.id === 'trader') { ctx.fillRect(-26, -MH(1.1), 52, MH(1.1)); ctx.strokeRect(-26, -MH(1.1), 52, MH(1.1)); ctx.fillStyle = col; ctx.globalAlpha = 0.45 + 0.2 * Math.sin(t * 3); ctx.fillRect(-26, -MH(2.2), 52, MH(0.35)); } // прилавок с неоновым навесом
      else { ctx.fillRect(-14, -MH(1.8), 28, MH(1.8)); ctx.strokeRect(-14, -MH(1.8), 28, MH(1.8)); ctx.fillStyle = col; ctx.globalAlpha = 0.5 + 0.2 * Math.sin(t * 3); ctx.fillRect(-10, -MH(1.6), 20, MH(0.9)); }
      ctx.restore(); ctx.save(); ctx.font = '700 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = near ? '#fff' : '#8f98ad'; ctx.fillText(pt.name + (near ? ' · E' : ''), q.x, q.y + 22); ctx.restore();
    }
  }

  function drawCompass(p) {
    if (s.mode === 'base') return; const has = S.invCount(p, C.EXTRACTION.keyItem) > 0; if (!has) return;
    const G = s.map.gate, gq = SCR(G.x, G.y), sx = gq.x, sy = gq.y;
    if (sx > 40 && sx < W - 40 && sy > 40 && sy < H - 40) return;
    const a = Math.atan2(sy - H / 2, sx - W / 2), cx = W / 2, cy = H / 2, k = Math.min((W / 2 - 40) / Math.abs(Math.cos(a) || 1e-6), (H / 2 - 60) / Math.abs(Math.sin(a) || 1e-6));
    ctx.save(); ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.translate(cx + Math.cos(a) * k, cy + Math.sin(a) * k); ctx.rotate(a);
    ctx.fillStyle = '#22f2ff'; ctx.strokeStyle = '#06141a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -9); ctx.lineTo(-4, 0); ctx.lineTo(-8, 9); ctx.closePath(); ctx.stroke(); ctx.fill(); ctx.restore();
  }
  // Названия зданий (трафарет на крыше) и редкие неоновые вывески над входом. Не интерактив: цвет вывески не несёт игровой роли.
  function drawLabels() {
    const t = performance.now() / 1000; ctx.save(); ctx.textAlign = 'center';
    s.map.blds.forEach((b, i) => {
      const lq = SCR(b.x + b.w / 2, b.y), x = lq.x, y = lq.y; if (x < -200 || y < -120 || x > W + 200 || y > H + 120) return;
      ctx.font = `700 ${11/zoom}px "Chakra Petch", sans-serif`; ctx.fillStyle = 'rgba(200,212,230,0.55)'; ctx.fillText(b.name, x, y - 12);
      if (b.sign) {
        const fl = Math.sin(t * 7 + i * 3.1) > 0.93 ? 0.35 : 1, col = i % 2 ? '#ff4a6e' : '#3df2ff';
        ctx.font = `700 ${12/zoom}px "Chakra Petch", sans-serif`; const tw = ctx.measureText(b.sign).width + 10;
        ctx.globalAlpha = fl; ctx.fillStyle = 'rgba(6,5,12,0.8)'; ctx.fillRect(x - tw / 2, y + 6, tw, 17);
        ctx.shadowColor = col; ctx.shadowBlur = 10; ctx.fillStyle = col; ctx.fillText(b.sign, x, y + 19); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      }
    });
    ctx.restore();
  }
  function drawKioskSigns() { // неоновые вывески киосков: редкий точечный неон, мерцают
    if (!s.map.city) return; const t = performance.now() / 1000; ctx.save(); ctx.textAlign = 'center'; ctx.font = `700 ${10/zoom}px "Chakra Petch", sans-serif`;
    for (const b of visibleBuildings) {
      if (!b.sign) continue; const kq = SCR(b.c.x, b.c.y), x = kq.x, y = kq.y - MH(b.h) - 8; if (x < -80 || y < -40 || x > W + 80 || y > H + 40) continue;
      const col = b.id % 2 ? '#ff4a6e' : '#3df2ff', fl = Math.sin(t * 6 + b.id * 2.3) > 0.92 ? 0.35 : 1; ctx.globalAlpha = fl; ctx.shadowColor = col; ctx.shadowBlur = 9; ctx.fillStyle = col; ctx.fillText(b.sign, x, y); ctx.shadowBlur = 0;
    }
    ctx.restore();
  }
  // ===================== ИЗОМЕТРИЯ (чистый 2D canvas, без 3D-движка) =====================
  // Мир (x,y) в пикселях мира (10 px = 1 м). Земля: поворот на 45° и сжатие 1:2 (ромбы). Высота — вертикально вверх по экрану.
  // SC — px экрана на метр вдоль оси; Kx — px экрана на px мира; VMh — px экрана на метр высоты.
  const MH = (m) => m * VMh;
  function SCR(x, y) { const dx = x - cam.x - VW / 2, dy = y - cam.y - VH / 2; return { x: W / 2 + (dx - dy) * Kx + shx, y: H / 2 + (dx + dy) * Kx / 2 + shy }; }
  function screenToWorld(X, Y) { const u = (X - W / 2 - shx) / Kx, v = (Y - H / 2 - shy) / Kx; return { x: cam.x + VW / 2 + (u + 2 * v) / 2, y: cam.y + VH / 2 + (2 * v - u) / 2 }; }
  const ctxScr = () => ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const ctxFlat = () => ctx.setTransform(DPR * Kx, DPR * Kx / 2, -DPR * Kx, DPR * Kx / 2, DPR * (W / 2 + (VH - VW) * Kx / 2 + shx), DPR * (H / 2 - (VW + VH) * Kx / 4 + shy));
  const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); return `rgb(${Math.min(255, (n >> 16 & 255) * k) | 0},${Math.min(255, (n >> 8 & 255) * k) | 0},${Math.min(255, (n & 255) * k) | 0})`; };
  const rectPts = (w) => [{ x: w.x, y: w.y }, { x: w.x + w.w, y: w.y }, { x: w.x + w.w, y: w.y + w.h }, { x: w.x, y: w.y + w.h }];
  const BCOL = { panel: ['#8e98a4', '#9aa0a6', '#8a94a0'], house: ['#9a7c68', '#8c8f86', '#a08a70', '#7e8a92'], shed: ['#6a6a62', '#5e625c'], garage_row: ['#70777c', '#666e74'], booth: ['#7a6a52', '#4f6a64'], barrier: ['#6d727c'] };
  const CAR_COL = ['#5a3a2c', '#3a4c5e', '#555e68', '#6a3030', '#3f5148'];

  // выпуклая призма с 4 основаниями: боковые грани видимых сторон + крыша. o: {face, roof, snow, deco(f), roofDeco(pts, Hp)}
  function prism(wp, Hm, o) {
    const Hp = MH(Hm), pts = wp.map(q => SCR(q.x, q.y));
    let area = 0; for (let i = 0; i < 4; i++) { const a = pts[i], c = pts[(i + 1) % 4]; area += a.x * c.y - c.x * a.y; }
    const sg = area > 0 ? 1 : -1;
    for (let i = 0; i < 4; i++) {
      const a = pts[i], c = pts[(i + 1) % 4], ex = c.x - a.x, ey = c.y - a.y, nx = sg * ey, ny = -sg * ex, nl = Math.hypot(nx, ny) || 1;
      if (ny / nl <= 0.02) continue;
      const w0 = wp[i], w1 = wp[(i + 1) % 4], wl = Math.hypot(w1.x - w0.x, w1.y - w0.y) || 1, len = Math.hypot(ex, ey) || 1;
      const k = 0.55 + 0.45 * Math.max(0, -(nx / nl) * LIGHT.x * 0.7 + (ny / nl) * 0.5);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.lineTo(c.x, c.y - Hp); ctx.lineTo(a.x, a.y - Hp); ctx.closePath();
      if (o.tex !== false && (TEX[o.wallTexture] || TEX.wall) && Hp > 3) { // материал стены из фасада v03 (без окон): паттерн заливает грань напрямую (без clip), затем умножение на цвет здания
        const wn = (o.wallTexture && TEX[o.wallTexture]) ? o.wallTexture : 'wall'; const pt = wallPat(wn); if (pt) { const sx = (len / wl) * (36 / 292), ux = ex / len, uy = ey / len;
          pt.setTransform(new DOMMatrix([ux * sx, uy * sx, 0, MH(3.1) / 240, a.x, a.y])); ctx.fillStyle = pt; ctx.fill(); // y-ось грани направлена вверх экрана: переворот ниже
          const m = TEXMEAN[wn] || TEXMEAN.wall, fc = shade(o.face, k * 0.8 * 1.15).match(/\d+/g); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = `rgb(${Math.min(255, fc[0] / m[0] * 255) | 0},${Math.min(255, fc[1] / m[1] * 255) | 0},${Math.min(255, fc[2] / m[2] * 255) | 0})`; ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
        else { ctx.fillStyle = shade(o.face, k * 0.8); ctx.fill(); }
      } else { ctx.fillStyle = shade(o.face, k * 0.8); ctx.fill(); }
      if (o.deco && Hp > 3) {
        ctx.save(); ctx.clip(); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.lineTo(c.x, c.y - Hp); ctx.lineTo(a.x, a.y - Hp); ctx.closePath(); ctx.clip();
        ctx.transform(ex / len, ey / len, 0, -1, a.x, a.y); ctx.scale(len / wl, 1);
        o.deco({ i, wl, Hp, k, a, c, w0, w1 }); ctx.restore();
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x, c.y - Hp); ctx.stroke();
    }
    if (o.noRoof) return pts;
    ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y - Hp) : ctx.moveTo(p.x, p.y - Hp)); ctx.closePath();
    ctx.fillStyle = o.roof || shade(o.face, 1.1); ctx.fill();
    if (o.tex !== false && TEX.roof) texFill(ctx, 'roof', 0.95, 0.16, worldM(Hp), 'nonzero', 0, 0, o.roof || shade(o.face, 1.1), 1.15);
    if (o.snow !== 0) { ctx.fillStyle = `rgba(226,238,246,${o.snow == null ? 0.55 : o.snow})`; ctx.fill(); }
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(14,20,26,0.55)'; ctx.stroke();
    if (o.roofDeco) o.roofDeco(pts, Hp);
    return pts;
  }

  // геометрия окон жилых зданий: проёмы по фасаду (совпадает с отрисовкой)
  function winGeo(b, wl) { const bay = (b.kind === 'panel' ? 3.0 : 3.4) * C.PX_PER_M, nb = Math.max(1, Math.floor(wl / bay)); return { bay, nb, off: (wl - nb * bay) / 2 + bay * 0.2, ww: bay * 0.55 }; }
  const FLH = 2.8;
  function decalsDeco(b, f) {
    if (!b.decals) return; for (const d of b.decals) { if (d.i !== f.i || d.h * VMh > f.Hp) continue; ctx.fillStyle = 'rgba(8,10,12,0.85)'; ctx.beginPath(); ctx.arc(d.u, d.h * VMh, 1.8, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(220,225,230,0.55)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(d.u, d.h * VMh, 3.4, 0, 7); ctx.stroke(); }
  }
  const CIVIC_NAME = { school: 'ШКОЛА №', admin: 'АДМІНІСТРАЦІЯ', clinic: 'ПОЛІКЛІНІКА', kinder: 'ДИТЯЧИЙ САДОК', police: 'ПОЛІЦІЯ', library: 'БІБЛІОТЕКА', post: 'ПОШТА', council: 'РАЙОННА РАДА' };
  function civicSign(b, f) { // вывеска над входом муниципального здания
    if (f.i !== b.door) return; const sub = b.sub || 'admin', txt = (CIVIC_NAME[sub] || 'АДМІНІСТРАЦІЯ') + (sub === 'school' ? (1 + Math.floor(hsh(b.id, 61) * 40)) : '');
    ctx.save(); const T = ctx.getTransform(), sx = T.a < 0 ? -1 : 1, sy = T.d < 0 ? -1 : 1; ctx.font = '700 7px "Chakra Petch", sans-serif'; ctx.textAlign = 'center'; const tw = ctx.measureText(txt).width + 8, cx = f.wl / 2, y = Math.min(f.Hp - 10, MH(2.5));
    ctx.translate(cx, y + 4.5); ctx.scale(sx, sy); // знак масштаба грани разный на разных сторонах: текст всегда читается слева направо
    ctx.fillStyle = '#1c3a5e'; ctx.fillRect(-tw / 2, -4.5, tw, 9); ctx.strokeStyle = '#d8dde0'; ctx.lineWidth = 0.8; ctx.strokeRect(-tw / 2, -4.5, tw, 9); ctx.fillStyle = '#f2f4f5'; ctx.textBaseline = 'middle'; ctx.fillText(txt, 0, 0.5); ctx.restore();
  }
  function doorDeco(b, f) { // дверь жилого дома / подъезда по центру грани, интерактивная
    if (f.i !== b.door || !b.doorCells) return; const dw = 12, dh = Math.min(f.Hp, MH(2.1)), x = f.wl / 2 - dw / 2;
    ctx.fillStyle = '#0a0f13'; ctx.fillRect(x - 1, 0, dw + 2, dh + 1);
    if (!b.doorOpen) { ctx.fillStyle = b.locked ? '#4a2e2a' : '#5a3d2a'; ctx.fillRect(x, 0, dw, dh); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x + dw / 2, 0, 1, dh); ctx.fillStyle = b.locked ? '#d0504a' : '#c9b07a'; ctx.fillRect(x + dw - 3, dh * 0.45, 2, 3); }
    else { ctx.fillStyle = '#5a3d2a'; ctx.fillRect(x, 0, 3, dh); }
  }
  // ---------- здания города ----------
  function buildingDeco(b) {
    const P = C.PX_PER_M;
    return (f) => {
      if (window.WL_HOUSES && WL_HOUSES.facade && WL_HOUSES.facade(ctx, b, f, hookEnv())) { if (b.kind === 'civic') civicSign(b, f); return; } // interiors.js: окна, двери, следы
      const { wl, Hp } = f, fl = MH(2.8), floors = Math.max(1, Math.round(b.h / 2.8));
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(0, 0, wl, Math.min(Hp, MH(0.9))); // цоколь
      doorDeco(b, f);
      if (b.kind === 'panel' || b.kind === 'house') {
        const bay = (b.kind === 'panel' ? 3.0 : 3.4) * P, nb = Math.max(1, Math.floor(wl / bay)), off = (wl - nb * bay) / 2 + bay * 0.2, ww = bay * 0.55;
        for (let fi = 0; fi < floors; fi++) {
          const y0 = fi * fl + fl * 0.3, hh = fl * 0.45; if (fi * fl >= Hp) break;
          if (b.kind === 'panel') { ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0, fi * fl, wl, 1); }
          for (let k = 0; k < nb; k++) {
            if (fi === 0 && f.i === b.door && b.doorCells && Math.abs(off + k * bay + ww / 2 - wl / 2) < 14) continue; // место двери
            const key = f.i + ':' + fi + ':' + k, br = b.brk && b.brk[key], lit = !br && hsh(b.id * 131 + fi * 17 + f.i, k * 7 + 1) < 0.12;
            ctx.fillStyle = '#0c151c'; ctx.fillRect(off + k * bay - 1, y0 - 1, ww + 2, hh + 2);
            ctx.fillStyle = br ? '#05080b' : lit ? '#e6b070' : ((b.kind === 'panel' && (k + fi) % 5 === 0) ? '#2c3f4b' : '#1a2833'); ctx.fillRect(off + k * bay, y0, ww, hh);
            if (br) { ctx.strokeStyle = 'rgba(200,220,235,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(off + k * bay, y0 + hh); ctx.lineTo(off + k * bay + ww * 0.5, y0 + hh * 0.3); ctx.lineTo(off + k * bay + ww, y0 + hh); ctx.stroke(); }
            else { ctx.fillStyle = 'rgba(160,200,220,0.12)'; ctx.fillRect(off + k * bay, y0, ww * 0.4, hh); }
          }
        }
      } else if (b.kind === 'garage_row') {
        const nb = Math.max(2, Math.floor(wl / (3.2 * P))), bw = wl / nb; for (let k = 0; k < nb; k++) { ctx.fillStyle = hsh(b.id, k) > 0.5 ? '#3b4a52' : '#4a3f38'; ctx.fillRect(k * bw + 2, 1, bw - 4, Hp - 2); ctx.fillStyle = 'rgba(0,0,0,0.3)'; for (let r = 4; r < Hp - 2; r += 4) ctx.fillRect(k * bw + 2, r, bw - 4, 1); }
      } else if (b.kind === 'industrial' || b.kind === 'warehouse') {
        ctx.fillStyle = b.kind === 'industrial' ? '#4a4f55' : '#55504a'; ctx.fillRect(0, 0, wl, Hp);
        ctx.fillStyle = 'rgba(0,0,0,0.22)'; for (let r = 4; r < Hp; r += 6) ctx.fillRect(0, r, wl, 1);
        if (f.i === b.door) { const gw = 36, gh = Math.min(Hp, MH(3.2)), op = (b.doorOpen || 0); ctx.fillStyle = '#0a0f13'; ctx.fillRect(wl / 2 - gw / 2, 0, gw, gh); ctx.fillStyle = '#5a4a2a'; ctx.fillRect(wl / 2 - gw / 2 - 2, gh, gw + 4, 3); if (op < 0.5) { ctx.fillStyle = '#6b5a38'; ctx.fillRect(wl / 2 - gw / 2, 0, gw, gh * (1 - op * 2)); ctx.fillStyle = 'rgba(0,0,0,0.3)'; for (let r = 3; r < gh; r += 5) ctx.fillRect(wl / 2 - gw / 2, r, gw, 1); } }
        const nw = Math.floor(wl / (6 * P)); for (let k = 0; k < nw; k++) { const key = f.i + ':w:' + k, br = b.brk && b.brk[key]; ctx.fillStyle = br ? '#05080b' : hsh(b.id, 20 + k) > 0.85 ? '#e6b070' : '#16222b'; ctx.fillRect(k * 6 * P + 10, Math.min(Hp - 6, MH(4.5)), 2.4 * P, Math.min(MH(1.2), Hp * 0.3)); }
      } else if (b.kind === 'booth') { ctx.fillStyle = '#1b2a30'; ctx.fillRect(wl * 0.15, Hp * 0.35, wl * 0.7, Hp * 0.35); ctx.fillStyle = 'rgba(255,190,110,0.55)'; ctx.fillRect(wl * 0.2, Hp * 0.4, wl * 0.6, Hp * 0.25); }
      decalsDeco(b, f);
    };
  }
  // стили зданий: у каждого вида свой цвет стен, текстура и крыша (b.sub задаёт генератор карты)
  const SUBSTY = {
    grey: ['#8e98a4', 'wall_panel_grey', '#6f7a85'], ochre: ['#a89c80', 'wall_panel_ochre', '#7a6f62'], brick: ['#8a5a4a', 'wall_brick', '#4f4a48'], stucco: ['#b3a98c', 'wall_stucco', '#6a5148'],
    hbrick: ['#9a6a58', 'wall_brick', '#6c4a42'], hstucco: ['#b8ad92', 'wall_stucco', '#5a5e66'], wood: ['#8a6a46', 'wall', '#4e5a4a'], block: ['#8f9498', 'wall', '#6a4f48'],
    school: ['#c4b78a', 'wall_stucco', '#7a4a42'], admin: ['#a9a89c', 'wall_stucco', '#505a63'], clinic: ['#c6d0d2', 'wall_stucco', '#4c6670'], kinder: ['#d0a066', 'wall_stucco', '#8a4a3a'],
    police: ['#8c97a2', 'wall', '#3f4a54'], library: ['#b59a82', 'wall_brick', '#5a4640'], post: ['#9c8a72', 'wall_stucco', '#4a5a52'], council: ['#bdb6a0', 'wall_stucco', '#47505a']
  };
  function buildingStyle(b) {
    if (b._sty) return b._sty;
    let sub = b.sub, st;
    if (b.kind === 'house') { sub = sub === 'brick' ? 'hbrick' : sub === 'stucco' ? 'hstucco' : sub; if (!SUBSTY[sub]) sub = ['hbrick', 'hstucco', 'wood', 'block'][Math.floor(hsh(b.id, 552) * 4)]; }
    else if (b.kind === 'panel') { if (!SUBSTY[sub]) sub = hsh(b.id, 551) < 0.23 ? 'ochre' : 'grey'; }
    else if (b.kind === 'civic') { if (!SUBSTY[sub]) sub = 'admin'; }
    if (SUBSTY[sub] && (b.kind === 'house' || b.kind === 'panel' || b.kind === 'civic')) { const v = SUBSTY[sub], j = Math.floor(hsh(b.id * 7, 3) * 3) - 1; st = { face: v[0], tex: v[1], roof: v[2] }; void j; }
    else { const arr = BCOL[b.kind] || BCOL.house; st = { face: arr[Math.floor(hsh(b.id * 7, 3) * arr.length)], tex: 'wall', roof: b.kind === 'industrial' ? '#59626a' : b.kind === 'warehouse' ? '#6a6258' : '#6f7a85' }; }
    return (b._sty = st);
  }
  function drawBuilding(b) {
    const sty = buildingStyle(b), base = sty.face;
    const e = Math.max(b.cut || 0, b.inner ? (b.fade || 0) : 0), Hm = b.h + (Math.min(b.h, 1.4) - b.h) * Math.min(1, e); b._Hm = Hm;
    const roofC = sty.roof;
    if (e > 0.3 && window.WL_HOUSES && WL_HOUSES.back) WL_HOUSES.back(b, Hm, hookEnv()); // контур со всех четырёх сторон при срезе
    prism(b.poly, Hm, { face: base, roof: roofC, wallTexture: sty.tex, deco: buildingDeco(b), noRoof: e > 0.5 && !!b.inner,
      roofDeco: (pts, Hp) => {
        if (b.kind === 'house') { const m1 = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 - Hp }, m2 = { x: (pts[2].x + pts[3].x) / 2, y: (pts[2].y + pts[3].y) / 2 - Hp }; ctx.strokeStyle = 'rgba(40,30,28,0.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(m1.x, m1.y); ctx.lineTo(m2.x, m2.y); ctx.stroke(); }
        if (b.kind === 'panel' && e < 0.5) { const q = SCR(b.c.x, b.c.y), cx = q.x, cy = q.y - Hp; for (let k = 0; k < 3; k++) { ctx.fillStyle = 'rgba(58,66,74,0.9)'; ctx.fillRect(cx + (hsh(b.id, k + 20) - 0.5) * 40 - 5, cy + (hsh(b.id, k + 30) - 0.5) * 16 - 3, 10, 6); } ctx.strokeStyle = '#161c22'; ctx.lineWidth = 1.2; const x = cx + (hsh(b.id, 40) - 0.5) * 30; ctx.beginPath(); ctx.moveTo(x, cy); ctx.lineTo(x, cy - 18); ctx.moveTo(x - 5, cy - 13); ctx.lineTo(x + 5, cy - 13); ctx.stroke(); if (b.h > 20) { const bl = 0.4 + 0.6 * Math.abs(Math.sin(s.t * 1.7 + b.id)); ctx.fillStyle = `rgba(255,60,50,${bl})`; ctx.fillRect(cx + 10, cy - 20, 3, 3); } }
      } });
    if (b.kind === 'panel' && b.int && e < 0.3) drawPorches(b);
  }
  // подъезды многоквартирного дома: козырёк на столбах, номер и лампа над каждой входной дверью (только на видимом фасаде)
  function drawPorches(b) {
    let num = 0; const doors = b.int.doors.filter(D => D.ext && D.entry && D.kind === 'door').slice().sort((p, q) => (p.x + p.y) - (q.x + q.y));
    for (const D of doors) {
      num++; if (D.nx + D.ny <= 0.05) continue;
      const ax = -D.ny, ay = D.nx, at = (a, o, h) => { const q = SCR(D.x + ax * a + D.nx * o, D.y + ay * a + D.ny * o); return { x: q.x, y: q.y - MH(h) }; };
      const quad = (pts, col) => { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1; ctx.stroke(); };
      quad([at(-13, 3, 0.18), at(13, 3, 0.18), at(13, 17, 0.18), at(-13, 17, 0.18)], '#6f6e68'); // крыльцо
      ctx.strokeStyle = '#2b3035'; ctx.lineWidth = 3; for (const a of [-13, 13]) { const p0 = at(a, 17, 0.18), p1 = at(a, 17, 2.45); ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke(); }
      quad([at(-15, 0, 2.7), at(15, 0, 2.7), at(15, 20, 2.45), at(-15, 20, 2.45)], '#9a968a'); // козырёк
      quad([at(-15, 20, 2.45), at(15, 20, 2.45), at(15, 20, 2.2), at(-15, 20, 2.2)], '#5e5a52');
      const l = at(0, 20, 2.33); ctx.fillStyle = '#e9e4d0'; ctx.fillRect(l.x - 7, l.y - 6, 14, 12); ctx.fillStyle = '#1b2126'; ctx.font = '700 10px "JetBrains Mono", monospace'; ctx.textAlign = 'center'; ctx.fillText(String(num), l.x, l.y + 4);
    }
  }
  // машина в нашей проекции: колёса стоят на земле, кузов на клиренсе, салон со стёклами, плотная тень; габариты ВАЗ-2106 4,2 x 1,6 x 1,45 м
  const CAR_PAINT = ['#6b7160', '#5d6a73', '#7a6f58', '#6a3a34', '#4a5a4c', '#8a8d86'];
  function drawCar(w) {
    const px = C.PX_PER_M, alongX = w.w >= w.h, cx = w.x + w.w / 2, cy = w.y + w.h / 2, rear = hsh(w.x | 0, w.y | 0) > 0.5 ? -1 : 1;
    const paint = CAR_PAINT[Math.floor(hsh((w.x | 0) + 3, (w.y | 0) + 7) * CAR_PAINT.length)];
    const Q = (u0, u1, v0, v1) => { const X = (u, v) => alongX ? { x: cx + u * px, y: cy + v * px } : { x: cx + v * px, y: cy + u * px }; return [X(u0, v0), X(u1, v0), X(u1, v1), X(u0, v1)]; };
    const lift = (m, f) => { ctx.save(); ctx.translate(0, -MH(m)); f(); ctx.restore(); };
    // контактная тень на земле
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); Q(-2.25, 2.25, -0.95, 0.95).forEach((p, i) => { const s = SCR(p.x, p.y); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); }); ctx.closePath(); ctx.fill();
    // колёса
    for (const u of [-1.3, 1.3]) for (const v of [-0.72, 0.72]) prism(Q(u - 0.33, u + 0.33, v - 0.11, v + 0.11), 0.66, { face: '#0b0e11', roof: '#15191d', snow: 0, tex: false });
    // кузов на клиренсе 0,2 м
    lift(0.2, () => prism(Q(-2.1, 2.1, -0.8, 0.8), 0.6, { face: paint, roof: paint, snow: 0.35, tex: false, deco: (f) => {
      ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fillRect(0, 0, f.wl, f.Hp * 0.22); ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(0, f.Hp * 0.62, f.wl, f.Hp * 0.06);
      ctx.fillStyle = 'rgba(112,64,34,0.30)'; for (let i = 0; i < 4; i++) ctx.fillRect(f.wl * hsh(i + (w.x | 0), (w.y | 0) + 2), 0, f.wl * 0.05, f.Hp * (0.3 + 0.3 * hsh(i, (w.y | 0)))); } }));
    // салон: стёкла + стойки, смещён назад
    lift(0.8, () => prism(Q(-1.35 + 0.1 * rear, 0.75 + 0.1 * rear, -0.68, 0.68), 0.65, { face: '#18222c', roof: paint, snow: 0.45, tex: false, deco: (f) => {
      ctx.fillStyle = paint; ctx.fillRect(0, 0, f.wl * 0.07, f.Hp); ctx.fillRect(f.wl * 0.93, 0, f.wl * 0.07, f.Hp); ctx.fillRect(f.wl * 0.46, 0, f.wl * 0.05, f.Hp); ctx.fillRect(0, f.Hp * 0.9, f.wl, f.Hp * 0.1); ctx.fillStyle = 'rgba(180,200,215,0.12)'; ctx.fillRect(f.wl * 0.1, f.Hp * 0.15, f.wl * 0.3, f.Hp * 0.12); } }));
  }
  function drawWall(w) {
    const k = w.kind;
    if (window.WL_HOUSES && WL_HOUSES.drawWall && WL_HOUSES.drawWall(w, hookEnv())) return; // interiors.js: мебель, перегородки
    if (k === 'door') return;
    if (k === 'lamp') lampLight(w);
    if (k === 'lamp' || k === 'tree' || k === 'pylon' || k === 'pole') return drawProp(w);
    const wp = rectPts(w);
    if (k === 'rack' && SPR.props && window.B96_CARSPRITE) {
      const q = SCR(w.x + w.w / 2, w.y + w.h / 2); spr('props', 4, q.x, q.y + (w.w + w.h) * Kx * 0.22, Math.max(SC * 1.4, (w.w + w.h) * Kx * 1.05), null);
    } else if (k === 'crate' && SPR.props && window.B96_CARSPRITE) {
      const q = SCR(w.x + w.w / 2, w.y + w.h / 2); spr('props', 3, q.x, q.y + (w.w + w.h) * Kx * 0.22, Math.max(SC * 0.9, (w.w + w.h) * Kx * 1.05), null);
    } else if (k === 'car') { drawCar(w);
    } else if (k === 'rack') {
      prism(wp, 2.2, { face: '#1b2420', roof: '#566348', snow: 0.15, deco: (f) => { for (let r = 0; r < 4; r++) { ctx.fillStyle = '#4c5a3f'; ctx.fillRect(0, r * f.Hp / 4 + 1, f.wl, 2); ctx.fillStyle = hsh((w.x | 0) + r, r) > 0.4 ? '#6b6648' : '#3d4a56'; ctx.fillRect(2 + r * 5, r * f.Hp / 4 + 3, Math.min(f.wl * 0.3, 10), f.Hp / 4 - 5); } } });
    } else if (k === 'crate') {
      prism(wp, 1.1, { face: '#4a432d', roof: '#7d7650', snow: 0.1, deco: (f) => { ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1; ctx.strokeRect(1, 1, f.wl - 2, f.Hp - 2); ctx.beginPath(); ctx.moveTo(1, 1); ctx.lineTo(f.wl - 1, f.Hp - 1); ctx.stroke(); } });
    } else if (k === 'block') {
      prism(wp, 1.0, { face: '#2d3a45', roof: '#5b6e79', snow: 0.65 });
    } else if (k === 'stop') {
      prism(wp, 2.8, { face: '#1b242c', roof: '#3f4b55', snow: 0.5, deco: (f) => { ctx.fillStyle = 'rgba(120,170,190,0.3)'; ctx.fillRect(3, f.Hp * 0.15, f.wl - 6, f.Hp * 0.6); } });
    } else if (k === 'border') {
      // периметр 16 районов: бетонный забор (светлые плиты, столбы, колючка поверху), а не чёрный блок
      prism(wp, 2.2, { face: '#7d858a', roof: '#a0a7ab', snow: 0, tex: false, deco: (f) => { ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.fillRect(0, 0, f.wl, f.Hp * 0.12); ctx.strokeStyle = 'rgba(30,36,40,0.55)'; ctx.lineWidth = 1; for (let x = 0; x < f.wl; x += 20) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, f.Hp); ctx.stroke(); } ctx.strokeStyle = 'rgba(25,30,34,0.7)'; ctx.beginPath(); ctx.moveTo(0, f.Hp * 0.16); ctx.lineTo(f.wl, f.Hp * 0.16); ctx.stroke(); ctx.fillStyle = '#3a4046'; ctx.fillRect(0, f.Hp * 0.04, f.wl, 2); } });
    } else { // забор / стена двора
      const lowm = w.low ? 1.2 : 3.0;
      prism(wp, lowm, { face: '#46585f', roof: '#7d919c', deco: (f) => { ctx.fillStyle = 'rgba(0,0,0,0.25)'; for (let x = 0; x < f.wl; x += 12) ctx.fillRect(x, 0, 1, f.Hp); } });
    }
  }

  // ---------- реквизит: фонари, деревья, опоры (спрайты, стоят вертикально) ----------
  function drawProp(w) {
    const q = SCR(w.x + w.w / 2, w.y + w.h / 2); if (q.x < -120 || q.x > W + 120 || q.y < -60 || q.y > H + 700) return;
    ctx.save(); ctx.translate(q.x, q.y); ctx.lineCap = 'round';
    if (w.kind === 'lamp' || w.kind === 'tree') { ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.beginPath(); ctx.ellipse(0, 0, w.kind === 'tree' ? SC * 0.55 : 7, w.kind === 'tree' ? SC * 0.25 : 3.5, 0, 0, 7); ctx.fill(); }
    if (w.kind === 'lamp' && spr('props', 1, 0, 0, null, MH(7.5))) {
      const nk=nightK(s.hour == null ? 10 : s.hour);
      if(nk>0.02){
        const h=MH(7.5), u=h/425;
        // Glass diffuser is part of the sprite, rather than a point light hovering above it.
        const x=(151-97.5)*u, y=-(425-49)*u;
        ctx.save();ctx.globalCompositeOperation='screen';
        ctx.translate(x,y);ctx.rotate(-0.16);
        const g=ctx.createRadialGradient(0,0,0,0,0,23*u);
        g.addColorStop(0,`rgba(255,236,186,${0.88*nk})`);
        g.addColorStop(.50,`rgba(255,198,121,${0.60*nk})`);
        g.addColorStop(1,'rgba(255,179,100,0)');
        ctx.scale(1.18,.57);ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,23*u,0,Math.PI*2);ctx.fill();ctx.restore();
      }
    } else if (w.kind === 'lamp') {
      const h = MH(7.5); ctx.strokeStyle = '#0f151b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -h); ctx.lineTo(MH(0.9) * 0.8, -h - 3); ctx.stroke();
      ctx.fillStyle = '#ffd7a0'; ctx.fillRect(MH(0.9) * 0.8 - 5, -h - 4, 11, 4);
    } else if (w.kind === 'tree' && spr('props', hsh((w.x | 0) + 5, (w.y | 0)) > 0.35 ? 0 : 7, 0, 0, null, MH(7 + hsh((w.x | 0) + 1, (w.y | 0) - 1) * 4))) {
    } else if (w.kind === 'tree') {
      const r = (k) => hsh((w.x | 0) + k, (w.y | 0) - k), th = MH(6 + r(1) * 3), tw = SC * 0.42;
      ctx.strokeStyle = '#161c21'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -MH(2)); ctx.stroke();
      for (let i = 0; i < 4; i++) { const y0 = -MH(1.6) - i * (th - MH(1.6)) / 4.4, wid = tw * (1.9 - i * 0.38); ctx.fillStyle = i % 2 ? '#22362b' : '#1d3026'; ctx.beginPath(); ctx.moveTo(-wid, y0); ctx.lineTo(wid, y0); ctx.lineTo(0, y0 - th / 2.6); ctx.closePath(); ctx.fill(); ctx.fillStyle = 'rgba(214,230,240,0.5)'; ctx.beginPath(); ctx.moveTo(-wid * 0.9, y0 - 3); ctx.lineTo(wid * 0.9, y0 - 3); ctx.lineTo(0, y0 - th / 2.6); ctx.closePath(); ctx.fill(); }
    } else if (w.kind === 'pole') {
      const h = MH(9); ctx.strokeStyle = '#2a211b'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -h); ctx.stroke();
      ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-SC * 0.5, -h + 8); ctx.lineTo(SC * 0.5, -h + 8); ctx.moveTo(-SC * 0.35, -h + 22); ctx.lineTo(SC * 0.35, -h + 22); ctx.stroke();
    } else { // pylon
      const h = MH(24), b0 = SC * 1.1; ctx.strokeStyle = '#141a20'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-b0, 0); ctx.lineTo(-b0 * 0.25, -h); ctx.moveTo(b0, 0); ctx.lineTo(b0 * 0.25, -h); ctx.stroke(); ctx.lineWidth = 1.5;
      for (let i = 0; i < 7; i++) { const t0 = i / 7, t1 = (i + 1) / 7, w0 = b0 * (1 - 0.75 * t0), w1 = b0 * (1 - 0.75 * t1); ctx.beginPath(); ctx.moveTo(-w0, -h * t0); ctx.lineTo(w1, -h * t1); ctx.moveTo(w0, -h * t0); ctx.lineTo(-w1, -h * t1); ctx.moveTo(-w1, -h * t1); ctx.lineTo(w1, -h * t1); ctx.stroke(); }
      ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-SC * 1.6, -h * 0.9); ctx.lineTo(SC * 1.6, -h * 0.9); ctx.moveTo(-SC * 1.2, -h * 0.72); ctx.lineTo(SC * 1.2, -h * 0.72); ctx.stroke();
    }
    ctx.restore();
  }
  function drawWires() {
    const ps = visWalls.filter(w => w.kind === 'pylon').sort((a, b) => a.x - b.x);
    ctx.save(); ctx.strokeStyle = 'rgba(10,16,22,0.85)'; ctx.lineWidth = 1.2;
    for (let i = 0; i + 1 < ps.length; i++) {
      const a = SCR(ps[i].x + ps[i].w / 2, ps[i].y + ps[i].h / 2), b = SCR(ps[i + 1].x + ps[i + 1].w / 2, ps[i + 1].y + ps[i + 1].h / 2); if (Math.max(a.x, b.x) < -40 || Math.min(a.x, b.x) > W + 40) continue;
      for (const [off, hh] of [[-SC * 1.6, 21.6], [SC * 1.6, 21.6], [-SC * 1.2, 17.3], [SC * 1.2, 17.3]]) { const ay = a.y - MH(hh), by = b.y - MH(hh); ctx.beginPath(); ctx.moveTo(a.x + off, ay); ctx.quadraticCurveTo((a.x + b.x) / 2 + off, (ay + by) / 2 + 24, b.x + off, by); ctx.stroke(); }
    }
    ctx.restore();
  }
  function drawPoleWires() {
    if (!s.map.city || !s.map.city.lines) return; ctx.save(); ctx.strokeStyle = 'rgba(10,16,22,0.8)'; ctx.lineWidth = 1;
    for (const ln of s.map.city.lines) for (let i = 0; i + 1 < ln.length; i++) {
      const A = s.map.walls[ln[i]], B = s.map.walls[ln[i + 1]], a = SCR(A.x + A.w / 2, A.y + A.h / 2), b = SCR(B.x + B.w / 2, B.y + B.h / 2);
      if (Math.max(a.x, b.x) < -20 || Math.min(a.x, b.x) > W + 20 || Math.max(a.y, b.y) < -40 || Math.min(a.y, b.y) > H + 400) continue;
      for (const o of [-SC * 0.5, SC * 0.5]) { const ay = a.y - MH(8.8), by = b.y - MH(8.8); ctx.beginPath(); ctx.moveTo(a.x + o, ay); ctx.quadraticCurveTo((a.x + b.x) / 2 + o, (ay + by) / 2 + 10, b.x + o, by); ctx.stroke(); }
    }
    ctx.restore();
  }

  // ---------- человечек: ноги, руки, голова, оружие ----------
  const anim = {};
  const hookEnv = () => ({ SCR, SC, Kx, VMh, MH, C, s, hsh, ctxScr, shade, FLH, cam, ctx, prism, rectPts, innerShown, insideId, TEX, texFill });
  const WEAPON_M = { pistol: 0.22, shotgun: 0.75, rifle: 0.95 };
  let prevEn = [], corpses = [];
  function drawActor(a, isPlayer) { try { drawActor0(a, isPlayer); } catch (e) { if (!window.__daErr) { window.__daErr = 1; console.warn('drawActor', e && e.message); } } }
  function drawActor0(a, isPlayer) {
    if (window.WL_CHARS && WL_CHARS.draw && WL_CHARS.draw(ctx, a, isPlayer, hookEnv())) { // модуль characters.js (если подключён) рисует человечка сам
      if (!isPlayer && !a.dead && a.maxHp && a.hp > 0 && a.hp < a.maxHp) { const q = SCR(a.x, a.y), w = 30, h = 3.5, x0 = q.x - w / 2, y0 = q.y - MH(2.15); ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(x0 - 1, y0 - 1, w + 2, h + 2); ctx.fillStyle = '#f08a24'; ctx.fillRect(x0, y0, w * Math.max(0, a.hp / a.maxHp), h); } // оранжевая полоса здоровья над раненой целью, как в референсе
      return;
    }
    const q = SCR(a.x, a.y); if (q.x < -80 || q.x > W + 80 || q.y < -40 || q.y > H + 160) return;
    let st = anim[a.id]; if (!st || st.o !== a) st = anim[a.id] = { o: a, ph: Math.random() * 6, x: a.x, y: a.y, sp: 0 };
    const mv = Math.hypot(a.x - st.x, a.y - st.y); st.ph += mv * 0.11; st.sp += ((mv > 0.15 ? 1 : 0) - st.sp) * 0.25; st.x = a.x; st.y = a.y;
    const ang = isPlayer ? Math.atan2(a.ay - a.y, a.ax - a.x) : (a.ang || 0), ca = Math.cos(ang), sa = Math.sin(ang);
    const col = isPlayer ? '#3df2ff' : ((C.ENEMIES[a.type] || (window.WL_ENEMIES && WL_ENEMIES.TYPES[a.type]) || {}).color || '#ff2bd6');
    const LK = !isPlayer && window.WL_ENEMIES && WL_ENEMIES.look ? WL_ENEMIES.look(a) : { armed: !isPlayer && a.type === 'raider', gunLen: 16, shape: 'shoulders', mark: '' };
    const armed = isPlayer || LK.armed, wid = isPlayer ? (a.weapons[a.cur] && a.weapons[a.cur].id) : null, glm = isPlayer ? (WEAPON_M[wid] || 0.3) : Math.max(0.2, (LK.gunLen || 16) / 22);
    const off = (mx, my) => ({ x: (mx - my) * 10 * Kx, y: (mx + my) * 10 * Kx / 2 }); // смещение мира в метрах -> экран
    const fx = (d, l) => off(ca * d - sa * l, sa * d + ca * l); // вперёд d, влево l (в метрах)
    const hurtF = a.hitFlash > 0, skin = '#c9a98c', cloth = hurtF ? '#ffffff' : isPlayer ? '#27414d' : '#2a2433', pants = hurtF ? '#ffffff' : '#171d24';
    const sw = Math.sin(st.ph) * 0.3 * (0.15 + 0.85 * st.sp), face = fx(1, 0).y > 0; // лицом к камере
    ctx.save(); ctx.translate(q.x, q.y);
    ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.beginPath(); ctx.ellipse(0, 1, SC * 0.34, SC * 0.17, 0, 0, 7); ctx.fill();
    const hip = -MH(0.92), sh = -MH(1.45), hd = -MH(1.68), lw = Math.max(3, SC * 0.09);
    // ноги
    ctx.lineCap = 'round'; ctx.lineWidth = lw + 1; ctx.strokeStyle = pants;
    for (const sd of [-1, 1]) { const ft = fx(sw * sd, 0.1 * sd); ctx.beginPath(); ctx.moveTo(fx(0, 0.1 * sd).x, hip); ctx.lineTo(ft.x, ft.y - (sw * sd > 0.12 ? MH(0.08) : 0)); ctx.stroke(); }
    // руки/оружие: в целом позади тела, если стоим к камере спиной
    const hand = fx(0.34, 0.06), hand2 = fx(0.2, -0.18), tip = fx(0.34 + glm, 0.06);
    const gun = () => { if (!armed) return; ctx.strokeStyle = '#14181d'; ctx.lineWidth = lw + 1; ctx.beginPath(); ctx.moveTo(hand.x, sh + MH(0.2) + hand.y); ctx.lineTo(tip.x, sh + MH(0.2) + tip.y); ctx.stroke(); ctx.strokeStyle = '#8f98a8'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(hand.x, sh + MH(0.2) + hand.y); ctx.lineTo(tip.x, sh + MH(0.2) + tip.y); ctx.stroke(); };
    const arms = () => {
      ctx.strokeStyle = cloth; ctx.lineWidth = lw;
      const sL = fx(0, 0.2), sR = fx(0, -0.2);
      if (armed) { ctx.beginPath(); ctx.moveTo(sL.x, sh + sL.y); ctx.lineTo(hand.x, sh + MH(0.2) + hand.y); ctx.moveTo(sR.x, sh + sR.y); ctx.lineTo(hand2.x, sh + MH(0.2) + hand2.y); ctx.stroke(); }
      else { const aw = sw * 1.2; const h1 = fx(-aw, 0.22), h2 = fx(aw, -0.22); ctx.beginPath(); ctx.moveTo(sL.x, sh + sL.y); ctx.lineTo(h1.x, sh + MH(0.5) + h1.y); ctx.moveTo(sR.x, sh + sR.y); ctx.lineTo(h2.x, sh + MH(0.5) + h2.y); ctx.stroke(); }
    };
    if (!face) { gun(); arms(); }
    // торс
    const tw = SC * 0.2; ctx.fillStyle = cloth; ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-tw, sh); ctx.lineTo(tw, sh); ctx.lineTo(tw * 0.8, hip); ctx.lineTo(-tw * 0.8, hip); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (!isPlayer && LK.shape === 'shoulders') { ctx.fillStyle = col; ctx.fillRect(-tw - 3, sh - 2, 5, 5); ctx.fillRect(tw - 2, sh - 2, 5, 5); }
    // голова
    const hr = SC * 0.15, hx = fx(0.05, 0).x; ctx.fillStyle = hurtF ? '#fff' : skin; ctx.beginPath(); ctx.arc(hx, hd, hr, 0, 7); ctx.fill(); ctx.fillStyle = isPlayer ? '#1b2a33' : '#1a1520'; ctx.beginPath(); ctx.arc(hx, hd - hr * 0.2, hr * 1.02, Math.PI, 0); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(hx, hd, hr + 0.8, 0, 7); ctx.stroke();
    if (face) { gun(); arms(); }
    if (!isPlayer) {
      if (a.hp < a.maxHp) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(-14, hd - hr - 9, 28, 4); ctx.fillStyle = col; ctx.fillRect(-14, hd - hr - 9, 28 * a.hp / a.maxHp, 4); }
      if (LK.mark) { ctx.fillStyle = LK.mark === '!' ? '#ff3ea5' : '#ffd24a'; ctx.font = '700 13px "Chakra Petch", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(LK.mark, 0, hd - hr - 14); }
    } else if (a.adren > 0) { ctx.strokeStyle = 'rgba(255,178,61,0.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 0, SC * 0.5, SC * 0.25, 0, 0, 7); ctx.stroke(); }
    ctx.restore();
  }

  // ---------- контейнеры и метки на земле (плоский слой) ----------
  function drawContainer3D(c, p) { // ящик, шкафчик, бак, гараж, почтовые ящики на фасаде: объёмные предметы
    const live = !c.searched, near = live && Math.hypot(c.x - p.x, c.y - p.y) < 60, t = performance.now() / 1000, K = c.kind, a = c.ang || 0, ca = Math.cos(a), sa = Math.sin(a);
    const S = { crate: [4.6, 4, 0.9], locker: [3.4, 3, 1.8], bin: [3.8, 3.4, 1.1], garage: [5.2, 3.2, 0.9], entrance: [6.5, 1.3, 1.6], body: [9, 3, 0.22] }[K] || [4.5, 4, 0.9];
    const wp = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => ({ x: c.x + ca * i * S[0] - sa * j * S[1], y: c.y + sa * i * S[0] + ca * j * S[1] }));
    const dim = live ? 1 : 0.55;
    if (near) { const q = SCR(c.x, c.y), g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, 34); g.addColorStop(0, `rgba(255,178,61,${0.28 + 0.1 * Math.sin(t * 4)})`); g.addColorStop(1, 'rgba(255,178,61,0)'); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(q.x, q.y, 34, 17, 0, 0, 7); ctx.fill(); ctx.restore(); }
    ctx.save(); if (!live) ctx.globalAlpha = 0.8;
    if (K === 'crate') prism(wp, S[2], { face: live ? '#7a5632' : '#4f4030', roof: live ? '#9a7442' : '#5e4d38', snow: 0.12, deco: (f) => { ctx.strokeStyle = 'rgba(30,18,8,0.6)'; ctx.lineWidth = 1; for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(0, f.Hp * i / 4); ctx.lineTo(f.wl, f.Hp * i / 4); ctx.stroke(); } ctx.strokeRect(1, 1, f.wl - 2, f.Hp - 2); ctx.fillStyle = 'rgba(20,12,6,0.55)'; ctx.fillRect(f.wl * 0.08, 0, f.wl * 0.08, f.Hp); ctx.fillRect(f.wl * 0.84, 0, f.wl * 0.08, f.Hp); } });
    else if (K === 'locker') prism(wp, S[2], { face: live ? '#4a6272' : '#34424c', roof: '#6e8696', snow: 0.1, deco: (f) => { ctx.strokeStyle = 'rgba(10,20,28,0.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(f.wl / 2, 0); ctx.lineTo(f.wl / 2, f.Hp); ctx.stroke(); ctx.fillStyle = 'rgba(200,215,225,0.5)'; ctx.fillRect(f.wl * 0.42, f.Hp * 0.45, 2, 5); ctx.fillRect(f.wl * 0.54, f.Hp * 0.45, 2, 5); for (let i = 0; i < 4; i++) ctx.fillRect(f.wl * 0.12, f.Hp * (0.08 + i * 0.03), f.wl * 0.22, 1); } });
    else if (K === 'bin') prism(wp, S[2], { face: live ? '#2f5a43' : '#25382f', roof: '#1d3a2c', snow: 0.2, deco: (f) => { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(0, 0, f.wl, f.Hp * 0.18); ctx.fillStyle = 'rgba(255,255,255,0.08)'; for (let x = f.wl * 0.1; x < f.wl; x += f.wl * 0.2) ctx.fillRect(x, f.Hp * 0.25, 1, f.Hp * 0.7); } });
    else if (K === 'garage') prism(wp, S[2], { face: live ? '#5a3a30' : '#3a2e2a', roof: '#7a5a4a', snow: 0.1, deco: (f) => { ctx.fillStyle = 'rgba(20,10,8,0.6)'; ctx.fillRect(f.wl * 0.1, f.Hp * 0.4, f.wl * 0.8, 2); ctx.fillStyle = 'rgba(210,190,120,0.5)'; ctx.fillRect(f.wl * 0.45, f.Hp * 0.3, f.wl * 0.1, 4); } });
    else if (K === 'entrance') prism(wp, S[2], { face: live ? '#5f7686' : '#3d4953', roof: '#8497a4', snow: 0.1, deco: (f) => { const n = 6, cw = f.wl / n; for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) { ctx.fillStyle = 'rgba(14,22,28,0.75)'; ctx.fillRect(i * cw + 1.2, f.Hp * (0.08 + j * 0.3), cw - 2.4, f.Hp * 0.24); ctx.fillStyle = 'rgba(210,220,226,0.55)'; ctx.fillRect(i * cw + cw * 0.3, f.Hp * (0.17 + j * 0.3), cw * 0.4, 1.2); } } });
    else prism(wp, S[2], { face: '#2a1420', roof: '#3a1c2a', snow: 0 });
    ctx.restore();
  }
  function drawContainer(c) {
    const live = !c.searched; ctx.save(); ctx.translate(c.x - cam.x, c.y - cam.y);
    if (c.kind === 'car') { ctx.strokeStyle = live ? 'rgba(255,178,61,0.9)' : 'rgba(120,110,140,0.35)'; ctx.lineWidth = 1; ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, 7); ctx.stroke(); ctx.restore(); return; }
    const sz = c.kind === 'locker' ? [7, 12] : c.kind === 'body' ? [18, 6] : [11, 8];
    ctx.fillStyle = c.kind === 'body' ? '#2a1420' : c.kind === 'locker' ? '#22303a' : '#3a2a1a'; ctx.fillRect(-sz[0] / 2, -sz[1] / 2, sz[0], sz[1]);
    ctx.strokeStyle = live ? '#ffb23d' : 'rgba(120,110,140,0.35)'; if (live) { ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 8; } ctx.lineWidth = 1; ctx.strokeRect(-sz[0] / 2, -sz[1] / 2, sz[0], sz[1]); ctx.restore();
  }
  // тени на земле (плоский слой): сдвиг основания по направлению света
  function flatShadow(wp, Hm) {
    const k = Hm * 10 * 0.55, dx = k * LIGHT.x * 0.9, dy = k * LIGHT.y * 0.9, pts = wp.map(q => ({ x: q.x - cam.x, y: q.y - cam.y })), all = pts.concat(pts.map(q => ({ x: q.x + dx, y: q.y + dy })));
    const hh = hull(all); ctx.beginPath(); hh.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.closePath(); ctx.fill();
  }
  function drawShadows() {
    ctx.save(); ctx.fillStyle = 'rgba(4,10,18,0.42)';
    if (s.map.city) for (const b of visibleBuildings) { if (b.maxX < cam.x - 60 || b.minX > cam.x + VW + 60 || b.maxY < cam.y - 60 || b.minY > cam.y + VH + 60) continue; flatShadow(b.poly, Math.min(b.h, 30)); }
    for (const w of visWalls) {
      if (w.kind === 'border' || w.kind === 'bldg' || w.kind === 'water' || w.kind === 'door' || w.kind === 'win' || w.kind === 'car' || w._ox != null) continue; if (w.inb != null && !innerShown(w.inb)) continue;
      const x = w.x - cam.x, y = w.y - cam.y; if (x > VW + 60 || y > VH + 60 || x + w.w < -60 || y + w.h < -60) continue;
      if (w.kind === 'lamp' || w.kind === 'pole' || w.kind === 'pylon' || w.kind === 'tree') { const L = w.kind === 'pylon' ? 160 : w.kind === 'tree' ? 50 : 60; ctx.beginPath(); ctx.ellipse(x + w.w / 2 + L * 0.35, y + w.h / 2 + L * 0.2, L * 0.4, w.kind === 'tree' ? 14 : 2.5, 0.5, 0, 7); ctx.fill(); continue; }
      flatShadow(rectPts(w), w.kind === 'furn' ? Math.min(1.2, (w.fh || 1) * 0.5) : w.kind === 'wall' && w.part ? 0.8 : { car: 1.4, rack: 2.2, crate: 1.1, block: 1, stop: 2.8 }[w.kind] || 3);
    }
    for (const c of s.cars || []) { if (c.x < cam.x - 80 || c.x > cam.x + VW + 80 || c.y < cam.y - 80 || c.y > cam.y + VH + 80) continue; flatShadow(B96_VEH.corners(c), B96_VEH.height(c) * 0.9); }
    ctx.restore();
  }
  function drawInteriors() { // пол входимых зданий (плоский слой)
    for (const b of ents || []) {
      if (!b.fade || b.maxX < cam.x - 60 || b.minX > cam.x + VW + 60 || b.maxY < cam.y - 60 || b.minY > cam.y + VH + 60) continue;
      ctx.save(); ctx.globalAlpha = Math.min(1, b.fade * 1.4); ctx.beginPath(); b.inner.forEach((q, i) => i ? ctx.lineTo(q.x - cam.x, q.y - cam.y) : ctx.moveTo(q.x - cam.x, q.y - cam.y)); ctx.closePath();
      ctx.fillStyle = '#3b3e3a'; ctx.fill(); ctx.clip();
      if (window.WL_HOUSES && WL_HOUSES.floor && WL_HOUSES.floor(ctx, b, hookEnv())) { ctx.restore(); continue; }
      for (let k = 0; k < 40; k++) { ctx.fillStyle = hsh(b.id, k) > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.14)'; ctx.fillRect(b.minX - cam.x + hsh(b.id, k + 50) * (b.maxX - b.minX), b.minY - cam.y + hsh(b.id, k + 90) * (b.maxY - b.minY), 20 + hsh(b.id, k + 7) * 70, 3); }
      ctx.restore();
    }
  }

  function render(dt) {
    const p = s.players[LOCAL];
    // камера: игрок + вынос к прицелу
    const am = aimWorld(p), lx = Math.max(-170, Math.min(170, (am.x - p.x) * 0.22)), ly = Math.max(-170, Math.min(170, (am.y - p.y) * 0.22));
    kick.x *= Math.exp(-dt * 12); kick.y *= Math.exp(-dt * 12);
    const fo = window.WL_FEEL ? WL_FEEL.camera(p, dt) : { x: 0, y: 0 };
    if (window.WL_FEEL && !p.dead) WL_FEEL.update(p, dt, { sfx });
    // ПКМ (удерживать): камера плавно смещается к курсору ещё на 10 м; при отпускании возвращается
    lookK += ((mouse.look && !p.dead ? 1 : 0) - lookK) * Math.min(1, dt * 5);
    const adx = am.x - p.x, ady = am.y - p.y, adl = Math.hypot(adx, ady) || 1, lkx = adx / adl * 100 * lookK, lky = ady / adl * 100 * lookK;
    const tx = p.x + lx + lkx - VW / 2 + kick.x + fo.x, ty = p.y + ly + lky - VH / 2 + kick.y + fo.y;
    cam.x += (tx - cam.x) * Math.min(1, dt * 8); cam.y += (ty - cam.y) * Math.min(1, dt * 8);
    if (window.WL_ENEMIES && WL_ENEMIES.setCamera) WL_ENEMIES.setCamera(cam.x + VW / 2 - p.x, cam.y + VH / 2 - p.y); // смещение центра камеры от игрока, мир. px
    shake = Math.max(0, shake - dt * 30); hurt = Math.max(0, hurt - dt);
    if (p.moving && !p.dead && Math.hypot(p.x - lastPrint.x, p.y - lastPrint.y) > 12) { lastPrint = { x: p.x, y: p.y }; prints.push({ x: p.x, y: p.y + 6, a: Math.atan2(p.ay - p.y, p.ax - p.x), side: prints.length % 2 ? 5 : -5, age: 0 }); if (prints.length > 170) prints.shift(); }
    shx = (Math.random() - 0.5) * shake; shy = (Math.random() - 0.5) * shake;
    ctxScr(); ctx.fillStyle = '#0a121a'; ctx.fillRect(0, 0, W, H);
    visibleBuildings = getVisibleBuildings();
    visWalls = WL_SIM.API.wallsNear(s, cam.x - 300, cam.y - 300, cam.x + VW + 300, cam.y + VH + 300);
    // --- плоский слой: земля, следы, тени, пол помещений, контейнеры
    ctxFlat(); ctx.imageSmoothingEnabled = true;
    const gx = Math.max(0, cam.x), gy = Math.max(0, cam.y);
    if (ground.world) drawGroundWorld(); else { const gw = Math.min(ground.width / GS - gx, VW - (gx - cam.x)), gh = Math.min(ground.height / GS - gy, VH - (gy - cam.y)); if (gw > 0 && gh > 0) ctx.drawImage(ground, gx * GS, gy * GS, gw * GS, gh * GS, gx - cam.x, gy - cam.y, gw, gh); }
    drawGroundMarks(dt); drawShadows(); updateInside(p); drawInteriors();
    const vx0 = cam.x - 80, vx1 = cam.x + VW + 80, vy0 = cam.y - 80, vy1 = cam.y + VH + 80;
    // --- изометрический слой: здания, стены, реквизит, люди, по глубине (x+y)
    ctxScr();
    drawGate(p); drawPoints(p); drawNodes(p);
    const list = [], pS = SCR(p.x, p.y), pk = p.x + p.y;
    for (const w of visWalls) { if (w.kind === 'bldg' || w.kind === 'water' || w.kind === 'door' || w.kind === 'win' || w.kind === 'car' || w._ox != null) continue; if (w.inb != null && !innerShown(w.inb)) continue; list.push({ k: w.x + w.w / 2 + w.y + w.h / 2, w }); }
    { const hh = s.hour == null ? 10 : s.hour, nkc = (hh >= 17 || hh < 9) ? 1 : hh >= 16 ? hh - 16 : hh >= 9 && hh < 10 ? 10 - hh : 0, cenv = { ctx, SCR, MH, night: nkc, t: performance.now() / 1000, zoom };
      for (const c of s.cars || []) if (c.x > vx0 - 80 && c.x < vx1 + 80 && c.y > vy0 - 80 && c.y < vy1 + 140) list.push({ k: c.x + c.y, fn: () => B96_VEH.draw(cenv, c) }); }
    for (const c of s.containers) if (c.kind !== 'car' && c.x > vx0 && c.x < vx1 && c.y > vy0 && c.y < vy1 + 60 && (c.inb == null || innerShown(c.inb))) list.push({ k: c.x + c.y, fn: () => drawContainer3D(c, p) });
    if (window.WL_HOUSES && WL_HOUSES.items) for (const b of ents || []) if (b.int && innerShown(b.id)) for (const it of WL_HOUSES.items(b, hookEnv())) list.push(it);
    const ib0 = insideId >= 0 && ents ? ents.find(x => x.id === insideId) : null, insB = ib0 ? (() => { const c0 = SCR(ib0.c.x, ib0.c.y); return { sx: c0.x, sy: c0.y - MH(0.8) }; })() : null;
    const bldItems = [];
    if (s.map.city) for (const b of visibleBuildings) {
      const q = SCR(b.c.x, b.c.y), rad = Math.hypot(b.w, b.d) / 2 * Kx * 1.1 + 20;
      if (q.x < -rad || q.x > W + rad || q.y + rad < -20 || q.y - MH(b.h) - rad > H + 20) continue;
      // срез ближней стены: здание перед игроком, закрывающее его, опускается до пояса (непрозрачность не меняется)
      let tg = 0; const k = b.c.x + b.c.y;
      let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9; for (const r of b.poly) { if (r.x < bx0) bx0 = r.x; if (r.x > bx1) bx1 = r.x; if (r.y < by0) by0 = r.y; if (r.y > by1) by1 = r.y; }
      const bbx = [bx0, by0, bx1, by1], bps = b.poly.map(r => SCR(r.x, r.y)), Hf = MH(b.h), hl = hull(bps.concat(bps.map(r => ({ x: r.x, y: r.y - Hf }))));
      // порядок «здание впереди точки» по габариту, а не по центру: длинный дом иначе рисуется позади игрока, стоящего у его дальнего торца
      const inFront = (px, py, kk) => (px > bx1 || py > by1) ? false : (px < bx0 || py < by0) ? true : k >= kk;
      bldItems.push({ k, bb: bbx, hl, b });
      if (!p.dead && !(b.inner && ptIn(p.x, p.y, b.inner))) {
        // снаружи: только здание впереди игрока; внутри здания: любое чужое здание, чья масса перекрывает игрока или его помещение
        if (inFront(p.x, p.y, pk) && Math.abs(q.x - pS.x) < rad && pS.y - MH(0.9) > q.y - MH(b.h) - rad && pS.y - MH(0.9) < q.y + rad && ptIn(pS.x, pS.y - MH(0.9), hl)) tg = 1;
        else if (insideId >= 0) { if (ptIn(pS.x, pS.y - MH(0.9), hl) || (insB && ptIn(insB.sx, insB.sy, hl))) tg = 1; else { const R = 190; for (let j = -2; j <= 2 && !tg; j++) for (let i = -2; i <= 2; i++) if (ptIn(pS.x + i * R / 2, pS.y - MH(0.9) + j * R / 2, hl)) { tg = 1; break; } } }
      }
      b.cut = (b.cut || 0) + (tg - (b.cut || 0)) * 0.22; if (b.cut < 0.01) b.cut = 0;
      list.push({ k, bd: b });
    }
    for (const e of s.enemies) { if (e.x < vx0 || e.x > vx1 || e.y < vy0 || e.y > vy1 + 120) continue; const q = SCR(e.x, e.y); if (q.x < -60 || q.x > W + 60 || q.y < -40 || q.y > H + 160) continue; let hid = false; for (const b of ents || []) if (!innerShown(b.id) && ptIn(e.x, e.y, b.inner)) { hid = true; break; } if (!hid && (!window.WL_VISION || WL_VISION.entAlpha(s, s.players[LOCAL], e, dt) > 0.04)) list.push({ k: e.x + e.y, a: e }); }
    { // трупы: враг исчез из s.enemies -> держим его в списке отрисовки 8 с с dead:true (падение)
      const cur = new Set(s.enemies);
      for (const e of prevEn) if (!cur.has(e)) { e.dead = true; e.hp = 0; e._cT = 0; corpses.push(e); }
      prevEn = s.enemies.slice();
      for (let i = corpses.length - 1; i >= 0; i--) { const c = corpses[i]; c._cT += dt; if (c._cT > 8) { corpses.splice(i, 1); continue; } if (c.x < vx0 || c.x > vx1 || c.y < vy0 || c.y > vy1 + 120) continue; list.push({ k: c.x + c.y, a: c, pl: false }); }
    }
    for (const id in s.players) if (!s.players[id].dead && !s.players[id].extracted && s.players[id].drive == null) list.push({ k: s.players[id].x + s.players[id].y + 0.5, a: s.players[id], pl: true });
    for (const it of list) if (it.a && bldItems.length) { // актёр и здание: порядок по габариту дома
      const a = it.a, q = SCR(a.x, a.y), yy = q.y - MH(0.9);
      for (const bi of bldItems) { const bb = bi.bb; if (a.x > bb[2] || a.y > bb[3]) { if (it.k <= bi.k && ptIn(q.x, yy, bi.hl)) it.k = bi.k + 0.01; } else if ((a.x < bb[0] || a.y < bb[1]) && ptIn(q.x, yy, bi.hl)) { if (it.k >= bi.k) it.k = bi.k - 0.01; } }
    }
    list.sort((a, b) => a.k - b.k);
    lightBegin();
    for (const it of list) { if (it.bd) { drawBuilding(it.bd); lightOcclude(it.bd); } else if (it.w) drawWall(it.w); else if (it.fn) it.fn(); else drawActor(it.a, it.pl); }
    ctx.globalAlpha = 1; drawCarFx(dt, p); drawWires(); drawPoleWires(); drawLabels(); drawKioskSigns();
    // пули
    ctx.save(); ctx.lineCap = 'round';
    for (const b of s.bullets) {
      const q = SCR(b.x, b.y), x = q.x, y = q.y - MH(1.3), k = 0.018, dxs = (b.vx - b.vy) * Kx * k, dys = (b.vx + b.vy) * Kx / 2 * k;
      const bc = b.faction === 'players' ? '#22f2ff' : '#ff2bd6'; ctx.strokeStyle = bc; ctx.shadowColor = bc; ctx.shadowBlur = 8; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - dxs, y - dys); ctx.lineTo(x, y); ctx.stroke();
    }
    ctx.restore();
    // ночь и свет (плоский слой для пятен света)
    ctx.fillStyle = 'rgba(6,12,28,0.40)'; ctx.fillRect(0, 0, W, H);
    ctxFlat(); drawLights(); ctxScr();
    flushLampLight();
    if (window.WL_BEH_X) WL_BEH_X.draw(ctx, { SCR, Kx, s }); // дым, огонь, растяжки (behavior/extras.js)
    // эффекты
    ctx.save();
    fx = fx.filter(f => (f.life -= dt) > 0);
    for (const f of fx) {
      const qq = SCR(f.x, f.y), t = f.life / f.max; ctx.save(); ctx.translate(qq.x, qq.y - MH(0.9)); ctx.scale(Kx * 1.2, Kx * 1.2); const x = 0, y = 0;
      const solid = f.k === 'smoke' || f.k === 'casing' || f.k === 'chip';
      ctx.globalCompositeOperation = solid ? 'source-over' : 'lighter';
      if (f.k === 'smoke') {
        f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.96; f.vy *= 0.96; const r = f.r + f.grow * (1 - t);
        const sg = ctx.createRadialGradient(x, y, 0, x, y, r); sg.addColorStop(0, 'rgba(150,164,180,' + (f.a0 * t) + ')'); sg.addColorStop(1, 'rgba(100,112,126,0)');
        ctx.globalAlpha = 1; ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      }
      else if (f.k === 'casing') { f.vy += 260 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.97; ctx.globalAlpha = Math.min(1, t * 3); ctx.fillStyle = '#8a8fa0'; ctx.fillRect(x - 1, y - 1, 3, 2); }
      else if (f.k === 'chip') { f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.92; f.vy *= 0.92; ctx.globalAlpha = t; ctx.fillStyle = '#7b8a96'; ctx.fillRect(x - 1, y - 1, 2, 2); }
      else if (f.k === 'light') { const lg = ctx.createRadialGradient(x, y, 0, x, y, 110); lg.addColorStop(0, f.color); lg.addColorStop(1, 'rgba(0,0,0,0)'); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.34 * t; ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(x, y, 110, 0, 7); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
      else if (f.k === 'boom') { const k = 1 - t, rr = f.r * Kx * 0.8 * (0.3 + k), g2 = ctx.createRadialGradient(x, y, 0, x, y, rr); g2.addColorStop(0, `rgba(255,240,180,${0.9 * t})`); g2.addColorStop(0.4, `rgba(255,150,50,${0.6 * t})`); g2.addColorStop(1, 'rgba(255,80,20,0)'); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g2; ctx.beginPath(); ctx.ellipse(x, y, rr, rr * 0.55, 0, 0, 7); ctx.fill(); }
      else if (f.k === 'flash') { ctx.fillStyle = f.color; ctx.globalAlpha = t; ctx.beginPath(); ctx.arc(x, y, 10 + 8 * (1 - t), 0, 7); ctx.fill(); }
      else if (f.k === 'spark') { f.x += f.vx * dt; f.y += f.vy * dt; ctx.fillStyle = f.color; ctx.globalAlpha = t; ctx.fillRect(x - 1.5, y - 1.5, 3, 3); }
      else if (f.k === 'ring') { ctx.strokeStyle = f.color; ctx.globalAlpha = t; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 30 * (1 - t) + 8, 0, 7); ctx.stroke(); }
      else if (f.k === 'puff') { ctx.fillStyle = '#8a84a8'; ctx.globalAlpha = t * 0.4; ctx.beginPath(); ctx.arc(x, y + 8, 4 + 6 * (1 - t), 0, 7); ctx.fill(); }
      else if (f.k === 'arc') { ctx.strokeStyle = '#f4f2ff'; ctx.globalAlpha = t; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 34, f.a - 0.6, f.a + 0.6); ctx.stroke(); }
      ctx.restore();
    }
    ctx.restore(); ctx.globalAlpha = 1;
    ctx.textAlign = 'center'; ctx.font = '700 13px "JetBrains Mono", monospace';
    floaters = floaters.filter(f => (f.life -= dt) > 0);
    for (const f of floaters) { const fq = SCR(f.x, f.y); ctx.globalAlpha = Math.min(1, f.life * 2); ctx.fillStyle = f.color; ctx.fillText(f.text, fq.x, fq.y - MH(1.9) - (0.8 - f.life) * 30); }
    ctx.globalAlpha = 1;
    if (!p.dead) drawSearch(p);
    ctxFlat(); drawFog(p); if (window.WL_VISION && insideId < 0) WL_VISION.drawFog(ctx, s, p, { cam }); if (window.WL_FEEL) WL_FEEL.drawWorld(ctx, p, { cam, zoom, W, H, mouse, t: s.t }); ctxScr();
    // экранные слои: ночь, снегопад, виньетка, прицел
    { const nk2 = nightK(s.hour == null ? 10 : s.hour); if (nk2 > 0 && s.mode !== 'base') { ctx.fillStyle = `rgba(4,9,30,${0.36 * nk2})`; ctx.fillRect(0, 0, W, H); } }
    ctx.fillStyle = 'rgba(224,243,255,0.5)';
    for (const [u, v, n] of flurries) { const x = (u * W + s.t * (10 + 22 * n)) % W, y = (v * H + s.t * (18 + 37 * n)) % H; ctx.globalAlpha = n > 0.6 ? 0.5 : 0.25; ctx.beginPath(); ctx.arc(x, y, 0.7 + n * 1.2, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
    const px = pS.x, py = pS.y - MH(0.9);
    const vg = ctx.createRadialGradient(px, py, Math.min(W, H) * 0.35, px, py, Math.max(W, H) * 0.8);
    vg.addColorStop(0, 'rgba(5,10,18,0)'); vg.addColorStop(0.55, 'rgba(5,10,18,0.25)'); vg.addColorStop(1, 'rgba(3,6,12,0.88)'); // сильное затемнение к краям экрана, как в референсе
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    if (!p.dead && !p.extracted && started) { drawAim(p); drawCompass(p); if (window.WL_FEEL) WL_FEEL.drawScreen(ctx, p, { cam, zoom, W, H, mouse: scr(p), t: s.t }); }
    { const lowHp = p.maxHp ? Math.max(0, 1 - p.hp / p.maxHp - 0.55) * 1.6 : 0, ha = Math.min(1, hurt * 2.2 + lowHp * (0.6 + 0.4 * Math.sin(s.t * 4)));
      if (ha > 0.01 && !p.dead) { const rg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.75); rg.addColorStop(0, 'rgba(150,10,20,0)'); rg.addColorStop(1, `rgba(150,10,20,${0.75 * ha})`); ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H); } } // красная виньетка при ранении и низком здоровье
    if (mode === 'raid' && !p.dead && started) { carHint(p); drawDirMarks(p, dt); }
    if (mode === 'raid' && !p.dead && started) { const hr = s.hour == null ? 10 : s.hour, hh = Math.floor(hr), mm = Math.floor((hr - hh) * 60); ctx.fillStyle = 'rgba(190,200,210,0.55)'; ctx.font = '600 13px "IBM Plex Mono", monospace'; ctx.textAlign = 'right'; ctx.fillText(String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'), W - 16, 24); ctx.textAlign = 'left'; } // часы, как в референсе
  }
  function drawSearch(p) {
    if (p.pry && !p.search) { const D = (window.WL_HOUSES_SIM && WL_HOUSES_SIM.near(s, p, 22) || {}).o; if (D) { const dq = SCR(D.x, D.y), x = dq.x, y = dq.y - MH(1.1), t = Math.min(1, p.pry.t / p.pry.need);
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.beginPath(); ctx.arc(x, y, 18, 0, 7); ctx.stroke(); ctx.strokeStyle = '#ff4d5e'; ctx.beginPath(); ctx.arc(x, y, 18, -Math.PI / 2, -Math.PI / 2 + t * Math.PI * 2); ctx.stroke();
      ctx.font = '600 11px "Chakra Petch", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#ff4d5e'; ctx.fillText('ВЗЛОМ · шум', x, y - 26); } return; }
    if (!p.search) {
      // подсказка у ближайшего контейнера
      let best = null, bd = 20; for (const c of s.containers) if (!c.searched && (c.inb == null || c.inb === insideId)) { const d = Math.hypot(c.x - p.x, c.y - p.y); if (d < bd) { bd = d; best = c; } }
      if (best) { ctx.font = '600 12px "Chakra Petch", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#f4f2ff'; { const bq = SCR(best.x, best.y); ctx.fillText(`[E] ${C.CONTAINERS[best.kind].name}`, bq.x, bq.y - 26); } }
      return;
    }
    const c = s.containers.find(q => q.id === p.search.id); if (!c) return;
    const cq = SCR(c.x, c.y), x = cq.x, y = cq.y - MH(0.9), t = Math.min(1, p.search.t / p.search.need);
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.beginPath(); ctx.arc(x, y, 18, 0, 7); ctx.stroke();
    ctx.strokeStyle = '#ffb23d'; ctx.beginPath(); ctx.arc(x, y, 18, -Math.PI / 2, -Math.PI / 2 + t * Math.PI * 2); ctx.stroke();
  }
  // Прицел: прямая линия от игрока до крестика, один вид. Тёмная обводка + светлая линия читаются на любом фоне.
  const scr = (p) => { if (!touchMode) return mouse; const A = aimWorld(p); return SCR(A.x, A.y); };
  function drawAim(p) {
    if (!S.weaponStats(p)) return;
    const po = SCR(p.x, p.y), ox = po.x, oy = po.y - MH(1.25), mx = scr(p).x, my = scr(p).y, ang = Math.atan2(my - oy, mx - ox);
    const sx = ox + Math.cos(ang) * 16, sy = oy + Math.sin(ang) * 16;
    ctx.save(); ctx.lineCap = 'round';
    const stroke = (w, col) => { ctx.lineWidth = w; ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(mx, my); ctx.stroke(); };
    stroke(4, 'rgba(7,6,11,0.75)'); stroke(1.5, '#f4f7ff');
    const cross = (w, col) => { ctx.lineWidth = w; ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(mx - 7, my - 7); ctx.lineTo(mx + 7, my + 7); ctx.moveTo(mx + 7, my - 7); ctx.lineTo(mx - 7, my + 7); ctx.stroke(); };
    cross(4.5, 'rgba(7,6,11,0.75)'); cross(2, '#f4f7ff');
    if (p.reload > 0) { ctx.font = '600 11px "JetBrains Mono", monospace'; ctx.textAlign = 'left'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(7,6,11,0.8)'; ctx.strokeText('перезарядка…', mx + 12, my + 16); ctx.fillStyle = '#f4f7ff'; ctx.fillText('перезарядка…', mx + 12, my + 16); }
    ctx.restore();
  }

  // ---------- HUD ----------
  const bar = (id, v, max) => { const el = $(id); el.style.width = Math.max(0, Math.min(100, v / max * 100)) + '%'; };
  let wHud = 0, hudOwned = false, hudT = 0, lastPanel = '', lastSlots = '';
  function hud(dt) {
    if (window.WL_HUD && WL_HUD.update) { wHud -= dt; if (wHud <= 0) { wHud = 0.08; hudOwned = WL_HUD.update(s, s.players[LOCAL], { $, S, C, mode, save }) !== false; } if (hudOwned) return; } // hud.js replaces the built-in HUD only if it returns something other than false
    hudT -= dt; if (hudT > 0) return; hudT = 0.08;
    const p = s.players[LOCAL], d = S.derived(p), ws = S.weaponStats(p);
    bar('hpF', p.hp, d.maxHp); $('hpT').textContent = `${Math.ceil(p.hp)} / ${d.maxHp}`;
    bar('stF', p.stam, d.stamMax); $('stT').textContent = Math.round(p.stam) + (p.tired ? ' !' : '');
    const hasKey = S.invCount(p, C.EXTRACTION.keyItem) > 0, G = s.map.gate, gd = Math.round(Math.hypot(G.x - p.x, G.y - p.y) / C.PX_PER_M);
    $('goal').textContent = s.mode === 'base' ? (Math.hypot(G.x - p.x, G.y - p.y) < G.r ? 'ВЫХОД В РЕЙД: ДЕРЖИ E' : 'УБЕЖИЩЕ · вход в метро: ' + NODE_NAMES[save.node] + ' (N — сменить)') : nearNode(p) ? nodeText(p, nearNode(p)) : hasKey ? (gd < G.r / C.PX_PER_M ? 'НА БЛОКПОСТЕ: ДЕРЖИ E' : `К БЛОКПОСТУ · ${gd} м`) : 'НАЙДИ ПРОПУСК НА БЛОКПОСТ';
    { const z = s.map.zones ? S.zoneAt(s, p.x, p.y) : null; $('zone').textContent = s.map.city ? (C.CITY.base + (z ? ' · ' + z.name : '')) : ''; }
    bar('fdF', p.hunger, 100); $('fdT').textContent = Math.round(p.hunger);
    bar('wtF', p.thirst, 100); $('wtT').textContent = Math.round(p.thirst);
    bar('xpF', p.xp, S.xpNeed(p.level)); $('lvl').textContent = p.level; $('xpT').textContent = `${p.xp} / ${S.xpNeed(p.level)} XP`;
    $('pts').hidden = !(p.statPts + p.skillPts); $('pts').textContent = `+${p.statPts + p.skillPts} очк. · C`;
    if (ws) {
      $('wName').textContent = ws.def.name;
      $('wAmmo').textContent = `${ws.w.mag}`; $('wRes').textContent = `/ ${S.invCount(p, ws.def.ammo)} ${C.ITEMS[ws.def.ammo].name.replace('Патроны ', '')}`;
      $('wRange').textContent = `эфф. ${Math.round(ws.eff / C.PX_PER_M)} м · предел ${Math.round(ws.max / C.PX_PER_M)} м`;
    }
    const heal = p.inv.find(it => C.ITEMS[it.id].kind === 'heal'), slotsParts = [0, 1, 2].map(i => { const w = p.weapons[i]; return hx`<span class="slot${i === p.cur ? ' on' : ''}${w ? '' : ' empty'}" data-slot="${i}"><b>${i + 1}</b>${w ? C.WEAPONS[w.id].name : '—'}</span>`; }), slotsTail = hx`<span class="slot${heal ? '' : ' empty'}" data-slot="3"><b>4</b>${heal ? C.ITEMS[heal.id].name + ' ×' + heal.n : '—'}</span>`, slotsHtml = hx`${slotsParts}${slotsTail}`, slotsKey = String(slotsHtml);
    if (slotsKey !== lastSlots) { lastSlots = slotsKey; setHtml($('slots'), slotsHtml); }
    const A = C.ABILITIES.adrenaline;
    $('abil').textContent = p.adren > 0 ? `${A.name} · ${p.adren.toFixed(1)} с` : p.adrenCd > 0 ? `${A.name} · ${Math.ceil(p.adrenCd)} с` : `[Q] ${A.name} готов`;
    $('abil').className = 'abil' + (p.adren > 0 ? ' act' : p.adrenCd > 0 ? '' : ' ready');
    const wgt = S.invWeight(p); $('wgt').textContent = `${wgt.toFixed(1)} / ${d.carry} кг`; $('wgt').className = wgt > d.carry ? 'warn' : '';
    $('enemies').textContent = `Враги: ${s.enemies.length} · Убито: ${p.kills}`;
    renderPanels(p, d);
  }
  const NODE_NAMES = { n0: 'Метро «Павлов Яр»', n1: 'Метро «Частный сектор»', n2: 'Метро «Набережная»' };
  function cycleNode() { const ids = Object.keys(NODE_NAMES).filter(k => save.nodes[k]), i = ids.indexOf(save.node); save.node = ids[(i + 1) % ids.length]; persist(); toast(`Вход в метро: ${NODE_NAMES[save.node]} (N — сменить; открыто ${ids.length} из 3)`, true); }
  function baseInteract() {
    if (!started || mode !== 'base' || !$('prep').hidden) return; const q = nearPoint(s.players[LOCAL]); if (!q) return;
    if (q.id === 'trader') { $('char').hidden = true; $('inv').hidden = true; WL_SHOP.open(); return; }
    if (q.id === 'stash') { $('char').hidden = true; $('inv').hidden = true; if (!save.pick) autoPick(); renderPrep(); $('prep').hidden = false; } else togglePanel('char');
  }
  const nearNode = (p) => s.mode === 'base' ? null : s.map.nodes.find(n => Math.hypot(n.x - p.x, n.y - p.y) < n.r);
  const nodeText = (p, n) => n.open ? (p.evacLock > 0 ? `ВХОД ЗАБЛОКИРОВАН ${Math.ceil(p.evacLock)} с` : 'ВХОД В МЕТРО: ДЕРЖИ E 15 с — АВАРИЙНЫЙ ВЫХОД') : 'ВХОД ЗАКРЫТ: ДЕРЖИ E 3 с, ЧТОБЫ ОТКРЫТЬ';
  function nearPoint(p) { return (s.map.points || []).find(q => Math.hypot(q.x - p.x, q.y - p.y) < q.r); }
  $('tCar').addEventListener('pointerdown', (e) => { e.preventDefault(); if (mode === 'raid') actions.push({ pid: LOCAL, type: 'veh' }); });
  function updTouchBtn() { const b2 = $('tCar'); if (b2) b2.hidden = !(touchMode && started && mode === 'raid' && $('inv').hidden && $('char').hidden); const b = $('tSearch'); if (b) b.hidden = !(touchMode && started && (mode === 'raid' || mode === 'base') && $('inv').hidden && $('char').hidden && $('prep').hidden); }
  setInterval(updTouchBtn, 200);
  function nearInteract(p) { if (p.dead) return false; const G = s.map.gate; if (s.mode === 'base') return !!nearPoint(p); return !!nearNode(p) || Math.hypot(G.x - p.x, G.y - p.y) < G.r || s.containers.some(c => !c.searched && Math.hypot(c.x - p.x, c.y - p.y) < 48); }
  // Фокус: кнопки панелей не должны забирать клавиатуру, а после закрытия меню фокус возвращается на игру — движение работает сразу, без клика.
  function refocus() { try { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); window.focus(); cv.focus({ preventScroll: true }); } catch (_) { /* нет фокуса */ } }
  document.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
  document.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
  function togglePanel(id) { const el = $(id), other = $(id === 'inv' ? 'char' : 'inv'); el.hidden = !el.hidden; if (!el.hidden) other.hidden = true; lastPanel = ''; mouse.down = false; if (el.hidden) refocus(); }
  function renderPanels(p, d) {
    let html = null, target = null;
    if (!$('inv').hidden) {
      target = 'invBody';
      const rows = p.inv.map((it, i) => {
        const def = C.ITEMS[it.id];
        const btn = def.kind === 'heal' || def.kind === 'food' ? hx`<button data-a="use" data-i="${i}">Использовать</button>` : def.kind === 'weapon' ? hx`<button data-a="equip" data-i="${i}">В руки (слот ${p.cur + 1})</button>` : def.kind === 'attach' ? hx`<button data-a="attach" data-i="${i}">Установить</button>` : '';
        return hx`<tr><td class="k-${def.kind}">${def.name}</td><td class="num">${it.n}</td><td class="num">${(def.w * it.n).toFixed(1)}</td><td class="act">${btn}<button class="ghost" data-a="drop" data-i="${i}">Выбросить</button></td></tr>`;
      });
      const wpns = p.weapons.map((w, i) => {
        const def = C.WEAPONS[w.id], m = S.attachMods(w);
        const atts = Object.keys(w.att || {}).map(sl => hx`<button class="ghost" data-a="detach" data-k="${sl}"${i === p.cur ? '' : ' disabled'}>снять: ${C.ITEMS[w.att[sl]].name}</button>`);
        return hx`<li><b>${i + 1}</b> ${def.name} <span>${w.mag}/${def.mag} · ${C.ITEMS[def.ammo].name} · эфф. ${Math.round(def.eff * d.rangeMul * m.eff / C.PX_PER_M)} м</span> ${atts}</li>`;
      });
      html = hx`<ul class="wl">${wpns}</ul><table><thead><tr><th>Предмет</th><th class="num">Шт.</th><th class="num">Кг</th><th></th></tr></thead><tbody>${rows.length ? rows : hx`<tr><td colspan="4" class="muted">Пусто. Обыскивай ящики, шкафчики и багажники клавишей E.</td></tr>`}</tbody></table>
        <p class="muted">Вес: ${S.invWeight(p).toFixed(1)} из ${d.carry} кг. Перегруз снижает скорость на 40%. Металлолом, провода и неон-ячейки пойдут на строительство базы.</p>`;
    } else if (!$('char').hidden) {
      target = 'charBody';
      const st = Object.keys(C.STATS.names).map(k => hx`<tr><td>${C.STATS.names[k]}<small>${C.STATS.hint[k]}</small></td><td class="num">${p.stats[k]}</td><td>${p.statPts > 0 && mode === 'base' && p.stats[k] < C.STATS.max ? hx`<button data-a="stat" data-k="${k}">+</button>` : ''}</td></tr>`);
      const sk = Object.keys(C.SKILLS.names).map(k => hx`<tr><td>${C.SKILLS.names[k]}<small>${C.SKILLS.hint[k]}</small></td><td class="num">${p.skills[k]}</td><td>${p.skillPts > 0 && mode === 'base' && p.skills[k] < C.SKILLS.max ? hx`<button data-a="skill" data-k="${k}">+</button>` : ''}</td></tr>`);
      html = hx`<p class="lv">Уровень ${p.level} · ${p.xp}/${S.xpNeed(p.level)} XP</p>
        <h3>Характеристики <span>${p.statPts ? hx`свободно: ${p.statPts}` : ''}</span></h3><table>${st}</table>
        <h3>Навыки <span>${p.skillPts ? hx`свободно: ${p.skillPts}` : ''}</span></h3><table>${sk}</table>
        <h3>Способность</h3><p class="muted">[Q] ${C.ABILITIES.adrenaline.name}: ${C.ABILITIES.adrenaline.dur} с ×${C.ABILITIES.adrenaline.speed} скорость, быстрее перезарядка. Перезарядка ${C.ABILITIES.adrenaline.cd} с.</p>
        <h3>Итог</h3><dl><dt>Здоровье</dt><dd>${d.maxHp}</dd><dt>Переносимый вес</dt><dd>${d.carry} кг</dd><dt>Скорость</dt><dd>${(d.speed / C.PX_PER_M).toFixed(1)} м/с</dd><dt>Дальность</dt><dd>×${d.rangeMul.toFixed(2)}</dd><dt>Разброс</dt><dd>×${d.spreadMul.toFixed(2)}</dd><dt>Удар прикладом</dt><dd>${d.melee}</dd></dl>`;
    }
    { const key = html == null ? '' : String(html); if (target && key !== lastPanel) { setHtml($(target), html); lastPanel = key; } }
  }
  document.addEventListener('click', (e) => {

    const b = e.target.closest('button[data-a]'); if (!b) return;
    actions.push({ pid: LOCAL, type: b.dataset.a, idx: b.dataset.i != null ? +b.dataset.i : undefined, key: b.dataset.k });
    lastPanel = '';
  });
  // панель «КОНТЕЙНЕР» после обыска (как вкладка контейнера в референсе): название, найденные предметы, исчезает через 5 с или по любой клавише
  let foundEl = null, foundT = 0;
  function showFound(ev) {
    if (!foundEl) {
      const st = document.createElement('style'); st.textContent = '#found{position:fixed;right:18px;top:50%;transform:translateY(-50%);min-width:210px;max-width:260px;background:rgba(10,14,12,.93);border:1px solid #2b3a33;border-top:3px solid #c9b07a;padding:10px 12px;z-index:30;font:13px "IBM Plex Mono",monospace;color:#cdd6d0;pointer-events:none;transition:opacity .3s}#found h4{margin:0 0 8px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#c9b07a}#found div{display:flex;justify-content:space-between;gap:10px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.06)}#found div b{color:#e9eee8;font-weight:600}#found .e{color:#7f8a83}';
      document.head.appendChild(st); foundEl = document.createElement('div'); foundEl.id = 'found'; document.body.appendChild(foundEl);
    }
    foundEl.replaceChildren(el_('h4', null, ev.name || 'Контейнер'), ...(ev.items.length ? ev.items.map(([n, k]) => el_('div', null, el_('span', null, n), el_('b', null, '×' + k))) : [el_('div', { class: 'e' }, 'Пусто')]));
    foundEl.style.opacity = '1'; foundEl.hidden = false; foundT = performance.now() + 5000;
    setTimeout(() => { if (foundEl && performance.now() >= foundT - 50) foundEl.style.opacity = '0'; }, 5100);
  }
  function toast(text, hot) {
    const el = document.createElement('div'); el.className = 'toast' + (hot ? ' hot' : ''); el.textContent = text;
    $('toasts').prepend(el); setTimeout(() => el.remove(), 2800);
    while ($('toasts').children.length > 6) $('toasts').lastChild.remove();
  }
  // ---------- конец рейда и подготовка к следующему ----------
  function finishRaid(success) {
    if (ended) return; ended = true; mouse.down = false; tMove.x = tMove.y = tAim.x = tAim.y = 0;
    const p = s.players[LOCAL], brought = SV.applyRaid(save, p, success, C);
    persist();
    $('resTitle').textContent = success ? 'Эвакуация завершена' : 'Ты погиб';
    $('resTitle').className = success ? 'ok' : '';
    $('deadStats').textContent = `Уровень ${p.level} · убито ${p.kills} · обыскано ${p.looted} · время ${Math.floor(s.t / 60)} мин ${Math.floor(s.t % 60)} с`;
    $('resList').replaceChildren(el_('h3', null, success ? 'Унесено в убежище' : 'Потеряно'), el_('p', null, success ? (brought.join(' · ') || 'ничего') : 'Всё, что было при тебе в рейде. Склад убежища цел, уровень и характеристики остались.'));
    $('restart').textContent = 'В убежище';
    $('dead').hidden = false;
  }
  const stashW = (id) => (C.ITEMS[id] || { w: 0 }).w;
  function autoPick() {
    const pk = { w: [0, 1].filter(i => i < save.stash.weapons.length), items: {} }, take = (id, n) => { const have = save.stash.items[id] || 0; if (have > 0) pk.items[id] = Math.min(have, n); };
    for (const i of pk.w) take(C.WEAPONS[save.stash.weapons[i].id].ammo, 48);
    take('bandage', 2); take('medkit', 1); take('water', 1); take('food', 1);
    save.pick = pk;
  }
  function enterBase() {
    ended = false; $('intro').hidden = true; $('dead').hidden = true; $('inv').hidden = true; $('char').hidden = true; $('prep').hidden = true;
    if (!save.stash.weapons.length) { for (const w of C.META.rescueKit.weapons) save.stash.weapons.push(clone(w)); for (const id in C.META.rescueKit.items) save.stash.items[id] = (save.stash.items[id] || 0) + C.META.rescueKit.items[id]; save.pick = null; }
    if (!save.pick) autoPick();
    save.pick.w = save.pick.w.filter(i => i < save.stash.weapons.length);
    for (const id in save.pick.items) save.pick.items[id] = Math.max(0, Math.min(save.pick.items[id], save.stash.items[id] || 0));
    persist(); boot({ char: clone(save.char), inv: [], weapons: [] }, true); started = true; if (!ac) audioInit();
    toast('Убежище: склад — сундук в доме (E), прокачка — терминал (E), в рейд — калитка на севере', true);
  }
  function renderPrep() {
    const pk = save.pick, d = S.derived({ stats: save.char.stats, skills: save.char.skills });
    let wgt = 0; for (const i of pk.w) wgt += stashW(save.stash.weapons[i].id); for (const id in pk.items) wgt += stashW(id) * pk.items[id];
    const wrows = save.stash.weapons.map((w, i) => { const on = pk.w.includes(i), def = C.WEAPONS[w.id], at = Object.keys(w.att || {}).map(k => C.ITEMS[w.att[k]].name).join(', ');
      return hx`<tr><td class="k-weapon">${def.name}<small>${at || 'без навесного'} · ${C.ITEMS[def.ammo].name}</small></td><td class="num">${C.ITEMS[w.id].w}</td><td class="act"><button data-p="w" data-i="${i}" class="${on ? '' : 'ghost'}">${on ? 'Берёшь' : 'Взять'}</button></td></tr>`; });
    const ids = Object.keys(save.stash.items).filter(id => save.stash.items[id] > 0 && C.META.carryKinds.includes(C.ITEMS[id].kind));
    const irows = ids.map(id => hx`<tr><td class="k-${C.ITEMS[id].kind}">${C.ITEMS[id].name}</td><td class="num">${save.stash.items[id]}</td><td class="act"><button class="ghost" data-p="dec" data-id="${id}">−</button> <span class="num">${pk.items[id] || 0}</span> <button class="ghost" data-p="inc" data-id="${id}">+</button> <button class="ghost" data-p="all" data-id="${id}">все</button></td></tr>`);
    const mats = Object.keys(save.stash.items).filter(id => save.stash.items[id] > 0 && !C.META.carryKinds.includes(C.ITEMS[id].kind)).map(id => `${C.ITEMS[id].name} ${save.stash.items[id]}`).join(' · ');
    setHtml($('prepBody'), hx`<p class="lv">Уровень ${save.char.level} · рейдов ${save.raids.n} · вышел ${save.raids.out} · погиб ${save.raids.died}</p>
      <h3>Оружие со склада <span>до 3 стволов</span></h3><table><tbody>${wrows}</tbody></table>
      <h3>Снаряжение <span>склад · в рейд</span></h3><table><tbody>${irows.length ? irows : hx`<tr><td class="muted">Склад пуст.</td></tr>`}</tbody></table>
      <p class="${wgt > d.carry ? 'warn' : 'muted'}">Вес: ${wgt.toFixed(1)} из ${d.carry} кг${wgt > d.carry ? ': перегруз, бег и движение медленнее' : ''}</p>
      ${mats ? hx`<p class="muted">На базе (для стройки): ${mats}</p>` : ''}`);
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-p]'); if (!b) return; const pk = save.pick, id = b.dataset.id, st = save.stash.items[id] || 0;
    if (b.dataset.p === 'w') { const i = +b.dataset.i, at = pk.w.indexOf(i); if (at >= 0) pk.w.splice(at, 1); else if (pk.w.length < 3) pk.w.push(i); }
    else if (b.dataset.p === 'inc') pk.items[id] = Math.min(st, (pk.items[id] || 0) + (C.ITEMS[id].kind === 'ammo' ? 12 : 1));
    else if (b.dataset.p === 'dec') pk.items[id] = Math.max(0, (pk.items[id] || 0) - (C.ITEMS[id].kind === 'ammo' ? 12 : 1));
    else if (b.dataset.p === 'all') pk.items[id] = st;
    persist(); renderPrep();
  });
  // Перед каждым рейдом — экран выбора банды (район, одежда, оружие, кто враждебен); игра на паузе.
  let picking = false;
  function startRaid() {
    if (!window.WL_START || !WL_START.mountGang) { launchRaid(); return; }
    if (!save.pick) autoPick();
    picking = true; mouse.down = false; $('gang').hidden = false;
    if (!gangUI) gangUI = WL_START.mountGang($('gangPick')); else gangUI.refresh();
  }
  let gangUI = null;
  function launchRaid() {
    if (!save.pick) autoPick();
    const pk = save.pick, load = { char: clone(save.char), inv: [], weapons: [] }, kit = window.WL_START && WL_START.gangById ? WL_START.gangById(WL_START.gang()).kit : null;
    if (kit) { for (const w of kit.weapons) load.weapons.push(clone(w)); for (const [id, n] of kit.inv) load.inv.push([id, n]); } // снаряжение банды: выдаётся бесплатно
    pk.w = pk.w.slice(0, Math.max(0, 3 - load.weapons.length)); for (const i of pk.w) load.weapons.push(clone(save.stash.weapons[i]));
    for (const id in pk.items) if (pk.items[id] > 0) { load.inv.push([id, pk.items[id]]); save.stash.items[id] -= pk.items[id]; }
    const took = pk.w.slice(); save.stash.weapons = save.stash.weapons.filter((w, i) => !took.includes(i)); save.pick = null; save.raids.n++; persist();
    boot(load, false, save.node); started = true; ended = false; $('prep').hidden = true; $('gang').hidden = true; picking = false; if (!ac) audioInit(); refocus();
  }
  document.addEventListener('click', (e) => { if (e.target && e.target.id === 'gangGo') launchRaid(); if (e.target && e.target.id === 'gangBack') { $('gang').hidden = true; picking = false; const q = s && s.players[LOCAL]; if (q && s.mode === 'base') { q.y += 60; q.extract = 0; } refocus(); } });
  // старт: интро-текст, выбор района, торговец
  if (window.WL_START) { WL_START.applyIntro(); }
  if (window.WL_SHOP) WL_SHOP.mount({ save: () => save, persist, toast, C, onClose: refocus });
  $('restart').addEventListener('click', enterBase);
  $('start').addEventListener('click', enterBase);
  $('go').addEventListener('click', () => { $('prep').hidden = true; refocus(); });

  // ---------- цикл ----------
  let last = performance.now(), acc = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (started && !ended && !picking) {
      acc += dt;
      if (mode === 'raid' && window.WL_HOUSES_SIM && WL_HOUSES_SIM.pryTick) { const pp = s.players[LOCAL], pr = WL_HOUSES_SIM.pryTick(s, pp, dt, keys.has('KeyE') && !pp.search); if (pr && pr.done) { toast(pr.text, true); sfx(520, 0.25, 0.14); } }
      let cmd = readCmd(), n = 0;
      while (acc >= TICK && n < 6) {
        const had = actions.length; S.step(s, { [LOCAL]: cmd }, actions.splice(0), TICK);
        if (had && mode === 'base') { const q = s.players[LOCAL]; save.char = { level: q.level, xp: q.xp, stats: clone(q.stats), skills: clone(q.skills), statPts: q.statPts, skillPts: q.skillPts }; persist(); }
        cmd = Object.assign({}, cmd, { reload: false, ability: false, slot: null, melee: false });
        acc -= TICK; n++;
      }
      if (n === 6) acc = 0;
      consumeEvents();
      hud(dt);
    }
    if (window.WL_MAP) WL_MAP.tick(s, s.players[LOCAL], started && !ended && !picking);
    render(dt);
    requestAnimationFrame(frame);
  }
  boot(null, true); // фон заставки
  window.WL_DEBUG = { startRaid, enterBase, get s() { return s; }, SCR, tryUse, get cam() { return cam; } };
  requestAnimationFrame(frame);
})();
