// Owner: movement/combat thread.
// window.WL_PLAYER = { step(s, p, cmd, dt, API) } replaces the built-in player step.
// Deterministic: no Math.random, no DOM, all state lives on `p`.
//
// Strategy: the built-in step still does timers, abilities, melee, searching, extraction and needs.
// We call it with movement/fire/reload neutralised, then run our own movement, stamina and weapon code.
// Tuning lives in WL_PLAYER.TUNE (overridable via window.WL_CONFIG.MOVE) so balance is not hard-coded below.
'use strict';
(function () {
  const C = window.WL_CONFIG, D2R = Math.PI / 180;
  const TUNE = Object.assign({
    accel: 1500,          // px/s^2 while a direction is held (150 px/s reached in ~0.1 s)
    accelSprint: 520,     // sprint is a ramp, not a switch: full speed in ~0.35 s
    decel: 2300,          // stopping takes ~0.07 s walking
    decelSprint: 900,     // sprint carries momentum, stopping takes ~0.2 s
    backMul: 0.78,        // walking away from the aim direction
    sideMul: 0.9,         // strafing
    reloadMul: 0.88,      // moving while reloading
    tiredMul: 0.8,        // exhausted: no sprint and slower walk until stamina recovers
    sprintMinDot: -0.2,   // sprint only toward the aim side (cos of angle), no backwards sprint
    sprintExit: 0.22,     // s: weapon not ready right after a sprint ends
    fireDelayOnSwap: 0.25,
    stamMelee: 8,         // stamina cost of a melee swing
    recGain: 0.55,        // recoil climb (deg) per shot = def.kick * recGain
    recMax: 9,            // max recoil climb, deg
    recDelay: 0.14,       // s after the last shot before recoil starts to recover
    recDecay: 14,         // deg/s recovery of the recoil climb
    recSide: 0.45,        // fraction of the climb that drifts sideways (side flips per burst)
    holdSteady: 0.5,      // s standing still before the steady-aim bonus
    steadyMul: 0.7,       // spread multiplier while settled
  }, C.MOVE || {});

  function init(p) {
    if (p._pl) return;
    p._pl = true;
    p.sprintT = 0;      // 0..1 sprint ramp (HUD and camera read it)
    p.sprintOut = 0;    // s left of the post-sprint weapon delay
    p.still = 0;        // s standing still
    p.rec = 0;          // recoil climb in degrees
    p.recDir = 1;       // +1 / -1 drift side, flips per burst
    p.recT = 9;         // s since the last shot
    p.reloadMax = 0;    // for the reload bar
    p.shots = 0;        // shots fired, keeps the recoil pattern deterministic
    p.speedNow = 0;
    p._vx = 0; p._vy = 0;
  }

  function step(s, p, cmd, dt, API) {
    const SIM = window.WL_SIM;
    if (p.dead || p.extracted) return API.builtin.stepPlayer(s, p, cmd, dt);
    init(p);
    const d = API.derived(p), ST = C.STAMINA;
    const prevMelee = p.melee || 0;
    const keep = { stam: p.stam, stamDelay: p.stamDelay, tired: p.tired };

    // 1) built-in: timers, ability, melee, search/extract, needs. Movement and weapon off.
    p.vx = 0; p.vy = 0; // otherwise the built-in inertia would move us twice
    const bx = p.x, by = p.y;
    API.builtin.stepPlayer(s, p, { ax: cmd.ax, ay: cmd.ay, interact: cmd.interact, ability: cmd.ability, melee: cmd.melee, slot: cmd.slot }, dt);
    p.x = bx; p.y = by; p.vx = p._vx; p.vy = p._vy;
    p.stam = keep.stam; p.stamDelay = keep.stamDelay; p.tired = keep.tired;
    if (p.dead || p.extracted) return;
    if (cmd.slot != null && p.cur === cmd.slot) p.cool = Math.max(p.cool, TUNE.fireDelayOnSwap);
    if ((p.melee || 0) > prevMelee) p.stam = Math.max(0, p.stam - TUNE.stamMelee);

    // 2) aim
    p.ax = cmd.ax != null ? cmd.ax : p.ax; p.ay = cmd.ay != null ? cmd.ay : p.ay;
    if (window.WL_VISION) WL_VISION.update(p, dt);
    const aimA = Math.atan2(p.ay - p.y, p.ax - p.x), cosA = Math.cos(aimA), sinA = Math.sin(aimA);
    // Where the bullet goes: if the cursor pixel lies on a body's silhouette, at that body's centre; otherwise at the ground point under the cursor.
    const shotA = silhouetteAim(s, p, aimA);

    // 3) intent
    let mx = cmd.mx || 0, my = cmd.my || 0; const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    const dirDot = ml > 0.05 ? (mx * cosA + my * sinA) / Math.max(ml, 1) : 0; // +1 toward aim, -1 away
    const ws = API.weaponStats(p);
    const searching = !!p.search;

    // 4) sprint + stamina. Firing cancels sprint (stop to shoot). Tired = locked out until `recover`.
    const canSprint = ml > 0.1 && !searching && !p.tired && p.stam > 0 && dirDot > TUNE.sprintMinDot && !(cmd.fire && ws && p.reload <= 0);
    const wantSprint = !!cmd.sprint && canSprint;
    if (wantSprint) {
      const run = p.speedNow > 8 || p.sprintT < 0.5; // pushing into a wall costs nothing
      if (run) p.stam = Math.max(0, p.stam - ST.drain * dt); p.stamDelay = ST.regenDelay;
      if (p.stam <= 0) p.tired = true;
      p.sprintT = Math.min(1, p.sprintT + dt / 0.35);
    } else {
      if (p.sprinting) p.sprintOut = TUNE.sprintExit;
      p.stamDelay = Math.max(0, p.stamDelay - dt);
      if (p.stamDelay <= 0) p.stam = Math.min(d.stamMax, p.stam + ST.regen * (ml > 0.1 ? 0.6 : 1) * dt);
      if (p.tired && p.stam >= ST.recover) p.tired = false;
      p.sprintT = Math.max(0, p.sprintT - dt / 0.25);
    }
    p.sprinting = wantSprint;
    p.sprintOut = Math.max(0, p.sprintOut - dt);

    // 5) velocity: target speed with direction modifiers, then constant acceleration / deceleration
    const AD = C.ABILITIES.adrenaline;
    let mul = p.adren > 0 ? AD.speed : 1;
    if (ml > 0.05) {
      const back = Math.max(0, -dirDot), side = 1 - Math.abs(dirDot);
      mul *= 1 - back * (1 - TUNE.backMul) - side * (1 - TUNE.sideMul);
    }
    if (p.reload > 0) mul *= TUNE.reloadMul;
    if (p.tired) mul *= TUNE.tiredMul;
    if (searching) mul = 0;
    const over = SIM.invWeight(p) > d.carry;
    const top = d.speed * (over ? 0.6 : 1) * mul * (1 + (ST.sprintMul - 1) * p.sprintT);
    const tvx = mx * top, tvy = my * top;
    const sp = p.sprintT > 0.05;
    const acc = (ml > 0.05 ? (sp ? TUNE.accelSprint : TUNE.accel) : (sp ? TUNE.decelSprint : TUNE.decel)) * dt;
    const dx = tvx - p.vx, dy = tvy - p.vy, dl = Math.hypot(dx, dy);
    if (dl <= acc) { p.vx = tvx; p.vy = tvy; } else { p.vx += dx / dl * acc; p.vy += dy / dl * acc; }
    const px0 = p.x, py0 = p.y; p.x += p.vx * dt; p.y += p.vy * dt; API.collide(s, p);
    if (dt > 0) { // walls swallow the velocity component that pushed into them
      const rx = (p.x - px0) / dt, ry = (p.y - py0) / dt;
      if (Math.abs(rx) < Math.abs(p.vx) * 0.5) p.vx = rx;
      if (Math.abs(ry) < Math.abs(p.vy) * 0.5) p.vy = ry;
    }
    p._vx = p.vx; p._vy = p.vy;
    p.speedNow = Math.hypot(p.vx, p.vy);
    p.moving = p.speedNow > 6 && !searching;
    p.still = p.moving ? 0 : p.still + dt;

    // 6) weapon: reload, recoil, fire
    p.recT += dt;
    if (p.recT > TUNE.recDelay) p.rec = Math.max(0, p.rec - TUNE.recDecay * dt);
    if (!ws) { p.reloadMax = 0; return; }
    const { w, def } = ws, reserve = API.invCount(p, def.ammo);
    if (cmd.reload && p.reload <= 0 && w.mag < def.mag && reserve > 0) { p.reloadMax = def.reload * d.reloadMul * (p.adren > 0 ? AD.reload : 1); p.reload = p.reloadMax; }
    if (p.reload > 0) {
      p.reload -= dt;
      if (p.reload <= 0) { const k = API.invTake(p, def.ammo, def.mag - w.mag); w.mag += k; p.reload = 0; p.reloadMax = 0; }
      return;
    }
    p.reloadMax = 0;
    if (!cmd.fire || p.cool > 0 || searching || p.sprintOut > 0 || p.sprintT > 0.3) return;
    if (w.mag <= 0) {
      if (reserve > 0) { p.reloadMax = def.reload * d.reloadMul; p.reload = p.reloadMax; }
      else { p.cool = 0.4; s.events.push({ t: 'empty', pid: p.id }); }
      return;
    }
    if (p.recT > 0.35) p.recDir = (p.shots & 1) ? -1 : 1; // new burst: flip the drift side
    const m = ws.m;
    const steady = p.still >= TUNE.holdSteady ? TUNE.steadyMul : 1;
    const spread = (def.spread * steady + (p.moving ? def.moveSpread * Math.min(1, p.speedNow / d.speed) : 0) + (p.sprintT > 0 ? ST.spreadAdd : 0) + p.bloom + p.rec * 0.5) * d.spreadMul * m.spread;
    const drift = p.rec * TUNE.recSide * p.recDir * D2R * 0.5;
    const kick = def.kick * m.kick;
    API.fire(s, p, m.dmg === 1 ? def : Object.assign({}, def, { dmg: def.dmg * m.dmg }), shotA + drift, spread, ws.eff, ws.max, { quiet: m.noise < 0.6, kick });
    w.mag--; p.cool = def.rof; p.shots++;
    p.bloom = Math.min(p.bloom + def.bloom * m.bloom, 12);
    p.rec = Math.min(TUNE.recMax, p.rec + kick * TUNE.recGain); p.recT = 0;
    const nr = 650 * m.noise * (p.sprintT > 0.3 ? ST.noiseMul : 1);
    for (const e of s.enemies) if (Math.hypot(e.x - p.x, e.y - p.y) < nr) { e.alert = Math.max(e.alert, 5); e.lx = p.x; e.ly = p.y; }
  }

  // BUG FIX "aim at the head, bullet misses": game.js maps the mouse pixel onto the GROUND plane, but a head drawn 1.7 m up sits on screen
  // ~2 m up-left of the feet, so the ground point under the head pixel is ~2.9 m beside the target. The cursor really is a view ray (every
  // point that projects to that pixel). We intersect that ray with a vertical cylinder around each body (radius = body radius + a little
  // slack, height 0..H); if it passes through, the shot is aimed at the body's centre. Spread (def.spread, bloom, recoil) then decides the hit.
  const ISO = C.ISO_H != null ? C.ISO_H : 12.25;   // world px per metre of height in the 3/4 view (game.js: VMh / Kx)
  const BODY_H = { dog: 0.75, ghoul: 0.75 }, SLACK = 1.5; // metres; px slack around the body radius
  function silhouetteAim(s, p, aimA) {
    const gx = p.ax, gy = p.ay; let best = null, bd = 1e9;
    const test = (a) => {
      if (a === p || a.dead || a.extracted) return;
      if (Math.abs(a.x - p.x) > 700 || Math.abs(a.y - p.y) > 700) return;
      const H = (BODY_H[a.type] || 1.8), ux = gx - a.x, uy = gy - a.y;
      const zeta = Math.min(H, Math.max(0, -(ux + uy) / (2 * ISO)));      // closest point of the view ray to the body axis, inside its height
      const d = Math.hypot(ux + zeta * ISO, uy + zeta * ISO);
      if (d <= (a.r || 3.5) + SLACK && d < bd) { bd = d; best = a; }
    };
    for (const e of s.enemies) test(e);
    for (const id in s.players) test(s.players[id]);
    p.aimTarget = best ? best.id : null;
    return best ? Math.atan2(best.y - p.y, best.x - p.x) : aimA;
  }

  window.WL_PLAYER = { step, TUNE, silhouetteAim };
})();
