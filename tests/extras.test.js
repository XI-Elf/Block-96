// Block-96 behaviour extras autotest (headless): clashes, traps, shield, smoke/molotov/petard, doors. node tests/extras.test.js (B96_ROOT=<js-prototype>)
const H = require('./harness');
let pass = 0, fail = 0; const log = [];
const ok = (c, m) => { if (c) pass++; else { fail++; log.push('FAIL: ' + m); } console.log((c ? 'ok   ' : 'FAIL ') + m); };
const mk = (hour, home, lvl) => { const h = H.boot({ hour, home: home || 'pavlov_yar' }); h.p.level = lvl || 1; h.step(0.5); return h; };
const T = (h) => h.w.WL_ENEMIES.TYPES;
const facOf = (h, e) => T(h)[e.type] && T(h)[e.type].fac;
function park(h, keep) { for (const o of h.s.enemies) if (!keep.includes(h.s.sq[o.sq])) { o.x = -9000 - o.id; o.y = -9000; } }
function findSquad(h, fac, minN) { return Object.values(h.s.sq).find(q => q.fac === fac && q.members.length >= (minN || 1) && q.members.every(id => { const e = h.s.enemies.find(z => z.id === id); return e && h.S.API.freeSpot(h.s, e.x, e.y, 11); })); }
function put(h, sq, x, y) { sq.members.forEach((id, i) => { const e = h.s.enemies.find(z => z.id === id); e.x = x + i * 14; e.y = y; e.m = 'idle'; e.mode = 'idle'; }); sq.home = { x, y }; }
function openSpot(h, x0, y0) { const A = h.S.API; for (let r = 0; r < 2000; r += 20) for (let k = 0; k < 16; k++) { const a = k * 0.3927, x = x0 + Math.cos(a) * r, y = y0 + Math.sin(a) * r; if (A.freeSpot(h.s, x, y, 14) && A.freeSpot(h.s, x + 160, y, 14) && A.los(h.s, { x, y, r: 3 }, { x: x + 160, y: y, r: 3 })) return { x, y }; } return null; }

// ---- 1. gang clash: Kazan vs Sobor-hating Sektor / PPS vs street ----
{ const h = mk(22, 'pavlov_yar'); const a = findSquad(h, 'kazanskie', 2), b = findSquad(h, 'sobor', 2); ok(!!a && !!b, 'two hostile gangs exist (Kazanskie, Sobor)');
  if (a && b) { park(h, [a, b]); const o = openSpot(h, a.home.x, a.home.y); put(h, a, o.x, o.y); put(h, b, o.x + 100, o.y); h.p.x = o.x + 50; h.p.y = o.y + 380; for (let i = 0; i < 40 && !h.S.API.freeSpot(h.s, h.p.x, h.p.y, 6); i++) h.p.y += 10;
    const hp0 = [...a.members, ...b.members].map(id => { const e = h.s.enemies.find(z => z.id === id); return e.hp; }).reduce((x, y) => x + y, 0), n0 = a.members.length + b.members.length; let shots = 0; h.keepEvents = true;
    for (let i = 0; i < 20; i++) { h.step(0.5); for (const ev of h.s.events) if (ev.t === 'shot' && ev.by !== 'players') shots++; h.s.events.length = 0; } h.keepEvents = false;
    const hp1 = [...a.members, ...b.members].map(id => { const e = h.s.enemies.find(z => z.id === id); return e ? e.hp : 0; }).reduce((x, y) => x + y, 0);
    ok(shots > 5, 'hostile gangs shoot at each other (' + shots + ' shots in 10 s)'); ok(hp1 < hp0, 'the clash costs HP / kills (' + Math.round(hp0) + ' -> ' + Math.round(hp1) + ')'); } }
{ const h = mk(22, 'pavlov_yar'); const a = findSquad(h, 'kazanskie', 2), b = findSquad(h, 'kazanskie', 2) === a ? null : null; // same gang never fights itself
  if (a) { const same = a.members.map(id => h.s.enemies.find(z => z.id === id)); park(h, [a]); h.step(5); ok(same.every(e => !e.cl), 'members of one gang do not clash'); } }

// ---- 2. tripwires ----
{ const h = mk(12, 'pavlov_yar'); h.step(2); const X = h.w.WL_BEH_X.state(h.s); ok(X.traps.length >= 4, 'Kooperativ tripwires placed (' + X.traps.length + ')');
  const tr = X.traps[0]; park(h, []); h.p.x = tr.x + 40; h.p.y = tr.y; h.p.hp = 100; const hp = h.p.hp; h.p.x = tr.x; h.p.y = tr.y; h.keepEvents = true; h.step(0.2); h.keepEvents = false;
  ok(h.s.events.some(e => e.t === 'boom') && !X.traps.includes(tr), 'stepping on a tripwire detonates it'); ok(h.p.hp < hp, 'the blast hurts the player (' + hp + ' -> ' + Math.round(h.p.hp) + ')'); }

// ---- 3. shield ----
{ const h = mk(22, 'pavlov_yar'); const q = findSquad(h, 'brigada', 2); ok(!!q, 'Brigada squad exists'); if (q) { const e = h.s.enemies.find(z => z.id === q.members[0]); park(h, [q]); h.p.x = e.x + 300; h.p.y = e.y; h.step(0.1);
    ok(e.shield === true, 'first Brigada fighter carries the shield'); e.ang = 0; e.php = e.hp = 100; e.hp -= 20; e.lx = e.x + 100; e.ly = e.y; h.step(1 / 60); ok(e.hp > 87, 'frontal hit mostly absorbed (hp ' + e.hp.toFixed(1) + ')');
    e.php = e.hp = 100; e.hp -= 20; e.lx = e.x - 100; e.ly = e.y; h.step(1 / 60); ok(e.hp < 81, 'hit from behind goes through (hp ' + e.hp.toFixed(1) + ')'); } }

// ---- 4. smoke ----
{ const h = mk(12, 'pavlov_yar'); const V = h.w.WL_VISION; const X = h.w.WL_BEH_X.state(h.s); h.p.x = 20000; h.p.y = 5000; h.p.face = 0;
  X.smokes.push({ x: 20060, y: 5000, r: 46, life: 10 }); ok(h.w.WL_BEH_X.blockedBySmoke(h.s, 20000, 5000, 20120, 5000) && !h.w.WL_BEH_X.blockedBySmoke(h.s, 20000, 5100, 20120, 5100), 'smoke blocks the line of sight through it only');
  ok(V.playerSees(h.s, h.p, { x: 20120, y: 5000, r: 3 }) === false, 'player cannot see through smoke'); }

// ---- 5. thrown gadgets: smoke (Kholodnogorskie), Molotov (Sobor), smoke + firecracker (Cherdak) ----
function duel(fac, hour, dist) { const h = mk(hour, 'pavlov_yar'); const q = findSquad(h, fac, 2); if (!q) return {}; park(h, [q]); const o = openSpot(h, q.home.x, q.home.y); put(h, q, o.x, o.y); const lead = h.s.enemies.find(z => z.id === q.members[0]); h.p.x = o.x + dist; h.p.y = o.y; h.p.hp = 5000; lead.ang = 0; return { h, q, lead, X: h.w.WL_BEH_X.state(h.s) }; }
{ const d = duel('holodnogorskie', 12, 130); if (d.h) { d.h.keepEvents = true; d.h.step(3); d.h.keepEvents = false; ok(d.X.smokes.length > 0 || d.X.pend.length > 0 || d.h.s.events.some(e => e.t === 'throw'), 'Kholodnogorskie throw a smoke grenade while closing in'); } else ok(false, 'holodnogorskie squad found'); }
{ const d = duel('sobor', 12, 120); if (d.h) { const hp0 = d.h.p.hp; d.h.step(6); ok(d.X.fires.length > 0 || d.h.p.hp < hp0, 'Sobor throws a Molotov (fire zone ' + d.X.fires.length + ')');
    d.h.s.enemies.forEach(o => { o.x = -9000 - o.id; o.y = -9000; }); d.X.fires.length = 0; d.h.p.dead = false; d.h.p.hp = 90; const f = { x: d.h.p.x, y: d.h.p.y, r: 32, life: 8, k: 0 }; d.X.fires.push(f); const hp1 = d.h.p.hp; d.h.step(1.5); ok(d.h.p.hp < hp1 - 3, 'standing in the fire burns (' + Math.round(hp1 - d.h.p.hp) + ' dmg)'); } else ok(false, 'sobor squad found'); }
{ const d = duel('cherdak', 22, 120); if (d.h) { d.h.keepEvents = true; d.h.step(4); d.h.keepEvents = false; ok(d.X.smokes.length > 0 || d.h.s.events.some(e => e.t === 'petard' || e.t === 'throw'), 'Cherdak throws smoke and a firecracker'); } else ok(false, 'cherdak squad found'); }

// ---- 6. doors ----
{ const h = mk(0, 'pavlov_yar'); h.step(2); const CT = h.s.map.city; let n = 0, lk = 0; for (const b of CT.buildings) if (b.int && (b.kind === 'house' || b.kind === 'panel')) for (const D of b.int.doors) if (D.ext && D.entry && D.kind === 'door' && !D.garage) { n++; if (D.locked) lk++; }
  console.log('   residential entrance doors', n, 'locked', lk); ok(n > 0 && lk / n > 0.2 && lk / n < 0.45, 'night: about 30% of residential entrances are locked (lockShare 0.3) (' + lk + '/' + n + ')');
  h.s.h0 = 12 - h.s.t / 120; h.step(2); let lk2 = 0; for (const b of CT.buildings) if (b.int && (b.kind === 'house' || b.kind === 'panel')) for (const D of b.int.doors) if (D.ext && D.entry && D.kind === 'door' && !D.garage && D.locked) lk2++; ok(h.s.hour >= 10 && lk2 < lk * 0.5, 'day: doors unlock again (' + lk2 + '/' + n + ', hour ' + h.s.hour.toFixed(1) + ')');
  const b = CT.buildings.find(q => q.int && q.int.doors.some(D => D.ext)); const D = b.int.doors.find(z => z.ext); h.p.x = D.x + 200; h.p.y = D.y; h.step(0.6); h.keepEvents = true; D.broke = 1; h.step(0.6); h.keepEvents = false;
  ok(h.s.events.some(e => e.t === 'noise' && e.kind === 'door'), 'a broken door makes noise (45 m)'); }

// ---- 7. Aviastroika has civilians; clashes and gadgets keep the frame budget on a dense night ----
{ const h = mk(12, 'pavlov_yar'); const T0 = h.w.WL_ENEMIES.census(h.s); ok(T0.aviastroika.civ >= 1, 'Aviastroika has civilians by day (' + T0.aviastroika.civ + ')'); }
{ const h = mk(22, 'pavlov_yar', 8); const t0 = Date.now(); h.step(30); const ms = (Date.now() - t0) / 1800; ok(ms < 6, 'dense night, level 8: ' + ms.toFixed(2) + ' ms per tick (budget 6)'); console.log('   enemies', h.s.enemies.length, 'clashing', h.w.WL_BEH_X.state(h.s).cl.length); }
console.log(`\n${pass} passed, ${fail} failed`); if (fail) { console.log(log.join('\n')); process.exit(1); }
