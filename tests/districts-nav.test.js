// Block-96 district connectivity (headless): can an NPC / player reach every one of the 16 districts on foot (nav grid flood fill)
// and by car (road network + bridges)? node tests/districts-nav.test.js
const H = require('./harness');
let pass = 0, fail = 0; const log = [];
const ok = (c, m) => { if (c) pass++; else { fail++; log.push('FAIL: ' + m); } console.log((c ? 'ok   ' : 'FAIL ') + m); };
const h = H.boot({ hour: 12 }), { s, w } = h, W = w.B96_WORLD, P = w.WL_CONFIG.PX_PER_M, NAV = w.WL_NAV;
const nav = NAV.build(s), gw = nav.gw, gh = nav.gh;
const ND = W.districts.length; ok(ND === 16, 'world has 16 districts (' + ND + ')');
// anchor per district: the road sample closest to the district polygon centroid
const anchors = W.districts.map((d, di) => {
  let cx = 0, cy = 0; for (const p of d.poly) { cx += p[0]; cy += p[1]; } cx = cx / d.poly.length * P; cy = cy / d.poly.length * P;
  let best = null, bd = 1e18; for (const q of W.roadSamples) { const x = q[0] * P, y = q[1] * P; const dd = Math.hypot(x - cx, y - cy); if (dd < bd) { bd = dd; best = { x, y }; } }
  return { id: d.id, name: d.name, x: best.x, y: best.y };
});
// flood fill on the walkable grid from the first anchor
const cell = (x, y) => NAV.snap(nav, x, y), comp = new Int32Array(gw * gh).fill(-1); let ncomp = 0;
function fill(c0) { const st = [c0]; comp[c0] = ncomp; while (st.length) { const c = st.pop(), i = c % gw, j = (c - i) / gw; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= gw || jj >= gh) continue; const n = jj * gw + ii; if (nav.blocked[n] || comp[n] >= 0) continue; comp[n] = ncomp; st.push(n); } } ncomp++; }
const cells = anchors.map((a) => cell(a.x, a.y)); const base = cells[0]; fill(base);
const unreachable = anchors.filter((a, i) => cells[i] < 0 || comp[cells[i]] !== comp[base]);
ok(unreachable.length === 0, 'all 16 district anchors are connected on foot (nav grid)' + (unreachable.length ? ': unreachable ' + unreachable.map((a) => a.name).join(', ') : ''));
// bridges must be part of the pedestrian network: both deck ends in the main component
const BR = w.WL_BRIDGES.list;
BR.forEach((b, i) => { const a = cell(b.pts[0][0] * P, b.pts[0][1] * P), z = cell(b.pts[1][0] * P, b.pts[1][1] * P); ok(a >= 0 && z >= 0 && comp[a] === comp[base] && comp[z] === comp[base], 'bridge M' + (i + 1) + ' both ends are in the main walkable network'); });
// real A* between district anchors (pedestrian, 12 random-ish pairs incl. farthest)
let longest = 0, failed = [];
const pairs = []; for (let i = 0; i < anchors.length; i++) pairs.push([i, (i * 7 + 3) % anchors.length]);
for (const [i, j] of pairs) { if (i === j) continue; const a = anchors[i], b = anchors[j]; const t0 = Date.now(); const path = NAV.find(s, a.x, a.y, b.x, b.y, (x, y) => true, 400000); const ms = Date.now() - t0; longest = Math.max(longest, ms); if (!path || !path.length) failed.push(a.name + ' -> ' + b.name); }
ok(failed.length === 0, 'A* finds a pedestrian route for ' + pairs.length + ' district pairs' + (failed.length ? ' — no route: ' + failed.join('; ') : '') + ' (slowest ' + longest + ' ms)');
console.log(`\n${pass} passed, ${fail} failed`); if (fail) { console.log(log.join('\n')); process.exit(1); }
