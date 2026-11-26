/* Block-96 bridges (procedural). Load after world15.js and modules/bridges-data.js, BEFORE sim.js.
 *
 * 1. Applies window.B96_BRIDGE_PATCH (tools/fix_bridges.py) to window.B96_WORLD: river closed under the decks, deck corridor carved out
 *    of the water collision mask, dead-end roads joined, rails cut at road crossings, deck geometry snapped onto the roads.
 * 2. WL_BRIDGES.paint(c, b, tile): draws one bridge into a baked ground tile (ground plane, world px; the tile context is already
 *    translated/scaled). Replaces game.js paintBridge: shadow on the water, piers with foam, girder, pavement + carriageway with
 *    markings that fade into the road at both ends, concrete kerbs, railings with posts, lamp posts.
 * 3. WL_BRIDGES.at(x, y) -> bridge meta or null (world px) for cars / NPC / AI; WL_BRIDGES.list = decks in metres.
 * Deck surface stays at ground level (no actor lifting needed); height is faked with the same (-a,-a) ground shift game.js uses
 * for kerbs (0.15 m = 1.6 px, i.e. 10.7 px per metre). Bullets fly over water ('fly' walls) and decks have no walls: nothing to break.
 */
(function (root) {
  'use strict';
  const PM = 10.7;                    // ground-plane shift per metre of height (same as the kerb code in game.js bakeTile)
  const W = root.B96_WORLD, PATCH = root.B96_BRIDGE_PATCH;
  if (W && PATCH) { for (const k of Object.keys(PATCH)) W[k] = PATCH[k]; }
  const pxm = () => (root.WL_CONFIG && root.WL_CONFIG.PX_PER_M) || 10;
  const list = (W && W.bridges) || [];

  function meta(b) { // match a game-side {pts (px), w (px)} to the metre-based entry
    const P = pxm(); let best = null, bd = 1e9;
    for (const m of list) { const d = Math.hypot(m.pts[0][0] * P - b.pts[0].x, m.pts[0][1] * P - b.pts[0].y); if (d < bd) { bd = d; best = m; } }
    return bd < 5 ? best : null;
  }
  function at(x, y) { // is the world point on a deck (px)?
    const P = pxm();
    for (const m of list) {
      const ax = m.pts[0][0] * P, ay = m.pts[0][1] * P, dx = m.pts[1][0] * P - ax, dy = m.pts[1][1] * P - ay, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
      const t = (x - ax) * ux + (y - ay) * uy, s = -(x - ax) * uy + (y - ay) * ux;
      if (t >= 0 && t <= L && Math.abs(s) <= m.w * P / 2) return m;
    }
    return null;
  }

  function paint(c, b) {
    const m = meta(b), a = b.pts[0], d = b.pts[1], dx = d.x - a.x, dy = d.y - a.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux, hw = b.w / 2;
    const P = pxm(), wa = m ? m.wa * P : L * 0.3, wb = m ? m.wb * P : L * 0.7;
    const near = (nx + ny) >= 0 ? 1 : -1; // side whose face is turned to the camera (larger x+y)
    const pt = (t, s, sh) => ({ x: a.x + ux * t + nx * s + (sh || 0), y: a.y + uy * t + ny * s + (sh || 0) });
    const poly = (pts, fill) => { c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.closePath(); c.fillStyle = fill; c.fill(); };
    const Q = (t0, t1, s0, s1, sh0, sh1, fill) => poly([pt(t0, s0, sh0), pt(t1, s0, sh0), pt(t1, s1, sh1 == null ? sh0 : sh1), pt(t0, s1, sh1 == null ? sh0 : sh1)], fill);
    const line = (p, q, col, w, dash) => { c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); c.strokeStyle = col; c.lineWidth = w; if (dash) c.setLineDash(dash); c.stroke(); if (dash) c.setLineDash([]); };
    const wt0 = Math.max(0, wa - 6), wt1 = Math.min(L, wb + 6);   // over the water (plus the abutments)
    const sw = Math.min(26, hw * 0.2);                              // pavement width
    c.save(); c.lineCap = 'butt'; c.lineJoin = 'round';

    // 1. shadow on the water + piers (base is 2.6 m below the deck, so it sticks out under the near girder)
    Q(wt0, wt1, -hw - 4, hw + 4, 16, 16, 'rgba(3,10,18,0.50)');
    const span = wt1 - wt0, np = Math.max(1, Math.round(span / 230)), PD = 3.4 * PM;
    for (let i = 0; i < np; i++) {
      const tp = wt0 + (i + 0.5) / np * span, pl = 11;
      for (const sc of [-1, 1]) {                       // two round-nosed columns per bent, one under each edge of the deck
        const sm = sc * (hw - 14), s0 = sm - 8, s1 = sm + 8;
        for (const [r, al] of [[12, 0.12], [6, 0.26]]) { // foam ring at the foot
          c.beginPath(); c.ellipse(pt(tp, sm, PD).x, pt(tp, sm, PD).y, (pl + r) * 1.5, (pl + r) * 0.95, Math.atan2(uy + ux * 0, ux) * 0, 0, 7); c.fillStyle = `rgba(205,226,238,${al})`; c.fill();
        }
        const E = [[tp - pl, s0], [tp + pl, s0], [tp + pl, s1], [tp - pl, s1]];
        for (let k = 0; k < 4; k++) { const p = E[k], q = E[(k + 1) % 4]; poly([pt(p[0], p[1], 0), pt(q[0], q[1], 0), pt(q[0], q[1], PD), pt(p[0], p[1], PD)], k % 2 ? '#2a3239' : '#3b454e'); }
        poly([pt(tp - pl, s0, PD), pt(tp + pl, s0, PD), pt(tp + pl, s1, PD), pt(tp - pl, s1, PD)], '#1e252b');
        line(pt(tp - pl, s1, 0), pt(tp - pl, s1, PD), 'rgba(160,176,190,0.30)', 1.2);
      }
    }
    // 2. girder on the near side (deck thickness 1 m) and abutment blocks at the banks
    Q(wt0, wt1, near * hw, near * hw, 0, 1.0 * PM, '#20272e');
    line(pt(wt0, near * hw, 1.0 * PM), pt(wt1, near * hw, 1.0 * PM), 'rgba(120,132,144,0.40)', 1.3);
    for (const t of [wt0, wt1]) Q(t - 6, t + 6, -hw - 3, hw + 3, 0, 0, 'rgba(32,40,48,0.85)');

    // 3. deck: pavement with a kerb on both sides, carriageway between (alpha fades in over the road ends so it joins the road)
    const d0 = Math.max(0, wa - 40), d1 = Math.min(L, wb + 40), fade = Math.min(36, (d1 - d0) * 0.2);
    const fa = (col, al) => `rgba(${col},${al})`;
    const gradient = (col) => { const p = pt(d0, 0, 0), q = pt(d1, 0, 0), gg = c.createLinearGradient(p.x, p.y, q.x, q.y); gg.addColorStop(0, fa(col, 0)); gg.addColorStop(fade / (d1 - d0), fa(col, 1)); gg.addColorStop(1 - fade / (d1 - d0), fa(col, 1)); gg.addColorStop(1, fa(col, 0)); return gg; };
    for (const sd of [-1, 1]) {
      const s0 = sd * hw, s1 = sd * (hw - sw);
      Q(d0, d1, s0, s1, 0, 0, gradient('22,29,35'));             // kerb side face
      Q(d0, d1, s0, s1, -1.6, -1.6, gradient('88,98,108'));      // pavement slab (0.15 m up)
      line(pt(d0 + fade, s1, -1.6), pt(d1 - fade, s1, -1.6), 'rgba(170,184,196,0.55)', 1.6);
    }
    Q(d0, d1, -hw + sw, hw - sw, 0, 0, gradient('44,53,61'));    // carriageway
    for (let t = d0 + 40; t < d1 - 20; t += 160) line(pt(t, -hw + sw, 0), pt(t, hw - sw, 0), 'rgba(10,16,22,0.35)', 1.2); // expansion joints
    for (let t = d0 + 30; t < d1 - 30; t += 70) for (const sd of [-1, 1]) line(pt(t, sd * (hw - sw / 2), -1.6), pt(t + 36, sd * (hw - sw / 2), -1.6), 'rgba(60,70,80,0.35)', 1);
    const m0 = d0 + fade + 6, m1 = d1 - fade - 6;
    line(pt(m0, -1.4, 0), pt(m1, -1.4, 0), 'rgba(217,196,106,0.85)', 1.8); line(pt(m0, 1.4, 0), pt(m1, 1.4, 0), 'rgba(217,196,106,0.85)', 1.8); // double yellow
    const lane = (hw - sw) / 2;
    for (const sd of [-1, 1]) {
      line(pt(m0, sd * lane, 0), pt(m1, sd * lane, 0), 'rgba(232,232,232,0.5)', 1.6, [20, 26]);
      line(pt(m0, sd * (hw - sw - 4), 0), pt(m1, sd * (hw - sw - 4), 0), 'rgba(232,232,232,0.55)', 1.6);
    }

    // 4. railings: low concrete kerb wall, posts, rail; far side first (behind the traffic), near side last
    const rl0 = Math.max(0, wa - 14), rl1 = Math.min(L, wb + 14), H1 = 0.5 * PM, H2 = 1.15 * PM;
    const rail = (sd) => {
      const s = sd * (hw - 3);
      Q(rl0, rl1, s - 3.5, s + 3.5, 0, 0, '#46505a');                                    // wall footprint
      Q(rl0, rl1, s - 3.5, s + 3.5, -H1, -H1, '#8b97a3');                                // wall top
      if (sd === near) Q(rl0, rl1, s + 3.5, s + 3.5, 0, -H1, '#59636d');                // outer face turned to the camera
      else Q(rl0, rl1, s - 3.5, s - 3.5, 0, -H1, '#59636d');
      for (let t = rl0; t <= rl1 + 0.1; t += 34) line(pt(t, s, -H1), pt(t, s, -H2), '#9aa6b2', 1.8);   // posts
      line(pt(rl0, s, -H2), pt(rl1, s, -H2), '#b4bfca', 2);                              // top rail
      line(pt(rl0, s, -(H1 + H2) / 2), pt(rl1, s, -(H1 + H2) / 2), 'rgba(150,162,174,0.7)', 1.3); // mid rail
      for (const t of [rl0, rl1]) { Q(t - 5, t + 5, s - 6, s + 6, 0, 0, '#3b444d'); Q(t - 5, t + 5, s - 6, s + 6, -1.5 * PM, -1.5 * PM, '#7d8994'); } // end posts
    };
    // lamp posts on both sides, 28 m apart; a faint cold glow on the deck
    const lamps = (sd) => { for (let t = rl0 + 80; t < rl1 - 40; t += 280) { const s = sd * (hw - 3), p0 = pt(t, s, 0), p1 = pt(t, s, -4.8 * PM), p2 = pt(t - 14 * sd * 0, s - sd * 9, -4.8 * PM);
      line(p0, p1, '#444c55', 2.4); line(p1, p2, '#444c55', 2); c.beginPath(); c.arc(p2.x, p2.y, 2.6, 0, 7); c.fillStyle = '#d6e6ee'; c.fill();
      const gl = c.createRadialGradient(p0.x - sd * 8, p0.y, 1, p0.x - sd * 8, p0.y, 70); gl.addColorStop(0, 'rgba(190,225,240,0.13)'); gl.addColorStop(1, 'rgba(190,225,240,0)'); c.fillStyle = gl; c.beginPath(); c.arc(p0.x - sd * 8, p0.y, 70, 0, 7); c.fill(); } };
    rail(-near); lamps(-near); rail(near); lamps(near);
    c.restore();
  }

  // Invisible railing walls: the water collision mask has 1.9 m resolution, so the deck corridor is carved slightly wider than the deck.
  // The integrator adds these as 'water'-kind fly walls (bullets pass, nobody walks off the deck sideways). Returns [[x, y, w, h], ...] in world px.
  function railWalls() {
    const P = pxm(), out = [];
    for (const m of list) {
      const ax = m.pts[0][0] * P, ay = m.pts[0][1] * P, dx = m.pts[1][0] * P - ax, dy = m.pts[1][1] * P - ay, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy, ny = ux, hw = m.w * P / 2;
      const t0 = Math.max(0, m.wa * P - 14), t1 = Math.min(L, m.wb * P + 14);
      for (let t = t0; t <= t1; t += 6) for (const sd of [-1, 1]) { const x = ax + ux * t + nx * sd * (hw + 4), y = ay + uy * t + ny * sd * (hw + 4); out.push([Math.round(x - 4), Math.round(y - 4), 8, 8]); }
    }
    return out;
  }

  root.WL_BRIDGES = { paint, at, list, meta, railWalls, PM, version: 1 };
})(window);
