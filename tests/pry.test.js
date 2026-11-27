// Forced entry (v79): hold E at a locked exterior door (3 s) or garage gate (6 s), noise every second. node tests/pry.test.js
const H = require('./harness');
let pass = 0, fail = 0; const log = [];
const ok = (c, m) => { if (c) pass++; else { fail++; log.push('FAIL: ' + m); } console.log((c ? 'ok   ' : 'FAIL ') + m); };
const h = H.boot({ hour: 12 }), { s, p, w } = h, HS = w.WL_HOUSES_SIM, CT = s.map.city; p.hp = 1e9;
const pick = (pred) => { for (const b of CT.buildings) if (b.int) for (const D of b.int.doors) if (D.ext && pred(D, b)) return { b, D }; return null; };
const stand = (D) => { p.x = D.x + D.nx * 12; p.y = D.y + D.ny * 12; p.drive = null; p.dead = false; p.search = null; p.pry = null; };
const lock = (D) => { HS.setDoor(D, 0); D.locked = true; D.broke = 0; };
function run(D, secs, held, step) { const ev = []; let last = null; for (let t = 0; t < secs; t += step || 0.1) { s.events.length = 0; last = HS.pryTick(s, p, step || 0.1, held); for (const e of s.events) ev.push(e); } return { last, ev }; }
const gate = pick((D) => D.garage), door = pick((D) => !D.garage && D.entry && D.kind === 'door');
ok(!!gate && !!door, 'a garage gate and a house door exist');
{ const D = gate.D; lock(D); stand(D); const r = run(D, 5.5, true); ok(D.locked && !r.last.done && r.last.need === 6, 'gate: still locked after 5.5 s of holding E (needs 6 s)'); const r2 = run(D, 1, true); ok(!D.locked && D.open === 1, 'gate: unlocked and raised after 6 s'); }
{ const D = gate.D; lock(D); stand(D); const r = run(D, 3.5, true); const n = r.ev.filter((e) => e.t === 'noise' && e.kind === 'door').length; ok(n >= 3, 'gate: makes noise every second while prying (' + n + ' events in 3.5 s)'); ok(Math.hypot(r.ev[0].x - D.x, r.ev[0].y - D.y) < 1, 'noise comes from the gate'); }
{ const D = door.D; lock(D); stand(D); const r = run(D, 2.9, true); ok(D.locked, 'door: still locked after 2.9 s'); run(D, 0.3, true); ok(!D.locked && D.open === 1, 'door: unlocked after 3 s'); }
{ const D = door.D; lock(D); stand(D); run(D, 2, true); const r = run(D, 0.1, false); ok(p.pry === null && r.last === null, 'releasing E cancels the progress'); run(D, 2, true); ok(D.locked, 'progress restarts from zero after release'); }
{ const D = door.D; lock(D); stand(D); run(D, 1.5, true); p.x += 40; const r = HS.pryTick(s, p, 0.1, true); ok(r === null || p.pry === null || p.pry.t < 0.2, 'walking away cancels'); }
{ const D = door.D; lock(D); D.broke = 1; stand(D); const r = run(D, 4, true); ok(r.last === null, 'a kicked-in door cannot be pried'); }
{ const D = door.D; HS.setDoor(D, 0); D.locked = false; D.broke = 0; stand(D); const r = run(D, 2, true); ok(r.last === null && !D.open, 'an unlocked door is not "pried" (E just opens it)'); }
{ p.dead = true; const D = door.D; lock(D); stand(D); p.dead = true; const r = HS.pryTick(s, p, 0.1, true); ok(r === null, 'dead player cannot pry'); p.dead = false; }
console.log(`\n${pass} passed, ${fail} failed`); if (fail) { console.log(log.join('\n')); process.exit(1); }
