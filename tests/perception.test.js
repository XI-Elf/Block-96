// Block-96 perception autotest (headless): hostile squads must not know where the player is without seeing or hearing it.
// Sanctioned exception (documented, v73 night-raid ring squads, enemies.js "sq.known = p"): a squad spawned by the night-raid ring starts with the player's position.
// node tests/perception.test.js
const H = require('./harness');
let pass = 0, fail = 0; const log = [];
const ok = (c, m) => { if (c) pass++; else { fail++; log.push('FAIL: ' + m); } console.log((c ? 'ok   ' : 'FAIL ') + m); };
const park = (h, keep) => { for (const o of h.s.enemies) if (!keep.includes(h.s.sq[o.sq])) { o.x = -9000 - o.id; o.y = -9000; } };
const findSquad = (h, fac, n) => Object.values(h.s.sq).find((q) => q.fac === fac && q.members.length >= n && q.members.every((id) => { const e = h.s.enemies.find((z) => z.id === id); return e && h.S.API.freeSpot(h.s, e.x, e.y, 11); }));
const put = (h, sq, x, y) => { sq.members.forEach((id, i) => { const e = h.s.enemies.find((z) => z.id === id); e.x = x + i * 14; e.y = y; e.m = 'idle'; e.mode = 'idle'; }); sq.home = { x, y }; };
const spot = (h, x0, y0) => { const A = h.S.API; for (let r = 0; r < 3000; r += 20) for (let k = 0; k < 16; k++) { const a = k * 0.3927, x = x0 + Math.cos(a) * r, y = y0 + Math.sin(a) * r; if (A.freeSpot(h.s, x, y, 14)) return { x, y }; } return null; };

// A. far, unseen squad: never learns the player's position
for (const seed of [12345, 777, 31337]) {
  const h = H.boot({ hour: 12, seed, home: 'pavlov_yar' }); h.p.hp = 1e9; h.step(1);
  const sq = findSquad(h, 'kazanskie', 2) || Object.values(h.s.sq).find((q) => q.members.length >= 2 && q.fac && q.fac !== 'players' && q.type !== 'civ'); if (!sq) { ok(false, 'seed ' + seed + ': a hostile squad exists'); continue; }
  park(h, [sq]); const a = spot(h, h.p.x, h.p.y); put(h, sq, a.x, a.y); const far = spot(h, a.x + 900, a.y); h.p.x = far.x; h.p.y = far.y; // ~90 m apart
  const lead = h.s.enemies.find((e) => e.id === sq.members[0]);
  let known = false, engaged = false; for (let i = 0; i < 40; i++) { h.step(1); if (sq.known && Math.hypot(sq.known.x - h.p.x, sq.known.y - h.p.y) < 60) known = true; for (const id of sq.members) { const e = h.s.enemies.find((z) => z.id === id); if (e && (e.m === 'combat' || e.m === 'warn') && Math.hypot(e.x - h.p.x, e.y - h.p.y) > 400) engaged = true; } }
  ok(!known, 'seed ' + seed + ': squad 90 m away and unseen never gets the player position (sq.known)');
  ok(!engaged, 'seed ' + seed + ': unseen squad does not enter combat/warn against a far player');
}
// B. a shot is heard (probabilistically, up to 220 m at night): the squad investigates the SHOT position, never the player's own position
{ const h = H.boot({ hour: 22, seed: 12345, home: 'pavlov_yar' }); h.p.hp = 1e9; h.step(1);
  const sq = findSquad(h, 'kazanskie', 2); ok(!!sq, 'B: a Kazan squad exists at night');
  if (sq) { park(h, [sq]); const a = spot(h, h.p.x, h.p.y); put(h, sq, a.x, a.y); const far = spot(h, a.x - 1500, a.y); h.p.x = far.x; h.p.y = far.y; const shot = { x: a.x + 700, y: a.y }; // shot 70 m from the squad, player 150 m the other way
    let heard = null, tries = 0; for (; tries < 40 && !heard; tries++) { sq.known = null; sq.heardT = null; h.s.events.push({ t: 'shot', by: 'players', x: shot.x, y: shot.y }); h.step(0.1); if (sq.known) heard = sq.known; h.step(6); }
    ok(!!heard, 'B: the squad hears a shot 70 m away within 40 attempts (hearing is probabilistic) - heard after ' + tries);
    ok(!!heard && Math.hypot(heard.x - shot.x, heard.y - shot.y) < 20, 'B: remembered point = shot position' + (heard ? ' (off by ' + Math.round(Math.hypot(heard.x - shot.x, heard.y - shot.y)) + ' px)' : ''));
    ok(!!heard && Math.hypot(heard.x - h.p.x, heard.y - h.p.y) > 600, 'B: remembered point is not the player position'); } }
// C. out of hearing range: a shot 300 m away (night range 220 m) is never heard by a gang squad
{ const h = H.boot({ hour: 22, seed: 12345, home: 'pavlov_yar' }); h.p.hp = 1e9; h.step(1);
  const sq = findSquad(h, 'kazanskie', 2); if (sq) { park(h, [sq]); const a = spot(h, h.p.x, h.p.y); put(h, sq, a.x, a.y); const far = spot(h, a.x - 1500, a.y); h.p.x = far.x; h.p.y = far.y; let heard = false;
    for (let i = 0; i < 30; i++) { sq.known = null; sq.heardT = null; h.s.events.push({ t: 'shot', by: 'players', x: a.x + 3000, y: a.y }); h.step(0.1); if (sq.known) heard = true; h.step(6); }
    ok(!heard, 'C: a shot 300 m away is never heard (30 attempts)'); } }
console.log(`\n${pass} passed, ${fail} failed`); if (fail) { console.log(log.join('\n')); process.exit(1); }
