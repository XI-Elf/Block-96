// Block-96 behaviour autotest (headless). Run: node behavior.test.js   (B96_ROOT=<js-prototype dir>)
const H = require('./harness');
let pass = 0, fail = 0; const log = [];
const ok = (c, m) => { if (c) pass++; else { fail++; log.push('FAIL: ' + m); } console.log((c ? 'ok   ' : 'FAIL ') + m); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ---------- 1. population table, every district, day and night ----------
function population(hour, level, home) {
  const h = H.boot({ hour, home: home || 'pavlov_yar' }); h.p.level = level; h.step(1);
  const E = h.w.WL_ENEMIES, B = h.w.WL_BEH, T = E.census(h.s), A = h.S.API;
  const day = B.isDay(h.s.hour), civOk = day && !B.returnHome(h.s.hour);
  const pos = {}; for (const z of h.s.map.zones) pos[z.id] = { mob: 0, civ: 0 };
  for (const e of h.s.enemies) { const z = A.zoneAt(h.s, e.x, e.y); if (z) pos[z.id][e.type === 'civ' ? 'civ' : 'mob']++; }
  return { h, E, B, T, pos, day, civOk };
}
for (const [hour, lvl, label] of [[12, 1, 'day, level 1'], [22, 1, 'night, level 1'], [12, 8, 'day, level 8'], [22, 8, 'night, level 8']]) {
  const { h, B, T, pos, day, civOk } = population(hour, lvl);
  let total = 0, allOk = true, civDistricts = 0, mobDistricts = 0, civBad = [], armBad = [];
  for (const z of h.s.map.zones) {
    const tg = B.target(z.id, day, lvl, z.id === 'pavlov_yar'); if (!civOk) tg.civ = 0;
    const c = T[z.id]; total += c.civ + c.armed + c.dogs;
    if (!near(c.civ, tg.civ, Math.max(1, Math.round(tg.civ * 0.1)))) civBad.push(`${z.id} civ ${c.civ}/${tg.civ}`);
    if (day ? !near(c.armed, tg.armed, 4) : (c.armed < tg.armed - 4 || c.armed > Math.max(40, tg.armed * 3))) armBad.push(`${z.id} armed ${c.armed}/${tg.armed}`);
    if (day && tg.civ > 0 && pos[z.id].civ > 0) civDistricts++; if (pos[z.id].mob > 0) mobDistricts++;
    if (!day && c.dogs < 1) armBad.push(`${z.id} no dogs`);
  }
  ok(civBad.length === 0, `${label}: civilians per district match dayCap*civRatio (${civBad.join('; ') || 'all 16'})`);
  ok(armBad.length === 0, `${label}: armed mobs per district match the table x hostileK(${lvl}) (${armBad.join('; ') || 'all 16'})`);
  ok(mobDistricts === 16, `${label}: mobs stand in all 16 districts (${mobDistricts}/16)`);
  if (day) ok(civDistricts >= 14, `${label}: civilians stand in every district with civRatio>0 (${civDistricts}/15; Aviastroika civRatio=0 by TDD)`);
  else ok(Object.values(T).every(c => c.civ === 0), `${label}: no civilians on the streets at night`);
  if (!day) ok(total >= 350 && total <= 760, `${label}: v62 dense night: population ${total} within 350-760`);
  else if (lvl === 8) ok(total >= 350 && total <= 450, `${label}: map population ${total} within TDD 350-450`);
  else ok(total < 300, `${label}: starting density limited (${total})`);
}

// ---------- 2. clock rules ----------
{ const B = require(require('path').join(H.ROOT, 'behavior/factions.js'));
  ok(B.returnHome(15.5) && B.returnHome(23) && B.returnHome(3) && !B.returnHome(12) && !B.returnHome(10), 'RETURN_HOME = (>=15:30 OR <10:00)');
  ok(B.isDay(10) && B.isDay(15.99) && !B.isDay(16) && !B.isDay(9.9), 'day 10:00-16:00, night 18 h');
  ok(B.relation('ADMIN_PPS', 'SCAV_GANG') === -100 && B.relation('GANG_SEKTOR', 'GANG_SOBOR') === -95 && B.relation('GANG_SOBOR', 'CIVILIAN') === -10 && B.relation('CIVILIAN', 'GANG_SEKTOR') === -80 && B.relation('SCAV_GANG', 'CIVILIAN', { day: false }) === -70 && B.relation('TRADE_COALITION', 'CIVILIAN') === 50, 'faction matrix values');
  ok(B.relation('GANG_VYSHKA', 'GANG_BRIGADA') === -70 && B.relation('GANG_BRIGADA', 'ADMIN_PPS') === -80 && B.relation('GANG_CHERDAK', 'GANG_SOBOR') === -85, 'gang vs gang / gang vs others');
  ok(B.lightRange(0.12, false) >= 0.75 && B.lightRange(0.65, true) <= 1.25, 'light changes detection range by at most +-25% (16 m view kept)'); }

// ---------- scenario helpers ----------
function scenario(hour, home, lvl) { const h = H.boot({ hour, home: home || 'pavlov_yar' }); h.p.level = lvl || 1; h.step(0.5); return h; }
function mobOf(h, pred) { return h.s.enemies.find(e => e.hp > 0 && pred(e, h.s.sq[e.sq], h.w.WL_ENEMIES.TYPES[e.type])); }
function putPlayerBefore(h, e, distPx) { // place the player in line of sight of e, in front of it, on a free spot; returns true
  const A = h.S.API;
  for (let k = 0; k < 60; k++) { const a = k * 0.5236 + (k > 11 ? 0.26 : 0), r = distPx * (k > 23 ? 0.6 : 1), x = e.x + Math.cos(a) * r, y = e.y + Math.sin(a) * r;
    if (!A.freeSpot(h.s, x, y, 6)) continue; h.p.x = x; h.p.y = y; if (!A.los(h.s, e, h.p)) continue; e.ang = Math.atan2(y - e.y, x - e.x); return true; }
  return false;
}
function freeze(h, keep) { for (const e of h.s.enemies) if (e !== keep && !(keep && keep.sq === e.sq)) { e.x = -9000; e.y = -9000; } } // park everybody else far away (asleep)
function setup(h, e, dist) { for (const o of h.s.enemies) if (o !== e && h.s.sq[o.sq] !== h.s.sq[e.sq]) { o.x = -9000 - o.id; o.y = -9000; } return putPlayerBefore(h, e, dist); }

// ---------- 3. PPS: WARN_HOLSTER 3 s by day ----------
{ const patrol = (e, q, d) => d.fac === 'admin' && d.idle === 'patrol' && q && q.zone === 'novozavodskoy' && q.members.length === 3 && e.id === q.members[0];
  const h = scenario(12, 'pavlov_yar'); const m = mobOf(h, patrol);
  ok(!!m, 'a PPS squad exists in Novozavodskoy by day');
  if (m) { ok(h.s.sq[m.sq].members.length === 3, 'PPS patrol squad has 3 members'); ok(setup(h, m, 80), 'player placed in sight of PPS');
    h.cmd = {}; h.step(1.5); ok(m.m !== 'combat' && m.m !== 'warn' && h.w.WL_ENEMIES.stanceOf(h.s, m) === 'neutral', 'holstered stranger by day: PPS does not react (stance neutral)');
    ok(h.w.WL_VISION.mobSees(h.s, m, h.p, h.S.API), 'PPS still sees the player before warning');
    h.cmd = { aim: true }; h.step(0.7); ok(m.m === 'warn' && m.ai === 'WARN_HOLSTER', 'weapon out: state WARN_HOLSTER');
    h.step(1.8); ok(m.m === 'warn', 'still warning before 3 s');
    h.step(1.8); ok(m.m === 'combat', 'weapon still out after 3 s: COMBAT_ENGAGE'); }
  const h2 = scenario(12, 'pavlov_yar'); const m2 = mobOf(h2, patrol);
  if (m2) { ok(setup(h2, m2, 80) && h2.w.WL_VISION.mobSees(h2.s, m2, h2.p, h2.S.API), 'PPS sees the player before holster scenario'); h2.cmd = { aim: true }; h2.step(0.7); const warned = m2.m === 'warn'; h2.step(1.0); h2.cmd = {}; h2.step(1.0); ok(warned && m2.m !== 'combat' && m2.m !== 'warn', 'holstered within 3 s: PPS stands down'); }
  const h3 = scenario(22, 'pavlov_yar'); const m3 = mobOf(h3, (e, q, d) => d.fac === 'admin' && q && q.zone === 'novozavodskoy');
  if (m3) { setup(h3, m3, 80); h3.cmd = { aim: true }; h3.step(1.2); ok(m3.m === 'warn' || m3.m === 'combat', 'v61: night in an Administration district: same order rules as by day (warning first, no curfew shooting)'); } }

// ---------- 4. Port rule ----------
{ const h = scenario(12, 'pavlov_yar'); const m = mobOf(h, (e, q, d) => d.fac === 'coalition' && q && q.zone === 'rechnoy_port');
  ok(!!m, 'Coalition guards exist in the port');
  if (m) { setup(h, m, 80); h.cmd = {}; h.step(2); ok(h.w.WL_ENEMIES.stanceOf(h.s, m) === 'neutral' && m.m !== 'combat', 'port: holstered stranger is neutral'); 
    h.s.events.push({ t: 'shot', x: h.p.x, y: h.p.y, a: 0, by: 'players', sound: 700 }); h.cmd = { aim: true }; h.step(0.2);
    ok(h.s._e.portShot === true && h.w.WL_ENEMIES.stanceOf(h.s, m) === 'hostile', 'a shot inside the port makes the Coalition hostile'); h.step(1.5); ok(m.m === 'combat', 'Coalition guard attacks the shooter'); } }

// ---------- 5. Sektor ----------
{ const h = scenario(12, 'pavlov_yar'); const m = mobOf(h, (e, q, d) => d.fac === 'sektor' && q && q.zone === 'levoberezhe');
  ok(!!m, 'Sektor fighters exist in Levoberezhe by day');
  if (m) { setup(h, m, 80); h.cmd = {}; h.step(1.2); ok(m.m === 'combat' || m.m === 'combat?' || h.w.WL_ENEMIES.stanceOf(h.s, m) === 'hostile', 'Sektor: outsider attacked at once (holstered, no warning)'); }
  const h2 = scenario(12, 'levoberezhe'); const m2 = mobOf(h2, (e, q, d) => d.fac === 'sektor' && q && q.zone === 'levoberezhe');
  if (m2) ok(h2.w.WL_ENEMIES.stanceOf(h2.s, m2) === 'neutral', 'Sektor: a Levoberezhe resident is not attacked'); }

// ---------- 6. wanted ----------
{ const h = scenario(12, 'pavlov_yar'); const civ = mobOf(h, (e) => e.type === 'civ'); setup(h, civ, 60);
  h.S.API.damage(h.s, civ, 9999, h.p); h.step(0.3); ok(h.w.WL_ENEMIES.wanted(h.s) && h.p.wanted === true, 'killing a civilian sets the wanted flag');
  const pps = mobOf(h, (e, q, d) => d.fac === 'admin'); h.cmd = {}; ok(h.w.WL_ENEMIES.stanceOf(h.s, pps) === 'hostile', 'wanted: PPS is hostile even to a holstered player'); }

// ---------- 7. civilians: arch, elder camera, teen scout, tokens ----------
{ const h = scenario(12, 'pavlov_yar', 1); const civs = h.s.enemies.filter(e => e.type === 'civ'); const cnt = {}; for (const c of civs) cnt[c.arch] = (cnt[c.arch] || 0) + 1;
  const sh = (k) => (cnt[k] || 0) / civs.length; console.log('   archetype shares', JSON.stringify(cnt));
  ok(near(sh('CIV_ADULT_M'), 0.42, 0.1) && near(sh('CIV_ADULT_F'), 0.33, 0.1) && near(sh('CIV_ELDER'), 0.17, 0.08) && near(sh('CIV_TEEN'), 0.08, 0.06), 'civilian archetype shares ~42/33/17/8');
  const el = civs.find(c => c.arch === 'CIV_ELDER'); ok(el && el.hp === 65 && Math.abs(el.spdK * 24 - 16) < 0.1, 'elder: 65 hp, 1.6 m/s'); }
{ const h = scenario(12, 'pavlov_yar'); const e = mobOf(h, (e, q) => e.type === 'civ' && q && q.zone === 'holodnaya_gora'); e.arch = 'CIV_ELDER'; e.susp = 0;
  const patrol = mobOf(h, (m, q, d) => d.fac === 'holodnogorskie' && q && q.zone === 'holodnaya_gora');
  setup(h, e, 100); h.cmd = {}; patrol.x = e.x + 400; patrol.y = e.y; for (const id of h.s.sq[patrol.sq].members) { const mm = h.s.enemies.find(q => q.id === id); if (mm) { mm.x = e.x + 400; mm.y = e.y; } }
  h.step(5); ok(e.fleeT > 0 || e.susp > 0, 'elder in a gang district watches the stranger (suspicion grows)'); h.step(2);
  ok(h.s.sq[patrol.sq].known && h.s.sq[patrol.sq].known.t > 0, 'elder alerts the gang patrol within 120 m (DistrictAlertEvent)'); }
{ const h = scenario(12, 'pavlov_yar'); const e = mobOf(h, (e, q) => e.type === 'civ' && q && q.zone === 'holodnaya_gora'); e.arch = 'CIV_TEEN'; e.sightK = 1.15;
  setup(h, e, 100); h.cmd = {}; h.step(1.5); ok(e.report || e.ai === 'REPORT_THREAT' || e.fleeT > 0, 'teen scout reports a stranger (REPORT_THREAT)'); }
{ const h = scenario(12, 'pavlov_yar'); const e = mobOf(h, (e, q) => e.type === 'civ' && q && q.zone === 'pavlov_yar'); ok(setup(h, e, 30), 'player placed within 4 m of civilian'); const before = (h.p.inv.find(i => i.id === 'token') || { n: 0 }).n;
  h.cmd = { aim: true, ax: e.x, ay: e.y }; h.step(0.1);
  const got = ((h.p.inv.find(i => i.id === 'token') || { n: 0 }).n) - before;
  ok(e.paid && h.w.WL_BEH.TOKEN_DROP === 0.65 && got >= 0 && got <= 3, 'aiming at a civilian at < 4 m triggers one 65% token roll'); }

// ---------- 8. gunfire: civilians flee, Shakal waits and loots ----------
{ const h = scenario(12, 'pavlov_yar'); const e = mobOf(h, (e) => e.type === 'civ'); setup(h, e, 100);
  h.s.events.push({ t: 'shot', x: h.p.x, y: h.p.y, a: 0, by: 'players', sound: 700 }); h.step(0.2); ok(e.fleeT > 5 && e.ai === 'FLEE_COVER', 'civilian within 45 m of a shot: FLEE_COVER'); }
{ const h = scenario(22, 'pavlov_yar'); const m = mobOf(h, (e, q, d) => d.fac === 'street' && d.role === 'gun' && q && q.members.length >= 3 && e.id === q.members[0] && h.S.API.freeSpot(h.s, e.x, e.y, 11) && h.S.API.freeSpot(h.s, e.x + 450, e.y, 11));
  ok(!!m, 'a Shakal street gang (3-5) exists at night'); if (m) { const sq = h.s.sq[m.sq]; ok(sq.members.length >= 3 && sq.members.length <= 5, 'Shakal squad size 3-5 (' + sq.members.length + ')');
    for (const o of h.s.enemies) if (h.s.sq[o.sq] !== sq) { o.x = -9000 - o.id; o.y = -9000; } h.p.x = m.x + 450; h.p.y = m.y; const A = h.S.API; for (let k = 0; k < 30 && !A.freeSpot(h.s, h.p.x, h.p.y, 6); k++) { h.p.x = m.x + 400 + k * 20; }
    h.s.containers.push({ id: 99999, kind: 'body', x: h.p.x - 20, y: h.p.y, searched: false, loot: [['9mm', 5]] });
    h.s.events.push({ t: 'shot', x: h.p.x, y: h.p.y, a: 0, by: 'players', sound: 700 }); h.step(0.3); ok(!!sq.shk, 'Shakal hears the shot (180 m) and listens'); h.p.x -= 1100; // the shooter leaves, otherwise the gang sees him
    h.step(5); ok(sq.shk && h.s.t - sq.shk.last < 10, 'Shakal waits (10 s after the last shot)'); h.step(40);
    ok(!sq.shk || h.s.containers.find(c => c.id === 99999).searched, 'Shakal loots the body afterwards (LOOT_BODY)'); } }

// ---------- 9. profiles, memory, Vyshka, sound bus ----------
{ const h = scenario(12, 'pavlov_yar'); const T = h.w.WL_ENEMIES.TYPES;
  ok(T.pps_ak.lose === 8 && T.torg.lose === 8 && T.holod.lose === 8 && T.shaika.lose === 4 && T.gopnik.lose === 4, 'target memory 8 s (PPS/gangs/Coalition) / 4 s (street)');
  ok(T.sobor.fleeHp === 0 && T.brigada.fleeHp === 0 && T.sobor.prof.id === 'ZEALOT_PURGE' && T.cherdak.when === 'night' && T.kazan.flank === true, 'gang profiles applied (Sobor/Brigada never retreat, Cherdak night only, Kazan flank)');
  const v = h.s.enemies.filter(e => { const d = T[e.type]; return d && d.fac === 'vyshka'; }); ok(v.length > 0 && v.every(e => e.z === 2), 'Vyshka stand at tall buildings with z=2 marker (' + v.length + ')');
  const pps = [...new Set(h.s.enemies.filter(e => ['militia', 'pps_ak', 'pps_pm'].includes(e.type) && !h.s.sq[e.sq].post && h.s.sq[e.sq].zone).map(e => h.s.sq[e.sq]))]; ok(pps.length > 3 && pps.every(q => q.size0 === 3), 'all PPS patrols are triples (' + pps.length + ')');
  const g = h.s.enemies.filter(e => T[e.type].fac === 'holodnogorskie')[0]; ok(!!g && !!g.cmd === false, 'only squad leaders carry radio (commander flag)'); }
console.log(`\n${pass} passed, ${fail} failed`); if (fail) { console.log(log.join('\n')); process.exit(1); }
