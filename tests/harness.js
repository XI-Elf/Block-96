// Headless Block-96 sim harness (node). Usage: const H = require('./harness'); const {s, step} = H.boot({hour:12, home:'novozavodskoy'})
const vm = require('vm'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(process.env.B96_ROOT || path.join(__dirname, '..'));
function load(extra) {
  const win = { addEventListener() {}, location: { search: '' }, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720 };
  win.window = win; win.performance = performance;
  const ctx = vm.createContext(Object.assign(win, { console, Math, Date, JSON, Object, Array, Set, Map, Float32Array, Uint8Array, Uint16Array, Int32Array, Uint32Array, Float64Array, Int16Array, Uint8ClampedArray, ArrayBuffer, document: { getElementById: () => null, createElement: () => ({ getContext: () => null, style: {} }), addEventListener() {} }, localStorage: { getItem() { return null; }, setItem() {} }, setTimeout, clearTimeout }));
  const files = ['config.js', 'modules/dom.js', 'behavior/factions.js', 'modules/vehicles-phys.js', 'world15.js', 'road_network.js', 'modules/bridges-data.js', 'modules/bridges.js', 'nav.js', 'modules/interiors_sim.js', 'sim.js'].concat(extra && extra.pre || [], ['enemies.js', 'player.js', 'modules/vision.js', 'behavior/extras.js'], extra && extra.post || []);
  for (const f of files) { const fp = path.join(ROOT, f); if (!fs.existsSync(fp)) { if (extra && extra.optional) continue; throw new Error('missing ' + f); } try { vm.runInContext(fs.readFileSync(fp, 'utf8'), ctx, { filename: f }); } catch (e) { console.error('LOAD FAIL', f, e.message); throw e; } }
  return ctx;
}
function boot(o) {
  o = o || {}; const w = load(o), S = w.WL_SIM;
  const s = S.newWorld(o.seed || 12345, null, [], o.start || null);
  if (o.hour != null) s.h0 = o.hour;
  if (o.home && w.WL_ENEMIES) w.WL_ENEMIES.setHome(s, o.home);
  S.addPlayer(s, 'p1', 'T', { inv: w.WL_CONFIG.START.inv, weapons: w.WL_CONFIG.START.weapons.map(id => ({ id })) });
  const p = s.players.p1;
  if (o.at) { p.x = o.at.x; p.y = o.at.y; }
  const R = { w, S, s, p, cmd: {} };
  R.step = (sec, cmd) => { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { S.step(s, { p1: cmd || R.cmd }, [], 1 / 60); if (!R.keepEvents) s.events.length = 0; } };
  return R;
}
module.exports = { boot, load, ROOT };
