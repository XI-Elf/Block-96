// Block-96 no-progress measurement (headless): 5 sim-minutes, player invulnerable and idle.
// A "stalled" NPC has a goal > 5 m away and reports moving in >=4 samples (15 s apart) but moved < 3 m in >60% of them (loitering at the goal is not counted).
// Only NPCs inside the 260 m active bubble count: NPCs farther away sleep (enemies.js SIM_R) and keep a stale moving flag. v79 correction: the v77 note about 9 stalled night squads was a measurement artifact of exactly that.
const H = require('./harness');
let pass = 0, fail = 0; const log = [];
const ok = (c, m) => { if (c) pass++; else { fail++; log.push('FAIL: ' + m); } console.log((c ? 'ok   ' : 'FAIL ') + m); };
for (const [hour, maxFrac] of [[12, 0.05], [22, 0.15]]) {
  const h = H.boot({ hour }), { s } = h; h.p.hp = 1e9; const track = new Map(), movers = new Set();
  for (let k = 0; k < 20; k++) { h.step(15);
    for (const e of s.enemies) { const r = track.get(e.id); if (!r) { track.set(e.id, { x: e.x, y: e.y, mv: 0, st: 0 }); continue; } const d = Math.hypot(e.x - r.x, e.y - r.y); const act = Math.hypot(e.x - h.p.x, e.y - h.p.y) < 2600; /* sleeping NPCs (>260 m, SIM_R) keep a stale moving flag */ const wantsMove = e.goal && Math.hypot(e.goal.x - e.x, e.goal.y - e.y) > 50; /* loitering near the goal is normal */ if (e.moving && act && wantsMove) { r.mv++; movers.add(e.id); if (d < 30) r.st++; } r.x = e.x; r.y = e.y; } }
  const bad = [...track.values()].filter((r) => r.mv >= 4 && r.st >= 4 && r.st / r.mv > 0.6).length, frac = movers.size ? bad / movers.size : 0;
  ok(frac <= maxFrac, 'hour ' + hour + ': stalled ' + bad + ' of ' + movers.size + ' moving NPCs (' + Math.round(frac * 100) + '%, limit ' + Math.round(maxFrac * 100) + '%)');
}
console.log(`\n${pass} passed, ${fail} failed`); if (fail) { console.log(log.join('\n')); process.exit(1); }
