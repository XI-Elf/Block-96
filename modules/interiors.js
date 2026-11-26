// Block-96: houses, client side. Needs interiors_sim.js (WL_HOUSES_SIM) loaded before. Hooks per INTERFACES.md section 2
// plus a few small additions (drawWall, items, floor) listed in NOTE.md. All hooks return true when they handled the call.
'use strict';
(function () {
  const HS = window.WL_HOUSES_SIM; if (!HS) return;
  const P = 10, FH = 2.8;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const faceS = (I, face, s) => (face === 0 ? s + I.fr.w / 2 : face === 1 ? s + I.fr.d / 2 : face === 2 ? I.fr.w / 2 - s : I.fr.d / 2 - s) * P; // layout coord -> px along poly edge `face`
  const toW = (I, lx, ly) => ({ x: I.fr.c.x + (I.fr.ux * lx + I.fr.vx * ly) * P, y: I.fr.c.y + (I.fr.uy * lx + I.fr.vy * ly) * P });
  const GLASS = ['#16222b', '#1a2833', '#18262f', '#1d2c37'];

  // ---------- facade ----------
  function facade(ctx, b, f, env) {
    const I = b.int; if (!I) return false;
    const { wl, Hp } = f, MH = env.MH, hsh = env.hsh, fl = MH(FH), floors = Math.max(1, Math.round(b.h / FH)), k = b.kind;
    const ind = k === 'industrial' || k === 'warehouse', gar = k === 'garage_row' || k === 'shed';
    // wall base tone and plinth
    if (ind) { ctx.fillStyle = k === 'industrial' ? '#4a4f55' : '#55504a'; ctx.fillRect(0, 0, wl, Hp); ctx.fillStyle = 'rgba(0,0,0,0.22)'; for (let r = 4; r < Hp; r += 6) ctx.fillRect(0, r, wl, 1); }
    else if (gar) { ctx.fillStyle = k === 'shed' ? '#4a3f33' : '#3b4a52'; ctx.fillRect(0, 0, wl, Hp); ctx.fillStyle = 'rgba(0,0,0,0.25)'; for (let r = 4; r < Hp; r += 4) ctx.fillRect(0, r, wl, 1); }
    else { ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(0, 0, wl, Math.min(Hp, MH(0.9))); if (k === 'panel' || k === 'civic') { ctx.fillStyle = 'rgba(0,0,0,0.18)'; for (let fi = 1; fi < floors; fi++) { ctx.fillRect(0, fi * fl, wl, 1.65); ctx.fillStyle='rgba(190,196,200,0.18)'; ctx.fillRect(0,fi*fl+1.65,wl,0.9);ctx.fillStyle='rgba(0,0,0,0.18)'; } for (let x = 0; x < wl; x += 3 * P * 2) { ctx.fillStyle = 'rgba(0,0,0,0.10)'; ctx.fillRect(x, 0, 1, Hp); } } }
    // windows
    for (const W of I.wins) {
      if (W.face !== f.i) continue; const u = faceS(I, W.face, W.s), ww = W.wd * P, x = u - ww / 2;
      const nF = W.high ? 1 : (k === 'industrial' || k === 'warehouse' ? 1 : floors);
      for (let fi = 0; fi < nF; fi++) {
        const y0 = fi * fl + MH(W.z0), hh = MH(W.z1 - W.z0); if (y0 >= Hp) break; const hz = Math.min(hh, Hp - y0);
        const g = fi === 0 ? W.st : 0, lit = fi === 0 ? W.lit : hsh(b.id * 131 + fi * 17 + f.i, Math.round(W.s * 7)) < 0.12;
        ctx.fillStyle = '#0c151c'; ctx.fillRect(x - 1, y0 - 1, ww + 2, hz + 2);
        if (g === 2) { ctx.fillStyle = '#05080b'; ctx.fillRect(x, y0, ww, hz); ctx.fillStyle = 'rgba(200,220,235,0.75)'; for (const [a, c] of [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0]]) { ctx.beginPath(); ctx.moveTo(x + a * ww, y0 + c * hz); ctx.lineTo(x + ww * (0.35 + 0.3 * hsh(b.id, a * 3 + c)), y0 + hz * (0.35 + 0.3 * hsh(b.id, 9 + a))); ctx.lineTo(x + ww * (a === 0 ? 0.12 : 0.88), y0 + hz * (c === 0 ? 0.0 : 1)); ctx.fill(); } }
        else if (g === 1) { ctx.fillStyle = '#0a1016'; ctx.fillRect(x, y0, ww, hz); ctx.fillStyle = '#5a4a38'; ctx.fillRect(x, y0, ww * 0.3, hz); ctx.fillStyle = 'rgba(160,200,220,0.12)'; ctx.fillRect(x + ww * 0.3, y0, ww * 0.2, hz); }
        else { ctx.fillStyle = lit ? '#e6b070' : GLASS[(b.id + fi) & 3]; ctx.fillRect(x, y0, ww, hz); if (!lit) { ctx.fillStyle = 'rgba(160,200,220,0.14)'; ctx.fillRect(x, y0, ww * 0.4, hz); } else { ctx.fillStyle = 'rgba(255,230,180,0.25)'; ctx.fillRect(x, y0, ww, hz * 0.4); } if (fi === 0 && W.curtain > 0.6) { ctx.fillStyle = 'rgba(120,70,70,0.55)'; ctx.fillRect(x, y0, ww * 0.35, hz); ctx.fillRect(x + ww * 0.65, y0, ww * 0.35, hz); } ctx.strokeStyle = 'rgba(10,16,20,0.9)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + ww / 2, y0); ctx.lineTo(x + ww / 2, y0 + hz); ctx.stroke(); }
        if (!W.high) { ctx.fillStyle = 'rgba(70,74,70,0.9)'; ctx.fillRect(x - 2, y0 - 2, ww + 4, 1.5); }
      }
      for (const d of W.dec || []) { const hh = MH(1.1 + hsh(b.id, Math.round(d.x)) * 0.8); decal(ctx, u + (hsh(b.id, Math.round(d.y)) - 0.5) * ww * 0.7, hh); }
    }
    // doors / gates
    for (const D of I.doors) {
      if (!D.ext || D.face !== f.i) continue; const u = faceS(I, D.face, D.s), dw = D.wd * P, x = u - dw / 2, dh = Math.min(Hp, MH(D.z1));
      if (D.kind === 'gate') {
        ctx.fillStyle = '#0a0f13'; ctx.fillRect(x - 1, 0, dw + 2, dh + 1);
        const leaf = 1 - (D.anim || 0); if (leaf > 0.03) { ctx.fillStyle = D.garage ? '#5a5f58' : '#6b5a38'; ctx.fillRect(x, 0, dw, dh * leaf); ctx.fillStyle = 'rgba(0,0,0,0.3)'; for (let r = 3; r < dh * leaf; r += 4) ctx.fillRect(x, r, dw, 1); if (D.locked) { ctx.fillStyle = '#d0504a'; ctx.fillRect(x + dw / 2 - 2, 3, 4, 3); } }
        ctx.fillStyle = '#5a4a2a'; ctx.fillRect(x - 2, dh, dw + 4, 3);
      } else {
        ctx.fillStyle = '#0a0f13'; ctx.fillRect(x - 1, 0, dw + 2, dh + 1);
        if (!D.broke) { const lf = 1 - (D.anim || 0); if (lf > 0.05) { ctx.fillStyle = D.locked ? '#4a2e2a' : D.steel ? '#4a545c' : '#5a3d2a'; ctx.fillRect(x, 0, dw * lf, dh); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x + dw * lf / 2, 0, 1, dh); if (lf > 0.5) { ctx.fillStyle = D.locked ? '#d0504a' : '#c9b07a'; ctx.fillRect(x + dw * lf - 3, dh * 0.45, 2, 3); } } if ((D.anim || 0) > 0.1) { ctx.fillStyle = 'rgba(10,14,18,0.9)'; ctx.fillRect(x + dw * (1 - D.anim), 0, dw * D.anim, dh); } }
        else { ctx.fillStyle = '#05080b'; ctx.fillRect(x, 0, dw, dh); ctx.fillStyle = '#5a3d2a'; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 3, dh * 0.7); ctx.lineTo(x + 1, dh); ctx.lineTo(x, dh); ctx.fill(); }
      }
      for (const d of D.dec || []) decal(ctx, u + (hsh(b.id, Math.round(d.x)) - 0.5) * dw * 0.8, MH(d.h));
    }
    // marks on the wall (hits that were not on a window or door)
    if (b.decals) for (const d of b.decals) { if (d.i !== f.i || d.h * env.VMh > Hp) continue; decal(ctx, d.u, d.h * env.VMh); }
    streetWriting(ctx, b, f, env);
    if (ind && k === 'industrial') { ctx.fillStyle = 'rgba(0,0,0,0.0)'; }
    return true;
  }
  // Original editorial writing on actual building faces, projected in facade coordinates.
  // Does not use picture-space overlays: it follows the wall, scale and camera.
  function streetWriting(ctx, b, f, env) {
    if (b.kind !== 'panel' && b.kind !== 'house') return;
    const entries = window.B96_GRAFFITI || []; if (!entries.length) return;
    const H = env.MH, wl=f.wl, Hp=f.Hp;
    if (wl < 95 || Hp < H(2.5)) return;
    // A handful of marked buildings; blank walls remain the majority.
    const chance = env.hsh(b.id * 7 + f.i * 19, 347);
    if (chance > 0.27) return;
    const floor = chance > 0.19 && Hp > H(8) ? 2 : 0;
    const floorY = H(floor * FH);
    const roomLow = floorY + H(0.9), roomHigh = Math.min(Hp-H(0.25),floorY+H(2.25));
    if (roomLow >= roomHigh) return;
    const left=9, right=wl-9;
    const blocks=[];
    for (const W of (b.int?.wins||[])) {
      if (W.face!==f.i) continue;
      const u=faceS(b.int,W.face,W.s), wd=W.wd*P;
      blocks.push([u-wd/2-9,u+wd/2+9]);
    }
    if (floor===0) for (const D of (b.int?.doors||[])) {
      if (!D.ext || D.face!==f.i) continue;
      const u=faceS(b.int,D.face,D.s), wd=D.wd*P;
      blocks.push([u-wd/2-13,u+wd/2+13]);
    }
    let slots=[]; let prev=left;
    for(const seg of blocks.sort((a,c)=>a[0]-c[0])){
      if (seg[0]>prev+45) slots.push([prev,seg[0]]);
      prev=Math.max(prev,seg[1]);
    }
    if(right>prev+45) slots.push([prev,right]);
    if (!slots.length) return;
    slots.sort((a,c)=>(c[1]-c[0])-(a[1]-a[0]));
    const slot=slots[0], span=slot[1]-slot[0];
    const k=Math.floor(env.hsh(b.id + f.i*37, 911)*entries.length), obj=entries[k];
    const raw=String(obj.text||'').slice(0,65).toUpperCase();if(!raw)return;
    const lines=raw.split('|').slice(0,2);
    const stencil=obj.style!=='spray';
    const fontSize=Math.max(7,Math.min(11.5,H(0.35),roomHigh-roomLow-2));
    ctx.save();
    ctx.font=(stencil?'bold ':'900 ')+fontSize+'px sans-serif';
    const widest=Math.max(...lines.map(t=>ctx.measureText(t).width));
    const factor=Math.min(1,span/Math.max(1,widest+8));
    const x=slot[0]+(span-widest*factor)/2;
    // Local facade Y points upward: mirror the glyphs back so text is upright.
    ctx.translate(x,roomLow);ctx.scale(factor,-1);
    const r=env.hsh(b.id, f.i+323);
    ctx.fillStyle=stencil?(r>0.5?'rgba(198,194,181,0.64)':'rgba(35,38,40,0.68)'):(r>0.5?'rgba(174,69,57,0.70)':'rgba(214,201,171,0.68)');
    ctx.textBaseline='alphabetic';
    lines.forEach((txt,i)=>ctx.fillText(txt,0,-(i*(fontSize+1)+fontSize)));
    // Scratches and incomplete sprayed spots make it weathered without a solid label backing.
    const n=stencil?14:25;
    for(let q=0;q<n;q++){
      const px=env.hsh(b.id*31+f.i,q*2+141)*widest;
      const py=env.hsh(b.id*31+f.i,q*2+142)*fontSize;
      ctx.fillStyle=stencil?'rgba(64,63,58,0.23)':'rgba(28,27,27,0.21)';
      ctx.fillRect(px,-fontSize-py*0.08,0.5+env.hsh(b.id,q)*1.6,0.4);
    }
    ctx.restore();
  }
  function decal(ctx, x, y) { ctx.fillStyle = 'rgba(8,10,12,0.85)'; ctx.beginPath(); ctx.arc(x, y, 1.8, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(220,225,230,0.5)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(x, y, 3.4, 0, 7); ctx.stroke(); }

  // ---------- hits ----------
  function onHit(x, y, env) {
    const s = env.s, CT = s.map.city; if (!CT) return false;
    const r = HS.hit(s, x, y, 1);
    if (r) {
      if (r.kind === 'win' && r.broke) { env.sfx(3200, 0.22, 0.12); for (let j = 0; j < 6; j++) env.fx.push({ k: 'chip', x, y, vx: (Math.random() - 0.5) * 140, vy: (Math.random() - 0.5) * 140, life: 0.55, max: 0.55 }); }
      else if (r.kind === 'door') { env.sfx(r.broke ? 160 : 220, 0.12, 0.1); if (r.broke) for (let j = 0; j < 5; j++) env.fx.push({ k: 'chip', x, y, vx: (Math.random() - 0.5) * 100, vy: (Math.random() - 0.5) * 100, life: 0.4, max: 0.4 }); }
      return true;
    }
    // exterior wall of a building with an interior: mark on the facade
    let best = null, bd = 14;
    for (const b of CT.buildings) {
      if (!b.int || x < b.minX - 14 || x > b.maxX + 14 || y < b.minY - 14 || y > b.maxY + 14) continue;
      for (let i = 0; i < 4; i++) { const a = b.poly[i], c = b.poly[(i + 1) % 4], ex = c.x - a.x, ey = c.y - a.y, L2 = ex * ex + ey * ey, t = Math.max(0, Math.min(1, ((x - a.x) * ex + (y - a.y) * ey) / L2)), d = Math.hypot(x - (a.x + ex * t), y - (a.y + ey * t)); if (d < bd) { bd = d; best = { b, i, u: t * Math.sqrt(L2) }; } }
    }
    if (!best) return false;
    const b = best.b; b.decals = b.decals || []; b.decals.push({ i: best.i, u: best.u, h: 0.9 + Math.random() * 1.9 }); if (b.decals.length > 40) b.decals.shift(); return true;
  }

  // ---------- use (E tap) ----------
  const CALC = { s: 0 };
  function use(p, env) {
    const s = env.s;
    for (const c of s.containers) if (!c.searched && (c.inb == null || c.inb === env.insideId) && Math.hypot(c.x - p.x, c.y - p.y) < 20) return false;
    const API = window.WL_SIM && WL_SIM.API;
    const r = HS.use(s, p, (pl, d) => { if (API && API.damage) API.damage(s, pl, d, null); });
    if (!r) return false;
    if (r.text) env.toast(r.text); if (r.sfx) env.sfx(r.sfx, 0.2, 0.12);
    if (r.vault) { p.hop = 0.35; }
    return true;
  }

  // ---------- animation of door leaves (called from items(); cheap) ----------
  function animDoors(I, dt) { for (const D of I.doors) { const t = D.open ? 1 : 0; D.anim = (D.anim || 0) + (t - (D.anim || 0)) * Math.min(1, dt * 9); if (Math.abs(D.anim - t) < 0.01) D.anim = t; } }

  // ---------- floor painter: called inside the clipped inner polygon of the flat layer (coordinates: world px minus cam) ----------
  const FLOORC = { hall: '#4a4638', living: '#4a4a52', bedroom: '#463f50', kitchen: '#58584a', bath: '#4a5a5a', storage: '#454540', studio: '#4a4a52', stairs: '#3c3c3c', hall_big: '#3b3e3a', office: '#4e5240', store: '#43483f', garage: '#3a3c40', room: '#44443f' };
  function floor(ctx, b, env) {
    const I = b.int; if (!I) return false; const cam = env.cam;
    for (const r of I.rooms) {
      const q = [toW(I, r.x0, r.y0), toW(I, r.x1, r.y0), toW(I, r.x1, r.y1), toW(I, r.x0, r.y1)];
      ctx.beginPath(); q.forEach((a, i) => i ? ctx.lineTo(a.x - cam.x, a.y - cam.y) : ctx.moveTo(a.x - cam.x, a.y - cam.y)); ctx.closePath();
      ctx.fillStyle = FLOORC[r.type] || '#44443f'; ctx.fill();
      if (env.texFill) env.texFill(ctx, r.type === 'bath' || r.type === 'kitchen' ? 'floor_tile' : (r.type === 'living' || r.type === 'bedroom' ? 'floor_parquet' : 'floor_linoleum'), r.type === 'bath' || r.type === 'kitchen' ? 0.55 : 0.68, 0.05, null, 'nonzero', -cam.x, -cam.y);
      if (r.type === 'bath' || r.type === 'kitchen') { ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1; ctx.stroke(); }
    }
    // лестничные марши: ступени на полу подъезда (поперёк марша)
    for (const f of I.furn) {
      if (f.kind !== 'stairs') continue; const n = 9;
      const quad = (y0, y1) => { const q = [toW(I, f.x0, y0), toW(I, f.x1, y0), toW(I, f.x1, y1), toW(I, f.x0, y1)]; ctx.beginPath(); q.forEach((a, i) => i ? ctx.lineTo(a.x - cam.x, a.y - cam.y) : ctx.moveTo(a.x - cam.x, a.y - cam.y)); ctx.closePath(); };
      const h = (f.y1 - f.y0) / n;
      for (let i = 0; i < n; i++) { quad(f.y0 + i * h, f.y0 + (i + 1) * h); ctx.fillStyle = `rgb(${88 + i * 11},${86 + i * 11},${80 + i * 10})`; ctx.fill(); quad(f.y0 + i * h, f.y0 + i * h + h * 0.22); ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill(); }
      quad(f.y0, f.y1); ctx.strokeStyle = '#c9b07a'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    // door thresholds + open window light spill are skipped; bullet marks on the floor are not tracked
    return true;
  }

  // ---------- furniture / interior walls ----------
  function nearCut(env, w, h, low) { // стены/мебель между камерой и игроком срезаются низко
    const pl = env.s.players && Object.values(env.s.players)[0]; if (!pl || pl.dead) return h;
    const dx = w.x + w.w / 2 - pl.x, dy = w.y + w.h / 2 - pl.y;
    if (dx + dy > -6 && Math.hypot(dx, dy) < 190 && Math.abs(dx - dy) < 170) return Math.min(h, low);
    return h;
  }
  function drawWall(w, env) {
    if (w._ox != null) return true; // door panel that is currently open (moved away)
    const k = w.kind; if (k === 'win' || k === 'door') return true;
    if (k !== 'furn' && !(k === 'wall' && w.part)) return false;
    if (w.chain) return true;
    const prism = env.prism, shade = env.shade; if (!prism || !env.rectPts) return false;
    const wp = w.or ? w.or.map(q => ({ x: q.x, y: q.y })) : env.rectPts(w);
    if (k === 'wall') { prism(wp, nearCut(env, w, 1.6, 0.55), { face: '#8f8a7c', roof: '#b8b2a2', snow: 0, deco: (f) => { if (w.dec) wallDecals(env, w, f); } }); return true; }
    const kind = w.fk, col = w.col || '#7d7650'; let hh = w.fh || 1; hh = nearCut(env, w, hh, 0.9);
    prism(wp, hh, { face: shade(col, 1.0), roof: shade(col, 1.3), snow: 0, deco: (f) => furnDeco(env, kind, f, col, w) });
    return true;
  }
  function wallDecals(env, w, f) { const ctx = env.ctx; if (!ctx) return; for (const d of w.dec) { if (d.h * env.VMh > f.Hp) continue; const u = Math.hypot(d.x - w.x, d.y - w.y) % f.wl; ctx.fillStyle = 'rgba(8,10,12,0.85)'; ctx.beginPath(); ctx.arc(u, d.h * env.VMh, 1.6, 0, 7); ctx.fill(); } }
  function furnDeco(env, kind, f, col, w) {
    const ctx = env.ctx; if (!ctx) return; const wl = f.wl, Hp = f.Hp;
    if (kind === 'mailbox') { ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; const n = Math.max(1, Math.floor(wl / 4)); for (let r = 0; r < 3; r++) for (let i = 0; i < n; i++) { const x = i * wl / n, y = Hp * (0.4 + r * 0.19); ctx.strokeRect(x + 0.5, y, wl / n - 1, Hp * 0.17); ctx.fillStyle = 'rgba(230,230,220,0.7)'; ctx.fillRect(x + wl / n * 0.3, y + 2, wl / n * 0.4, 1); } }
    else if (kind === 'fridge') {ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, Hp * 0.62, wl, 1); ctx.fillRect(wl * 0.8, Hp * 0.7, 1.5, Hp * 0.15); }
    else if (kind === 'wardrobe' || kind === 'cabinet' || kind === 'locker2') { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(wl / 2, 1, 1, Hp - 2); ctx.fillStyle = 'rgba(220,200,150,0.6)'; ctx.fillRect(wl / 2 - 3, Hp * 0.5, 1.5, 2); ctx.fillRect(wl / 2 + 2, Hp * 0.5, 1.5, 2); }
    else if (kind === 'rack' || kind === 'shelf') { for (let r = 1; r < 4; r++) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, r * Hp / 4, wl, 1.5); } ctx.fillStyle = 'rgba(140,130,90,0.7)'; for (let r = 0; r < 4; r++) ctx.fillRect(2 + r * 7 % Math.max(4, wl - 8), r * Hp / 4 + 2, Math.min(9, wl * 0.2), Hp / 4 - 4); }
    else if (kind === 'crate' || kind === 'boxes') { ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1; ctx.strokeRect(1, 1, wl - 2, Hp - 2); ctx.beginPath(); ctx.moveTo(1, 1); ctx.lineTo(wl - 1, Hp - 1); ctx.stroke(); }
    else if (kind === 'stove') { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(2, Hp * 0.35, wl - 4, Hp * 0.4); }
    else if (kind === 'car') { ctx.fillStyle = 'rgba(15,20,28,0.7)'; ctx.fillRect(wl * 0.22, Hp * 0.5, wl * 0.5, Hp * 0.32); }
    else if (kind === 'sofa') { ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(0, 0, wl, Hp * 0.3); }
    else if (kind === 'bed' || kind === 'bed1') { ctx.fillStyle = 'rgba(230,230,235,0.25)'; ctx.fillRect(2, Hp * 0.3, wl - 4, Hp * 0.45); }
    if (w.dec) for (const d of w.dec) { if (d.h * env.VMh > Hp) continue; const u = (Math.hypot(d.x - w.x, d.y - w.y)) % wl; ctx.fillStyle = 'rgba(8,10,12,0.85)'; ctx.beginPath(); ctx.arc(u, d.h * env.VMh * 0.6, 1.5, 0, 7); ctx.fill(); }
  }

  // ---------- interior doors drawn as depth-sorted items: WL_HOUSES.items(b, env) -> [{k, fn}] ----------
  const _acc = {};
  function items(b, env) {
    const I = b.int; if (!I) return []; const out = [];
    animDoors(I, 1 / 60);
    for (const D of I.doors) {
      if (D.ext && D.kind === 'gate') continue;
      if (D.broke) { out.push({ k: D.x + D.y - 1, fn: () => debris(env, D) }); continue; }
      out.push({ k: D.x + D.y, fn: () => leaf(env, D) });
    }
    return out;
  }
  function debris(env, D) { // splinters of a destroyed door leaf lie in the doorway
    const c = env.ctx; if (!c) return; const ax = -D.ny, ay = D.nx;
    for (let i = 0; i < 7; i++) { const h = env.hsh(D.id.length * 31 + i, Math.round(D.x)), h2 = env.hsh(i + 5, Math.round(D.y)), t = (h - 0.5) * D.wd * P * 0.9, q = env.SCR(D.x + ax * t + D.nx * (h2 - 0.5) * 8, D.y + ay * t + D.ny * (h2 - 0.5) * 8);
      c.fillStyle = h2 > 0.5 ? '#6a4a2e' : '#4a3422'; c.save(); c.translate(q.x, q.y); c.rotate(h * 6); c.fillRect(-4 - h2 * 3, -1, 8 + h2 * 5, 2.2); c.restore(); }
  }
  function leaf(env, D) {
    const c = env.ctx; if (!c) return;
    const ax = -D.ny, ay = D.nx, ln = D.wd * P, a = D.anim || 0;
    // along-wall axis for a door with outward normal n is perpendicular to n (layout run axis)
    const x0 = D.x - ax * ln / 2, y0 = D.y - ay * ln / 2; // hinge
    const ang = a * Math.PI / 2, ca = Math.cos(ang), sa = Math.sin(ang), inx = D.ext ? -D.nx : D.nx, iny = D.ext ? -D.ny : D.ny;
    const ex = x0 + (ax * ca + inx * sa) * ln, ey = y0 + (ay * ca + iny * sa) * ln;
    const p0 = env.SCR(x0, y0), p1 = env.SCR(ex, ey), H = env.MH(D.ext ? 1.9 : 1.6);
    c.beginPath(); c.moveTo(p0.x, p0.y); c.lineTo(p1.x, p1.y); c.lineTo(p1.x, p1.y - H); c.lineTo(p0.x, p0.y - H); c.closePath();
    c.fillStyle = D.locked ? '#5a3430' : D.steel ? '#59636b' : '#7a5a3a'; c.fill(); c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 1.2; c.stroke();
    c.fillStyle = '#d9c28a'; c.fillRect((p0.x * 0.2 + p1.x * 0.8) - 1, (p0.y * 0.2 + p1.y * 0.8) - H * 0.45, 2, 2);
    for (const d of D.dec || []) { const q = env.SCR(d.x, d.y); c.fillStyle = 'rgba(8,10,12,0.85)'; c.beginPath(); c.arc(q.x, q.y - env.MH(d.h), 1.5, 0, 7); c.fill(); }
  }

  // cut-away shell: inner faces of the two far walls and a contour on all four sides, drawn before the building prism
  function back(b, Hm, env) {
    const c = env.ctx, pts = b.poly.map(q => env.SCR(q.x, q.y)), Hp = env.MH(Hm); let area = 0;
    for (let i = 0; i < 4; i++) { const a = pts[i], d = pts[(i + 1) % 4]; area += a.x * d.y - d.x * a.y; }
    const sg = area > 0 ? 1 : -1;
    for (let i = 0; i < 4; i++) {
      const a = pts[i], d = pts[(i + 1) % 4], nx = sg * (d.y - a.y), ny = -sg * (d.x - a.x), nl = Math.hypot(nx, ny) || 1;
      if (ny / nl > 0.02) continue; // near faces are drawn by the prism itself
      c.fillStyle = '#8a8070'; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(d.x, d.y); c.lineTo(d.x, d.y - Hp); c.lineTo(a.x, a.y - Hp); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(230,220,200,0.55)'; c.lineWidth = 1.5; c.stroke();
    }
    c.strokeStyle = 'rgba(230,220,200,0.6)'; c.lineWidth = 1.5; c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p.x, p.y - Hp) : c.moveTo(p.x, p.y - Hp)); c.closePath(); c.stroke();
  }
  window.WL_HOUSES = { back, facade, onHit, use, drawWall, items, floor };
})();
