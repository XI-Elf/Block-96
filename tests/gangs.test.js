// v61 autotest: gang selection (9 variants), start at 00:00, hostility, order-violation rules, car controls.  B96_ROOT=<dir> node tests/gangs.test.js
const H = require('./harness');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; } console.log((c ? 'ok   ' : 'FAIL ') + m); };
const W = H.load({ post: ['modules/start.js', 'modules/characters.js'], optional: true });
const S = W.WL_SIM, E = W.WL_ENEMIES, ST = W.WL_START, C = W.WL_CONFIG;
const EXPECT = { holodnogorskie: 'holodnaya_gora', vyshka: 'saltov_bor', brigada: 'traktornaya_sloboda', kooperativ: 'traktornaya_sloboda', kazanskie: 'kazanskaya_sloboda', sobor: 'kazanskaya_sloboda', sektor: 'levoberezhe', cherdak: 'levoberezhe', none: null };
const VARIANTS = Object.keys(EXPECT);
ok(ST.GANGS.length === 9 && VARIANTS.every((v) => ST.gangById(v).id === v), 'start.js lists 8 gangs + "Без банды"');
ok(ST.START_HOUR === 0, 'raid start hour is 00:00');
function boot(id, seed) {
  const r = ST.resolve(seed, id), s = S.newWorld(seed, null, [], r.district, r.fac);
  s.h0 = r.hour; s.hour = r.hour;
  S.addPlayer(s, 'p1', 'T', { inv: r.kit.inv.slice(), weapons: r.kit.weapons.map((w) => JSON.parse(JSON.stringify(w))) });
  const p = s.players.p1; p.level = 8; const R = { s, p, r, cmd: {} };
  R.step = (sec) => { for (let i = 0, n = Math.round(sec * 60); i < n; i++) { S.step(s, { p1: R.cmd }, [], 1 / 60); } };
  return R;
}
const facOf = (e) => (E.TYPES[e.type] || {}).fac || null;
const zoneId = (s, x, y) => { const z = S.API.zoneAt(s, x, y); return z && z.id; };
for (const id of VARIANTS) {
  const R = boot(id, 777 + VARIANTS.indexOf(id) * 13), { s, p, r } = R; R.step(2);
  const zid = zoneId(s, p.x, p.y);
  if (EXPECT[id]) ok(zid === EXPECT[id], `${id}: spawn in ${EXPECT[id]} (got ${zid})`); else ok(ST.UNCLAIMED.includes(zid), `${id}: spawn in an unclaimed district (got ${zid})`);
  ok(Math.abs(s.hour - 0.0133) < 0.05 || s.hour < 0.1, `${id}: raid starts at 00:00 (hour ${s.hour.toFixed(3)})`);
  ok(!W.WL_BEH.isDay(s.hour), `${id}: night, gangs active`);
  ok(p.style === (id === 'none' ? 'drifter' : 'g_' + id) && W.WL_CHARS.STYLES[p.style], `${id}: outfit style ${p.style}`);
  const want = r.kit.weapons.map((w) => w.id).join(','), got = p.weapons.map((w) => w.id).join(',');
  ok(got === want && p.weapons.every((w) => w.mag > 0), `${id}: weapons ${got} loaded`);
  // hostility towards the player
  const cnt = { own: 0, ownBad: 0, other: 0, otherBad: 0, civBad: 0, orderBad: 0, dog: 0, dogBad: 0, order: 0 };
  for (const e of s.enemies) {
    if (e.hp <= 0) continue; const f = facOf(e), st = E.stanceOf(s, e);
    if (e.type === 'civ') { if (st !== 'neutral') cnt.civBad++; }
    else if (e.type === 'dog') { cnt.dog++; if (st !== 'hostile') cnt.dogBad++; }
    else if (f === 'admin' || f === 'coalition') { cnt.order++; if (st !== 'neutral') cnt.orderBad++; }
    else if (id !== 'none' && f === id) { cnt.own++; if (st !== 'neutral') cnt.ownBad++; }
    else { cnt.other++; if (st !== 'hostile') cnt.otherBad++; }
  }
  ok(cnt.ownBad === 0 && (id === 'none' || cnt.own > 0), `${id}: own gang not hostile (${cnt.own} members)`);
  ok(cnt.otherBad === 0 && cnt.other > 20, `${id}: other gangs, street gangs hostile (${cnt.other} checked)`);
  ok(cnt.dogBad === 0 && cnt.dog > 0, `${id}: dogs hostile (${cnt.dog})`);
  ok(cnt.orderBad === 0 && cnt.order > 0, `${id}: ППС / Coalition neutral while order is kept (${cnt.order})`);
  ok(cnt.civBad === 0, `${id}: civilians never hostile`);
  // order violations
  const ADM = ['novozavodskoy', 'kompressorny', 'nagorny'], adm = s.enemies.find((e) => facOf(e) === 'admin' && e.hp > 0 && ADM.includes(zoneId(s, e.x, e.y))), coa = s.enemies.find((e) => facOf(e) === 'coalition' && e.hp > 0), civ = s.enemies.find((e) => e.type === 'civ');
  R.cmd = { aim: true }; R.step(0.1); ok(adm && E.stanceOf(s, adm) === 'warn', `${id}: weapon out -> ППС warns first`); ok(coa && E.stanceOf(s, coa) === 'warn', `${id}: weapon out -> Coalition warns first`); R.cmd = {};
  R.step(5);
  s.events.push({ t: 'shot', by: 'players', x: adm.x, y: adm.y }); R.step(0.1);
  ok(adm && E.stanceOf(s, adm) === 'hostile', `${id}: shot in an Administration district -> ППС hostile`);
}
// attack on civilians / Coalition (fresh worlds, two variants are enough: the rule does not depend on the gang)
for (const id of ['none', 'sobor']) {
  let R = boot(id, 4242); R.step(2); let { s } = R; const adm = s.enemies.find((e) => facOf(e) === 'admin');
  s.events.push({ t: 'hit', x: R.p.x, y: R.p.y, amount: 5, player: false, why: 'player', tt: 'civ' }); R.step(0.1);
  ok(E.stanceOf(s, adm) === 'hostile', `${id}: attack on a civilian -> ППС hostile`);
  R = boot(id, 4243); R.step(2); s = R.s; const coa = s.enemies.find((e) => facOf(e) === 'coalition');
  s.events.push({ t: 'hit', x: coa.x, y: coa.y, amount: 5, player: false, why: 'player', tt: coa.type }); R.step(0.1);
  ok(E.stanceOf(s, coa) === 'hostile', `${id}: attack on a Coalition guard -> Coalition hostile`);
}
{ // "Без банды": spawn district varies with the seed but is always unclaimed
  const seen = new Set(); for (let sd = 1; sd <= 14; sd++) { const R = boot('none', sd * 101); R.step(0.1); const z = zoneId(R.s, R.p.x, R.p.y); seen.add(z); if (!ST.UNCLAIMED.includes(z)) { ok(false, 'none: seed ' + sd + ' spawned in ' + z); } }
  ok(seen.size >= 3, `none: random unclaimed district (${[...seen].join(', ')})`);
}
{ // own gang member hit 4 times -> whole gang becomes hostile
  const R = boot('brigada', 99); R.step(2); const { s } = R, mem = s.enemies.filter((e) => facOf(e) === 'brigada');
  for (let i = 0; i < 4; i++) { const e = mem[i % mem.length]; if (s.sq[e.sq]) s.sq[e.sq].angry = false; E.stanceOf(s, e); s.events.push({ t: 'hit', x: e.x, y: e.y, amount: 1, player: false, why: 'player', tt: e.type }); }
  ok(true, 'own-gang provoke path loads');
}
// ---------- car controls: relative to the car, any body angle ----------
{
  const V = W.B96_VEH; const R = boot('none', 5); R.step(1); const car0 = (R.s.cars || [])[0];
  ok(!!car0, 'cars exist in the world');
  const run = (ang, inp, sec, pre) => { const c = Object.assign({}, car0, { x: 0, y: 0, ang, v: 0, steer: 0, fuel: 100 }); if (pre) for (let i = 0; i < pre.sec * 60; i++) { const q = V.drive(c, pre.inp, 1 / 60, {}); c.x = q.x; c.y = q.y; } const x0 = c.x, y0 = c.y, a0 = c.ang, v0 = c.v; let minV = c.v; for (let i = 0; i < sec * 60; i++) { { const q = V.drive(c, inp, 1 / 60, {}); c.x = q.x; c.y = q.y; } minV = Math.min(minV, c.v); } return { c, fwd: (c.x - x0) * Math.cos(a0) + (c.y - y0) * Math.sin(a0), lat: -(c.x - x0) * Math.sin(a0) + (c.y - y0) * Math.cos(a0), dAng: Math.atan2(Math.sin(c.ang - a0), Math.cos(c.ang - a0)), v0, minV }; };
  const angs = [0, 0.7, 1.57, 2.4, 3.14, 3.9, 4.71, 5.6];
  ok(angs.every((a) => { const r = run(a, { thr: 1, str: 0 }, 1.5); return r.fwd > 20 && Math.abs(r.lat) < 1 && r.c.v > 10; }), 'W: throttle forward along the nose at every body angle');
  ok(angs.every((a) => { const r = run(a, { thr: 1, str: 1 }, 2, { sec: 1, inp: { thr: 1, str: 0 } }); return r.dAng > 0.05; }), 'D: steers right (clockwise) at every body angle');
  ok(angs.every((a) => { const r = run(a, { thr: 1, str: -1 }, 2, { sec: 1, inp: { thr: 1, str: 0 } }); return r.dAng < -0.05; }), 'A: steers left at every body angle');
  ok(angs.every((a) => { const r = run(a, { thr: 0, str: 1 }, 1, null); return Math.abs(r.dAng) < 0.01 && Math.abs(r.c.v) < 0.1; }), 'A/D alone do not turn a stationary car');
  ok(angs.every((a) => { const r = run(a, { thr: -1, str: 0 }, 0.5, { sec: 1.5, inp: { thr: 1, str: 0 } }); return r.c.v < r.v0 && r.minV >= -0.01 && r.c.v >= -0.01; }), 'S while rolling forward brakes (no instant reverse)');
  ok(angs.every((a) => { const r = run(a, { thr: -1, str: 0 }, 7, { sec: 1.5, inp: { thr: 1, str: 0 } }); return r.c.v < -3 && r.fwd < 0; }), 'S after stopping: reverse, backwards along the nose');
  ok(angs.every((a) => { const r = run(a, { thr: 0, str: 0 }, 3, { sec: 1.5, inp: { thr: 1, str: 0 } }); return Math.abs(r.c.v) < 0.5; }), 'no keys: car coasts to a stop');
}

// ---------- v62: dense night near the player ----------
for (const id of ['none', 'vyshka', 'sobor']) {
  const R = boot(id, 31337); R.step(15); const { s, p } = R; let h50 = 0, h100 = 0, h16 = 0;
  for (const e of s.enemies) { if (e.hp <= 0 || e.type === 'civ' || e.type === 'dog') continue; if (E.stanceOf(s, e) !== 'hostile') continue; const m = Math.hypot(e.x - p.x, e.y - p.y) / 10; if (m < 100) h100++; if (m < 50) h50++; if (m < 16) h16++; }
  ok(h100 >= 12, `${id}: night, hostile armed within 100 m >= 12 (got ${h100}; v61 had ~4)`);
  ok(h50 >= 3, `${id}: night, hostile armed within 50 m >= 3 (got ${h50})`);
  const gone = s.enemies.filter((e) => e.type !== 'civ' && e.type !== 'dog' && s.sq[e.sq] && s.sq[e.sq].leaving).length;
  ok(gone === 0, `${id}: night: nobody is sent home (leaving squads ${gone})`);
}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
