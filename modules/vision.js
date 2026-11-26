// Owner: movement/combat thread. Shared field-of-view for the player and mobs (cone + small near circle + line of sight).
// Sim side (deterministic, no DOM): WL_VISION.sees / mobSees / update.  Client side: drawFog (grey map outside the view), entVisible.
// Rules (user): you see colour only inside your cone; outside it the map is drawn grey (no darkness), live targets
// (mobs, enemies) are NOT drawn, they vanish the moment you turn away. Walls and line of sight cut the cone.
'use strict';
(function () {
  const C = window.WL_CONFIG, D2R = Math.PI / 180, PXM = C.PX_PER_M || 10;
  // half = half-angle (deg), range / near in px (10 px = 1 m). near = small circle around the viewer (no blindness point blank).
  const VIS = Object.assign({
    player: { half: 60, range: 350, near: 40 },     // 120 deg, 35 m, 4 m circle
    aim:    { half: 45, range: 400, near: 40 },     // weapon raised: narrower (90 deg), a bit further
    bino:   { half: 14, range: 800, near: 40 },     // binoculars: 28 deg tube, 80 m
    mob:    { half: 55, range: 160, near: 30 },     // mobs: 110 deg, 16 m (user), 3 m circle
    turn: 14,                                        // rad/s: how fast the player's facing follows the cursor
    fade: 7,                                         // 1/s: live targets fade in/out (hides flicker at the cone edge)
    greyTone: '#7c8084', greyVeil: 0.22,             // outside the view: desaturated map under a light grey veil
  }, C.VISION || {});

  const angDiff = (a, b) => { let d = (a - b) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };

  function playerCfg(p) { return p && p.bino ? VIS.bino : p && p.aiming ? VIS.aim : VIS.player; }
  function inCone(vx, vy, face, cfg, tx, ty, pad) {
    const dx = tx - vx, dy = ty - vy, d = Math.hypot(dx, dy), r = pad || 0;
    if (d > cfg.range + r) return false;
    if (d <= cfg.near + r) return true;
    return Math.abs(angDiff(Math.atan2(dy, dx), face)) <= cfg.half * D2R + Math.atan2(r, d);
  }
  // viewer: { x, y, face }; target: { x, y, r? }. API.los: wall check. Stealth shrinks range for the player target.
  function sees(s, viewer, target, cfg, API) {
    if (!inCone(viewer.x, viewer.y, viewer.face, cfg, target.x, target.y, target.r || 0)) return false;
    return API.los(s, viewer, target);
  }
  function mobFace(e) { return e.ang || 0; }
  // Mob sees the target (player or other mob): own cone, 16 m, line of sight. `mult` = stealth multiplier of the target.
  function mobSees(s, e, tgt, API, mult) {
    const cfg = mult && mult !== 1 ? Object.assign({}, VIS.mob, { range: VIS.mob.range * mult, near: VIS.mob.near * mult }) : VIS.mob;
    return sees(s, { x: e.x, y: e.y, face: mobFace(e) }, tgt, cfg, API || window.WL_SIM.API);
  }
  // Player facing follows the aim point; call every sim tick from player.js.
  function update(p, dt) {
    if (p.face == null) p.face = Math.atan2((p.ay || p.y) - p.y, (p.ax || p.x) - p.x);
    const want = Math.atan2(p.ay - p.y, p.ax - p.x), d = angDiff(want, p.face), m = VIS.turn * dt;
    p.face += Math.abs(d) <= m ? d : Math.sign(d) * m;
  }
  function playerSees(s, p, t, API) { return sees(s, { x: p.x, y: p.y, face: p.face || 0 }, t, playerCfg(p), API || window.WL_SIM.API); }

  // ---------------- client ----------------
  // Live target visibility with a short fade. Returns alpha 0..1 (0 = do not draw).
  function entAlpha(s, p, e, dt) {
    const vis = playerSees(s, p, e) ? 1 : 0;
    if (e._va == null) e._va = vis;
    e._va += (vis - e._va) * Math.min(1, dt * VIS.fade);
    if (Math.abs(vis - e._va) < 0.02) e._va = vis;
    return e._va;
  }

  let ov = null, octx = null;
  function visPolygons(s, p, API) {
    const cfg = playerCfg(p), face = p.face || 0, half = cfg.half * D2R, polys = [];
    const ray = (a, R) => { const dx = Math.cos(a), dy = Math.sin(a), t = API.rayWall(s, p.x, p.y, p.x + dx * R, p.y + dy * R), f = t >= 0 ? Math.min(1, t + 4 / R) : 1; return { x: p.x + dx * R * f, y: p.y + dy * R * f }; };
    const cone = [{ x: p.x, y: p.y }], n = Math.max(8, Math.ceil(half * 2 / (1.2 * D2R)));
    for (let i = 0; i <= n; i++) cone.push(ray(face - half + (half * 2) * i / n, cfg.range));
    polys.push(cone);
    const circ = []; for (let i = 0; i < 28; i++) circ.push(ray(i / 28 * Math.PI * 2, cfg.near));
    polys.push(circ);
    return polys;
  }
  // Draw in the "flat" (world) transform, cam already subtracted by the caller via V.cam. V = { cam, W, H, DPR }.
  function drawFog(ctx, s, p, V) {
    if (!s.map || s.mode === 'base' || p.dead || p.extracted) return;
    const API = window.WL_SIM.API, cv = ctx.canvas; if (!cv.width || !cv.height) return;
    // Keep one fog pixel per CSS pixel on high-DPR displays. Visibility checks stay full precision.
    const naturalScale = Math.min(1, (cv.clientWidth || cv.width) / cv.width);
    const scale = Math.max(0.5, Math.min(1, Number.isFinite(window.B96_FOG_SCALE) ? window.B96_FOG_SCALE : naturalScale));
    const fogWidth = Math.max(1, Math.round(cv.width * scale)), fogHeight = Math.max(1, Math.round(cv.height * scale));
    if (!ov || ov.width !== fogWidth || ov.height !== fogHeight) { ov = document.createElement('canvas'); ov.width = fogWidth; ov.height = fogHeight; octx = ov.getContext('2d'); }
    const polys = visPolygons(s, p, API), tr = ctx.getTransform();
    // 2) mask: everything outside the current view (no darkness: the map stays readable, just without colours)
    octx.setTransform(1, 0, 0, 1, 0, 0); octx.globalCompositeOperation = 'source-over'; octx.clearRect(0, 0, ov.width, ov.height);
    octx.fillStyle = VIS.greyTone; octx.fillRect(0, 0, ov.width, ov.height);
    const sx = ov.width / cv.width, sy = ov.height / cv.height;
    octx.setTransform(tr.a * sx, tr.b * sy, tr.c * sx, tr.d * sy, tr.e * sx, tr.f * sy); octx.globalCompositeOperation = 'destination-out'; octx.fillStyle = '#000';
    for (const poly of polys) { octx.beginPath(); poly.forEach((q, i) => i ? octx.lineTo(q.x - V.cam.x, q.y - V.cam.y) : octx.moveTo(q.x - V.cam.x, q.y - V.cam.y)); octx.closePath(); octx.fill(); }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'saturation'; ctx.drawImage(ov, 0, 0, cv.width, cv.height);                         // strip colour
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = VIS.greyVeil; ctx.drawImage(ov, 0, 0, cv.width, cv.height); // light grey veil
    ctx.restore();
  }
  function reset() {}

  window.WL_VISION = { VIS, inCone, sees, mobSees, playerSees, update, entAlpha, drawFog, reset, playerCfg };
})();
