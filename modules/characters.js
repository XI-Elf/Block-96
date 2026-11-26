/* Block-96: characters.js — procedural animated humans (and dogs) for the 2D isometric canvas view.
 *
 * Contract (INTERFACES.md §1):  window.WL_CHARS.draw(ctx, a, isPlayer, env) -> true when drawn.
 *   ctx  : screen-space canvas context (identity transform)
 *   a    : actor (player or enemy object from sim). Feet are drawn at env.SCR(a.x, a.y).
 *   env  : { SCR, SC, Kx, VMh, MH, C, ... } (hookEnv from game.js)
 *
 * How it works: a small 3D skeleton is posed in metres (forward / left / up around the feet), limbs are solved
 * with 2-bone IK, every part is projected with the same isometric matrix as the ground and painter-sorted
 * (back to front), so any facing angle works, not only 8. Animation state is kept per actor id in a Map.
 *
 * Extra API (all optional):
 *   WL_CHARS.cue(a, 'shoot'|'melee'|'hit'|'reload'|'die', extra)   force an animation cue (auto-detected otherwise)
 *   WL_CHARS.forget(id)                                             drop animation state
 *   WL_CHARS.TUNE, WL_CHARS.STYLES, WL_CHARS.WEAPONS                tweakable data
 * Optional actor fields read when present: a.dead, a.killAng (world rad, direction the killing shot travelled),
 *   a.weaponId (override), a.style (override), a.reloadMax, a.shots, a.melee, a.wind, a.mag, a.cool.
 */
(function (root) {
  'use strict';
  const PI = Math.PI, TAU = PI * 2, S2 = Math.SQRT2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > PI) d -= TAU; if (d < -PI) d += TAU; return d; };
  const ease = (t) => t * t * (3 - 2 * t);
  const hash = (n) => { n = (n | 0) >>> 0; n = Math.imul(n ^ (n >>> 15), 2246822519) >>> 0; n = Math.imul(n ^ (n >>> 13), 3266489917) >>> 0; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };

  // ---------------------------------------------------------------- colour helpers
  const _rgb = {}, _mix = {};
  const rgb = (h) => _rgb[h] || (_rgb[h] = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
  function mix(a, b, t) {
    t = Math.round(clamp(t, 0, 1) * 32) / 32; const k = a + b + t; if (_mix[k]) return _mix[k];
    const A = rgb(a), B = rgb(b), h = (i) => ('0' + Math.round(A[i] + (B[i] - A[i]) * t).toString(16)).slice(-2);
    return (_mix[k] = '#' + h(0) + h(1) + h(2));
  }
  const shade = (c, f) => (f < 1 ? mix(c, '#000000', 1 - f) : mix(c, '#ffffff', f - 1));
  const OUT = 'rgba(8,10,13,0.9)';

  // ---------------------------------------------------------------- tunables / data
  const TUNE = {
    walkPx: 24,     // world px/s where the walk cycle starts to look like a walk
    runPx: 63,      // world px/s of a full run (sprint)
    cycleLo: 1.3,   // gait cycles per second at walkPx
    cycleHi: 2.8,   // cycles per second at runPx
    turn: 16,       // hips follow aim, 1/s
    aimedRelax: 2.2, // seconds after the last shot/alert before an NPC lowers the weapon
    spriteM: 1.9    // height in metres of one sprite cell (figure inside ~0.955 of it => ~1.8 m)
  };

  // Ukrainian city, 2003, muted; accent = small point neon (LED, piping, visor strip, eyes).
  const STYLES = {
    player:  { skin: '#c9a98c', jacket: '#2b4552', pants: '#1b2128', boots: '#14161a', hat: 'cap',      hatCol: '#1d2b33', accent: '#3df2ff', pack: '#3a4a3c', vest: 0 },
    // v61: gang outfits (README v5 section "gangs"), muted; accent = small point neon. Mobs of a gang wear the same style.
    drifter: { skin: '#c4a58c', jacket: '#5b5f5a', pants: '#34383d', boots: '#1c1d20', hat: 'cap', hatCol: '#3c3f3a', accent: '#9aa3ad', pack: '#4a4a40', vest: 0 },
    g_holodnogorskie: { skin: '#c4a58c', jacket: '#7a2c2c', pants: '#1c1f26', boots: '#e8e8e4', hat: 'bare', hatCol: '#222', accent: '#ff5a5a', pack: 0, stripe: '#e6e9ee', vest: '#2a2f38' },
    g_vyshka:         { skin: '#bd9a82', jacket: '#26282c', pants: '#1d2024', boots: '#15171a', hat: 'mask', hatCol: '#17181b', accent: '#ff3e3e', pack: '#4a4538', vest: '#34363a' },
    g_brigada:        { skin: '#bd9a82', jacket: '#3d3a2a', pants: '#2a2a22', boots: '#18160f', hat: 'helmet', hatCol: '#7a6a2e', accent: '#ff9a3a', pack: 0, vest: '#5a6066' },
    g_kooperativ:     { skin: '#c4a58c', jacket: '#1d1a1c', pants: '#2c3036', boots: '#121214', hat: 'helmet', hatCol: '#2b3038', accent: '#ffd23a', pack: '#3a3028', vest: 0 },
    g_kazanskie:      { skin: '#c4a58c', jacket: '#141418', pants: '#1a1a1e', boots: '#0f0f11', hat: 'ushanka', hatCol: '#2a2420', accent: '#b0b4c0', pack: 0, vest: '#2e3a2a' },
    g_sobor:          { skin: '#b99a80', jacket: '#101114', pants: '#16171a', boots: '#0c0c0e', hat: 'hood', hatCol: '#0e0e10', accent: '#e0c060', pack: 0, vest: 0 },
    g_sektor:         { skin: '#c9a98c', jacket: '#2f3a28', pants: '#3a4430', boots: '#e0e0d8', hat: 'bare', hatCol: '#222', accent: '#e8e8e0', pack: 0, stripe: '#e8e8e0', vest: 0 },
    g_cherdak:        { skin: '#c4a58c', jacket: '#15151a', pants: '#1b1c22', boots: '#d0d0d0', hat: 'hood', hatCol: '#15151a', accent: '#8a5cff', pack: 0, vest: 0 },
    bandit:  { skin: '#bd9a82', jacket: '#25202c', pants: '#15181d', boots: '#101215', hat: 'mask',     hatCol: '#16131a', accent: '#ff2bd6', pack: 0,         vest: '#2f2a38' },
    gopnik:  { skin: '#c4a58c', jacket: '#233a63', pants: '#1c2740', boots: '#d8d8d0', hat: 'flatcap',  hatCol: '#2c2c30', accent: '#ffa84a', pack: 0,         stripe: '#dfe3ea', vest: 0 },
    marauder:{ skin: '#b99a80', jacket: '#4b4a36', pants: '#2c2a22', boots: '#1d1a16', hat: 'ushanka',  hatCol: '#5a4a38', accent: '#9ccf5a', pack: '#5b5440', vest: 0 },
    militia: { skin: '#c2a48a', jacket: '#3b4658', pants: '#2c3340', boots: '#121418', hat: 'helmet',   hatCol: '#3d4a5a', accent: '#7fb7ff', pack: 0,         vest: '#2a3140' },
    civ:     { skin: '#c9ac94', jacket: '#6a6f73', pants: '#3a3f46', boots: '#222427', hat: 'bare', hatCol: '#3a3a3a', accent: '#9aa3ad', pack: 0, vest: 0 },
    ghoul:   { skin: '#97a596', jacket: '#4a4a42', pants: '#2c2a26', boots: '#1b1a18', hat: 'bare',     hatCol: '#2a2622', accent: '#ff7a9c', pack: 0,         vest: 0, hunch: 1, eyes: 1 },
    dog:     { skin: '#b9a98a', jacket: '#b9a98a', pants: '#8c7d63', boots: '#2a241c', hat: 'none',     hatCol: '#2a241c', accent: '#ff7a9c', pack: 0 }
  };
  const TYPE_STYLE = { civ: 'civ', raider: 'bandit', bandit: 'bandit', gopnik: 'gopnik', marauder: 'marauder', militia: 'militia', ghoul: 'ghoul', dog: 'dog' };

  // Weapons. Segments in weapon-local metres: a = along the barrel from the grip, u = up. muzzle: where the flash is.
  // supp: where the support hand grips (along a). shoulder: stock rests on the shoulder (longer arms forward).
  const M = '#2d3239', M2 = '#4a525d', W = '#6b4a2f', W2 = '#8a6540', G = '#1c1f24';
  const WEAPONS = {
    pistol:  { type: 'gun', grip: 0.34, muzzle: [0.17, 0.02], supp: [0.05, -0.06], segs: [[-0.04, 0.02, 0.16, 0.02, 0.046, M], [-0.03, 0.0, -0.06, -0.11, 0.046, G], [0.0, 0.03, 0.14, 0.03, 0.014, M2]] },
    shotgun: { type: 'gun', grip: 0.24, muzzle: [0.47, 0.03], supp: [0.20, -0.03], segs: [[-0.04, 0.02, 0.45, 0.03, 0.052, M], [-0.04, 0.0, -0.21, -0.07, 0.062, W], [0.02, 0.05, 0.43, 0.06, 0.012, M2], [0.14, 0.0, 0.26, 0.0, 0.07, W2]] },
    rifle:   { type: 'gun', grip: 0.22, muzzle: [0.66, 0.02], supp: [0.24, -0.02], segs: [[-0.32, -0.04, -0.03, 0.0, 0.065, W], [-0.03, 0.01, 0.28, 0.02, 0.055, M], [0.28, 0.02, 0.64, 0.02, 0.03, M], [0.05, 0.075, 0.23, 0.075, 0.04, G], [0.07, 0.092, 0.2, 0.092, 0.012, M2], [0.26, 0.0, 0.36, 0.0, 0.07, W2]] },
    ak:      { type: 'gun', grip: 0.22, muzzle: [0.63, 0.02], supp: [0.28, -0.02], segs: [[-0.32, -0.03, -0.04, 0.0, 0.06, W], [-0.04, 0.01, 0.32, 0.02, 0.055, M], [0.32, 0.02, 0.6, 0.02, 0.026, M], [0.14, 0.0, 0.42, 0.0, 0.066, W2], [0.1, 0.0, 0.17, -0.14, 0.046, '#7a5a35'], [0.0, 0.035, 0.3, 0.035, 0.012, M2]] },
    bat:     { type: 'melee', grip: 0.2, muzzle: [0.6, 0], supp: [0.12, 0], segs: [[-0.12, 0, 0.64, 0, 0.05, W], [0.4, 0, 0.64, 0, 0.062, W2]] }
  };

  // ---------------------------------------------------------------- per-actor state
  const states = new Map();
  let lastPrune = 0;
  function now() { const c = root.WL_CHARS && root.WL_CHARS.clock; return c ? c() : (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000; }

  function resolveStyle(a, isPlayer) {
    if (a.style && STYLES[a.style]) return a.style;
    if (isPlayer) return 'player';
    { const TT = root.WL_ENEMIES && root.WL_ENEMIES.TYPES && root.WL_ENEMIES.TYPES[a.type], gs = TT && TT.fac && 'g_' + TT.fac; if (gs && STYLES[gs]) return gs; }
    if (TYPE_STYLE[a.type]) return TYPE_STYLE[a.type];
    if (a.faction === 'mutants' || a.faction === 'beasts') return 'ghoul';
    return 'bandit';
  }
  function resolveWeapon(a, isPlayer, styleName, id) {
    if (a.weaponId) return a.weaponId === 'none' ? null : a.weaponId;
    if (isPlayer) { const w = a.weapons && a.weapons[a.cur]; return w && w.id && WEAPONS[w.id] ? w.id : 'pistol'; }
    if (styleName === 'dog' || styleName === 'ghoul') return null;
    const T = root.WL_ENEMIES && root.WL_ENEMIES.TYPES && root.WL_ENEMIES.TYPES[a.type];
    const g = (T && T.gun) || (root.WL_CONFIG && root.WL_CONFIG.ENEMIES && root.WL_CONFIG.ENEMIES[a.type] && root.WL_CONFIG.ENEMIES[a.type].gun);
    if (g) return g.pellets > 1 ? 'shotgun' : g.burst || g.rof < 0.3 ? 'ak' : 'pistol';
    if (styleName === 'gopnik') return hash(id * 7 + 3) < 0.55 ? 'bat' : null;
    return styleName === 'bandit' ? 'pistol' : null;
  }
  function getState(a, isPlayer, t, upm) {
    const id = a.id != null ? a.id : (a._cid || (a._cid = 'c' + Math.random()));
    let st = states.get(id);
    const sName = resolveStyle(a, isPlayer);
    if (!st || st.obj !== a) {
      const h = typeof id === 'number' ? id : [...String(id)].reduce((q, c) => (q * 31 + c.charCodeAt(0)) | 0, 7);
      st = { id, obj: a, h, style: sName, x: a.x, y: a.y, t: t - 1 / 60, spd: 0, vdx: 1, vdy: 0, ph: hash(h) * TAU, hy: 0, hyInit: false, rd: 0, recoil: 0, hit: 0, hitF: a.hitFlash || 0,
        melee: 0, meleeDur: 0.4, flash: 0, deadT: -1, shots: a.shots || 0, mag: magOf(a), cool: a.cool || 0, wind: a.wind || 0, mel: a.melee || 0, reloadSeen: 0, lastAim: -9, seen: t,
        lunge: 0, bob: 0 };
      states.set(id, st);
    }
    st.style = sName; st.seen = t;
    if (t - lastPrune > 20) { lastPrune = t; for (const [k, v] of states) if (t - v.seen > 25) states.delete(k); }
    return st;
  }
  function magOf(a) { if (a.weapons && a.weapons[a.cur] && typeof a.weapons[a.cur].mag === 'number') return a.weapons[a.cur].mag; return typeof a.mag === 'number' ? a.mag : null; }

  // palette with per-actor variation (so a crowd of bandits is not a crowd of clones)
  function palette(st) {
    if (st.pal && st.pal.sn === st.style) return st.pal;
    const S = STYLES[st.style] || STYLES.bandit, r1 = hash(st.h * 3 + 1), r2 = hash(st.h * 5 + 2), r3 = hash(st.h * 11 + 3);
    const vary = (c, amt) => (r1 < 0.5 ? mix(c, '#101010', amt * r2) : mix(c, '#9a9a9a', amt * r2));
    const hats = { bandit: ['mask', 'mask', 'hood'], gopnik: ['flatcap', 'flatcap', 'bare'], marauder: ['ushanka', 'ushanka', 'hood'], player: ['cap'], militia: ['helmet', 'helmet', 'beret'], ghoul: ['bare', 'bare', 'hood'] }[st.style];
    const hat = hats ? hats[Math.floor(r3 * hats.length)] : S.hat;
    st.pal = { sn: st.style, skin: mix(S.skin, r2 < 0.5 ? '#6b4a3a' : '#e0c4aa', 0.18 * r1), jacket: vary(S.jacket, 0.25), jacketDk: shade(vary(S.jacket, 0.25), 0.62), pants: vary(S.pants, 0.2), boots: S.boots,
      hat, hatCol: vary(S.hatCol, 0.25), accent: S.accent, pack: S.pack, vest: S.vest, stripe: S.stripe, hunch: S.hunch, eyes: S.eyes, hair: mix('#2a2018', '#8a7a60', r2), tall: 0.97 + 0.06 * r1 };
    return st.pal;
  }

  // ---------------------------------------------------------------- vector helpers (world offsets in metres: x, y, z up)
  function V(yaw, f, l, z) { const c = Math.cos(yaw), s = Math.sin(yaw); return [f * c + l * s, f * s - l * c, z]; }
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const mixv = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  function ik(root, tip, l1, l2, pole) {
    let d = sub(tip, root), L = len(d); if (L < 1e-5) { d = [0, 0, -1]; L = 1; }
    const mx = l1 + l2 - 0.002; let T = tip; if (L > mx) { T = add(root, mul(d, mx / L)); L = mx; }
    const dir = mul(sub(T, root), 1 / L), a = (l1 * l1 - l2 * l2 + L * L) / (2 * L), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    let p = sub(pole, mul(dir, dot(pole, dir))); const pl = len(p) || 1; p = mul(p, 1 / pl);
    return { mid: add(add(root, mul(dir, a)), mul(p, h)), tip: T };
  }
  function weaponDir(yaw, pitch) { const cp = Math.cos(pitch); return [cp * Math.cos(yaw), cp * Math.sin(yaw), Math.sin(pitch)]; }
  function weaponUp(yaw, pitch) { return [-Math.sin(pitch) * Math.cos(yaw), -Math.sin(pitch) * Math.sin(yaw), Math.cos(pitch)]; }

  // ---------------------------------------------------------------- the renderer context
  function makeRig(ctx, sx, sy, kg, kh, alpha) {
    const prims = [];
    const R = {
      prims, kg, kh, sphere: kg * S2,
      P: (p) => [sx + (p[0] - p[1]) * kg, sy + (p[0] + p[1]) * kg * 0.5 - p[2] * kh],
      depth: (p) => p[0] + p[1] + 0.816 * p[2]
    };
    R.cap = (a, b, w, col, out) => { prims.push({ d: (R.depth(a) + R.depth(b)) / 2, f() { const A = R.P(a), B = R.P(b), pw = w * R.sphere; ctx.lineCap = 'round'; ctx.strokeStyle = out || OUT; ctx.lineWidth = pw + 2; ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke(); ctx.strokeStyle = col; ctx.lineWidth = pw; ctx.stroke(); } }); };
    R.line = (a, b, w, col, bias) => { prims.push({ d: (R.depth(a) + R.depth(b)) / 2 + (bias || 0), f() { const A = R.P(a), B = R.P(b); ctx.lineCap = 'round'; ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, w * R.sphere); ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke(); } }); };
    R.ball = (c, r, col, out, bias) => { prims.push({ d: R.depth(c) + (bias || 0), f() { const A = R.P(c), pr = r * R.sphere; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(A[0], A[1], pr, 0, TAU); ctx.fill(); if (out !== false) { ctx.strokeStyle = out || OUT; ctx.lineWidth = 1.2; ctx.stroke(); } } }); };
    R.poly = (pts, col, d, out) => { prims.push({ d, f() { ctx.fillStyle = col; ctx.beginPath(); for (let i = 0; i < pts.length; i++) { const A = R.P(pts[i]); if (i) ctx.lineTo(A[0], A[1]); else ctx.moveTo(A[0], A[1]); } ctx.closePath(); ctx.fill(); ctx.strokeStyle = out || OUT; ctx.lineWidth = 1.1; ctx.lineJoin = 'round'; ctx.stroke(); } }); };
    R.fn = (d, f) => prims.push({ d, f });
    // frustum: bottom centre B at yaw, bottom half dims (f0,l0), top centre T, top half dims (f1,l1). cols(nf,nl,top)->colour
    R.prism = (B, Tp, yaw, f0, l0, f1, l1, cols) => {
      const cb = (f, l) => add(B, V(yaw, f, l, 0)), ct = (f, l) => add(Tp, V(yaw, f, l, 0));
      const bFL = cb(f0, l0), bFR = cb(f0, -l0), bBR = cb(-f0, -l0), bBL = cb(-f0, l0), tFL = ct(f1, l1), tFR = ct(f1, -l1), tBR = ct(-f1, -l1), tBL = ct(-f1, l1);
      const faces = [[1, 0, [tFL, tFR, bFR, bFL]], [-1, 0, [tBR, tBL, bBL, bBR]], [0, 1, [tBL, tFL, bFL, bBL]], [0, -1, [tFR, tBR, bBR, bFR]]];
      for (const [nf, nl, pts] of faces) { const n = V(yaw, nf, nl, 0); if (n[0] + n[1] <= 0.02) continue; const c = mul(add(add(pts[0], pts[1]), add(pts[2], pts[3])), 0.25); R.poly(pts, cols(nf, nl, false, n), R.depth(c)); }
      const tc = mul(add(add(tFL, tFR), add(tBR, tBL)), 0.25); R.poly([tFL, tFR, tBR, tBL], cols(0, 0, true), R.depth(tc) + 0.05);
    };
    return R;
  }
  const faceShade = (n) => 0.84 - 0.2 * ((n[0] - n[1]) / S2);

  // ---------------------------------------------------------------- main entry
  function draw(ctx, a, isPlayer, env) {
    if (!a || !env || !env.SCR) return false;
    const t = now(), upm = (env.C && env.C.PX_PER_M) || 10;
    const q = env.SCR(a.x, a.y), kg = env.Kx * upm, kh = env.VMh;
    const st = getState(a, isPlayer, t, upm);
    const pal = palette(st);
    update(st, a, isPlayer, t, upm);
    const R = makeRig(ctx, q.x, q.y, kg, kh);
    ctx.save();
    if (st.alpha != null && st.alpha < 1) ctx.globalAlpha = st.alpha;
    applyGender(pal, a, isPlayer); if (st.style === 'dog') drawDog(ctx, R, a, st, pal, isPlayer); else drawHuman(ctx, R, a, st, pal, isPlayer);
    ctx.restore();
    return true;
  }

  function st0(a) { return a.style && STYLES[a.style] ? a.style : 'player'; }
  function applyGender(pal, a, isPlayer) { if (!isPlayer) return; const g = a.gender || (root.WL_START && root.WL_START.gender && root.WL_START.gender()); pal.fem = g === 'female'; if (st0(a) === 'player' || pal.hat === 'cap') pal.hat = pal.fem ? 'bare' : 'cap'; if (pal.fem) { pal.hair = '#5a3a24'; pal.skin = pal.skin; } else pal.hair = pal.hair; }
  // ---------------------------------------------------------------- animation state update (once per frame per actor)
  function update(st, a, isPlayer, t, upm) {
    let dt = t - st.t; st.t = t;
    if (dt <= 1e-4) { st.dtZero = true; return; } st.dtZero = false;
    if (dt > 0.1) dt = 0.1;
    const ax = isPlayer ? Math.atan2(a.ay - a.y, a.ax - a.x) : (a.ang != null ? a.ang : 0);
    st.ay = isFinite(ax) ? ax : 0;
    if (!st.hyInit) { st.hy = st.ay; st.hyInit = true; }
    const dx = a.x - st.x, dy = a.y - st.y; st.x = a.x; st.y = a.y;
    const dist = Math.hypot(dx, dy);
    if (dist / upm > 6) { st.spd = 0; } // teleport
    else {
      const inst = dist / dt, k = Math.min(1, dt * 10);
      st.spd += (inst - st.spd) * k;
      if (dist > 0.05) { const ux = dx / dist, uy = dy / dist; st.vdx += (ux - st.vdx) * Math.min(1, dt * 14); st.vdy += (uy - st.vdy) * Math.min(1, dt * 14); const vl = Math.hypot(st.vdx, st.vdy) || 1; st.vdx /= vl; st.vdy /= vl; }
    }
    const dead = !!(a.dead || (a.hp != null && a.hp <= 0));
    if (dead) { if (st.deadT < 0) { st.deadT = 0; st.killAng = a.killAng != null ? a.killAng : st.ay + PI; st.spd = 0; } else st.deadT += dt; }
    else if (st.deadT >= 0) st.deadT = -1; // respawned
    // gait
    const run = clamp((st.spd - TUNE.walkPx) / (TUNE.runPx - TUNE.walkPx), 0, 1.25);
    st.mv = clamp(st.spd / TUNE.walkPx, 0, 1); st.run = run;
    st.ph += TAU * lerp(TUNE.cycleLo, TUNE.cycleHi, Math.min(1, run)) * dt * st.mv;
    // shots / melee / hit triggers
    const mg = magOf(a), shots = a.shots;
    let fired = false;
    if (typeof shots === 'number' && shots > st.shots) fired = true;
    else if (mg != null && st.mag != null && mg < st.mag) fired = true;
    else if (!isPlayer && typeof a.cool === 'number' && a.cool > st.cool + 0.05 && st.weaponId && WEAPONS[st.weaponId] && WEAPONS[st.weaponId].type === 'gun') fired = true;
    if (typeof shots === 'number') st.shots = shots; if (mg != null) st.mag = mg; if (typeof a.cool === 'number') st.cool = a.cool;
    if (fired && !dead) { st.recoil = 1; st.flash = 1; st.lastAim = t; }
    if (a.melee != null && a.melee > st.mel + 0.01) { st.melee = 1; st.meleeDur = 0.34; }
    st.mel = a.melee || 0;
    if (a.wind != null) { if (a.wind > 0 && st.wind <= 0) { st.melee = 1; st.meleeDur = Math.max(0.3, a.wind + 0.18); } st.wind = a.wind; }
    const hf = a.hitFlash || 0; if (hf > st.hitF + 0.001 && !dead) st.hit = 1; st.hitF = hf; st.flashW = hf > 0;
    st.recoil = Math.max(0, st.recoil - dt / 0.14); st.flash = Math.max(0, st.flash - dt / 0.07);
    st.hit = Math.max(0, st.hit - dt / 0.3); st.melee = Math.max(0, st.melee - dt / st.meleeDur);
    // weapon + readiness
    st.weaponId = resolveWeapon(a, isPlayer, st.style, st.h);
    let aimed;
    if (isPlayer) aimed = true;
    else if (st.style === 'ghoul' || st.style === 'dog') aimed = false;
    else { const combat = a.m === 'combat' || (a.alert || 0) > 2.5 || a.mode === 'combat' || a.mode === 'shoot'; if (combat) st.lastAim = t; aimed = t - st.lastAim < TUNE.aimedRelax; }
    st.rd += ((aimed ? 1 : 0) - st.rd) * Math.min(1, dt * 7);
    st.aimed = aimed;
    // hips: follow aim when armed & ready, else the walking direction
    const moving = st.spd > 12, vdir = Math.atan2(st.vdy, st.vdx);
    let target = st.ay;
    if (!(st.rd > 0.5) && moving && st.weaponId !== undefined && !isPlayer) target = vdir;
    if (!isPlayer && st.style !== 'bandit' && moving && st.rd < 0.5) target = vdir;
    st.hy += angDiff(st.hy, target) * Math.min(1, dt * TUNE.turn);
    st.vdir = vdir;
  }

  // ---------------------------------------------------------------- human
  function drawHuman(ctx, R, a, st, pal, isPlayer) {
    const S = STYLES[st.style] || STYLES.bandit, ph = st.ph, mv = st.mv, run = Math.min(1, st.run);
    const dead = st.deadT >= 0, tDead = Math.max(0, st.deadT);
    const ay = st.ay, hy = st.hy, ty = hy + clamp(angDiff(hy, ay), -1.3, 1.3) * 0.85;
    const wDef = st.weaponId ? WEAPONS[st.weaponId] : null, ranged = wDef && wDef.type === 'gun', rd = dead ? 0 : st.rd;
    const T = (c) => (st.flashW && !dead ? mix(c, '#ffffff', 0.78) : c);
    const tall = pal.tall, hunch = pal.hunch ? 1 : 0;

    // fall transform (death): rotate whole skeleton about the feet toward the killing direction
    const fa = dead ? ease(clamp(tDead / 0.55, 0, 1)) : 0, fall = fa * (PI / 2) * 0.96;
    const fdx = Math.cos(st.killAng || 0), fdy = Math.sin(st.killAng || 0);
    const FX = dead ? (p) => {
      const f = p[0] * fdx + p[1] * fdy, l = -p[0] * fdy + p[1] * fdx, z = p[2], c = Math.cos(fall), s = Math.sin(fall);
      const f2 = f * c + z * s, z2 = z * c - f * s; return [f2 * fdx - l * fdy, f2 * fdy + l * fdx, Math.max(0.05, z2 + 0.05 * fa)];
    } : (p) => p;

    // body motion
    const s = mv, cyc = Math.sin(ph * 2), bob = dead ? 0 : (0.022 * s + 0.018 * run) * cyc + 0.006 * Math.sin(st.t * 2.2) * (1 - s);
    const lean = (hunch ? 0.16 : 0) + 0.11 * run + 0.03 * s - 0.045 * st.recoil - 0.1 * st.hit + (st.melee > 0 ? 0.1 * Math.sin(st.melee * PI) : 0);
    const crouch = 0.03 * run + (hunch ? 0.06 : 0);
    const kick = V(ty, -0.05 * st.hit - 0.02 * st.recoil, 0, 0);
    const hipZ = 0.93 * tall - crouch + bob;
    const Pel = add([0, 0, hipZ], kick);
    const Tc = add(Pel, add(V(ty, lean * 1.0, 0, 0.55 * tall), [0, 0, -Math.abs(lean) * 0.06]));
    const neckZ = Tc[2];
    const Hd = add(Tc, add(V(ay, 0.04 + (hunch ? 0.1 : 0) + 0.04 * run, 0, 0.15), [0, 0, 0.02]));
    const shL = add(Tc, V(ty, 0, 0.205, -0.04)), shR = add(Tc, V(ty, 0, -0.205, -0.04));

    // legs
    const legs = [];
    const vf = Math.cos(st.vdir - hy), vl = Math.sin(st.vdir - hy) * 1; // velocity in hips frame (f, l) — l left = (s,-c)·v
    const vlocal = [Math.cos(st.vdir) * Math.cos(hy) + Math.sin(st.vdir) * Math.sin(hy), Math.cos(st.vdir) * Math.sin(hy) - Math.sin(st.vdir) * Math.cos(hy)];
    const Ls = (0.2 + 0.22 * run) * s, lift = (0.07 + 0.1 * run) * s;
    for (let i = 0; i < 2; i++) {
      const sg = i === 0 ? 1 : -1, pp = ph + i * PI, sn = Math.sin(pp), cs = Math.cos(pp);
      let ff = vlocal[0] * Ls * sn, fl = sg * 0.1 + vlocal[1] * Ls * sn * 0.9, fz = 0.045 + lift * Math.max(0, cs);
      // idle stance: shooter's stagger
      const idle = (1 - s) * (0.5 + 0.5 * rd);
      ff += idle * (sg > 0 ? 0.1 : -0.1); fl += idle * sg * 0.03;
      if (dead) { ff += sg * 0.03 + (i ? 0.08 : -0.02); fl += sg * 0.1 * fa; fz = 0.045; }
      const foot = add(add(Pel, V(hy, 0, sg * 0.1, 0)), [0, 0, 0]);
      const F = add(foot, V(hy, ff, fl - sg * 0.1, 0)); F[2] = fz;
      const hipJ = add(Pel, V(hy, 0, sg * 0.1, -0.02));
      const solved = ik(hipJ, F, 0.45 * tall, 0.46 * tall, V(hy, 1, 0, 0.12));
      const toe = add(solved.tip, V(hy, 0.13 + 0.03 * Math.min(1, st.mv), 0, -0.035 - 0.03 * Math.max(0, cs) * s));
      legs.push({ hip: FX(hipJ), knee: FX(solved.mid), ank: FX(solved.tip), toe: FX(toe) });
    }
    // draw legs
    for (const L of legs) {
      R.cap(L.hip, L.knee, 0.125, T(pal.pants)); R.cap(L.knee, L.ank, 0.1, T(pal.pants));
      R.cap(add(L.ank, [0, 0, 0.02]), L.toe, 0.115, T(pal.boots));
      if (pal.stripe) { R.line(add(L.hip, [0, 0, 0]), L.knee, 0.018, pal.stripe, 0.05); R.line(L.knee, L.ank, 0.018, pal.stripe, 0.05); }
    }

    // arms
    const arms = [];
    const D0 = weaponDir(ay, 0.0), swing = (i, amt) => Math.sin(ph + (i ? 0 : PI)) * amt;
    const wpn = { visible: !!wDef };
    // raised weapon pose
    let pitchR = 0.03 + 0.07 * st.recoil, yawR = ay;
    let rdLow = 1 - rd;
    let melP = st.melee > 0 ? 1 - st.melee : -1; // 0..1 progress of melee swing
    let relP = a.reload > 0 && a.reloadMax > 0 ? clamp(1 - a.reload / a.reloadMax, 0, 1) : (a.reload > 0 ? 0.5 : -1);
    let gripR, gripL, wYaw, wPitch;
    if (wDef) {
      const gr = wDef.grip;
      const raised = add(Tc, V(ty, gr - 0.1 * st.recoil, -0.075, -0.17));
      const lowDir = wDef.type === 'melee' ? [yawR, 0.9] : ranged && wDef.segs.length > 4 ? [hy, -0.55] : [hy, -0.95];
      const lowPos = wDef.type === 'melee' ? add(Pel, V(hy, 0.12, -0.27, 0.45)) : ranged && wDef.segs.length > 4 ? add(Tc, V(hy, 0.2, -0.14, -0.3)) : add(Pel, V(hy, 0.16, -0.24, 0.3));
      gripR = mixv(lowPos, raised, rd); wYaw = lerp(lowDir[0], yawR, rd) + angDiff(lowDir[0], yawR) * 0 ; wPitch = lerp(lowDir[1], pitchR, rd);
      wYaw = lowDir[0] + angDiff(lowDir[0], yawR) * rd;
      if (wDef.type === 'melee') { wYaw = hy + angDiff(hy, ay) * Math.max(rd, 0.3); }
      // melee swing overrides
      if (melP >= 0) {
        const u = melP, wind = u < 0.38, k = wind ? ease(u / 0.38) : ease((u - 0.38) / 0.4), amp = wDef.type === 'melee' ? 1 : 0.65;
        if (wind) { wPitch = lerp(wPitch, 1.25 * amp, k); gripR = add(gripR, V(ay, -0.08 * k, -0.06, 0.2 * k * amp)); wYaw = ay - 0.5 * k; }
        else { const kk = clamp(k, 0, 1); wPitch = lerp(1.25 * amp, -0.7 * amp, kk); wYaw = ay + lerp(-0.5, 0.65, kk); gripR = add(gripR, V(ay, 0.05 + 0.22 * kk * amp, -0.06 + 0.1 * kk, 0.2 * (1 - kk) * amp)); }
        if (u > 0.78) { const back = (u - 0.78) / 0.22; wPitch = lerp(wPitch, 0.0, back * 0.6); }
      }
      // reload: tilt, left hand to the mag
      if (relP >= 0 && ranged) { wPitch += 0.35 * Math.sin(clamp(relP / 1, 0, 1) * PI); }
      const D = weaponDir(wYaw, wPitch), U = weaponUp(wYaw, wPitch);
      wpn.D = D; wpn.U = U; wpn.pos = gripR; wpn.yaw = wYaw; wpn.pitch = wPitch;
      if (wDef.type === 'melee') { gripL = rd > 0.5 || melP >= 0 ? add(gripR, add(mul(D, -0.1), [0, 0, -0.02])) : add(shL, V(hy, swing(0, 0.28 * s), 0.1, -0.56 + 0.13 * run)); if (melP < 0 && rd < 0.5) { /* off-hand swings */ } }
      else {
        const sp = wDef.supp; let gl = add(gripR, add(mul(D, sp[0]), mul(U, sp[1])));
        if (wDef.segs.length <= 3) gl = add(gripR, add(add(mul(D, 0.02), mul(U, -0.04)), V(wYaw, 0, 0.065, 0)));
        // reload: left hand goes to belt then mag well
        if (relP >= 0) { const belt = add(Pel, V(ty, 0.12, 0.2, 0.08)), well = add(gripR, add(mul(D, 0.06), mul(U, -0.1))); const q = relP; const seq = q < 0.25 ? mixv(gl, belt, ease(q / 0.25)) : q < 0.5 ? mixv(belt, well, ease((q - 0.25) / 0.25)) : q < 0.8 ? well : mixv(well, gl, ease((q - 0.8) / 0.2)); gl = seq; }
        // lowered rifles: left hand at the hand guard, pistols: arm swings
        if (rd < 1 && wDef.segs.length <= 3) { const sw = add(shL, V(hy, swing(0, 0.3 * s), 0.1, -0.55 + 0.12 * run)); gl = mixv(sw, gl, rd); }
        gripL = gl;
      }
    } else {
      // unarmed: arms swing, clawing forward for the hunched kind
      const w = (i) => { const sg = i ? -1 : 1, sh = i ? shR : shL, sw = Math.sin(ph + (i ? PI : 0)); let hand = add(sh, V(hy, sw * (0.26 + 0.2 * run) * s * -1, sg * 0.1, -0.56 + 0.08 * Math.abs(sw) * s + 0.14 * run));
        if (hunch) hand = add(sh, V(ay, 0.45 + 0.1 * sw * s, sg * 0.1, -0.35 + 0.05 * Math.abs(sw)));
        if (melP >= 0) { const u = melP, k = u < 0.4 ? ease(u / 0.4) : 1 - ease((u - 0.4) / 0.6); const lead = i ? 1 : 0.6; hand = add(hand, V(ay, 0.45 * k * lead, -sg * 0.05, 0.28 * k * lead)); }
        if (dead) hand = add(sh, V(hy, 0.1 * sg, sg * (0.22 + 0.16 * fa), -0.45));
        return hand; };
      gripR = w(1); gripL = w(0);
    }
    if (dead) { gripR = add(shR, V(hy, 0.05, -0.2 - 0.14 * fa, -0.5 - 0.02)); gripL = add(shL, V(hy, -0.06, 0.2 + 0.14 * fa, -0.5)); }
    const armPoleR = V(ty, -0.35, -0.8, -0.55), armPoleL = V(ty, -0.35, 0.8, -0.55);
    const aR = ik(shR, gripR, 0.29, 0.28, armPoleR), aL = ik(shL, gripL, 0.29, 0.28, armPoleL);
    arms.push({ sh: shL, el: aL.mid, ha: aL.tip, side: 1 }); arms.push({ sh: shR, el: aR.mid, ha: aR.tip, side: -1 });

    // ground shadow
    const sc = dead ? fa : 0, shw = 0.4 + 0.22 * sc;
    R.fn(-1e6, () => {
      const ox = dead ? fdx * 0.45 * fa : 0, oy = dead ? fdy * 0.45 * fa : 0, cx = R.P([ox, oy, 0]); ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath();
      ctx.ellipse(cx[0], cx[1] + 1, shw * R.sphere, shw * R.sphere * 0.5, dead ? Math.atan2(fdx + fdy, (fdx - fdy)) * 0.0 : 0, 0, TAU); ctx.fill();
    });

    // torso (frustum) + pack + vest
    const fcol = T(pal.jacket), bcol = T(pal.jacketDk);
    const Bp = add(Pel, V(ty, 0, 0, -0.07)), Tt = Tc;
    const tcols = (nf, nl, top, n) => {
      if (top) return shade(fcol, 1.15);
      const k = faceShade(n);
      if (nf < 0) return shade(pal.pack && !dead ? T(pal.pack) : bcol, k * 0.95);
      if (nf > 0) return shade(pal.vest ? T(pal.vest) : fcol, k);
      return shade(fcol, k * 0.95);
    };
    const tz = (p) => p; // torso is built in non-fall space, then converted vertex-wise by wrapping prism
    if (dead) { // build the prism manually through the fall transform
      const cb = (f, l) => FX(add(Bp, V(ty, f, l, 0))), ct = (f, l) => FX(add(Tt, V(ty, f, l, 0)));
      const f0 = 0.125, l0 = 0.17, f1 = 0.13, l1 = 0.215;
      const bFL = cb(f0, l0), bFR = cb(f0, -l0), bBR = cb(-f0, -l0), bBL = cb(-f0, l0), tFL = ct(f1, l1), tFR = ct(f1, -l1), tBR = ct(-f1, -l1), tBL = ct(-f1, l1);
      const faces = [[1, 0, [tFL, tFR, bFR, bFL]], [-1, 0, [tBR, tBL, bBL, bBR]], [0, 1, [tBL, tFL, bFL, bBL]], [0, -1, [tFR, tBR, bBR, bFR]]];
      for (const [nf, nl, pts] of faces) { const c = mul(add(add(pts[0], pts[1]), add(pts[2], pts[3])), 0.25); const e1 = sub(pts[1], pts[0]), e2 = sub(pts[3], pts[0]); const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; const nn = len(n) || 1; const cn = [n[0] / nn, n[1] / nn, n[2] / nn]; const vis = cn[0] + cn[1] + 0.816 * cn[2]; const side = vis > 0 ? 1 : -1; if (vis < -0.2) continue; R.poly(pts, tcols(nf, nl, false, V(ty, nf, nl, 0)), R.depth(c)); }
      const tc = mul(add(add(tFL, tFR), add(tBR, tBL)), 0.25); R.poly([tFL, tFR, tBR, tBL], tcols(0, 0, true), R.depth(tc) + 0.05);
    } else R.prism(Bp, Tt, ty, 0.125, 0.17, 0.13, 0.215, tcols);
    if (pal.pack && !dead) { // backpack
      const c0 = add(Pel, V(ty, -0.2 + lean * 0.5, 0, 0.18)), c1 = add(Pel, V(ty, -0.2 + lean * 0.8, 0, 0.52));
      R.prism(c0, c1, ty, 0.075, 0.13, 0.07, 0.12, (nf, nl, top, n) => (top ? shade(T(pal.pack), 1.1) : shade(T(pal.pack), faceShade(n) * 0.95)));
    }
    // neon point (LED on the chest / shoulder)
    if (!dead) { const led = add(Tc, V(ty, 0.135, -0.16, -0.12)); R.fn(R.depth(led) + 0.2, () => { const P = R.P(led); const nf = V(ty, 1, 0, 0); if (nf[0] + nf[1] < -0.1 || !isFinite(P[0]) || !isFinite(P[1]) || !(R.sphere > 0)) return; ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(P[0], P[1], 0, P[0], P[1], R.sphere * 0.09); try { g.addColorStop(0, pal.accent || '#7fe'); } catch (_) { g.addColorStop(0, '#7fe'); } g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(P[0], P[1], R.sphere * 0.09, 0, TAU); ctx.fill(); ctx.restore(); }); }
    // belt
    // arms
    const sleeve = T(pal.jacket);
    for (const A of arms) {
      R.cap(FX(A.sh), FX(A.el), 0.1, sleeve); R.cap(FX(A.el), FX(A.ha), 0.085, sleeve);
      if (pal.stripe) { R.line(FX(A.sh), FX(A.el), 0.016, pal.stripe, 0.05); R.line(FX(A.el), FX(A.ha), 0.016, pal.stripe, 0.05); }
      R.ball(FX(A.ha), 0.05, T(pal.skin), OUT, 0.03);
    }
    // weapon
    if (wDef && wpn.D) {
      const D = wpn.D, U = wpn.U, G0 = wpn.pos;
      let wp = (a_, u_) => FX(add(G0, add(mul(D, a_), mul(U, u_))));
      if (dead && tDead > 0.12) { // dropped on the floor
        const g = V(st.killAng + 1.1, 0.0, 0.0, 0), baseP = FX(add(shR, V(hy, 0.1, -0.3, -0.6))); const gy = hy + 2.2 + hash(st.h) * 2;
        wp = (a_, u_) => [baseP[0] + Math.cos(gy) * a_ + 0.0, baseP[1] + Math.sin(gy) * a_, 0.04 + (u_ > 0 ? 0.03 : 0)];
      }
      for (const sg of wDef.segs) { const p0 = wp(sg[0], sg[1]), p1 = wp(sg[2], sg[3]); R.cap(p0, p1, sg[4] * 1.3, T(sg[5]), 'rgba(6,8,10,0.85)'); }
      if (wDef.segs.length > 3 && !dead && ranged) { const m = wDef.muzzle, L0 = wp(0.0, 0.035), L1 = wp(m[0] - 0.04, m[1] + 0.035); R.line(L0, L1, 0.008, 'rgba(190,200,215,0.55)', 0.04); }
      if (ranged && !dead) { const sight = wp(wDef.muzzle[0] * 0.55, wDef.muzzle[1] + 0.045); R.fn(R.depth(sight) + 0.1, () => { const P = R.P(sight); ctx.fillStyle = pal.accent; ctx.globalAlpha = 0.9 * (ctx.globalAlpha || 1); ctx.beginPath(); ctx.arc(P[0], P[1], Math.max(0.9, R.sphere * 0.012), 0, TAU); ctx.fill(); }); }
      if (ranged && st.flash > 0 && !dead) { const mz = wp(wDef.muzzle[0] + 0.02, wDef.muzzle[1]); R.fn(R.depth(mz) + 0.3, () => { const P = R.P(mz), k = st.flash, r = R.sphere * (wDef.segs.length > 4 ? 0.28 : 0.2) * (0.5 + k); ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(P[0], P[1], 0, P[0], P[1], r); g.addColorStop(0, 'rgba(255,248,214,' + (0.95 * k) + ')'); g.addColorStop(0.35, 'rgba(255,196,96,' + (0.7 * k) + ')'); g.addColorStop(1, 'rgba(255,120,40,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(P[0], P[1], r, 0, TAU); ctx.fill(); const D2 = [R.P(add(mz, mul(D, 0.5)))[0] - P[0], R.P(add(mz, mul(D, 0.5)))[1] - P[1]]; ctx.strokeStyle = 'rgba(255,230,160,' + (0.8 * k) + ')'; ctx.lineWidth = Math.max(1.5, R.sphere * 0.03); ctx.beginPath(); ctx.moveTo(P[0], P[1]); ctx.lineTo(P[0] + D2[0] * 0.8, P[1] + D2[1] * 0.8); ctx.stroke(); ctx.restore(); }); }
    }
    // head
    drawHead(ctx, R, st, pal, T, FX, Hd, ay, dead, fa, hunch, st.flashW);
    return true;
  }

  function drawHead(ctx, R, st, pal, T, FX, Hd, ay, dead, fa, hunch, flashW) {
    const H = FX(Hd), r = 0.108, fw = V(ay, 1, 0, 0), up = [0, 0, 1];
    const facing = !dead ? (fw[0] + fw[1]) > 0.03 : true;
    const fsx = (fw[0] - fw[1]) * R.kg, fsy = (fw[0] + fw[1]) * R.kg * 0.5, fl = Math.hypot(fsx, fsy) || 1;
    const dirx = dead ? 0 : fsx / fl, diry = dead ? 0.4 : fsy / fl; // screen direction the face looks
    const hat = pal.hat, depthH = R.depth(H) + 0.12;
    // neck
    R.cap(add(H, [0, 0, -0.14]), add(H, [0, 0, -0.05]), 0.07, T(pal.skin));
    R.fn(depthH, () => {
      const C = R.P(H), pr = r * R.sphere;
      const circ = (cx, cy, rr, col, stroke) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TAU); ctx.fill(); if (stroke) { ctx.strokeStyle = OUT; ctx.lineWidth = 1.2; ctx.stroke(); } };
      const skin = T(pal.skin), hair = T(pal.hair), hc = T(pal.hatCol);
      circ(C[0], C[1], pr, hat === 'mask' ? T('#17141c') : skin, true);                       // head base
      if (hat === 'bare' || hat === 'cap' || hat === 'flatcap' || hat === 'beret' || hat === 'none') circ(C[0] - dirx * pr * 0.32, C[1] - diry * pr * 0.32 - pr * 0.1, pr * 0.92, hair, false); // hair mass, shifts to the back
      if (pal.fem) { circ(C[0] - dirx * pr * 0.95, C[1] - diry * pr * 0.95 + pr * 0.55, pr * 0.5, hair, false); circ(C[0] - dirx * pr * 1.15, C[1] - diry * pr * 1.15 + pr * 1.05, pr * 0.38, hair, false); }
      if (hat === 'hood') circ(C[0] - dirx * pr * 0.25, C[1] - diry * pr * 0.25 - pr * 0.12, pr * 1.08, hc, true);
      if (facing && !dead) {                                                           // face: eyes toward the camera side
        const ex = C[0] + dirx * pr * 0.45, ey = C[1] + diry * pr * 0.35 + pr * 0.05, px = -diry, py = dirx; // perpendicular on screen
        if (hat === 'mask') { ctx.strokeStyle = T(pal.skin); ctx.lineWidth = Math.max(1.3, pr * 0.28); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(ex - px * pr * 0.45, ey - py * pr * 0.45); ctx.lineTo(ex + px * pr * 0.45, ey + py * pr * 0.45); ctx.stroke(); }
        if (pal.eyes) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = pal.accent; for (const sg of [-1, 1]) { ctx.beginPath(); ctx.arc(ex + px * pr * 0.32 * sg, ey + py * pr * 0.32 * sg, Math.max(1.1, pr * 0.14), 0, TAU); ctx.fill(); } ctx.restore(); }
        else if (hat !== 'mask') { ctx.fillStyle = '#16120f'; for (const sg of [-1, 1]) { ctx.beginPath(); ctx.arc(ex + px * pr * 0.3 * sg, ey + py * pr * 0.3 * sg, Math.max(0.8, pr * 0.085), 0, TAU); ctx.fill(); } }
      }
      const cap = (rr, up_, col) => circ(C[0] - dirx * pr * 0.18, C[1] - pr * up_ - diry * pr * 0.1, pr * rr, col, true);
      if (hat === 'cap' || hat === 'flatcap') { cap(hat === 'flatcap' ? 1.08 : 1.0, 0.4, hc); const vx = C[0] + dirx * pr * 0.95, vy = C[1] - pr * 0.18 + diry * pr * 0.75; if (facing || hat === 'flatcap') { ctx.strokeStyle = shade(hc, 0.8); ctx.lineWidth = Math.max(1.6, pr * 0.34); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(C[0] + dirx * pr * 0.45, C[1] - pr * 0.22 + diry * pr * 0.3); ctx.lineTo(vx, vy); ctx.stroke(); } }
      if (hat === 'ushanka') { cap(1.12, 0.5, hc); for (const sg of [-1, 1]) circ(C[0] + -diry * sg * pr * 0.95, C[1] + dirx * sg * pr * 0.95 + pr * 0.1, pr * 0.34, shade(hc, 0.85), true); }
      if (hat === 'helmet') { cap(1.1, 0.42, hc); ctx.strokeStyle = shade(hc, 1.25); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(C[0] - dirx * pr * 0.18, C[1] - pr * 0.42 - diry * pr * 0.1, pr * 0.9, PI * 1.12, PI * 1.88); ctx.stroke(); }
      if (hat === 'beret') { cap(1.1, 0.5, hc); }
      if (hat === 'mask') { circ(C[0] - dirx * pr * 0.18, C[1] - pr * 0.3 - diry * pr * 0.1, pr * 1.0, hc, false); ctx.strokeStyle = pal.accent; ctx.globalAlpha *= 0.85; ctx.lineWidth = Math.max(1, pr * 0.1); ctx.beginPath(); ctx.arc(C[0] - dirx * pr * 0.18, C[1] - diry * pr * 0.1 - pr * 0.3, pr * 0.97, PI * 1.15, PI * 1.85); ctx.stroke(); ctx.globalAlpha = 1; }
      if (flashW && !dead) { ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.arc(C[0], C[1], pr, 0, TAU); ctx.fill(); }
    });
  }

  // ---------------------------------------------------------------- dog (quadruped, same iso pipeline)
  function drawDog(ctx, R, a, st, pal, isPlayer) {
    const ph = st.ph, mv = st.mv, run = Math.min(1, st.run), dead = st.deadT >= 0, tDead = Math.max(0, st.deadT);
    const T = (c) => (st.flashW && !dead ? mix(c, '#ffffff', 0.78) : c);
    const yaw = st.hy, fa = dead ? ease(clamp(tDead / 0.4, 0, 1)) : 0;
    const body = pal.jacket, dark = shade(pal.jacket, 0.62), belly = shade(pal.jacket, 1.12);
    const lunge = st.melee > 0 ? Math.sin((1 - st.melee) * PI) : 0;
    const bz = 0.52 - 0.28 * fa + 0.035 * run * Math.sin(ph * 2) * mv, cx = 0.18 * lunge;
    const V2 = (f, l, z) => add(V(yaw, f + cx, l, z), [0, 0, 0]);
    const roll = dead ? fa : 0; // lying on its side
    const side = (l, z) => (dead ? [l * Math.cos(roll * 1.4) - 0, z * (1 - roll) + Math.abs(l) * 0.0 + 0.1 * roll] : [l, z]);
    const hipB = V2(-0.3, 0, bz + 0.02 * mv * Math.sin(ph * 2)), shB = V2(0.3, 0, bz + 0.04 + 0.02 * mv * Math.sin(ph * 2 + 1));
    // shadow
    R.fn(-1e6, () => { const P = R.P([0, 0, 0]); ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.beginPath(); ctx.ellipse(P[0], P[1] + 1, 0.55 * R.sphere, 0.27 * R.sphere, 0, 0, TAU); ctx.fill(); });
    // legs
    const gallop = Math.min(1, run + 0.0);
    const legSpec = [[0.3, 0.1, 0.0, shB], [0.3, -0.1, 0.5, shB], [-0.3, 0.1, 0.5, hipB], [-0.3, -0.1, 0.0, hipB]];
    for (const [lf, ll, po, root] of legSpec) {
      const pp = ph + po * PI + (lf > 0 ? 0 : 0), sn = Math.sin(pp), cs = Math.cos(pp), Ls = (0.14 + 0.12 * gallop) * mv, lift = (0.06 + 0.07 * gallop) * mv * Math.max(0, cs);
      const r0 = add(root, V(yaw, 0, ll, -0.02 - (dead ? 0.25 * fa : 0)));
      let tip = add(add(V(yaw, lf + cx, ll, 0), [0, 0, 0.02 + lift]), V(yaw, Ls * sn, 0, 0)); if (dead) tip = add(V(yaw, lf + 0.1 * fa * (ll > 0 ? 1 : -1), ll * (1 + 1.6 * fa), 0.03), [0, 0, 0.03 + 0.1 * fa * (ll > 0 ? 1 : 0)]);
      const s = ik(r0, tip, 0.26, 0.27, V(yaw, lf > 0 ? -0.6 : 0.6, 0, 0.3));
      R.cap(r0, s.mid, 0.085, T(dark)); R.cap(s.mid, s.tip, 0.06, T(dark)); R.cap(s.tip, add(s.tip, V(yaw, 0.05, 0, 0)), 0.07, T(shade(dark, 0.7)));
    }
    // body, neck, head, tail
    R.cap(hipB, shB, 0.24, T(body));
    R.cap(add(hipB, V(yaw, 0.1, 0, 0.06)), add(shB, V(yaw, -0.05, 0, 0.07)), 0.14, T(shade(body, 1.08)), 'rgba(0,0,0,0)');
    const headC = dead ? add(V2(0.7, 0, 0.2), V(yaw, 0, 0.1, 0)) : add(V2(0.58 + 0.12 * lunge, 0, bz + 0.16 + 0.04 * Math.sin(ph) * mv), V(st.ay, 0, 0, 0));
    R.cap(shB, headC, 0.13, T(body));
    const snout = add(headC, V(yaw, 0.17, 0, -0.06));
    R.cap(headC, snout, 0.1, T(belly));
    R.ball(add(snout, V(yaw, 0.05, 0, 0.01)), 0.03, T('#141210'), false, 0.05);
    if (!dead) { for (const sg of [-1, 1]) { const e0 = add(headC, V(yaw, -0.03, 0.06 * sg, 0.07)), e1 = add(e0, V(yaw, -0.04, 0.03 * sg, 0.09)); R.cap(e0, e1, 0.05, T(dark)); } R.ball(add(headC, V(yaw, 0.1, 0.05, 0.03)), 0.014, pal.accent, false, 0.1); R.ball(add(headC, V(yaw, 0.1, -0.05, 0.03)), 0.014, pal.accent, false, 0.1); }
    const tail0 = add(hipB, V(yaw, -0.1, 0, 0.03)), tail1 = add(tail0, V(yaw, -0.2, 0.06 * Math.sin(st.t * 6), 0.12 - 0.1 * fa));
    R.cap(tail0, tail1, 0.05, T(dark));
    if (lunge > 0.5) { const m0 = add(snout, V(yaw, 0.02, 0, -0.02)); R.line(m0, add(m0, V(yaw, 0.02, 0, -0.05)), 0.02, '#f2eee4', 0.1); }
    return true;
  }

  // ---------------------------------------------------------------- sprite mode (v03 art: 4x4 sheets, 8 directions x 2 walk poses)
  // Sheet layout (same as render3d.js of v03): frame = dir*2 + pose, dir 0..7 = N,NE,E,SE,S,SW,W,NW on SCREEN, grid 4 cols x 4 rows.
  const SPR = { img: {}, cache: {}, on: false }; // людей и мобов рисует процедурный риг (решение пользователя); спрайты v03 людей отключены
  const SPR_NAMES = ['young_male', 'young_female', 'people'];
  const SPR_TINT = { bandit: '#c9a8d6', gopnik: '#a8bff0', marauder: '#d6c68a', militia: '#a9c0e0', ghoul: '#c4d4b0' };
  function loadSprites(base) {
    base = base || root.B96_ASSET_BASE || 'assets/';
    SPR_NAMES.forEach((n) => {
      if (SPR.img[n]) return;
      const im = new Image(); im.onload = () => { SPR.img[n] = im; }; im.onerror = () => {};
      im.src = (root.B96_TEXTURES && root.B96_TEXTURES[n]) || (base + n + '.png');
    });
  }
  function variant(name, kind, style) { // cached recoloured copy of a sheet: tint (multiply) or white (hit flash)
    const key = name + '|' + kind + '|' + style; if (SPR.cache[key]) return SPR.cache[key];
    const img = SPR.img[name], c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    if (kind === 'white') { g.globalCompositeOperation = 'source-in'; g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height); }
    else { g.globalCompositeOperation = 'multiply'; g.fillStyle = SPR_TINT[style]; g.fillRect(0, 0, c.width, c.height); g.globalCompositeOperation = 'destination-in'; g.drawImage(img, 0, 0); }
    return (SPR.cache[key] = c);
  }
  function drawSprite(ctx, a, isPlayer, env, q, kg, kh, st) {
    const gnd = a.gender || (root.WL_START && root.WL_START.gender && root.WL_START.gender()), name = isPlayer ? (gnd === 'female' ? 'young_female' : 'young_male') : 'people';
    const img = SPR.img[name]; if (!img) return false;
    const dead = st.deadT >= 0, tDead = Math.max(0, st.deadT), ay = st.ay;
    const fx = Math.cos(ay), fy = Math.sin(ay), sX = (fx - fy) / S2, sY = (fx + fy) / S2;      // facing on screen
    const raw = Math.atan2(sX, -sY) / (PI / 4);
    if (st.dirIdx == null) st.dirIdx = Math.round(raw);
    else { let d = raw - st.dirIdx; d -= 8 * Math.round(d / 8); if (Math.abs(d) > 0.62) st.dirIdx = Math.round(raw); }
    const dir = ((Math.round(st.dirIdx) % 8) + 8) % 8, moving = st.mv > 0.15 && !dead, pose = moving ? (Math.floor(st.ph / PI) % 2 + 2) % 2 : 0, idx = dir * 2 + pose;
    const cw = img.width / 4, ch = img.height / 4, col = idx % 4, row = Math.floor(idx / 4);
    const H = TUNE.spriteM * kh, Wd = H * (cw / ch);
    const run = Math.min(1, st.run), lsx = sX / (Math.hypot(sX, sY) || 1), lsy = sY / (Math.hypot(sX, sY) || 1);
    const src = !isPlayer && SPR_TINT[st.style] ? variant(name, 'tint', st.style) : img;
    const kickPx = (st.recoil * 0.07 + (st.melee > 0 ? 0.28 * Math.sin((1 - st.melee) * PI) : 0) - st.hit * 0.08) * kg * S2;
    const bob = moving ? -Math.abs(Math.sin(st.ph)) * kh * (0.02 + 0.03 * run) : -Math.sin(st.t * 2.2) * kh * 0.004;
    const ox = lsx * kickPx, oy = lsy * kickPx * 0.5;
    const wDef = st.weaponId ? WEAPONS[st.weaponId] : null, overlay = wDef && st.weaponId !== 'pistol' && !dead;
    const wp = wDef ? weaponOverlay(ctx, q.x + ox, q.y + oy + bob, kg, kh, st, wDef, ay) : null;
    if (wp && overlay && wp.behind) wp.body();
    ctx.save();
    const sw = dead ? 0.55 : 0.36; ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(q.x, q.y + 1, sw * kg * S2, sw * kg * S2 * 0.5, 0, 0, TAU); ctx.fill();
    ctx.translate(q.x + ox, q.y + oy);
    if (dead) { const k = ease(clamp(tDead / 0.5, 0, 1)), sgn = lsx >= 0 ? 1 : -1; ctx.rotate(sgn * (PI / 2) * 0.93 * k); ctx.scale(1, 1 - 0.08 * k); if (st.deadT > 25) ctx.globalAlpha *= clamp(1 - (st.deadT - 25) / 8, 0, 1); }
    else ctx.rotate((0.05 * run * Math.sign(lsx || 1) + 0.0 * Math.sin(st.ph)) * (moving ? 1 : 0));
    const dy = -H * 0.975 + bob + (dead ? 0 : 0), breath = dead ? 1 : 1 + 0.006 * Math.sin(st.t * 2.2);
    // плавная смена двух поз шага: поза A целиком + поза B с прозрачностью w(фаза) -> ноги и руки непрерывно шагают
    const idxA = dir * 2, wB = moving ? (1 - Math.cos(st.ph)) / 2 : 0, ga0 = ctx.globalAlpha;
    const cell = (i) => [(i % 4) * cw, Math.floor(i / 4) * ch];
    const cA = cell(idxA), cB = cell(idxA + 1), hipK = 0.5, lift = moving ? Math.sin(st.ph) * H * 0.012 : 0;
    // часть клетки [fy0,fy1]x[fx0,fx1] (доли клетки), со сдвигом в экранных px
    const part = (cc, fx0, fx1, fy0, fy1, ox2, oy2) => ctx.drawImage(src, cc[0] + fx0 * cw, cc[1] + fy0 * ch, (fx1 - fx0) * cw, (fy1 - fy0) * ch, -Wd / 2 + fx0 * Wd + ox2, dy + fy0 * H * breath + oy2, (fx1 - fx0) * Wd, (fy1 - fy0) * H * breath);
    const amp = moving ? H * (0.03 + 0.03 * run) : 0, sg = Math.sin(st.ph), swx = moving ? Math.cos(st.ph) * H * 0.02 * (0.5 + run) : 0;
    for (const [cc, al] of [[cA, 1], [cB, wB]]) {
      if (al < 0.01) continue; ctx.globalAlpha = ga0 * al;
      part(cc, 0, 1, 0, hipK + 0.02, 0, 0);                                   // торс и голова
      part(cc, 0, 0.5, hipK, 1, -swx * 0.4, -Math.max(0, sg) * amp);          // одна нога поднимается
      part(cc, 0.5, 1, hipK, 1, swx * 0.4, -Math.max(0, -sg) * amp);          // другая
    }
    ctx.globalAlpha = ga0;
    if (st.flashW && !dead) { ctx.globalAlpha *= 0.6; ctx.drawImage(variant(name, 'white', ''), col * cw, row * ch, cw, ch, -Wd / 2, dy, Wd, H * breath); }
    ctx.restore();
    if (wp && !dead) { if (overlay && !wp.behind) wp.body(); wp.flash(); }
    return true;
  }
  // weapons other than the pistol (baked into the sprites) and the muzzle flash are drawn as a procedural overlay
  function weaponOverlay(ctx, x, y, kg, kh, st, wDef, ay) {
    const R = makeRig(ctx, x, y, kg, kh), fw = V(ay, 1, 0, 0), behind = (fw[0] + fw[1]) < -0.15;
    const melP = st.melee > 0 ? 1 - st.melee : -1;
    let pitch = wDef.type === 'melee' ? 0.7 : 0.02 + 0.06 * st.recoil, yaw = ay;
    if (melP >= 0 && wDef.type === 'melee') { const k = melP < 0.38 ? ease(melP / 0.38) : 1 - ease((melP - 0.38) / 0.62); pitch = lerp(0.7, 1.3, k) - (melP > 0.38 ? 2.0 * ease((melP - 0.38) / 0.4) : 0); yaw = ay + (melP > 0.38 ? lerp(-0.4, 0.6, ease((melP - 0.38) / 0.4)) : -0.4 * k); }
    const G0 = V(ay, (wDef.grip - 0.04) * 1.0 - 0.1 * st.recoil, -0.08, 1.12), D = weaponDir(yaw, pitch), U = weaponUp(yaw, pitch);
    const p = (a_, u_) => add(G0, add(mul(D, a_), mul(U, u_)));
    const overlay = st.weaponId !== 'pistol';
    const R2 = overlay ? R : null;
    if (overlay) for (const sg of wDef.segs) R.cap(p(sg[0], sg[1]), p(sg[2], sg[3]), sg[4] * 1.3, sg[5], 'rgba(6,8,10,0.85)');
    const mz = p(wDef.muzzle[0] + 0.02, wDef.muzzle[1]);
    if (wDef.type === 'gun' && st.flash > 0) R.fn(R.depth(mz) + 5, () => { const P = R.P(mz), k = st.flash, r = R.sphere * (wDef.segs.length > 4 ? 0.3 : 0.22) * (0.5 + k); ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(P[0], P[1], 0, P[0], P[1], r); g.addColorStop(0, 'rgba(255,248,214,' + 0.95 * k + ')'); g.addColorStop(0.35, 'rgba(255,196,96,' + 0.7 * k + ')'); g.addColorStop(1, 'rgba(255,120,40,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(P[0], P[1], r, 0, TAU); ctx.fill(); ctx.restore(); });
    const fd = R.depth(mz) + 4.9, body = R.prims.filter((q) => q.d < fd).sort((a, b) => a.d - b.d), fl = R.prims.filter((q) => q.d >= fd);
    return { behind, body() { for (const q of body) q.f(); }, flash() { for (const q of fl) q.f(); } };
  }

  // ---------------------------------------------------------------- public API
  function finish(ctx, R) { R.prims.sort((p, q) => p.d - q.d); for (const p of R.prims) { try { p.f(); } catch (e) { ctx.restore && 0; if (!window.__chErr) { window.__chErr = 1; console.warn('chars prim', e && e.message); } } } }
  const _draw = draw;
  function drawAndFlush(ctx, a, isPlayer, env) {
    // wrap: draw() builds prims inside; flush after build
    return _draw2(ctx, a, isPlayer, env);
  }
  function _draw2(ctx, a, isPlayer, env) {
    if (!a || !env || !env.SCR) return false;
    const t = now(), upm = (env.C && env.C.PX_PER_M) || 10;
    const q = env.SCR(a.x, a.y), kg = env.Kx * upm, kh = env.VMh;
    const st = getState(a, isPlayer, t, upm), pal = palette(st);
    update(st, a, isPlayer, t, upm);
    const R = makeRig(ctx, q.x, q.y, kg, kh);
    ctx.save();
    const fade = st.deadT > 25 ? clamp(1 - (st.deadT - 25) / 8, 0, 1) : 1; if (fade < 1) ctx.globalAlpha = fade;
    if (SPR.on && st.style !== 'dog' && drawSprite(ctx, a, isPlayer, env, q, kg, kh, st)) { ctx.restore(); return true; }
    applyGender(pal, a, isPlayer); if (st.style === 'dog') drawDog(ctx, R, a, st, pal, isPlayer); else drawHuman(ctx, R, a, st, pal, isPlayer);
    finish(ctx, R);
    ctx.restore();
    return true;
  }
  function cue(a, what, extra) {
    const st = states.get(a.id); if (!st) return;
    if (what === 'shoot') { st.recoil = 1; st.flash = 1; st.lastAim = now(); }
    else if (what === 'melee') { st.melee = 1; st.meleeDur = (extra && extra.dur) || 0.34; }
    else if (what === 'hit') st.hit = 1;
    else if (what === 'die') { st.deadT = 0; st.killAng = extra && extra.ang != null ? extra.ang : st.ay + PI; }
  }
  // loadSprites() намеренно не вызывается: спрайты людей v03 не используются
  root.WL_CHARS = { _states: states, draw: _draw2, loadSprites, setSprites: (on) => { SPR.on = !!on; }, SPR, cue, forget: (id) => states.delete(id), TUNE, STYLES, WEAPONS, TYPE_STYLE, version: 1 };
})(typeof window !== 'undefined' ? window : globalThis);
