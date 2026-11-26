// Owner: movement/combat thread. Client-only "game feel" layer (DOM/canvas/audio allowed here).
// Hooks that game.js calls if this file is loaded (all optional, see README "feel.js hooks"):
//   WL_FEEL.reset()                         on new raid/base
//   WL_FEEL.camera(p, dt)  -> {x, y}        extra camera offset in world px (movement lead)
//   WL_FEEL.onEvent(ev, api)                every sim event; api = { p, sfx(freq, vol, dur), shake(n), kick(dx, dy), local }
//   WL_FEEL.update(p, dt, api)              once per frame: footsteps, breath, reload clicks
//   WL_FEEL.drawWorld(ctx, p, V)            world space (cam already subtracted by V.cam): reload bar over the player
//   WL_FEEL.drawScreen(ctx, p, V)           screen space: hit marker, exhaustion vignette
// V = { cam, zoom, W, H, mouse, t }
'use strict';
(function () {
  const st = { hit: 0, kill: 0, stepT: 0, breathT: 0, prevReload: 0, prevTired: false, lastVx: 0, lastVy: 0, lead: { x: 0, y: 0 }, tiredFx: 0, ejectT: 0 };

  function reset() { Object.assign(st, { hit: 0, kill: 0, stepT: 0, breathT: 0, prevReload: 0, prevTired: false, lead: { x: 0, y: 0 }, tiredFx: 0 }); }

  // Camera leads in the movement direction: the screen shows where you are going. Sprint leads further.
  function camera(p, dt) {
    const k = 0.16 + 0.1 * (p.sprintT || 0), tx = (p._vx || 0) * k, ty = (p._vy || 0) * k;
    const f = Math.min(1, dt * 5);
    st.lead.x += (tx - st.lead.x) * f; st.lead.y += (ty - st.lead.y) * f;
    return { x: st.lead.x, y: st.lead.y };
  }

  function onEvent(ev, api) {
    const p = api.p;
    if (ev.t === 'hit' && !ev.player) { st.hit = 0.14; api.sfx(2400, 0.12, 0.05); }
    else if (ev.t === 'kill') { st.kill = 0.3; api.sfx(260, 0.22, 0.16); }
    else if (ev.t === 'shot' && ev.owner === api.local) {
      // heavier guns shove the camera more; sustained fire adds a little extra
      const climb = Math.min(1, (p.rec || 0) / 9);
      api.shake(0.4 + climb * 1.2);
    } else if (ev.t === 'empty' && ev.pid === api.local) api.sfx(1800, 0.1, 0.03);
    else if (ev.t === 'hit' && ev.player) { api.shake(4); }
  }

  function update(p, dt, api) {
    if (p.dead || p.extracted) return;
    // footsteps: dull, spaced by speed; louder and quicker while sprinting
    const sp = p.speedNow || 0;
    if (sp > 30) {
      st.stepT -= dt * (sp / 150);
      if (st.stepT <= 0) { st.stepT = 0.34; api.sfx(p.sprintT > 0.3 ? 320 : 240, p.sprintT > 0.3 ? 0.11 : 0.06, 0.07); }
    } else st.stepT = 0.1;
    // exhaustion: heavy breath once, then every ~1.1 s while still locked out
    if (p.tired) { st.breathT -= dt; if (!st.prevTired || st.breathT <= 0) { st.breathT = 1.1; api.sfx(700, 0.1, 0.35); } st.tiredFx = Math.min(1, st.tiredFx + dt * 3); }
    else st.tiredFx = Math.max(0, st.tiredFx - dt * 2);
    st.prevTired = !!p.tired;
    // reload start / end clicks
    if (p.reload > 0 && st.prevReload <= 0) api.sfx(900, 0.12, 0.05);
    if (p.reload <= 0 && st.prevReload > 0) api.sfx(1300, 0.16, 0.06);
    st.prevReload = p.reload || 0;
    st.hit = Math.max(0, st.hit - dt); st.kill = Math.max(0, st.kill - dt);
  }

  function drawWorld(ctx, p, V) {
    if (p.dead || p.extracted || !(p.reload > 0) || !(p.reloadMax > 0)) return;
    const x = p.x - V.cam.x, y = p.y - V.cam.y - 38, w = 46, t = 1 - p.reload / p.reloadMax;
    ctx.save();
    ctx.fillStyle = 'rgba(8,10,14,0.75)'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 6);
    ctx.fillStyle = '#ff8a1f'; ctx.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, t)), 4);
    ctx.restore();
  }

  function drawScreen(ctx, p, V) {
    if (st.tiredFx > 0.01) { // soft dark edges while exhausted; no colour
      const g = ctx.createRadialGradient(V.W / 2, V.H / 2, Math.min(V.W, V.H) * 0.35, V.W / 2, V.H / 2, Math.max(V.W, V.H) * 0.75);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${0.35 * st.tiredFx})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, V.W, V.H);
    }
    if (st.hit > 0 || st.kill > 0) { // hit marker: four short ticks around the crosshair, white
      const m = V.mouse, a = Math.max(st.hit / 0.14, st.kill / 0.3), r = st.kill > 0 ? 13 : 10, len = st.kill > 0 ? 7 : 5;
      ctx.save(); ctx.globalAlpha = Math.min(1, a * 1.4); ctx.lineCap = 'round';
      for (const [w, col] of [[4.5, 'rgba(7,6,11,0.75)'], [2, '#f4f7ff']]) {
        ctx.lineWidth = w; ctx.strokeStyle = col; ctx.beginPath();
        for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { ctx.moveTo(m.x + sx * r, m.y + sy * r); ctx.lineTo(m.x + sx * (r + len), m.y + sy * (r + len)); }
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  window.WL_FEEL = { reset, camera, onEvent, update, drawWorld, drawScreen };
})();
