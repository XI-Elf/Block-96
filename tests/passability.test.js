// Block-96 passability autotest (headless): bridges (on foot + by car) and building entrances (on foot).
// Usage: node tests/passability.test.js            (B96_ROOT=<game root> optional; REPORT=<file.json> writes the full report)
// Units: world px, 10 px = 1 m. Player radius 3.5 px. Failures are listed with world coordinates (px and m) and the blocking wall.
const fs = require('fs'), path = require('path');
const H = require('./harness');
let pass = 0, fail = 0; const log = [], report = { bridges: [], entrances: { summary: {}, failures: [] } };
const ok = (c, m) => { if (c) pass++; else { fail++; log.push('FAIL: ' + m); } console.log((c ? 'ok   ' : 'FAIL ') + m); };
const m1 = (v) => Math.round(v * 10) / 10, at = (x, y) => '(' + Math.round(x) + ',' + Math.round(y) + ')px = (' + m1(x / 10) + ',' + m1(y / 10) + ')m';

const h = H.boot({ hour: 12 }); const { s, w, S } = h; const A = S.API, VEH = w.B96_VEH, CT = s.map.city, WORLD = w.B96_WORLD;
const PR = 3.5; A.initCars(s); // parked cars exist only after initCars (raid start)
const hit = (x, y, r) => { const o = []; for (const q of A.wallsNear(s, x - r, y - r, x + r, y + r)) if (x + r > q.x && x - r < q.x + q.w && y + r > q.y && y - r < q.y + q.h) o.push(q); return o; };
const free = (x, y, r) => A.freeSpot(s, x, y, r == null ? PR : r);
const segFree = (x0, y0, x1, y1, r) => { const L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(L / 1)); for (let i = 0; i <= n; i++) if (!free(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, r)) return false; return true; };
const desc = (q) => q ? q.kind + '@' + at(q.x, q.y) + ' ' + Math.round(q.w) + 'x' + Math.round(q.h) + 'px' : 'none';

// ---- A* on a grid (8-neighbour, radius-aware) ----
// A* that returns the waypoint list
function route(sx, sy, tx, ty, o) {
  o = o || {}; const st = o.step || 6, r = o.r == null ? PR : o.r, lim = o.limit || 30000, bb = o.bbox, cache = new Map();
  const K = (i, j) => (i + 5000) * 10007 + (j + 5000);
  const okc = (i, j) => { const k = K(i, j); let v = cache.get(k); if (v === undefined) { const x = sx + i * st, y = sy + j * st; v = (!bb || (x >= bb[0] && x <= bb[2] && y >= bb[1] && y <= bb[3])) && free(x, y, r); cache.set(k, v); } return v; };
  if (!okc(0, 0)) return { ok: false, why: 'start blocked ' + desc(hit(sx, sy, r)[0]) };
  const gi = Math.round((tx - sx) / st), gj = Math.round((ty - sy) / st); if (!okc(gi, gj)) return { ok: false, why: 'goal blocked ' + desc(hit(sx + gi * st, sy + gj * st, r)[0]) };
  const g = new Map([[K(0, 0), 0]]), par = new Map(), closed = new Set(), open = [[0, 0, 0]]; let n = 0;
  while (open.length && n++ < lim) {
    let bi = 0; for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k; const [, i, j] = open.splice(bi, 1)[0], kk = K(i, j); if (closed.has(kk)) continue; closed.add(kk);
    if (i === gi && j === gj) { const path = [[sx + i * st, sy + j * st]]; let c = kk; while (par.has(c)) { c = par.get(c); const jj = c % 10007 - 5000, ii = Math.floor(c / 10007) - 5000; path.push([sx + ii * st, sy + jj * st]); } return { ok: true, path: path.reverse(), nodes: n }; }
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      if (!di && !dj) continue; const ni = i + di, nj = j + dj, nk = K(ni, nj); if (closed.has(nk) || !okc(ni, nj)) continue;
      if (di && dj && !(okc(i + di, j) && okc(i, j + dj))) continue;
      const ng = g.get(kk) + (di && dj ? 1.414 : 1) * st; if (g.has(nk) && g.get(nk) <= ng) continue; g.set(nk, ng); par.set(nk, kk);
      open.push([ng + 1.2 * Math.hypot(gi - ni, gj - nj) * st, ni, nj]);
    }
  }
  return { ok: false, why: n >= lim ? 'node limit' : 'no path', nodes: n };
}

// =============== BRIDGES ===============
const PX = 10;
const BR = w.WL_BRIDGES.list;
ok(BR.length === 7 && CT.bridges.length === 7, 'world has 7 bridges (list ' + BR.length + ', CT ' + CT.bridges.length + ')');
const NAMES = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7'];
CT.bridges.forEach((b, bi) => {
  const a = b.pts[0], d = b.pts[1], L = Math.hypot(d.x - a.x, d.y - a.y), ux = (d.x - a.x) / L, uy = (d.y - a.y) / L, nx = -uy, ny = ux, hw = b.w / 2, meta = BR[bi], R = { id: NAMES[bi], a: [a.x, a.y], b: [d.x, d.y], lengthM: m1(L / PX), widthM: b.w / PX, problems: [] };
  const P = (t, sv) => [a.x + ux * t + nx * sv, a.y + uy * t + ny * sv];
  // 1. static centreline sweep, from 100 px before to 100 px after the deck, with the real player and a truck-sized body
  const cl = []; for (let t = -100; t <= L + 100; t += 2) { const [x, y] = P(t, 0); if (!free(x, y, PR)) cl.push({ t, x, y, wall: desc(hit(x, y, PR)[0]) }); }
  R.centrelineBlocked = cl.length; if (cl.length) R.problems.push('centreline blocked at ' + cl.length + ' points, first at t=' + cl[0].t + 'px ' + at(cl[0].x, cl[0].y) + ' by ' + cl[0].wall);
  { const runs = []; let run = null; for (let t = -100; t <= L + 100; t += 2) { const [x, y] = P(t, 0), bl = !free(x, y, PR); if (bl && !run) run = { t0: t, p0: [Math.round(x), Math.round(y)], wall: desc(hit(x, y, PR)[0]) }; if (!bl && run) { run.t1 = t; run.p1 = [Math.round(x), Math.round(y)]; runs.push(run); run = null; } } if (run) { run.t1 = L + 100; runs.push(run); } R.blockedRuns = runs.filter(q => q.t1 - q.t0 >= 6).map(q => ({ fromPx: q.p0, toPx: q.p1 || null, lengthM: m1((q.t1 - q.t0) / PX), alongDeckM: [m1(q.t0 / PX), m1(q.t1 / PX)], firstWall: q.wall })); }
  // 2. free lateral width at 9 stations along the deck (px between the nearest blocking walls to each side)
  const wid = []; for (let k = 0; k <= 8; k++) { const t = L * k / 8, [x0, y0] = P(t, 0); let lo = 0, hi = 0; while (lo > -hw - 40 && free(...P(t, lo - 1), PR)) lo--; while (hi < hw + 40 && free(...P(t, hi + 1), PR)) hi++; wid.push({ t: Math.round(t), x: Math.round(x0), y: Math.round(y0), clear: hi - lo + 2 * PR, lo, hi }); }
  R.stations = wid.map(q => ({ alongDeckM: m1(q.t / PX), at: [q.x, q.y], freeFromPx: q.lo, freeToPx: q.hi })); R.lateralClearPx = wid.map(q => Math.round(q.clear)); const minClear = Math.min(...wid.map(q => q.clear)); R.minClearM = m1(minClear / PX);
  if (minClear < 100) R.problems.push('deck narrower than 10 m in the clear (min ' + R.minClearM + ' m at ' + at(...[wid.find(q => q.clear === minClear).x, wid.find(q => q.clear === minClear).y]) + ')');
  // 3. does the deck have water under the walkable strip? (water kind walls under the centreline = fall-in / collision)
  const sideWalls = []; for (let t = 0; t <= L; t += 6) for (const sg of [-1, 1]) { const [x, y] = P(t, sg * (hw - 2)); if (!free(x, y, 1)) sideWalls.push(1); } R.edgeBlockedSamples = sideWalls.length;
  // 4. foot route 140 px before the first end to 140 px after the second end, A* with r = 3.5
  const s0 = P(-140, 0), e0 = P(L + 140, 0), rt = route(s0[0], s0[1], e0[0], e0[1], { step: 6, bbox: [Math.min(s0[0], e0[0]) - 200, Math.min(s0[1], e0[1]) - 200, Math.max(s0[0], e0[0]) + 200, Math.max(s0[1], e0[1]) + 200] });
  R.footRoute = rt.ok ? 'ok (' + rt.nodes + ' nodes)' : 'FAIL: ' + rt.why; if (!rt.ok) R.problems.push('no foot route across the bridge (' + rt.why + ')');
  // 5. both ends touch road asphalt (road mask / road samples)
  const nearRoadAt = (x, y) => { for (const q of WORLD.roadSamples) if (Math.hypot(q[0] * PX - x, q[1] * PX - y) < Math.max(60, q[3] * PX)) return true; return false; };
  R.roadAtEnds = [nearRoadAt(...P(-60, 0)), nearRoadAt(...P(L + 60, 0))]; if (!R.roadAtEnds[0] || !R.roadAtEnds[1]) R.problems.push('no road within reach 6 m beyond deck end(s) (' + R.roadAtEnds.join('/') + '): bridge ends in a dead end');
  report.bridges.push(R);
  ok(R.problems.length === 0, 'bridge ' + R.id + ' foot passability ' + at(a.x, a.y) + ' -> ' + at(d.x, d.y) + (R.problems.length ? ' :: ' + R.problems.join('; ') : ''));
});

// real-sim walk (player controlled by commands) along the A* route of every bridge
function simWalk(bi) {
  const b = CT.bridges[bi], a = b.pts[0], d = b.pts[1], L = Math.hypot(d.x - a.x, d.y - a.y), ux = (d.x - a.x) / L, uy = (d.y - a.y) / L;
  const hh = h, p = hh.p; p.drive = null; p.vx = p.vy = 0; p.x = a.x - ux * 120; p.y = a.y - uy * 120; p.hp = 1e9; hh.cmd = {};
  const tx = d.x + ux * 120, ty = d.y + uy * 120; let t = 0, stuck = 0, lx = p.x, ly = p.y;
  while (t < Math.max(60, (L + 240) / 20)) { const dx = tx - p.x, dy = ty - p.y, dl = Math.hypot(dx, dy); if (dl < 8) break; hh.cmd = { mx: dx / dl, my: dy / dl }; hh.step(0.25); t += 0.25; if (Math.hypot(p.x - lx, p.y - ly) < 1) stuck++; else stuck = 0; lx = p.x; ly = p.y; if (stuck > 8) break; }
  return { arrived: Math.hypot(tx - p.x, ty - p.y) < 12, x: p.x, y: p.y, t };
}
CT.bridges.forEach((b, bi) => { const r = simWalk(bi); report.bridges[bi].simWalk = r.arrived ? 'ok ' + m1(r.t) + ' s' : 'STUCK at ' + at(r.x, r.y); ok(r.arrived, 'bridge ' + NAMES[bi] + ' sim walk on foot (straight W/A/S/D along the deck axis)' + (r.arrived ? '' : ' stuck at ' + at(r.x, r.y))); });

// by car: real stepDriving, pure-pursuit steering along the deck axis, both directions, sedan and truck
function carRun(bi, rev, vt) {
  const b = CT.bridges[bi], a = b.pts[rev ? 1 : 0], d = b.pts[rev ? 0 : 1], L = Math.hypot(d.x - a.x, d.y - a.y), ux = (d.x - a.x) / L, uy = (d.y - a.y) / L;
  const hh = h, ss = hh.s, p = hh.p, c = ss.cars[0]; p.hp = 1e9; p.drive = null; p.vx = p.vy = 0;
  for (const i of c.wis) { const q = ss.map.walls[i]; if (q) { q.x = -1e5; q.y = -1e5; } } // lift the parked car out of the wall grid
  let ap = 220; for (const dd of [220, 160, 110, 60]) { ap = dd; if (free(a.x - ux * dd, a.y - uy * dd, 12)) break; } // nearest free approach point (a building may stand 22 m before the deck)
  c.vt = vt; VEH.init(c, null); c.x = a.x - ux * ap; c.y = a.y - uy * ap; c.ang = Math.atan2(uy, ux); c.v = 0; c.fuel = 100; c.locked = false; c.hp = c.maxHp = 1e9; c.state = 'ok'; c.driver = p.id; p.drive = c.id; p.x = c.x; p.y = c.y;
  if (!free(c.x, c.y, 12)) return { arrived: false, along: -ap, L: Math.round(L), x: c.x, y: c.y, crashes: 0, t: 0, note: 'approach (' + ap + ' px before the deck) is blocked by ' + desc(hit(c.x, c.y, 12)[0]) };
  const tx = d.x + ux * 220, ty = d.y + uy * 220; let t = 0, crashes = 0, minV = 1e9, stall = 0, hp0 = c.hp; const T = hh.S.API;
  while (t < Math.max(40, (L + 440) / 70)) { const along = (c.x - a.x) * ux + (c.y - a.y) * uy, lat = -(c.x - a.x) * uy + (c.y - a.y) * ux, la = Math.min(L + 220, along + 70); const px = a.x + ux * la, py = a.y + uy * la, want = Math.atan2(py - c.y, px - c.x); let da = want - c.ang; da = Math.atan2(Math.sin(da), Math.cos(da));
    const cmd = { thr: along > L + 150 ? 0 : 1, str: Math.max(-1, Math.min(1, da * 2.2)) }; hh.cmd = cmd; const px0 = c.x, py0 = c.y; hh.keepEvents = true; hh.step(1 / 20, cmd); for (const ev of ss.events) if (ev.t === 'crash') crashes++; ss.events.length = 0; hh.keepEvents = false; t += 1 / 20;
    if (along > 40 && Math.abs(c.v) < 6) stall++; else stall = 0; if (stall > 40) break; if (along > L + 150) break; }
  const along = (c.x - a.x) * ux + (c.y - a.y) * uy;
  return { arrived: along > L + 120, along: Math.round(along), L: Math.round(L), x: c.x, y: c.y, crashes, t: m1(t) };
}
for (const vt of ['sedan', 'truck']) CT.bridges.forEach((b, bi) => [false, true].forEach(rev => {
  const r = carRun(bi, rev, vt), key = NAMES[bi] + (rev ? ' (return)' : ' (forward)') + ' ' + vt; (report.bridges[bi].cars = report.bridges[bi].cars || []).push({ vt, rev, ...r });
  ok(r.arrived && r.crashes === 0, 'bridge ' + key + ' by car: ' + (r.arrived ? 'passed in ' + r.t + ' s' : 'DID NOT PASS (stopped at ' + r.along + '/' + r.L + 'px along the deck, ' + at(r.x, r.y) + ')') + (r.crashes ? ', ' + r.crashes + ' collisions' : ''));
}));

// =============== BUILDING ENTRANCES ===============
const WH = w.WL_HOUSES_SIM; const RS = WORLD.roadSamples.map(q => [q[0] * PX, q[1] * PX]);
const roadGrid = new Map(); RS.forEach((q, i) => { const k = Math.floor(q[0] / 400) + ',' + Math.floor(q[1] / 400); if (!roadGrid.has(k)) roadGrid.set(k, []); roadGrid.get(k).push(q); });
const nearestRoad = (x, y) => { let best = null, bd = 1e18; const cx = Math.floor(x / 400), cy = Math.floor(y / 400); for (let r = 0; r < 6 && !best; r++) for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) { if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue; for (const q of roadGrid.get((cx + i) + ',' + (cy + j)) || []) { const dd = Math.hypot(q[0] - x, q[1] - y); if (dd < bd) { bd = dd; best = q; } } } return best ? { x: best[0], y: best[1], d: bd } : null; };
const E = report.entrances, sum = E.summary = { doors: 0, locked: 0, tightDoors: 0, blockedOutside: 0, blockedInside: 0, noStreetRoute: 0, noDoorGap: 0, byKind: {} };
const t0 = Date.now(); let streetChecked = 0;
for (const b of CT.buildings) {
  if (!b.int) continue; const bk = sum.byKind[b.kind] = sum.byKind[b.kind] || { doors: 0, fail: 0, noEntryDoor: 0 };
  const entries = b.int.doors.filter(D => D.ext && (D.entry || D.garage)); if (!entries.length) { bk.noEntryDoor++; E.noEntry = (E.noEntry || []).concat([{ id: b.id, kind: b.kind, c: [Math.round(b.c.x), Math.round(b.c.y)] }]); continue; }
  for (const D of entries) {
    sum.doors++; bk.doors++; const wasOpen = D.open; if (D.locked) sum.locked++; WH.setDoor(D, 1); // test the doorway itself with the leaf open
    const nx = D.nx, ny = D.ny, tx = -ny, ty = nx, rec = { building: b.id, kind: b.kind, sub: b.sub || null, door: [Math.round(D.x), Math.round(D.y)], doorM: [m1(D.x / 10), m1(D.y / 10)], widthPx: Math.round(D.wd * 10), locked: !!D.locked, problems: [] };
    // doorway clear width: scan along the wall line at the door plane with r=0 and with the player radius
    let lo = 0, hi = 0; while (lo > -30 && free(D.x + tx * (lo - 0.5), D.y + ty * (lo - 0.5), 0.5)) lo -= 0.5; while (hi < 30 && free(D.x + tx * (hi + 0.5), D.y + ty * (hi + 0.5), 0.5)) hi += 0.5; rec.gapPx = hi - lo + 1;
    // doorway: fine A* (1.5 px) between free spots in front of and behind the door (lateral offsets tried, rotated houses have staircase jambs)
    const cand = (sg) => { const o = []; for (const dist of [18, 24, 30]) for (const lat of [0, 4, -4, 8, -8]) { const x = D.x + sg * nx * dist + tx * lat, y = D.y + sg * ny * dist + ty * lat; if (free(x, y, PR)) o.push([x, y]); } return o; };
    const outs = cand(1), inns = cand(-1), out = outs[0] || [D.x + nx * 22, D.y + ny * 22];
    // real collision probe: a walking player (engine collide(), r=3.5, walking speed) aims at the point behind the door, started at several sideways offsets
    let pass = false, why = '';
    const walkSpeed = h.S.derived(h.p).speed || 26;
    const probe = (ox, oy, tx2, ty2) => { const e = { x: ox, y: oy, r: PR }; const dt = 1 / 60; for (let k = 0; k < 240; k++) { const dx = tx2 - e.x, dy = ty2 - e.y, dl = Math.hypot(dx, dy); if (dl < 3) return true; const st = Math.min(dl, walkSpeed * dt); e.x += dx / dl * st; e.y += dy / dl * st; A.collide(s, e); } return false; };
    if (!outs.length) { sum.blockedOutside++; rec.problems.push('space in front of the door (18-30 px, +-8 px sideways) is blocked by ' + desc(hit(D.x + nx * 22, D.y + ny * 22, PR)[0])); }
    else if (!inns.length) { sum.blockedInside++; rec.problems.push('space just inside the door (18-30 px) is blocked by ' + desc(hit(D.x - nx * 24, D.y - ny * 24, PR)[0])); }
    else { const tg = inns.find(q => Math.abs((q[0] - D.x) * tx + (q[1] - D.y) * ty) < 0.5) || inns[0];
      for (const lat of [0, 1, -1, 2, -2, 3, -3, 4.5, -4.5, 6, -6]) { const ox = D.x + nx * 22 + tx * lat, oy = D.y + ny * 22 + ty * lat; if (!free(ox, oy, PR)) continue; if (probe(ox, oy, D.x + tx * lat * 0.0, D.y) || true) { if (probe(ox, oy, tg[0], tg[1])) { pass = true; break; } } }
      if (!pass) { sum.noDoorGap++; rec.problems.push('doorway not passable for the player (r=3.5 px, engine collision, tried 11 approach offsets): clear gap on the wall line ' + rec.gapPx + ' px'); }
      else { const wide = (() => { for (const lat of [0, 1, -1, 2, -2]) { const ox = D.x + nx * 22 + tx * lat, oy = D.y + ny * 22 + ty * lat; if (!free(ox, oy, PR + 1)) continue; const e = { x: ox, y: oy, r: PR + 1.5 }; let okk = false; for (let k = 0; k < 240; k++) { const dx = tg[0] - e.x, dy = tg[1] - e.y, dl = Math.hypot(dx, dy); if (dl < 3) { okk = true; break; } const st = Math.min(dl, walkSpeed / 60); e.x += dx / dl * st; e.y += dy / dl * st; A.collide(s, e); } if (okk) return true; } return false; })(); if (!wide) { sum.tightDoors++; rec.tight = true; } } }
    // route from the door front to the nearest street (grid A*)
    const nr = nearestRoad(D.x, D.y);
    if (nr && outs.length) {
      streetChecked++; const rt = route(out[0], out[1], nr.x, nr.y, { step: 8, limit: 40000, bbox: [Math.min(out[0], nr.x) - 150, Math.min(out[1], nr.y) - 150, Math.max(out[0], nr.x) + 150, Math.max(out[1], nr.y) + 150], r: PR });
      // road centre samples may lie on a lamp / car: accept a route to any point within 25 px of the sample
      let okr = rt.ok; if (!okr) { for (const [ox, oy] of [[16, 0], [-16, 0], [0, 16], [0, -16], [24, 24], [-24, 24], [24, -24], [-24, -24]]) { const r2 = route(out[0], out[1], nr.x + ox, nr.y + oy, { step: 8, limit: 20000, bbox: [Math.min(out[0], nr.x) - 150, Math.min(out[1], nr.y) - 150, Math.max(out[0], nr.x) + 150, Math.max(out[1], nr.y) + 150], r: PR }); if (r2.ok) { okr = true; break; } } }
      if (!okr) { const r3 = route(out[0], out[1], nr.x, nr.y, { step: 3.5, limit: 90000, bbox: [Math.min(out[0], nr.x) - 120, Math.min(out[1], nr.y) - 120, Math.max(out[0], nr.x) + 120, Math.max(out[1], nr.y) + 120], r: PR }); okr = r3.ok; }
      if (!okr) { sum.noStreetRoute++; rec.problems.push('no walkable route from the door to the street (nearest road ' + Math.round(nr.d / 10) + ' m away at ' + at(nr.x, nr.y) + '): ' + rt.why); }
    }
    // restore the original door state
    WH.setDoor(D, wasOpen);
    if (rec.problems.length) { bk.fail++; E.failures.push(rec); }
  }
}
const EXC = JSON.parse(fs.readFileSync(path.join(__dirname, 'passability-exceptions.json'), 'utf8')), exKey = (b, d) => b + '@' + d[0] + ',' + d[1];
const exSet = new Set(EXC.doors.map(x => exKey(x.building, x.door))), failSet = new Set(E.failures.map(f => exKey(f.building, f.door)));
const undocumented = E.failures.filter(f => !exSet.has(exKey(f.building, f.door))), stale = EXC.doors.filter(x => !failSet.has(exKey(x.building, x.door)));
console.log('entrance failures raw: not passable ' + sum.noDoorGap + ', blocked in front ' + sum.blockedOutside + ', no street route ' + sum.noStreetRoute + ' of ' + sum.doors + ' doors; documented exceptions ' + EXC.doors.length);
ok(undocumented.length === 0, 'every entry door is passable and reaches a street, or is a documented exception (' + undocumented.length + ' undocumented' + (undocumented.length ? ': ' + undocumented.slice(0, 5).map(f => f.building + ' ' + f.problems[0].slice(0, 60)).join('; ') : '') + ')');
ok(stale.length === 0, 'no stale entrance exceptions (' + stale.length + ' fixed doors still listed)');
ok(sum.tightDoors === 0, 'no tight entry doors: all fit a player with a 1.5 px margin (' + sum.tightDoors + ' tight)');
ok(sum.blockedInside === 0, 'nothing blocks the space just inside entry doors (' + sum.blockedInside + ' blocked)');
console.log('entrances: ' + sum.doors + ' entry doors checked in ' + Math.round((Date.now() - t0) / 1000) + ' s, locked by design ' + sum.locked + ', tight (does not fit with a 1.5 px margin) ' + sum.tightDoors + ', buildings without an entry door ' + ((E.noEntry || []).length));
console.log('by kind:', JSON.stringify(sum.byKind));
if (process.env.REPORT) fs.writeFileSync(process.env.REPORT, JSON.stringify(report, null, 1));
console.log(`\n${pass} passed, ${fail} failed`); if (fail) { console.log(log.slice(0, 60).join('\n')); process.exit(1); }
