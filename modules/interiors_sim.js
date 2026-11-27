// Block-96: houses, sim side (no DOM, no Math.random). Thread "Сделать дома играбельными".
// Loaded after sim.js (or before it: it only needs window). Pure layout generation + building of colliders/containers
// + runtime state (doors, windows, bullet marks). See modules/houses/NOTE.md for the wiring patch.
//
// Units: layout in METRES in the building frame (origin = building centre, x along width `w`, y along depth `d`);
// world px = 10 px per metre, frame rotated by building angle (u=(cos a, sin a), v=(-sin a, cos a)).
// Face / poly-edge indices as in sim.js: 0 = -v side (y=-d/2), 1 = +u (x=+w/2), 2 = +v (y=+d/2), 3 = -u (x=-w/2).
'use strict';
(function () {
  const P = 10, FH = 2.8;
  const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
  const hsh = (a, b) => { let h = Math.imul((a | 0) ^ 0x9e3779b9, 374761393) + Math.imul((b | 0) + 0x7f4a7c15, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  function rngOf(seed) { let a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // exterior wall thickness (m) per building kind: sim.js must use the same value for `inner`
  const wallT = (kind) => kind === 'industrial' ? 0.6 : kind === 'warehouse' ? 0.5 : (kind === 'panel' || kind === 'civic') ? 0.6 : 0.5;
  const isEnterable = (kind, w, d) => kind === 'industrial' || kind === 'warehouse' || ((kind === 'house' || kind === 'panel') && w >= 6.4 && d >= 5.4) || ((kind === 'shed') && w >= 3.6 && d >= 3.4) || kind === 'garage_row' || (kind === 'civic' && w >= 8 && d >= 6);

  // ---------- furniture catalogue (metres): w along its own x, d along its own y, h height; cont: container kind (config CONTAINERS) ----------
  const F = {
    bed: [1.5, 2.0, 0.55], bed1: [0.95, 1.95, 0.5], wardrobe: [1.2, 0.55, 2.0, 'locker'], night: [0.45, 0.4, 0.5], sofa: [1.9, 0.9, 0.8], tv: [1.0, 0.5, 0.55],
    table: [1.1, 0.8, 0.75], chair: [0.45, 0.45, 0.9], fridge: [0.62, 0.65, 1.8, 'locker'], stove: [0.6, 0.6, 0.9], counter: [1.5, 0.6, 0.9, 'crate'], sinkk: [1.0, 0.6, 0.9],
    bath: [1.7, 0.75, 0.6], toilet: [0.4, 0.7, 0.45], basin: [0.55, 0.45, 0.9], shelf: [1.0, 0.38, 1.9, 'crate'], shoes: [0.8, 0.3, 0.5], coat: [0.7, 0.3, 1.8], boxes: [0.7, 0.55, 0.55, 'crate'],
    mailbox: [0.28, 1.2, 1.5, 'entrance'], cabinet: [0.9, 0.45, 1.1, 'locker'],rack: [2.4, 0.6, 2.3, 'crate'], pallet: [1.2, 0.8, 0.2], crate: [0.8, 0.8, 0.8, 'crate'], bench: [2.0, 0.8, 0.95, 'crate'], pillar: [0.45, 0.45, 3.2],
    desk: [1.4, 0.7, 0.75], car: [4.3, 1.85, 1.45, 'car'], barrel: [0.6, 0.6, 0.9], stairs: [1.1, 2.6, 0.6], drum: [0.6, 0.6, 1.0], tires: [0.7, 0.7, 0.7], locker2: [0.5, 0.5, 1.8, 'locker'],
  };
  const KINDCOL = { mailbox: '#4f6f9a', bed:'#6b5a74', bed1: '#5d6a78', wardrobe: '#6a4c34', night: '#6a4c34', sofa: '#7a4a4a', tv: '#2b3138', table: '#7a5a3a', chair: '#6a4c34', fridge: '#b9c2c6', stove: '#a8b0b3', counter: '#6d5a44', sinkk: '#a8b0b3', bath: '#c4cfd2', toilet: '#d4dcde', basin: '#cfd8da', shelf: '#5a4a38', shoes: '#4a4036', coat: '#4a3a30', boxes: '#8a7650', cabinet: '#5c4a38', rack: '#566348', pallet: '#8a7650', crate: '#7d7650', bench: '#5a5f66', pillar: '#7a8086', desk: '#6a5640', car: '#7a3a3a', barrel: '#4a5560', stairs: '#7a7466', drum: '#4a5560', tires: '#22282d', locker2: '#4f6a73' };

  // ---------- 2D helpers on layout rects {x0,y0,x1,y1} ----------
  const ov = (a, b, g) => a.x0 < b.x1 + (g || 0) && a.x1 > b.x0 - (g || 0) && a.y0 < b.y1 + (g || 0) && a.y1 > b.y0 - (g || 0);
  const inR = (a, b, m) => a.x0 >= b.x0 - (m || 0) && a.x1 <= b.x1 + (m || 0) && a.y0 >= b.y0 - (m || 0) && a.y1 <= b.y1 + (m || 0);

  // ---------- partition of a region into rooms ----------
  function bsp(R, rnd, o, leaves, splits) {
    const w = R.x1 - R.x0, d = R.y1 - R.y0, area = w * d, m = o.min;
    const canV = w >= 2 * m, canH = d >= 2 * m;
    if ((!canV && !canH) || area <= o.maxA * (0.55 + 0.9 * rnd())) { leaves.push(R); return; }
    let v; if (canV && canH) v = w / d > 1.2 ? true : d / w > 1.2 ? false : rnd() < 0.5; else v = canV;
    const len = v ? w : d, t = m + (len - 2 * m) * (0.3 + 0.4 * rnd()), pos = r1((v ? R.x0 : R.y0) + t);
    const A = v ? { x0: R.x0, y0: R.y0, x1: pos, y1: R.y1 } : { x0: R.x0, y0: R.y0, x1: R.x1, y1: pos };
    const B = v ? { x0: pos, y0: R.y0, x1: R.x1, y1: R.y1 } : { x0: R.x0, y0: pos, x1: R.x1, y1: R.y1 };
    splits.push({ run: v ? 'y' : 'x', pos, a0: v ? R.y0 : R.x0, a1: v ? R.y1 : R.x1 });
    bsp(A, rnd, o, leaves, splits); bsp(B, rnd, o, leaves, splits);
  }
  // overlap intervals of rooms on both sides of a wall line
  function sideIntervals(wall, leaves) {
    const e = 1e-6, A = [], B = [];
    for (const l of leaves) {
      if (wall.run === 'y') { if (l.y1 <= wall.a0 + e || l.y0 >= wall.a1 - e) continue; if (Math.abs(l.x1 - wall.pos) < e) A.push([Math.max(l.y0, wall.a0), Math.min(l.y1, wall.a1), l]); else if (Math.abs(l.x0 - wall.pos) < e) B.push([Math.max(l.y0, wall.a0), Math.min(l.y1, wall.a1), l]); }
      else { if (l.x1 <= wall.a0 + e || l.x0 >= wall.a1 - e) continue; if (Math.abs(l.y1 - wall.pos) < e) A.push([Math.max(l.x0, wall.a0), Math.min(l.x1, wall.a1), l]); else if (Math.abs(l.y0 - wall.pos) < e) B.push([Math.max(l.x0, wall.a0), Math.min(l.x1, wall.a1), l]); }
    }
    const out = []; for (const a of A) for (const b of B) { const s0 = Math.max(a[0], b[0]), s1 = Math.min(a[1], b[1]); if (s1 - s0 > 0.05) out.push({ s0, s1, A: a[2], B: b[2] }); }
    return out;
  }

  // ---------- layout builder ----------
  const ENTRY_W = 1.2; // v77: entry doorway width in metres (was 1.0): rotated houses rasterise jambs in 5 px squares and left a 7-8 px gap for a 7 px player
  function newLayout(spec) { return { id: spec.id, kind: spec.kind, w: spec.w, d: spec.d, T: wallT(spec.kind), rooms: [], walls: [], doors: [], wins: [], furn: [], entry: null, nid: 1 }; }
  const nid = (L, p) => p + (L.nid++);
  function addWall(L, run, pos, a0, a1, th, ext, face) { const w = { id: nid(L, 'w'), run, pos: r2(pos), a0: r2(a0), a1: r2(a1), th, ext: !!ext, face: face == null ? -1 : face, ops: [] }; L.walls.push(w); return w; }
  const wallRect = (wl, s0, s1) => wl.run === 'x' ? { x0: s0, y0: wl.pos - wl.th / 2, x1: s1, y1: wl.pos + wl.th / 2 } : { x0: wl.pos - wl.th / 2, y0: s0, x1: wl.pos + wl.th / 2, y1: s1 };
  function addDoor(L, wl, s, wd, o) { const d = Object.assign({ id: nid(L, 'd'), wall: wl.id, run: wl.run, pos: wl.pos, th: wl.th, s: r2(s), wd, ext: wl.ext, face: wl.face, kind: 'door', z1: 2.1 }, o || {}); L.doors.push(d); wl.ops.push({ s0: s - wd / 2, s1: s + wd / 2 }); return d; }
  function addWin(L, wl, s, wd, o) { const k = Object.assign({ id: nid(L, 'n'), wall: wl.id, run: wl.run, pos: wl.pos, th: wl.th, s: r2(s), wd, face: wl.face, z0: 0.9, z1: 2.1 }, o || {}); L.wins.push(k); wl.ops.push({ s0: s - wd / 2, s1: s + wd / 2 }); return k; }

  // a residential unit (private house / flat / shed) inside rect R. o: {min,maxA,ext:[N,E,S,W],entry:{wall,face},rooms}
  function unit(L, R, rnd, o) {
    const leaves = [], splits = []; bsp(R, rnd, o, leaves, splits);
    const iw = [];
    for (const sp of splits) { const wl = addWall(L, sp.run, sp.pos, sp.a0, sp.a1, 0.14, false); iw.push(wl); }
    // doors between rooms: one per split, in the longest overlap of the rooms on both sides
    for (const wl of iw) {
      const iv = sideIntervals(wl, leaves).sort((a, b) => (b.s1 - b.s0) - (a.s1 - a.s0));
      if (!iv.length) continue; const q = iv[0], len = q.s1 - q.s0; if (len < 0.85) continue;
      const wd = Math.min(1.1, len - 0.2), jit = Math.max(0, (len - wd - 0.3) / 2);
      addDoor(L, wl, (q.s0 + q.s1) / 2 + (rnd() - 0.5) * jit, wd, { open: rnd() < 0.7 ? 1 : 0 });
    }
    // entry: the room with the widest contact with the entry face
    const eFace = o.entry ? o.entry.face : -1; let hall = null;
    if (o.entry) {
      const wl = o.entry.wall, cands = [];
      for (const l of leaves) {
        let s0, s1; if (eFace === 0 && Math.abs(l.y0 - R.y0) < 1e-6) { s0 = l.x0; s1 = l.x1; } else if (eFace === 2 && Math.abs(l.y1 - R.y1) < 1e-6) { s0 = l.x0; s1 = l.x1; }
        else if (eFace === 3 && Math.abs(l.x0 - R.x0) < 1e-6) { s0 = l.y0; s1 = l.y1; } else if (eFace === 1 && Math.abs(l.x1 - R.x1) < 1e-6) { s0 = l.y0; s1 = l.y1; } else continue;
        const hw = o.entry.wd / 2 + 0.15;
        if (o.entry.at != null) { if (o.entry.at - hw >= s0 && o.entry.at + hw <= s1) cands.push({ l, s0, s1, at: o.entry.at, sc: 1 }); }
        else if (s1 - s0 >= o.entry.wd + 0.5) cands.push({ l, s0, s1, sc: (s1 - s0) + rnd() * 1.2 });
      }
      cands.sort((a, b) => b.sc - a.sc); const c = cands[0];
      if (c) { hall = c.l; const mid = (c.s0 + c.s1) / 2, j = Math.max(0, (c.s1 - c.s0 - o.entry.wd - 0.8) / 2); const ed0 = addDoor(L, wl, c.at != null ? c.at : mid + (rnd() - 0.5) * j, o.entry.wd, Object.assign({ entry: !o.flat, open: o.flat ? (rnd() < 0.5 ? 1 : 0) : 0 }, o.entry.opts || {})); ed0.room = hall; if (!o.flat) L.entry = ed0; }
    }
    // windows on exterior sides
    const ext = o.ext || [false, false, false, false];
    for (const l of leaves) for (let f = 0; f < 4; f++) {
      if (!ext[f]) continue; const wl = o.extWalls[f]; if (!wl) continue;
      let s0, s1; if (f === 0 && Math.abs(l.y0 - R.y0) < 1e-6) { s0 = l.x0; s1 = l.x1; } else if (f === 2 && Math.abs(l.y1 - R.y1) < 1e-6) { s0 = l.x0; s1 = l.x1; }
      else if (f === 3 && Math.abs(l.x0 - R.x0) < 1e-6) { s0 = l.y0; s1 = l.y1; } else if (f === 1 && Math.abs(l.x1 - R.x1) < 1e-6) { s0 = l.y0; s1 = l.y1; } else continue;
      const span = s1 - s0; if (span < 1.9) continue;
      const wd = l === hall ? 0.8 : 1.3, n = Math.max(1, Math.floor(span / 3.4));
      for (let k = 0; k < n; k++) {
        const s = s0 + (k + 0.5) * span / n;
        if (L.doors.some(dd => dd.wall === wl.id && Math.abs(dd.s - s) < dd.wd / 2 + wd / 2 + 0.5)) continue;
        if (l === hall && n === 1 && span < 3) continue;
        addWin(L, wl, s, wd, { room: l });
      }
    }
    // room types
    const rooms = leaves.map((l, i) => ({ id: nid(L, 'r'), x0: l.x0, y0: l.y0, x1: l.x1, y1: l.y1, type: 'room', _l: l, area: (l.x1 - l.x0) * (l.y1 - l.y0) }));
    for (const r of rooms) if (r._l === hall) r.type = 'hall';
    const rest = rooms.filter(r => r.type !== 'hall').sort((a, b) => b.area - a.area);
    if (rooms.length === 1) rooms[0].type = o.single || 'studio';
    else {
      if (rest.length) rest[0].type = o.flat ? 'bedroom' : 'living';
      if (rest.length > 1) rest[1].type = 'kitchen';
      if (rest.length > 2) { rest[rest.length - 1].type = 'bath'; for (let k = 2; k < rest.length - 1; k++) rest[k].type = k % 2 ? 'storage' : 'bedroom'; }
      if (rest.length === 2) rest[1].type = 'kitchen';
      if (rest.length >= 3 && o.flat) rest[0].type = 'living';
    }
    if (!hall && rooms.length > 1) { /* no entry here (flat reached by door in party wall is handled by caller) */ }
    for (const r of rooms) { delete r._l; L.rooms.push(r); }
    return { leaves, rooms, hall };
  }

  // ---------- furnishing ----------
  const WANT = {
    hall: ['shoes', 'coat'], living: ['sofa', 'tv', 'table'], bedroom: ['bed', 'wardrobe'], kitchen: ['fridge', 'stove', 'sinkk', 'table'],
    bath: ['bath', 'toilet'], storage: ['shelf', 'boxes'], studio: ['bed', 'table', 'stove'], room: ['shelf'], store: ['shelf', 'boxes'],
  };
  function furnish(L, rnd, rooms, allDoors) {
    const blockers = []; // door clearance zones
    for (const dd of allDoors) { const hw = dd.wd / 2 + 0.25, dep = 0.95; blockers.push(dd.run === 'x' ? { x0: dd.s - hw, x1: dd.s + hw, y0: dd.pos - dep, y1: dd.pos + dep } : { x0: dd.pos - dep, x1: dd.pos + dep, y0: dd.s - hw, y1: dd.s + hw }); }
    for (const wn of L.wins) { const hw = wn.wd / 2; blockers.push(wn.run === 'x' ? { x0: wn.s - hw, x1: wn.s + hw, y0: wn.pos - 0.5, y1: wn.pos + 0.5 } : { x0: wn.pos - 0.5, x1: wn.pos + 0.5, y0: wn.s - hw, y1: wn.s + hw }); }
    for (const f of L.furn) blockers.push(f);
    for (const r of rooms) {
      const list = (WANT[r.type] || WANT.room).slice();
      const inner = { x0: r.x0 + 0.18, y0: r.y0 + 0.18, x1: r.x1 - 0.18, y1: r.y1 - 0.18 };
      let placed = 0; const maxN = Math.min(list.length, Math.max(1, Math.floor(r.area / (L.kind === 'panel' ? 12 : 10)) + 1)); // больше свободной площади, особенно в панельках
      for (const kind of list) {
        if (placed >= maxN) break; const def = F[kind]; if (!def) continue;
        for (let t = 0; t < 24; t++) {
          const rot = rnd() < 0.5 ? 0 : 1, w = rot ? def[1] : def[0], d = rot ? def[0] : def[1];
          const rw = inner.x1 - inner.x0, rd = inner.y1 - inner.y0; if (w > rw || d > rd) continue;
          // stick to a random wall of the room
          const side = Math.floor(rnd() * 4); let x0, y0;
          if (side === 0) { y0 = inner.y0; x0 = inner.x0 + rnd() * (rw - w); } else if (side === 2) { y0 = inner.y1 - d; x0 = inner.x0 + rnd() * (rw - w); }
          else if (side === 3) { x0 = inner.x0; y0 = inner.y0 + rnd() * (rd - d); } else { x0 = inner.x1 - w; y0 = inner.y0 + rnd() * (rd - d); }
          if (kind === 'chair' || kind === 'table') { x0 = inner.x0 + 0.5 + rnd() * Math.max(0, rw - w - 1); y0 = inner.y0 + 0.5 + rnd() * Math.max(0, rd - d - 1); }
          const rc = { x0: r2(x0), y0: r2(y0), x1: r2(x0 + w), y1: r2(y0 + d) };
          if (blockers.some(b => ov(rc, b, 0.55))) continue; // минимум ~1.1 м между соседними препятствиями
          const fo = { id: nid(L, 'f'), kind, x0: rc.x0, y0: rc.y0, x1: rc.x1, y1: rc.y1, h: def[2], cont: def[3] || null, face: side === 0 ? 2 : side === 2 ? 0 : side === 3 ? 1 : 3, room: r.id, col: KINDCOL[kind] };
          if (fo.cont && rnd() < 0.25) fo.cont = null; // some are empty furniture
          L.furn.push(fo); blockers.push(fo); placed++; break;
        }
      }
    }
  }

  // keep the layout walkable: flood fill on 0.2 m grid, remove furniture that cuts doors / loot off
  function repair(L) {
    const st = 0.25, W = L.w, D = L.d, nx = Math.ceil(W / st), ny = Math.ceil(D / st), ox = -W / 2, oy = -D / 2;
    const cell = (x, y) => { const i = Math.floor((x - ox) / st), j = Math.floor((y - oy) / st); return (i < 0 || j < 0 || i >= nx || j >= ny) ? -1 : j * nx + i; };
    function solids() { const out = []; for (const wl of L.walls) { const ops = wl.ops.slice().sort((a, b) => a.s0 - b.s0); let cur = wl.a0; const seg = (a, b) => { if (b - a > 0.01) out.push(wallRect(wl, a, b)); }; for (const o of ops) { seg(cur, o.s0); cur = Math.max(cur, o.s1); } seg(cur, wl.a1); } return out; }
    const base = solids();
    for (let it = 0; it < 40; it++) { 
      const blk = new Uint8Array(nx * ny), mark = (r, pad) => { const i0 = Math.max(0, Math.floor((r.x0 - pad - ox) / st)), i1 = Math.min(nx - 1, Math.floor((r.x1 + pad - ox) / st)), j0 = Math.max(0, Math.floor((r.y0 - pad - oy) / st)), j1 = Math.min(ny - 1, Math.floor((r.y1 + pad - oy) / st)); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) blk[j * nx + i] = 1; };
      for (const r of base) mark(r, 0.17); for (const f of L.furn) if (f.kind !== 'stairs') mark(f, 0.17); // по лестнице ходят: она не преграда и не убирается
      // start: just inside the entry
      const e = L.entry; if (!e) return; const inw = e.run === 'x' ? (e.pos < 0 ? 1 : -1) : (e.pos < 0 ? 1 : -1);
      const sx = e.run === 'x' ? e.s : e.pos + inw * 0.55, sy = e.run === 'x' ? e.pos + inw * 0.55 : e.s; let s0 = cell(sx, sy); if (s0 < 0 || blk[s0]) { s0 = -1; for (const f of L.furn) if (ov(f, { x0: sx - 0.3, x1: sx + 0.3, y0: sy - 0.3, y1: sy + 0.3 })) { L.furn.splice(L.furn.indexOf(f), 1); s0 = -2; break; } if (s0 === -2) continue; return; }
      const seen = new Uint8Array(nx * ny), q = [s0]; seen[s0] = 1;
      // у дома с несколькими подъездами / входами обход начинается от каждого из них
      for (const o of L.doors) { if (o === e || !o.ext || !o.entry) continue; const iw = o.pos < 0 ? 1 : -1, c = cell(o.run === 'x' ? o.s : o.pos + iw * 0.55, o.run === 'x' ? o.pos + iw * 0.55 : o.s); if (c >= 0 && !blk[c] && !seen[c]) { seen[c] = 1; q.push(c); } }
      while (q.length) { const c = q.pop(), i = c % nx, j = (c / nx) | 0; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue; const k = jj * nx + ii; if (seen[k] || blk[k]) continue; seen[k] = 1; q.push(k); } }
      // targets: both sides of every interior door, access points of containers
      const bad = [];
      for (const dd of L.doors) for (const sg of [-1, 1]) { if (dd.ext && sg < 0) { /* outside */ } const px = dd.run === 'x' ? dd.s : dd.pos + sg * (dd.th / 2 + 0.3), py = dd.run === 'x' ? dd.pos + sg * (dd.th / 2 + 0.3) : dd.s; if (dd.ext && ((dd.run === 'x' && (dd.pos < 0 ? sg < 0 : sg > 0)) || (dd.run === 'y' && (dd.pos < 0 ? sg < 0 : sg > 0)))) continue; const c = cell(px, py); if (c >= 0 && !seen[c]) bad.push({ x: px, y: py }); }
      for (const f of L.furn) if (f.cont) { const ap = access(f); const c = cell(ap.x, ap.y); if (c < 0 || !seen[c]) bad.push({ x: ap.x, y: ap.y, f }); }
      if (!bad.length) return;
      // remove the furniture nearest to every unreachable target
      let removed = 0;
      for (const t of bad) { let best = null, bd = 1e9; for (const f of L.furn) { if (f === t.f || f.kind === 'stairs' || f.kind === 'mailbox') continue;const cx = (f.x0 + f.x1) / 2, cy = (f.y0 + f.y1) / 2, dd = Math.hypot(cx - t.x, cy - t.y); if (dd < bd) { bd = dd; best = f; } }
        const f = (best && bd <= (t.f ? 1.6 : 4)) ? best : t.f; if (f) { const k = L.furn.indexOf(f); if (k >= 0) { L.furn.splice(k, 1); removed++; } } }
      if (!removed) return;
    }
  }
  // point from which a container can be searched: just outside its front face
  function access(f) { const cx = (f.x0 + f.x1) / 2, cy = (f.y0 + f.y1) / 2, o = 0.45; return f.face === 0 ? { x: cx, y: f.y0 - o } : f.face === 2 ? { x: cx, y: f.y1 + o } : f.face === 3 ? { x: f.x0 - o, y: cy } : { x: f.x1 + o, y: cy }; }

  // ---------- per-kind layouts ----------
  function layoutHouse(L, rnd, spec) {
    const T = L.T, w = L.w, d = L.d, fc = spec.doorFace;
    const wN = addWall(L, 'x', -d / 2 + T / 2, -w / 2, w / 2, T, true, 0), wS = addWall(L, 'x', d / 2 - T / 2, -w / 2, w / 2, T, true, 2);
    const wW = addWall(L, 'y', -w / 2 + T / 2, -d / 2 + T, d / 2 - T, T, true, 3), wE = addWall(L, 'y', w / 2 - T / 2, -d / 2 + T, d / 2 - T, T, true, 1);
    const ew = [wN, wE, wS, wW], R = { x0: -w / 2 + T, y0: -d / 2 + T, x1: w / 2 - T, y1: d / 2 - T };
    const face = fc >= 0 ? fc : 0;
    if (w > 21) { // long building: separate units side by side, each with its own entrance
      const n = Math.max(2, Math.round(w / 11)), uw = (R.x1 - R.x0) / n;
      for (let k = 0; k < n; k++) {
        const x0 = r1(R.x0 + k * uw), x1 = k === n - 1 ? R.x1 : r1(R.x0 + (k + 1) * uw);
        if (k > 0) addWall(L, 'y', x0, R.y0, R.y1, 0.2, false);
        const ur = { x0: k > 0 ? x0 + 0.1 : x0, y0: R.y0, x1: k < n - 1 ? x1 - 0.1 : x1, y1: R.y1 };
        const ext = [true, k === n - 1, true, k === 0], horiz = face === 0 || face === 2;
        const ef = horiz ? face : (face === 3 && k === 0) || (face === 1 && k === n - 1) ? face : 2;
        const u = unit(L, ur, rnd, { min: 2.5, maxA: 26, ext, extWalls: ew, entry: { wall: ew[ef], face: ef, wd: ENTRY_W }, flat: false, single: 'studio' });
        if (u.hall && !L.entry) L.entry = L.doors.find(dd => dd.entry);
      }
    } else unit(L, R, rnd, { min: 2.5, maxA: w * d > 90 ? 30 : 24, ext: [true, true, true, true], extWalls: ew, entry: { wall: ew[face], face, wd: ENTRY_W }, flat: false, single: 'studio' });
    return { R };
  }
  // ---------- многоквартирный дом: секции вдоль фасада, в каждой подъезд с лестницей и квартиры вокруг площадки ----------
  // Координаты квартиры: u — от стены подъезда наружу, v — от фасада с входом вглубь дома (метры).
  function panelFlat(L, rnd, P_) {
    const { X, Y, FW, D, coreWall, frontW, backW, sideW } = P_;
    const rect = (u0, u1, v0, v1) => ({ x0: r2(Math.min(X(u0), X(u1))), x1: r2(Math.max(X(u0), X(u1))), y0: r2(Math.min(Y(v0), Y(v1))), y1: r2(Math.max(Y(v0), Y(v1))) });
    const room = (type, u0, u1, v0, v1) => { const rc = rect(u0, u1, v0, v1); L.rooms.push(Object.assign({ id: nid(L, 'r'), type, area: (rc.x1 - rc.x0) * (rc.y1 - rc.y0) }, rc)); };
    const wallU = (v, u0, u1) => addWall(L, 'x', r2(Y(v)), Math.min(X(u0), X(u1)), Math.max(X(u0), X(u1)), 0.14, false); // вдоль фасада
    const wallV = (u, v0, v1) => addWall(L, 'y', r2(X(u)), Math.min(Y(v0), Y(v1)), Math.max(Y(v0), Y(v1)), 0.14, false); // вглубь дома
    const doorAtU = (wl, u0, u1) => addDoor(L, wl, (X(u0) + X(u1)) / 2, Math.min(1.1, Math.abs(u1 - u0) - 0.2), { open: rnd() < 0.7 ? 1 : 0 });
    const doorAtV = (wl, v0, v1) => addDoor(L, wl, (Y(v0) + Y(v1)) / 2, Math.min(1.1, Math.abs(v1 - v0) - 0.2), { open: rnd() < 0.7 ? 1 : 0 });
    const winU = (wl, u0, u1) => { const span = u1 - u0; if (span >= 1.9) addWin(L, wl, (X(u0) + X(u1)) / 2, Math.min(1.5, span - 0.8)); };
    const winSide = (v0, v1) => { if (sideW && v1 - v0 >= 1.9) addWin(L, sideW, (Y(v0) + Y(v1)) / 2, 1.2); };
    const entrance = (v) => addDoor(L, coreWall, Y(v), ENTRY_W, { open: rnd() < 0.5 ? 1 : 0 });
    if (FW < 3) { entrance(D / 2); room('studio', 0, FW, 0, D); winU(frontW, 0, FW); winU(backW, 0, FW); return; }
    if (D >= 7.4 && FW >= 4.2) { // спереди кухня и комната, посередине коридор и санузел, сзади зал и спальни
      const ch = 2.0, a = r2(Math.max(2.6, Math.min(6, (D - ch) * 0.46))), b = r2(a + ch), bu = r2(FW - 2.2);
      const two = FW >= 5.7, kw = two ? r2(Math.max(2.4, Math.min(3.6, FW - 3.3, FW * 0.45))) : FW;
      const frontDoor = wallU(a, 0, FW), back = wallU(b, 0, FW), bathW = wallV(bu, a, b);
      entrance(a + ch / 2); room('hall', 0, bu, a, b); room('bath', bu, FW, a, b); doorAtV(bathW, a, b);
      room('kitchen', 0, kw, 0, a); doorAtU(frontDoor, 0, Math.min(kw, bu)); winU(frontW, 0, kw);
      if (two) { wallV(kw, 0, a); room('bedroom', kw, FW, 0, a); doorAtU(frontDoor, kw, bu); winU(frontW, kw, FW); }
      winSide(0, a);
      const cols = FW >= 6.4 ? [[0, r2(Math.min(FW - 3.3, FW * 0.55))], [r2(Math.min(FW - 3.3, FW * 0.55)), FW]] : [[0, FW]];
      if (cols.length > 1) wallV(cols[1][0], b, D);
      const n = Math.max(1, Math.ceil((D - b) / 6.5)), rh = (D - b) / n;
      cols.forEach(([u0, u1], c) => {
        doorAtU(back, u0, Math.min(u1, bu));
        for (let j = 0; j < n; j++) {
          const v0 = r2(b + j * rh), v1 = j === n - 1 ? D : r2(b + (j + 1) * rh);
          if (j > 0) doorAtU(wallU(v0, u0, u1), u0, u1);
          room(c === 0 && j === 0 ? 'living' : j === 0 || j === n - 1 ? 'bedroom' : 'storage', u0, u1, v0, v1);
          if (j === n - 1) winU(backW, u0, u1);
          if (c === cols.length - 1) winSide(v0, v1);
        }
      });
      return;
    }
    // неглубокий дом: прихожая вдоль подъезда, санузел в её конце, кухня и комната с окнами
    const hu = 1.8, bv = r2(D - 1.9), mid = r2(D * 0.45), div = wallV(hu, 0, D);
    const bathW = wallU(bv, 0, hu); entrance(Math.max(2.4, Math.min(D - 2.5, D * 0.5)));
    room('hall', 0, hu, 0, bv); room('bath', 0, hu, bv, D); doorAtU(bathW, 0, hu);
    wallU(mid, hu, FW);
    room('kitchen', hu, FW, 0, mid); doorAtV(div, 0, mid); winU(frontW, hu, FW); winSide(0, mid);
    room('living', hu, FW, mid, D); doorAtV(div, mid, Math.max(bv, mid + 1.2)); winU(backW, hu, FW); winSide(mid, D);
  }
  function layoutPanel(L, rnd, spec) {
    const T = L.T, w = L.w, d = L.d, face = (spec.doorFace === 0 || spec.doorFace === 2) ? spec.doorFace : (spec.doorFace === 1 || spec.doorFace === 3) ? (spec.doorFace === 1 ? 2 : 0) : 2;
    const wN = addWall(L, 'x', -d / 2 + T / 2, -w / 2, w / 2, T, true, 0), wS = addWall(L, 'x', d / 2 - T / 2, -w / 2, w / 2, T, true, 2);
    const wW = addWall(L, 'y', -w / 2 + T / 2, -d / 2 + T, d / 2 - T, T, true, 3), wE = addWall(L, 'y', w / 2 - T / 2, -d / 2 + T, d / 2 - T, T, true, 1);
    const ew = [wN, wE, wS, wW], R = { x0: -w / 2 + T, y0: -d / 2 + T, x1: w / 2 - T, y1: d / 2 - T };
    const n = Math.max(1, Math.round((R.x1 - R.x0) / 17.5)), sw = (R.x1 - R.x0) / n, cw = 3.4, D = R.y1 - R.y0;
    const Y = (v) => face === 0 ? R.y0 + v : R.y1 - v, entW = ew[face], backW = ew[face === 0 ? 2 : 0];
    const middle = D >= 10.5, coreD = middle ? r2(Math.max(6.5, D - 4.4)) : D; // третья квартира за лестницей, если дом глубокий
    for (let k = 0; k < n; k++) {
      const sx0 = r1(R.x0 + k * sw), sx1 = k === n - 1 ? R.x1 : r1(R.x0 + (k + 1) * sw), cx = r1((sx0 + sx1) / 2), c0 = r1(cx - cw / 2), c1 = r1(cx + cw / 2);
      if (k > 0) addWall(L, 'y', sx0, R.y0, R.y1, 0.3, false); // party wall between sections
      const pad0 = k > 0 ? 0.15 : 0, pad1 = k < n - 1 ? 0.15 : 0;
      const wl = addWall(L, 'y', c0, R.y0, R.y1, 0.2, false), wr = addWall(L, 'y', c1, R.y0, R.y1, 0.2, false);
      // подъезд: стальная дверь на фасаде, лестница в глубине, почтовые ящики у входа
      const ed = addDoor(L, entW, cx, 1.4, { entry: true, open: 0, steel: true }); if (k === (n - 1) >> 1 || !L.entry) L.entry = ed; ed.room = null;
      const box = (kind, x0, x1, v0, v1, h, cont, face_) => L.furn.push({ id: nid(L, 'f'), kind, x0: r2(x0), x1: r2(x1), y0: r2(Math.min(Y(v0), Y(v1))), y1: r2(Math.max(Y(v0), Y(v1))), h, cont, face: face_, room: coreRoom.id, col: KINDCOL[kind] });
      const coreRoom = { id: nid(L, 'r'), x0: c0 + 0.1, y0: Math.min(Y(0), Y(coreD)), x1: c1 - 0.1, y1: Math.max(Y(0), Y(coreD)), type: 'stairs', area: 0 }; L.rooms.push(coreRoom);
      if (middle) box('stairs', c0 + 0.15, c0 + 1.35, coreD - 3.2, coreD - 0.15, 0.6, null, 0);
      else box('stairs', cx - 1.2, cx + 1.2, D - 3.0, D - 0.1, 0.6, null, 0);
      box('mailbox', c1 - 0.4, c1 - 0.12, 0.35, 1.55, 1.5, 'entrance', 3);
      if (middle) { // квартира за лестничной площадкой
        const cw_ = addWall(L, 'x', r2(Y(coreD)), c0, c1, 0.2, false);
        addDoor(L, cw_, cx + 0.6, ENTRY_W, { open: rnd() < 0.5 ? 1 : 0 });
        L.rooms.push({ id: nid(L, 'r'), x0: c0 + 0.1, y0: Math.min(Y(coreD + 0.1), Y(D)), x1: c1 - 0.1, y1: Math.max(Y(coreD + 0.1), Y(D)), type: 'studio', area: (cw - 0.2) * (D - coreD) });
      }
      addWin(L, backW, cx, 1.2, { z0: 1.0, z1: 2.2 });
      for (const side of [0, 1]) {
        const FW = side ? sx1 - pad1 - c1 : c0 - sx0 - pad0, end = side ? k === n - 1 : k === 0;
        panelFlat(L, rnd, { X: (u) => side ? c1 + u : c0 - u, Y, FW, D, coreWall: side ? wr : wl, frontW: entW, backW, sideW: end ? ew[side ? 1 : 3] : null });
      }
    }
    return { R };
  }
  function layoutHall(L, rnd, spec) { // industrial / warehouse: one big hall, side office, racks, gate + wicket
    const T = L.T, w = L.w, d = L.d, fc = spec.doorFace >= 0 ? spec.doorFace : 0;
    const wN = addWall(L, 'x', -d / 2 + T / 2, -w / 2, w / 2, T, true, 0), wS = addWall(L, 'x', d / 2 - T / 2, -w / 2, w / 2, T, true, 2);
    const wW = addWall(L, 'y', -w / 2 + T / 2, -d / 2 + T, d / 2 - T, T, true, 3), wE = addWall(L, 'y', w / 2 - T / 2, -d / 2 + T, d / 2 - T, T, true, 1);
    const ew = [wN, wE, wS, wW], R = { x0: -w / 2 + T, y0: -d / 2 + T, x1: w / 2 - T, y1: d / 2 - T };
    const horiz = fc === 0 || fc === 2, ext = ew[fc], span = horiz ? w : d, gw = Math.min(3.6, span * 0.5);
    L.entry = addDoor(L, ext, (rnd() - 0.5) * span * 0.25, gw, { kind: 'gate', entry: true, open: 1, z1: 3.2 });
    const sd = (L.entry.s > 0 ? -1 : 1) * Math.min(span * 0.3, 6) + L.entry.s * 0; // wicket gate on the other side of the face
    if (span > 14) { const ws = L.entry.s + (L.entry.s > 0 ? -1 : 1) * Math.max(gw / 2 + 2.5, span * 0.2); if (Math.abs(ws) < span / 2 - 1.5) addDoor(L, ext, ws, ENTRY_W, { open: 0, side: true }); }
    // ribbon windows high up on the long walls, not climbable
    for (let f = 0; f < 4; f++) { const wl = ew[f], len = wl.a1 - wl.a0; const n = Math.floor(len / 6); for (let k = 0; k < n; k++) { const s = wl.a0 + (k + 0.5) * len / n; if (L.doors.some(dd => dd.wall === wl.id && Math.abs(dd.s - s) < dd.wd / 2 + 1.6)) continue; addWin(L, wl, s, 2.0, { z0: 3.3, z1: 4.6, high: true }); } }
    // office room in a corner of bigger halls
    let office = null;
    if (spec.kind === 'industrial' && (R.x1 - R.x0) > 18 && (R.y1 - R.y0) > 9) {
      const ow = 6, od = 4.4, sx = rnd() < 0.5 ? 1 : -1, sy = (fc === 0 ? 1 : fc === 2 ? -1 : (rnd() < 0.5 ? 1 : -1));
      const ox0 = sx > 0 ? R.x1 - ow : R.x0, ox1 = ox0 + ow, oy0 = sy > 0 ? R.y1 - od : R.y0, oy1 = oy0 + od;
      office = { x0: ox0, y0: oy0, x1: ox1, y1: oy1 };
      const hx = sx > 0 ? ox0 : ox1, hy = sy > 0 ? oy0 : oy1;
      const w1 = addWall(L, 'y', hx, oy0, oy1, 0.16, false); const w2 = addWall(L, 'x', hy, ox0, ox1, 0.16, false);
      addDoor(L, w1, (oy0 + oy1) / 2 + (sy > 0 ? 0.6 : -0.6) * 0, 0.9, { open: 1 }); L.rooms.push({ id: nid(L, 'r'), x0: ox0, y0: oy0, x1: ox1, y1: oy1, type: 'office', area: ow * od });
      // inner window in office wall
      void w2;
    }
    const hall = { id: nid(L, 'r'), x0: R.x0, y0: R.y0, x1: R.x1, y1: R.y1, type: 'hall_big', area: (R.x1 - R.x0) * (R.y1 - R.y0) }; L.rooms.push(hall);
    // columns on a grid, racks in rows, crates, pallets
    const blk = [], addF = (kind, x0, y0, w_, d_, o) => { const rc = { x0: r2(x0), y0: r2(y0), x1: r2(x0 + w_), y1: r2(y0 + d_) }; if (!inR(rc, R, -0.1)) return false; if (office && ov(rc, office, 0.9)) return false; if (blk.some(b => ov(rc, b, 0.0))) return false; const def = F[kind]; const fo = Object.assign({ id: nid(L, 'f'), kind, x0: rc.x0, y0: rc.y0, x1: rc.x1, y1: rc.y1, h: def[2], cont: def[3] || null, face: 0, room: hall.id, col: KINDCOL[kind] }, o || {}); L.furn.push(fo); blk.push(rc); return true; };
    const gx = L.entry.run === 'x' ? L.entry.s : L.entry.pos, gy = L.entry.run === 'x' ? L.entry.pos : L.entry.s;
    // clear lane in front of the gate
    const lane = L.entry.run === 'x' ? { x0: gx - 2.2, x1: gx + 2.2, y0: Math.min(gy, 0) - 0, y1: Math.max(gy, 0) } : { y0: gy - 2.2, y1: gy + 2.2, x0: Math.min(gx, 0), x1: Math.max(gx, 0) };
    blk.push(lane); blk.push({ x0: lane.x0 - 0, x1: lane.x1, y0: lane.y0, y1: lane.y1 });
    for (let x = R.x0 + 5; x < R.x1 - 3; x += 9) for (let y = R.y0 + 5; y < R.y1 - 3; y += 9) { if (span > 10) addF('pillar', x, y, 0.45, 0.45); }
    const lay = rnd(), rackW = 2.4, rackD = 0.6;
    for (let y = R.y0 + 2.2; y < R.y1 - 2.4; y += 3.4) for (let x = R.x0 + 2; x < R.x1 - 3.2; x += 2.9) {
      const r = rnd();
      if (r < 0.46) { const f = addF('rack', x, y, rackW, rackD, { face: rnd() < 0.5 ? 0 : 2 }); }
      else if (r < 0.6) addF('crate', x + 0.3, y, 0.8, 0.8, { face: 2 });
      else if (r < 0.7) addF('pallet', x, y, 1.2, 0.8, { face: 2, cont: null });
      else if (r < 0.76 && spec.kind === 'industrial') addF('bench', x, y, 2.0, 0.8, { face: 2 });
      else if (r < 0.8) addF('barrel', x + 0.5, y + 0.2, 0.6, 0.6, { cont: null });
    }
    if (lay < 0.4) { /* some halls keep an empty middle: remove a central band */ const cy0 = (R.y0 + R.y1) / 2 - 1.5; L.furn = L.furn.filter(f => !(f.kind !== 'pillar' && f.y0 > cy0 && f.y1 < cy0 + 3)); }
    if (office) { const od = { x0: office.x0 + 0.1, y0: office.y0 + 0.1, x1: office.x1 - 0.1, y1: office.y1 - 0.1 }; L.furn.push({ id: nid(L, 'f'), kind: 'desk', x0: od.x0 + 0.3, y0: od.y0 + 0.2, x1: od.x0 + 1.7, y1: od.y0 + 0.9, h: 0.75, cont: 'crate', face: 2, room: hall.id, col: KINDCOL.desk }, { id: nid(L, 'f'), kind: 'cabinet', x0: od.x1 - 1.0, y0: od.y1 - 0.5, x1: od.x1 - 0.1, y1: od.y1 - 0.05, h: 1.1, cont: 'locker', face: 0, room: hall.id, col: KINDCOL.cabinet }); }
    return { R };
  }
  function layoutShed(L, rnd, spec) { // shed: one room, door on the road side
    const T = 0.3; L.T = T; const w = L.w, d = L.d, fc = spec.doorFace >= 0 ? spec.doorFace : 2;
    const ew = [addWall(L, 'x', -d / 2 + T / 2, -w / 2, w / 2, T, true, 0), addWall(L, 'y', w / 2 - T / 2, -d / 2 + T, d / 2 - T, T, true, 1), addWall(L, 'x', d / 2 - T / 2, -w / 2, w / 2, T, true, 2), addWall(L, 'y', -w / 2 + T / 2, -d / 2 + T, d / 2 - T, T, true, 3)];
    const R = { x0: -w / 2 + T, y0: -d / 2 + T, x1: w / 2 - T, y1: d / 2 - T };
    L.entry = addDoor(L, ew[fc], 0, ENTRY_W, { entry: true, open: 0, shed: true }); const room = { id: nid(L, 'r'), x0: R.x0, y0: R.y0, x1: R.x1, y1: R.y1, type: 'store', area: (R.x1 - R.x0) * (R.y1 - R.y0) }; L.rooms.push(room);
    const wf = fc === 0 || fc === 2 ? ew[fc === 0 ? 2 : 0] : ew[fc === 1 ? 3 : 1]; if (rnd() < 0.5) addWin(L, wf, 0, 0.6, { z0: 1.2, z1: 1.8 });
    return { R };
  }
  function layoutGarages(L, rnd, spec) { // row of garages: boxes of ~3 m each with its own roll gate on the road side
    const T = 0.3; L.T = T; const w = L.w, d = L.d, fc = spec.doorFace >= 0 ? spec.doorFace : 2, horiz = fc === 0 || fc === 2 || w >= d; const long = w >= d;
    const ew = [addWall(L, 'x', -d / 2 + T / 2, -w / 2, w / 2, T, true, 0), addWall(L, 'y', w / 2 - T / 2, -d / 2 + T, d / 2 - T, T, true, 1), addWall(L, 'x', d / 2 - T / 2, -w / 2, w / 2, T, true, 2), addWall(L, 'y', -w / 2 + T / 2, -d / 2 + T, d / 2 - T, T, true, 3)];
    const R = { x0: -w / 2 + T, y0: -d / 2 + T, x1: w / 2 - T, y1: d / 2 - T }, f2 = long ? (fc === 0 || fc === 2 ? fc : 2) : (fc === 1 || fc === 3 ? fc : 1);
    const span = long ? R.x1 - R.x0 : R.y1 - R.y0, n = Math.max(1, Math.round(span / 3.3)), bw = span / n;
    for (let k = 0; k < n; k++) {
      const a0 = (long ? R.x0 : R.y0) + k * bw, a1 = a0 + bw; if (k > 0) addWall(L, long ? 'y' : 'x', r1(a0), long ? R.y0 : R.x0, long ? R.y1 : R.x1, 0.2, false);
      const g = addDoor(L, ew[f2], (a0 + a1) / 2, Math.min(2.6, bw - 0.5), { kind: 'gate', garage: true, open: rnd() < 0.35 ? 1 : 0, z1: 2.1 }); if (!L.entry || k === 0) L.entry = g;
      const rr = long ? { x0: a0 + 0.1, x1: a1 - 0.1, y0: R.y0, y1: R.y1 } : { x0: R.x0, x1: R.x1, y0: a0 + 0.1, y1: a1 - 0.1 }; L.rooms.push({ id: nid(L, 'r'), x0: rr.x0, y0: rr.y0, x1: rr.x1, y1: rr.y1, type: 'garage', area: 9 });
      const room = rr, depth = long ? room.y1 - room.y0 : room.x1 - room.x0, back = f2 === 2 || f2 === 1 ? -1 : 1;
      if (rnd() < 0.4 && depth > 3.6) { const cw = 1.85, cl = 4.3; const cx = (room.x0 + room.x1) / 2, cy = (room.y0 + room.y1) / 2; const rc = long ? { x0: cx - cw / 2, x1: cx + cw / 2, y0: cy - cl / 2 + back * 0.0, y1: cy + cl / 2 } : { x0: cx - cl / 2, x1: cx + cl / 2, y0: cy - cw / 2, y1: cy + cw / 2 }; if (rc.x1 - rc.x0 < bw - 0.1 || !long) { /* narrow boxes: put car only if fits */ } if (long && bw >= 2.6 && depth >= 4.6) L.furn.push({ id: nid(L, 'f'), kind: 'car', x0: r2(rc.x0), y0: r2(rc.y0), x1: r2(rc.x1), y1: r2(rc.y1), h: 1.45, cont: 'car', face: f2 === 2 ? 2 : 0, room: 'g' + k, col: KINDCOL.car }); }
      else if (rnd() < 0.8) { const sh = F.shelf, back0 = long ? (f2 === 2 ? { x0: a0 + 0.15, x1: a0 + 0.15 + 1.0, y0: R.y0 + 0.05, y1: R.y0 + 0.43 } : { x0: a0 + 0.15, x1: a0 + 1.15, y0: R.y1 - 0.43, y1: R.y1 - 0.05 }) : { x0: R.x0 + 0.05, x1: R.x0 + 0.43, y0: a0 + 0.15, y1: a0 + 1.15 }; if (bw > 1.5) L.furn.push({ id: nid(L, 'f'), kind: 'shelf', x0: r2(back0.x0), y0: r2(back0.y0), x1: r2(back0.x1), y1: r2(back0.y1), h: 1.9, cont: 'crate', face: f2 === 2 ? 2 : 0, room: 'g' + k, col: KINDCOL.shelf }); void sh; }
      void horiz;
    }
    return { R };
  }

  function layout(spec) {
    const L = newLayout(spec), rnd = rngOf(hsh(spec.id, spec.seed | 0) * 4294967295);
    let info;
    if (spec.kind === 'panel' || spec.kind === 'civic') info = layoutPanel(L, rnd, spec); else if (spec.kind === 'industrial' || spec.kind === 'warehouse') info = layoutHall(L, rnd, spec);
    else if (spec.kind === 'shed') info = layoutShed(L, rnd, spec); else if (spec.kind === 'garage_row') info = layoutGarages(L, rnd, spec); else info = layoutHouse(L, rnd, spec);
    if (spec.kind === 'civic') L.furn = L.furn.filter(f => f.kind !== 'mailbox'); // не жилой дом: без почтовых ящиков
    // furnishing (residential): all rooms
    if (spec.kind === 'house' || spec.kind === 'panel') furnish(L, rnd, L.rooms.filter(r => r.type !== 'stairs' && r.type !== 'hall_big' && r.type !== 'office'), L.doors);
    else if (spec.kind === 'shed') furnish(L, rnd, L.rooms, L.doors);
    if (spec.kind !== 'garage_row' && spec.kind !== 'industrial' && spec.kind !== 'warehouse') repair(L); else repair(L);
    L.floors = Math.max(1, Math.round(spec.h / FH));
    return L;
  }

  // ---------- world build ----------
  // E = enterable record from sim.js genWorld: {id, c:{x,y}, ux,uy,vx,vy, kind, ang, w,d (px), h (m), doorFace}
  // X = {add(x,y,w,h,kind,col,extra)->rect, mkCont(kind,x,y)->container, freeSpot, rnd}
  function build(s, E, X) {
    const k = E.kind, wm = E.w / P, dm = E.d / P;
    const L = layout({ id: E.id, kind: k, w: wm, d: dm, h: E.h, doorFace: E.doorFace, seed: s ? s.seed : 0 });
    const ang = ((E.ang % 90) + 90) % 90, aligned = ang < 1.5 || ang > 88.5;
    const ux = E.ux, uy = E.uy, vx = E.vx, vy = E.vy, c = E.c;
    const toW = (lx, ly) => ({ x: c.x + (ux * lx + vx * ly) * P, y: c.y + (uy * lx + vy * ly) * P });
    const I = { id: E.id, kind: k, L, aligned, doors: [], wins: [], decals: [], parts: [], furn: [], state: {} };
    // emit an axis-aligned (in layout) rect as world colliders. returns list of rects. Rotated buildings get a chain of small squares.
    function emit(rc, kind, extra) {
      const a = toW(rc.x0, rc.y0), b = toW(rc.x1, rc.y0), cc = toW(rc.x1, rc.y1), dd = toW(rc.x0, rc.y1); const out = [];
      if (aligned) { const xs = [a.x, b.x, cc.x, dd.x], ys = [a.y, b.y, cc.y, dd.y]; const x0 = Math.min(...xs), y0 = Math.min(...ys); out.push(X.add(x0, y0, Math.max(...xs) - x0, Math.max(...ys) - y0, kind, null, Object.assign({ or: [a, b, cc, dd] }, extra))); }
      else { // chain of squares along the long axis
        const lw = rc.x1 - rc.x0, ld = rc.y1 - rc.y0, long = lw >= ld, Ln = (long ? lw : ld) * P, th = Math.min(lw, ld) * P, sq = Math.max(2.4, Math.min(th, 5, Ln)), n = Math.max(1, Math.ceil((Ln - sq) / (sq * 0.8)) + 1);
        for (let i = 0; i < n; i++) { const dist = n === 1 ? Ln / 2 : sq / 2 + (Ln - sq) * i / (n - 1), t = dist / P, p = toW(long ? rc.x0 + t : (rc.x0 + rc.x1) / 2, long ? (rc.y0 + rc.y1) / 2 : rc.y0 + t); const o = X.add(p.x - sq / 2, p.y - sq / 2, sq, sq, kind, null, Object.assign({ or: i === 0 ? [a, b, cc, dd] : null, chain: i > 0 }, extra)); out.push(o); }
      }
      return out;
    }
    // shell, with openings cut out
    const sol = []; // solid pieces of walls
    for (const wl of L.walls) {
      const ops = wl.ops.slice().sort((p, q) => p.s0 - q.s0); let cur = wl.a0; const seg = (a, b) => { if (b - a > 0.02) sol.push([wl, a, b]); };
      for (const o of ops) { seg(cur, o.s0); cur = Math.max(cur, o.s1); } seg(cur, wl.a1);
    }
    for (const [wl, a, b] of sol) {
      const rc = wallRect(wl, a, b);
      if (wl.ext) emit(rc, 'bldg', { low: false, bid: E.id }); else I.parts.push(emit(rc, 'wall', { low: false, inb: E.id, part: true }));
    }
    // doors
    const faceU = (face, lx, ly) => face === 0 ? lx + wm / 2 : face === 1 ? ly + dm / 2 : face === 2 ? wm / 2 - lx : dm / 2 - ly;
    for (const dd of L.doors) {
      const rc = dd.run === 'x' ? { x0: dd.s - dd.wd / 2, x1: dd.s + dd.wd / 2, y0: dd.pos - dd.th / 2, y1: dd.pos + dd.th / 2 } : { x0: dd.pos - dd.th / 2, x1: dd.pos + dd.th / 2, y0: dd.s - dd.wd / 2, y1: dd.s + dd.wd / 2 };
      const cells = emit(rc, 'door', { bid: E.id, low: false, inb: dd.ext ? undefined : E.id });
      const ctr = toW(dd.run === 'x' ? dd.s : dd.pos, dd.run === 'x' ? dd.pos : dd.s), nrm = dd.run === 'x' ? toW(0, 1) : toW(1, 0), o0 = toW(0, 0);
      const osg = dd.pos < 0 ? -1 : 1, nx = (nrm.x - o0.x) / P * osg, ny = (nrm.y - o0.y) / P * osg;
      const D = { id: dd.id, ext: dd.ext, entry: !!dd.entry, kind: dd.kind, steel: !!dd.steel, garage: !!dd.garage, side: !!dd.side, run: dd.run, face: dd.ext ? dd.face : -1, s: dd.s, wd: dd.wd, z1: dd.z1, x: ctr.x, y: ctr.y, nx, ny, hp: dd.ext ? 8 : 4, open: dd.open ? 1 : 0, locked: false, broke: 0, cells, ang: 0, anim: dd.open ? 1 : 0, dec: [], layout: dd };
      if (dd.ext && dd.entry && dd.kind === 'door') D.locked = hsh(E.id, 77) > 0.8;
      if (dd.garage) D.locked = D.open ? false : hsh(E.id * 31 + Math.round(dd.s * 10), 5) > 0.6;
      if (D.locked) D.open = 0;
      I.doors.push(D);
    }
    // windows
    for (const wn of L.wins) {
      const rc = wn.run === 'x' ? { x0: wn.s - wn.wd / 2, x1: wn.s + wn.wd / 2, y0: wn.pos - wn.th / 2, y1: wn.pos + wn.th / 2 } : { x0: wn.pos - wn.th / 2, x1: wn.pos + wn.th / 2, y0: wn.s - wn.wd / 2, y1: wn.s + wn.wd / 2 };
      const cells = emit(rc, 'win', { bid: E.id, low: true });
      const ctr = toW(wn.run === 'x' ? wn.s : wn.pos, wn.run === 'x' ? wn.pos : wn.s), nrm = wn.run === 'x' ? toW(0, 1) : toW(1, 0), o0 = toW(0, 0);
      I.wins.push({ id: wn.id, face: wn.face, s: wn.s, wd: wn.wd, z0: wn.z0, z1: wn.z1, high: !!wn.high, x: ctr.x, y: ctr.y, nx: (nrm.x - o0.x) / P * (wn.pos < 0 ? -1 : 1), ny: (nrm.y - o0.y) / P * (wn.pos < 0 ? -1 : 1), st: 0, cells, dec: [], layout: wn, lit: hsh(E.id * 7 + Math.round(wn.s * 3), 3) < 0.1, curtain: hsh(E.id, Math.round(wn.s * 10)) });
    }
    // furniture: colliders and containers
    for (const f of L.furn) {
      const rc = { x0: f.x0, y0: f.y0, x1: f.x1, y1: f.y1 }, tall = f.h >= 1.3;
      const cells = f.kind === 'stairs' ? [] : emit(rc, 'furn', { fk: f.kind, fh: f.h, col: f.col, low: !tall, inb: E.id, pass: f.h < 0.3 });
      let cont = null;
      if (f.cont && X.mkCont) { const ap = access(f), pp = toW(ap.x, ap.y); cont = X.mkCont(f.cont, pp.x, pp.y); if (cont) cont.inb = E.id; }
      I.furn.push({ id: f.id, kind: f.kind, x0: f.x0, y0: f.y0, x1: f.x1, y1: f.y1, h: f.h, col: f.col, cells, cont: cont ? cont.id : null });
    }
    // floor plan for the client floor painter (rooms in layout metres)
    I.fr = { c: { x: c.x, y: c.y }, ux, uy, vx, vy, w: wm, d: dm };
    I.rooms = L.rooms.map(r => ({ x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1, type: r.type }));
    I.T = L.T;
    return I;
  }

  // ---------- runtime state ----------
  const OFFX = -1e8;
  function cellsSet(cells, closed) { for (const w of cells) { if (closed) { if (w._ox != null) { w.x = w._ox; w.y = w._oy; delete w._ox; delete w._oy; } } else if (w._ox == null) { w._ox = w.x; w._oy = w.y; w.x = OFFX; w.y = OFFX; } } }
  function setDoor(D, open) { D.open = open ? 1 : 0; cellsSet(D.cells, !open); for (const w of D.cells) { w.bdoor = !open; } }
  function lockDoor(D, locked) { D.locked = !!locked; if (D.locked) setDoor(D, 0); }
  function setWin(W, st) { W.st = st; for (const w of W.cells) { if (st === 0) { w.fly = false; w.low = true; } else { w.fly = true; w.low = true; } } }
  function init(s, I, b) { // apply the initial states generated in build()
    for (const D of I.doors) setDoor(D, D.open);
    if (b) b.int = I;
  }
  const bOf = (s, id) => { const CT = s.map && s.map.city; if (!CT) return null; const b = CT.buildings[id]; return b && b.id === id ? b : CT.buildings.find(q => q.id === id) || null; };

  // nearest interactive thing for player p (px). returns {t:'door'|'win', b, I, o, d, dist, text}
  function near(s, p, reach) {
    const CT = s.map.city; if (!CT) return null; reach = reach || 22; let best = null;
    for (const b of CT.buildings) {
      const I = b.int; if (!I || Math.abs(b.c.x - p.x) > b.w / 2 + 60 || Math.abs(b.c.y - p.y) > b.d / 2 + 60 && Math.abs(b.c.y - p.y) > b.w / 2 + 60) continue;
      for (const D of I.doors) { const dd = Math.hypot(D.x - p.x, D.y - p.y); if (dd < reach + D.wd * 3 && (!best || dd < best.dist)) best = { t: 'door', b, I, o: D, dist: dd }; }
      for (const W of I.wins) { if (W.high) continue; const dd = Math.hypot(W.x - p.x, W.y - p.y); if (dd < reach && (!best || dd < best.dist - 3)) best = { t: 'win', b, I, o: W, dist: dd }; }
    }
    return best;
  }
  // v79: forced entry. Hold E at a locked exterior door or garage gate: 3 s for a door, 6 s for a gate; every second it makes noise
  // (kind 'door', heard like a kicked-in door). Moving away or releasing E cancels. Returns the state for the HUD, or null.
  const PRY = { door: 3, gate: 6, noiseEvery: 1 };
  function pryTick(s, p, dt, held) {
    if (!held || p.dead || p.drive != null) { p.pry = null; return null; }
    const n = near(s, p, 22); if (!n || n.t !== 'door' || !n.o.ext || !n.o.locked || n.o.broke) { p.pry = null; return null; }
    const D = n.o, need = D.garage ? PRY.gate : PRY.door;
    if (!p.pry || p.pry.id !== D.id || p.pry.bid !== n.b.id) p.pry = { id: D.id, bid: n.b.id, t: 0, nt: 0, need, x: p.x, y: p.y };
    const q = p.pry; if (Math.hypot(p.x - q.x, p.y - q.y) > 25) { p.pry = null; return null; }
    q.t += dt; q.nt += dt;
    if (q.nt >= PRY.noiseEvery) { q.nt = 0; s.events.push({ t: 'noise', kind: 'door', x: D.x, y: D.y }); }
    if (q.t >= need) { D.locked = false; setDoor(D, 1); p.pry = null; s.events.push({ t: 'noise', kind: 'door', x: D.x, y: D.y }); return { done: true, door: D, text: D.garage ? 'Ворота взломаны и подняты' : 'Замок взломан' }; }
    return { t: q.t, need, door: D };
  }
  // E tap: returns {ok, text, sfx} describing what happened (client shows toast)
  function use(s, p, dmgFn) {
    const n = near(s, p); if (!n) return null;
    if (n.t === 'door') {
      const D = n.o;
      if (D.broke) return { ok: false, text: 'Дверь выбита', sfx: 0 };
      if (D.locked) { return { ok: false, text: 'Заперто. Удерживай E, чтобы взломать (шумно), или выбей замок выстрелами', sfx: 300, locked: true }; }
      setDoor(D, !D.open); return { ok: true, text: D.garage ? (D.open ? 'Ворота подняты' : 'Ворота закрыты') : (D.open ? 'Дверь открыта' : 'Дверь закрыта'), sfx: D.open ? 520 : 380, door: D };
    }
    const W = n.o, ins = pIn(n.b, p), sg = ins ? 1 : -1;
    if (W.st === 0) { setWin(W, 1); return { ok: true, text: 'Окно открыто', sfx: 420, win: W }; }
    const tx = W.x + W.nx * sg * 11, ty = W.y + W.ny * sg * 11; // world pos beyond the wall (nx,ny: outward normal)
    const SA = window.WL_SIM && WL_SIM.API; if (SA && !SA.freeSpot(s, tx, ty, p.r || 3.5)) return { ok: false, text: ins ? 'Снаружи мешает препятствие' : 'Внутри мешает мебель', sfx: 300 };
    const fromIn = ins; const out = { ok: true, vault: { x: tx, y: ty, fromX: p.x, fromY: p.y }, text: fromIn ? 'Вылез через окно' : 'Влез через окно', sfx: 260, win: W };
    p.x = tx; p.y = ty; p.vx = 0; p.vy = 0;
    if (W.st === 2 && dmgFn && hsh(W.id.length, Math.round(s.t * 10)) < 0.5) { dmgFn(p, 4); out.text += ' (порезался о стекло)'; }
    return out;
  }
  function pIn(b, p) { const q = b.inner; if (!q) return false; let c = false; for (let i = 0, j = q.length - 1; i < q.length; j = i++) { const a = q[i], d = q[j]; if ((a.y > p.y) !== (d.y > p.y) && p.x < (d.x - a.x) * (p.y - a.y) / (d.y - a.y) + a.x) c = !c; } return c; }

  // bullet hit at world point (x,y). Returns {kind:'win'|'door'|'wall'|'furn'|null, b, ...}. Safe to call for every spark.
  function hit(s, x, y, dmg) {
    const CT = s.map && s.map.city; if (!CT) return null; dmg = dmg || 1; let best = null, bd = 9;
    for (const b of CT.buildings) {
      const I = b.int; if (!I || x < b.minX - 12 || x > b.maxX + 12 || y < b.minY - 12 || y > b.maxY + 12) continue;
      for (const W of I.wins) for (const w of W.cells) { const dd = ptRect(x, y, w); if (dd < bd) { bd = dd; best = { kind: 'win', b, I, o: W }; } }
      for (const D of I.doors) if (!D.open) for (const w of D.cells) { const dd = ptRect(x, y, w); if (dd < bd) { bd = dd; best = { kind: 'door', b, I, o: D }; } }
    }
    if (best && best.kind === 'win') { const W = best.o; if (W.st !== 2) { setWin(W, 2); best.broke = true; } W.dec.push({ x, y }); return best; }
    if (best && best.kind === 'door') {
      const D = best.o; D.dec.push({ x, y, h: 0.9 + hsh(D.dec.length, Math.round(x)) * 1.1 }); if (D.dec.length > 14) D.dec.shift(); D.hp -= dmg;
      if (D.hp <= 0 && !D.broke) { D.broke = 1; D.locked = false; setDoor(D, 1); best.broke = true; }
      return best;
    }
    // interior walls / furniture / ext wall: leave a mark on the nearest piece
    let bw = null, bdist = 7;
    for (const b of CT.buildings) {
      const I = b.int; if (!I || x < b.minX - 12 || x > b.maxX + 12 || y < b.minY - 12 || y > b.maxY + 12) continue;
      for (const w of S_wallsNear(s, x - 8, y - 8, x + 8, y + 8)) { if (w.bid !== b.id && w.inb !== b.id) continue; if (w.kind !== 'wall' && w.kind !== 'furn') continue; const dd = ptRect(x, y, w); if (dd < bdist) { bdist = dd; bw = { kind: w.kind, b, I, w }; } }
    }
    if (bw) { const w = bw.w; (w.dec = w.dec || []).push({ x, y, h: 0.6 + hsh(w.dec ? w.dec.length : 0, Math.round(y)) * 1.5 }); if (w.dec.length > 10) w.dec.shift(); return bw; }
    return null;
  }
  function ptRect(x, y, w) { const cx = Math.max(w.x, Math.min(x, w.x + w.w)), cy = Math.max(w.y, Math.min(y, w.y + w.h)); return Math.hypot(x - cx, y - cy); }
  function S_wallsNear(s, x0, y0, x1, y1) { const A = window.WL_SIM && WL_SIM.API; return A && A.wallsNear ? A.wallsNear(s, x0, y0, x1, y1) : []; }

  // save / restore (keyed by building id)
  function save(s) { const CT = s.map && s.map.city, out = {}; if (!CT) return out; for (const b of CT.buildings) { const I = b.int; if (!I) continue; const o = { d: I.doors.map(D => [D.open, D.locked ? 1 : 0, D.broke, Math.max(0, D.hp)]), w: I.wins.map(W => W.st) }; if (o.d.some((q, i) => q[0] !== (I.doors[i].layout.open ? 1 : 0) || q[2]) || o.w.some(v => v)) out[b.id] = o; } return out; }
  function load(s, data) { const CT = s.map && s.map.city; if (!CT || !data) return; for (const id in data) { const b = bOf(s, +id), I = b && b.int; if (!I) continue; const o = data[id]; o.d.forEach((q, i) => { const D = I.doors[i]; if (!D) return; D.locked = !!q[1]; D.broke = q[2]; D.hp = q[3]; setDoor(D, q[0] && !D.locked); }); o.w.forEach((v, i) => { if (I.wins[i]) setWin(I.wins[i], v); }); } }

  window.WL_HOUSES_SIM = { P, FH, wallT, isEnterable, layout, build, init, setDoor, lockDoor, setWin, near, use, pryTick, PRY, hit, save, load, F, KINDCOL, hsh, access };
})();
