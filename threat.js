// Block-96: incoming-fire indicator (owner: enemies/AI thread). Client-only; no game.js edit needed.
// Load AFTER feel.js (and after enemies.js): it wraps WL_FEEL.onEvent / drawScreen / reset.
// Shows a wedge at the screen edge pointing at whoever shoots at the player (also when the shooter is off screen or hidden
// behind a wall), brighter and longer after you are actually hit. Melee threats ('threat' events) show a short red flash.
'use strict';
(function () {
  const F = window.WL_FEEL; if (!F) return;
  const marks = []; // { a (screen angle), t, life, hit, melee }
  let lastShot = null; // last enemy shot aimed at the player: { a, t }
  const MAX_AIM = 0.30; // rad: a shot counts as aimed at the player if its direction is this close to the player

  // world delta -> isometric screen angle (same projection as game.js screenToWorld, inverted)
  const scrAngle = (dx, dy) => Math.atan2((dx + dy) / 2, dx - dy);
  const angDiff = (a, b) => { let d = (a - b) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };

  function add(a, life, hit, melee) {
    for (const m of marks) if (Math.abs(angDiff(m.a, a)) < 0.12) { m.t = Math.max(m.t, life); m.life = Math.max(m.life, life); m.hit = m.hit || hit; m.melee = m.melee && melee; return; }
    marks.push({ a, t: life, life, hit, melee });
    if (marks.length > 8) marks.shift();
  }

  function onEvent(ev, api) {
    const p = api.p; if (!p || p.dead) return;
    if (ev.t === 'shot' && ev.by !== 'players') {
      const dx = p.x - ev.x, dy = p.y - ev.y, d = Math.hypot(dx, dy);
      if (d < 4 || d > 400) return;
      const aimed = Math.abs(angDiff(ev.a, Math.atan2(dy, dx))) < Math.max(MAX_AIM, Math.atan2(8, d));
      if (!aimed) return;
      const sa = scrAngle(-dx, -dy); // direction from player to shooter on screen
      lastShot = { a: sa, t: 1.2 };
      add(sa, 0.9, false, false);
    } else if (ev.t === 'threat' && ev.melee) {
      add(scrAngle(ev.x - p.x, ev.y - p.y), 0.5, false, true);
    } else if (ev.t === 'hit' && ev.player) {
      if (lastShot && lastShot.t > 0) add(lastShot.a, 1.4, true, false);
    }
  }

  function drawScreen(ctx, p, V) {
    const now = V.t, dt = Math.min(0.1, Math.max(0, draw.last == null ? 0 : now - draw.last)); draw.last = now;
    if (lastShot) lastShot.t -= dt;
    for (let i = marks.length - 1; i >= 0; i--) { marks[i].t -= dt; if (marks[i].t <= 0) marks.splice(i, 1); }
    if (!marks.length) return;
    const W = V.W, H = V.H, pad = 34, E = window.WL_ENEMIES, VW = E && E.VIEW;
    // the player is not at the screen centre while the camera leads / looks around: use the real position when known
    const cx = VW && VW.has ? Math.max(pad + 10, Math.min(W - pad - 10, W / 2 + (-VW.ox + VW.oy) * VW.Kx)) : W / 2;
    const cy = VW && VW.has ? Math.max(pad + 10, Math.min(H - pad - 10, H / 2 - (VW.ox + VW.oy) / 2 * VW.Kx)) : H / 2;
    ctx.save(); ctx.lineJoin = 'round';
    for (const m of marks) {
      const k = Math.min(1, m.t / Math.min(m.life, 0.4)), dx = Math.cos(m.a), dy = Math.sin(m.a);
      // ray from the screen centre to the edge rectangle (with padding)
      const tx = dx ? ((dx > 0 ? W - pad : pad) - cx) / dx : 1e9, ty = dy ? ((dy > 0 ? H - pad : pad) - cy) / dy : 1e9, tt = Math.min(tx, ty);
      const x = cx + dx * tt, y = cy + dy * tt, big = m.hit ? 1.35 : 1;
      const col = m.melee ? '255,120,60' : m.hit ? '255,60,60' : '255,43,214';
      ctx.save(); ctx.translate(x, y); ctx.rotate(m.a); ctx.globalAlpha = 0.9 * k;
      ctx.beginPath(); ctx.moveTo(14 * big, 0); ctx.lineTo(-10 * big, -11 * big); ctx.lineTo(-4 * big, 0); ctx.lineTo(-10 * big, 11 * big); ctx.closePath();
      ctx.fillStyle = `rgba(${col},0.85)`; ctx.strokeStyle = 'rgba(7,6,11,0.8)'; ctx.lineWidth = 2; ctx.shadowColor = `rgb(${col})`; ctx.shadowBlur = 14 * k;
      ctx.stroke(); ctx.fill(); ctx.restore();
      // faint tracer line inward from the wedge
      ctx.globalAlpha = 0.35 * k; ctx.strokeStyle = `rgb(${col})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - dx * 20, y - dy * 20); ctx.lineTo(x - dx * 90, y - dy * 90); ctx.stroke();
    }
    ctx.restore();
  }
  const draw = { last: null };

  const o = { onEvent: F.onEvent, drawScreen: F.drawScreen, reset: F.reset };
  F.onEvent = function (ev, api) { if (o.onEvent) o.onEvent(ev, api); onEvent(ev, api); };
  F.drawScreen = function (ctx, p, V) { if (o.drawScreen) o.drawScreen(ctx, p, V); drawScreen(ctx, p, V); };
  F.reset = function () { marks.length = 0; lastShot = null; draw.last = null; if (o.reset) o.reset(); };
  window.WL_THREAT = { marks, onEvent, drawScreen };
})();
