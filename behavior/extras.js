// Block-96: behaviour extras (owner: enemies/behaviour thread). Load AFTER enemies.js (and after modules/interiors_sim.js, modules/vision.js).
// Scripted rules only (state machines, timers, dice from the seeded sim rng): no neural nets, no network.
// Adds to the base behaviour in enemies.js without editing sim.js / game.js:
//   1. gang clashes: hostile factions shoot at each other when they meet (relation <= -70 in the TDD matrix; dogs bite any mob);
//   2. tripwires of "Kooperativ" near garage entrances (fragmentation blast);  3. steel shield of "Brigada" (front hits are mostly absorbed);
//   4. smoke grenades (Kholodnogorskie to close in, Cherdak to distract), firecrackers (Cherdak), Molotov cocktails (Sobor, fire zone);
//   5. doors: residential entrance doors are locked from 15:30 until 10:00; broken doors and windows make noise (45 m) that mobs investigate.
// Client hook (optional): WL_BEH_X.draw(ctx, env) with env = { SCR, Kx, s, t } draws smoke, fire and tripwires seen from close.
'use strict';
(function () {
  const B = window.WL_BEH, E = window.WL_ENEMIES, C = window.WL_CONFIG;
  if (!B || !E) throw new Error('behavior/extras.js needs behavior/factions.js and enemies.js loaded first');
  const hyp = Math.hypot, TAU = Math.PI * 2;
  const T = E.TYPES;
  const K = {
    clash: { range: 150, max: 18, scan: 0.5, lose: 3, rel: -70 },          // px; concurrent shooters; s
    trap: { per: 2, r: 9, splash: 42, dmg: 45, max: 40 },                   // 2 tripwires per Kooperativ squad
    shield: { arc: 1.2, absorb: 0.65 },                                     // rad half-angle in front; share of damage removed
    smoke: { r: 46, life: 14, cd: 20, max: 6 },
    fire: { r: 32, life: 8, cd: 15, dps: 8 },
    petard: { cd: 18 },
    door: { lockShare: 0.3, noiseR: 700 },                                  // share of residential doors locked at night
  };
  const nrm = (a) => { a %= TAU; if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a; };
  const st = (s) => s._x || (s._x = { t: 0, traps: [], smokes: [], fires: [], pend: [], cl: [], cT: 0, tT: 0, dT: 0, nT: 0, gT: 0, locked: null, sqSeen: {}, k: 0 });
  const alivePlayers = (s) => { const o = []; for (const id in s.players) { const p = s.players[id]; if (!p.dead && !p.extracted) o.push(p); } return o; };
  const near = (ps, x, y, r) => { for (const p of ps) if (Math.abs(p.x - x) < r && Math.abs(p.y - y) < r) return true; return false; };
  const SIM_R = 2600;
  const facOf = (e) => { const d = T[e.type]; return d && d.fac ? d.fac : null; };
  const armed = (e) => e.type !== 'civ' && e.type !== 'dog' && e.hp > 0 && !e.dead && !!facOf(e);

  // ---------------------------------------------------------------- smoke blocks sight ----------------
  function blockedBySmoke(s, ax, ay, bx, by) {
    const X = s._x; if (!X || !X.smokes.length) return false;
    for (const m of X.smokes) {
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy; let u = L2 > 0 ? ((m.x - ax) * dx + (m.y - ay) * dy) / L2 : 0; u = Math.max(0, Math.min(1, u));
      if (hyp(ax + dx * u - m.x, ay + dy * u - m.y) < m.r * Math.min(1, m.life / 2) && L2 > 900) return true; // closer than 3 m is not blocked
    }
    return false;
  }
  const V = window.WL_VISION;
  if (V && !V._smoke) {
    V._smoke = true;
    const mobSees = V.mobSees, playerSees = V.playerSees, entAlpha = V.entAlpha;
    if (mobSees) V.mobSees = function (s, e, tgt, API, mult) { return mobSees.call(V, s, e, tgt, API, mult) && !blockedBySmoke(s, e.x, e.y, tgt.x, tgt.y); };
    if (playerSees) V.playerSees = function (s, p, t, API) { return playerSees.call(V, s, p, t, API) && !blockedBySmoke(s, p.x, p.y, t.x, t.y); };
    if (entAlpha) V.entAlpha = function (s, p, e, dt) { const a = entAlpha.call(V, s, p, e, dt); return blockedBySmoke(s, p.x, p.y, e.x, e.y) ? Math.min(a, 0.02) : a; };
  }

  // ---------------------------------------------------------------- shield (Brigada) ----------------
  function shields(s) {
    for (const e of s.enemies) {
      if (e.hp <= 0 || facOf(e) !== 'brigada') continue;
      if (e.shield == null) { const q = s.sq[e.sq]; e.shield = !!(q && (e.idx === 0 || e.type === 'brigada_s')); } // the first fighter of a squad carries the steel shield
      if (!e.shield || e.php == null || e.hp >= e.php - 1e-6) continue;
      const a = Math.atan2(e.ly - e.y, e.lx - e.x);
      if (Math.abs(nrm(a - e.ang)) < K.shield.arc) { const loss = e.php - e.hp; e.hp = e.php - loss * (1 - K.shield.absorb); s.events.push({ t: 'spark', x: e.x + Math.cos(e.ang) * 5, y: e.y + Math.sin(e.ang) * 5, color: '#cfe3ff' }); }
    }
  }

  // ---------------------------------------------------------------- tripwires (Kooperativ) ----------------
  function placeTraps(s, API, X) {
    if (X.traps.length >= K.trap.max) return;
    const free = (x, y) => API.freeSpot(s, x, y, 8);
    for (const k in s.sq) {
      const q = s.sq[k]; if (q.fac !== 'kooperativ' || q._tw || !q.home || !q.members.length) continue; q._tw = 1;
      for (let n = 0; n < K.trap.per && X.traps.length < K.trap.max; n++) for (let t = 0; t < 48; t++) { const a = API.rr(s, 0, TAU), r = API.rr(s, 35, 85), x = q.home.x + Math.cos(a) * r, y = q.home.y + Math.sin(a) * r; if (free(x, y)) { X.traps.push({ x, y, owner: q.id, a: a }); break; } }
    }
  }
  function stepTraps(s, API, X, ps) {
    for (let i = X.traps.length - 1; i >= 0; i--) {
      const tr = X.traps[i]; if (!near(ps, tr.x, tr.y, SIM_R)) continue;
      let hit = null;
      for (const p of ps) if (hyp(p.x - tr.x, p.y - tr.y) < K.trap.r + p.r) { hit = p; break; }
      if (!hit) for (const e of s.enemies) { if (e.hp <= 0 || facOf(e) === 'kooperativ' || Math.abs(e.x - tr.x) > 14 || Math.abs(e.y - tr.y) > 14) continue; if (hyp(e.x - tr.x, e.y - tr.y) < K.trap.r + e.r) { hit = e; break; } }
      if (!hit) continue;
      X.traps.splice(i, 1);
      s.events.push({ t: 'boom', x: tr.x, y: tr.y, r: K.trap.splash * 1.4 }); // client: flash + shake; mobs nearby hear it
      const src = { x: tr.x, y: tr.y, type: 'trap', id: -1 };
      const victims = ps.concat(s.enemies.filter(e => e.hp > 0)); // snapshot: damage() reassigns s.enemies
      for (const v of victims) { const d = hyp(v.x - tr.x, v.y - tr.y); if (d < K.trap.splash && !(v.dead)) API.damage(s, v, K.trap.dmg * (1 - 0.5 * d / K.trap.splash), src); }
      E.noise(s, tr.x, tr.y, 'blast');
    }
  }

  // ---------------------------------------------------------------- thrown gadgets ----------------
  const GADGET = { holodnogorskie: 'smoke', cherdak: 'smoke_petard', sobor: 'molotov' };
  function throwStuff(s, API, X, ps) {
    for (const e of s.enemies) {
      if (e.m !== 'combat' || e.idx !== 0 || e.hp <= 0) continue; const q = s.sq[e.sq], g = q && GADGET[q.fac]; if (!g || (q._gT != null && s.t < q._gT)) continue;
      let p = null, pd = 1e9; for (const o of ps) { const d = hyp(o.x - e.x, o.y - e.y); if (d < pd) { pd = d; p = o; } } if (!p || pd > 260) continue;
      if (g === 'smoke' && pd > 90 && pd < 200 && X.smokes.length < K.smoke.max) { q._gT = s.t + K.smoke.cd; queue(s, X, e, 'smoke', e.x + (p.x - e.x) * 0.55, e.y + (p.y - e.y) * 0.55); } // cover the approach
      else if (g === 'smoke_petard' && pd > 50 && pd < 190) { q._gT = s.t + K.petard.cd; if (X.smokes.length < K.smoke.max) queue(s, X, e, 'smoke', e.x + (p.x - e.x) * 0.4, e.y + (p.y - e.y) * 0.4); const a = Math.atan2(p.y - e.y, p.x - e.x) + (API.rnd(s) < 0.5 ? 1.57 : -1.57); queue(s, X, e, 'petard', p.x + Math.cos(a) * 90, p.y + Math.sin(a) * 90); } // distraction: bang to the side
      else if (g === 'molotov' && pd > 70 && pd < 200 && API.los(s, e, p)) { q._gT = s.t + K.fire.cd; const a = Math.atan2(p.y - e.y, p.x - e.x); queue(s, X, e, 'molotov', p.x + Math.cos(a) * 30, p.y + Math.sin(a) * 30); } // lands just behind the target: cuts the retreat
    }
  }
  function queue(s, X, e, kind, x, y) { X.pend.push({ at: s.t + 0.8, kind, x, y, by: e.id }); s.events.push({ t: 'throw', kind, x0: e.x, y0: e.y, x, y }); }
  function stepPending(s, API, X) {
    for (let i = X.pend.length - 1; i >= 0; i--) {
      const q = X.pend[i]; if (s.t < q.at) continue; X.pend.splice(i, 1);
      if (q.kind === 'smoke') { X.smokes.push({ x: q.x, y: q.y, r: K.smoke.r, life: K.smoke.life }); s.events.push({ t: 'smoke', x: q.x, y: q.y }); }
      else if (q.kind === 'molotov') { X.fires.push({ x: q.x, y: q.y, r: K.fire.r, life: K.fire.life, k: 0 }); s.events.push({ t: 'molotov', x: q.x, y: q.y }); E.noise(s, q.x, q.y, 'glass'); }
      else if (q.kind === 'petard') { s.events.push({ t: 'petard', x: q.x, y: q.y }); for (let k = 0; k < 4; k++) s.events.push({ t: 'spark', x: q.x, y: q.y, color: '#ffd27a' }); E.noise(s, q.x, q.y, 'petard'); }
    }
  }
  function stepZones(s, API, X, dt, ps) {
    for (let i = X.smokes.length - 1; i >= 0; i--) { const m = X.smokes[i]; m.life -= dt; if (m.life <= 0) X.smokes.splice(i, 1); }
    for (let i = X.fires.length - 1; i >= 0; i--) {
      const f = X.fires[i]; f.life -= dt; f.k -= dt; if (f.life <= 0) { X.fires.splice(i, 1); continue; }
      if (f.k > 0) continue; f.k = 0.25;
      const src = { x: f.x, y: f.y, type: 'fire', id: -2 };
      for (const v of ps.concat(s.enemies.filter(e => e.hp > 0 && Math.abs(e.x - f.x) < f.r + 10 && Math.abs(e.y - f.y) < f.r + 10))) if (!v.dead && hyp(v.x - f.x, v.y - f.y) < f.r && facOf(v) !== 'sobor') API.damage(s, v, K.fire.dps * 0.25, src);
    }
  }

  // ---------------------------------------------------------------- gang clashes ----------------
  function clashes(s, API, X, dt, ps) {
    X.cT -= dt;
    if (X.cT <= 0) { // scan: idle / investigating mobs look for a hated faction within shooting range
      X.cT = K.clash.scan;
      const act = [], grid = new Map(), CL = 200;
      for (const e of s.enemies) if (armed(e) && near(ps, e.x, e.y, SIM_R)) { act.push(e); const key = Math.floor(e.x / CL) * 100003 + Math.floor(e.y / CL); let a = grid.get(key); if (!a) grid.set(key, a = []); a.push(e); }
      X.cl = X.cl.filter(id => act.some(e => e.id === id && e.cl));
      for (const a of act) {
        if (X.cl.length >= K.clash.max) break; if (a.cl || !(a.m === 'idle' || a.m === 'invest' || a.m === 'search' || a.m === 'return')) continue; const fa = B.FID[facOf(a)];
        const gx = Math.floor(a.x / CL), gy = Math.floor(a.y / CL); let best = null, bd = K.clash.range;
        for (let i = gx - 1; i <= gx + 1; i++) for (let j = gy - 1; j <= gy + 1; j++) { const c = grid.get(i * 100003 + j); if (c) for (const f of c) { if (f.sq === a.sq) continue; const d = hyp(f.x - a.x, f.y - a.y); if (d >= bd || B.relation(fa, B.FID[facOf(f)]) > K.clash.rel) continue; if (!API.los(s, a, f)) continue; bd = d; best = f; } }
        if (best) { a.cl = { id: best.id, lost: 0 }; X.cl.push(a.id); }
      }
    }
    for (let i = X.cl.length - 1; i >= 0; i--) {
      const a = s.enemies.find(e => e.id === X.cl[i]), def = a && T[a.type]; let drop = !a || !a.cl || a.hp <= 0;
      let f = null; if (!drop) { f = s.enemies.find(e => e.id === a.cl.id); if (!f || f.hp <= 0 || a.m === 'combat' || a.m === 'flee' || a.m === 'warn') drop = true; }
      if (!drop) { const d = hyp(f.x - a.x, f.y - a.y), los = d < K.clash.range * 1.4 && API.los(s, a, f); a.cl.lost = los ? 0 : a.cl.lost + dt; if (a.cl.lost > K.clash.lose || d > K.clash.range * 2) drop = true; else if (los) fireAt(s, API, a, def, f, d, dt); }
      if (drop) { if (a) a.cl = null; X.cl.splice(i, 1); }
    }
  }
  function fireAt(s, API, a, def, f, d, dt) {
    a.pause = Math.max(a.pause, 0.5); a.ang = Math.atan2(f.y - a.y, f.x - a.x); a.alert = Math.max(a.alert, 1);
    const g = def.gun;
    if (!g) { if (def.melee && d < a.r + f.r + def.melee.range && a.cool <= 0) { API.damage(s, f, def.melee.dmg, a); a.cool = def.melee.cd; s.events.push({ t: 'bite', x: f.x, y: f.y }); } return; }
    if (a.mag <= 0) { a.mag = g.mag; a.cool = Math.max(a.cool, g.reload); return; }
    if (a.cool > 0 || d > g.max * 0.95) return;
    API.fire(s, a, g, a.ang, g.spread * 1.2, g.eff, g.max); a.mag--;
    if (a.burst <= 0) a.burst = g.burst || 1; a.burst--; a.cool = a.mag <= 0 ? g.reload : a.burst > 0 ? g.rof : g.burstCd * API.rr(s, 0.8, 1.3);
    // mob bullets never hit other mobs in sim.stepBullets, so the hit is rolled here
    const k = d <= g.eff ? 1 : Math.max(g.minDmg, 1 - (1 - g.minDmg) * Math.min(1, (d - g.eff) / Math.max(1, g.max - g.eff))), pr = Math.max(0.08, Math.min(0.6, 0.62 - d / (g.eff * 2.2)));
    if (API.rnd(s) < pr) API.damage(s, f, g.dmg * Math.max(1, Math.ceil(g.pellets * 0.5)) * k, a);
  }

  // ---------------------------------------------------------------- doors ----------------
  function doors(s, API, X, dt, ps) {
    const HS = window.WL_HOUSES_SIM, CT = s.map && s.map.city; if (!HS || !CT) return;
    X.dT -= dt; X.nT -= dt;
    if (X.dT <= 0) {
      X.dT = 1; const night = B.returnHome(s.hour == null ? 15 : s.hour);
      if (night !== X.locked) { // clock crossed 15:30 / 10:00 (and the first tick of a raid)
        X.locked = night;
        for (const b of CT.buildings) {
          const I = b.int; if (!I || (b.kind !== 'house' && b.kind !== 'panel')) continue;
          for (const D of I.doors) {
            if (!D.ext || !D.entry || D.kind !== 'door' || D.garage || D.broke) continue;
            if (night) { if (D._nl || HS.hsh(b.id, 301) > K.door.lockShare) continue; if (ps.some(p => hyp(p.x - b.c.x, p.y - b.c.y) < Math.max(b.w, b.d) / 2 + 6)) continue; D._nl = { open: D.open, locked: D.locked }; HS.lockDoor(D, true); }
            else if (D._nl) { const o = D._nl; D._nl = null; D.locked = o.locked; if (o.open && !D.locked) HS.setDoor(D, 1); }
          }
        }
      }
    }
    if (X.nT <= 0) { // broken doors / windows / glass near a player make noise
      X.nT = 0.25;
      for (const b of CT.buildings) {
        if (!ps.some(p => Math.abs(b.c.x - p.x) < K.door.noiseR && Math.abs(b.c.y - p.y) < K.door.noiseR)) continue;
        const I = b.int, seen = b._xs || (b._xs = { first: true, d: {}, w: {}, g: 0 });
        if (I) {
          for (const D of I.doors) if (D.broke && !seen.d[D.id]) { seen.d[D.id] = 1; if (!seen.first) E.noise(s, D.x, D.y, 'door'); }
          for (const W of I.wins) if (W.st === 2 && !seen.w[W.id]) { seen.w[W.id] = 1; if (!seen.first) E.noise(s, W.x, W.y, 'glass'); }
        }
        const g = b.brk ? Object.keys(b.brk).length : 0; if (g > seen.g) { if (!seen.first) E.noise(s, b.c.x, b.c.y, 'glass'); seen.g = g; }
        seen.first = false;
      }
    }
  }

  // ---------------------------------------------------------------- step wrapper ----------------
  const base = E.step;
  E.step = function (s, dt, API) {
    if (s.mode === 'base' || !s.map || !s.map.zones) return base(s, dt, API);
    const X = st(s);
    if (s._e) shields(s);
    base(s, dt, API);
    if (!s._e) return;
    const ps = alivePlayers(s); X.t += dt; X.k++;
    if ((X.k & 63) === 1) placeTraps(s, API, X);
    if ((X.k & 3) === 0) stepTraps(s, API, X, ps);
    X.tT -= dt; if (X.tT <= 0) { X.tT = 0.25; throwStuff(s, API, X, ps); }
    stepPending(s, API, X); stepZones(s, API, X, dt, ps);
    clashes(s, API, X, dt, ps); doors(s, API, X, dt, ps);
  };

  // ---------------------------------------------------------------- client drawing (optional hook) ----------------
  // env: { SCR(x, y) -> { x, y }, Kx, s }. Call once per frame after the ground objects and before the HUD.
  function draw(ctx, env) {
    const s = env.s, X = s && s._x; if (!X) return;
    const Kx = env.Kx || 3, ps = alivePlayers(s), now = (typeof performance !== 'undefined' ? performance.now() : 0) / 1000;
    ctx.save();
    for (const f of X.fires) { const q = env.SCR(f.x, f.y), rx = f.r * Kx * 1.3, ry = rx * 0.5, fl = 0.75 + 0.25 * Math.sin(now * 17 + f.x), a = Math.min(1, f.life / 2);
      const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, rx); g.addColorStop(0, `rgba(255,220,120,${0.85 * a * fl})`); g.addColorStop(0.45, `rgba(255,120,30,${0.6 * a})`); g.addColorStop(1, 'rgba(180,40,10,0)');
      ctx.save(); ctx.translate(q.x, q.y); ctx.scale(1, 0.5); ctx.translate(-q.x, -q.y); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q.x, q.y, rx, 0, TAU); ctx.fill(); ctx.restore(); }
    for (const m of X.smokes) { const q = env.SCR(m.x, m.y), a = Math.min(0.75, m.life / 3), rx = m.r * Kx * 1.4;
      for (let i = 0; i < 5; i++) { const ox = Math.sin(now * 0.7 + i * 2.1 + m.x) * rx * 0.3, oy = Math.cos(now * 0.6 + i * 1.7) * rx * 0.12 - i * 3, g = ctx.createRadialGradient(q.x + ox, q.y + oy, 0, q.x + ox, q.y + oy, rx * 0.7); g.addColorStop(0, `rgba(170,175,180,${a * 0.55})`); g.addColorStop(1, 'rgba(150,155,160,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q.x + ox, q.y + oy, rx * 0.7, 0, TAU); ctx.fill(); } }
    for (const t of X.traps) { if (!ps.some(p => hyp(p.x - t.x, p.y - t.y) < 70)) continue; const q = env.SCR(t.x, t.y), w = env.SCR(t.x + Math.cos(t.a) * 22, t.y + Math.sin(t.a) * 22); // the wire is visible from 7 m
      ctx.strokeStyle = 'rgba(210,200,160,0.55)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(w.x, w.y); ctx.stroke(); ctx.fillStyle = 'rgba(160,150,110,0.8)'; ctx.fillRect(q.x - 1.5, q.y - 1.5, 3, 3); }
    ctx.restore();
  }

  window.WL_BEH_X = { K, draw, blockedBySmoke, state: st, version: 1 };
})();
