// Save migrations/backup/recovery and safe-DOM tests (headless). node tests/save-dom.test.js
const fs = require('fs'), path = require('path');
const H = require('./harness'), SV = require('../modules/save.js'), D = require('../modules/dom.js');
const C = H.load().WL_CONFIG, KEY = C.META.saveKey;
let pass = 0, fail = 0; const log = [];
const ok = (c, m) => { if (c) pass++; else { fail++; log.push('FAIL: ' + m); } console.log((c ? 'ok   ' : 'FAIL ') + m); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const mem = (init) => { const m = new Map(Object.entries(init || {})); return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => m.delete(k) }; };
const v1 = () => ({ v: 1, nodes: { n0: true, n2: true }, node: 'n2', stash: { items: { '9mm': 60, bandage: 3, token: 15 }, weapons: [{ id: 'pistol', att: {} }] }, pick: null, raids: { n: 4, out: 2, died: 1 },
  char: { level: 3, xp: 40, stats: { str: 3, agi: 2, per: 2, end: 2 }, skills: { shoot: 1, scav: 0, med: 0 }, statPts: 1, skillPts: 0 } });

// ---- load / migrate ----
{ const st = mem(); const r = SV.load(st, C, KEY); ok(r.status === 'fresh' && r.save.v === SV.CURRENT && eq(r.save.stash, C.META.startStash), 'no save: fresh start stash'); }
{ const raw = JSON.stringify(v1()), st = mem({ [KEY]: raw }); const r = SV.load(st, C, KEY);
  ok(r.status === 'migrated' && r.save.v === SV.CURRENT, 'v1 save migrates to v' + SV.CURRENT);
  ok(eq(r.save.stash, v1().stash) && r.save.char.level === 3 && r.save.node === 'n2' && r.save.raids.n === 4, 'migration keeps stash, character, node, raid stats');
  ok(st.getItem(KEY + SV.SUFFIX.pre) === raw, 'original v1 text kept in .premigrate');
  ok(r.save.meta.migratedFrom === 1, 'migration noted in meta'); }
{ const j = v1(); delete j.nodes; delete j.node; const r = SV.load(mem({ [KEY]: JSON.stringify(j) }), C, KEY); ok(r.save.nodes.n0 === true && r.save.node === 'n0', 'legacy save without nodes gets n0'); }
{ const j = v1(); j.stash.items['<img src=x onerror=alert(1)>'] = 5; j.stash.items.ghost_item = 9; j.stash.weapons.push({ id: 'no_such_gun', att: {} }); j.stash.weapons[0].att = { scope: 'no_such_att' };
  const raw = JSON.stringify(j), st = mem({ [KEY]: raw }), r = SV.load(st, C, KEY);
  ok(!('ghost_item' in r.save.stash.items) && !Object.keys(r.save.stash.items).some((k) => k.includes('<')) && r.save.stash.weapons.length === 1, 'unknown items/weapons are dropped from the live save');
  ok(r.save.stash.items['9mm'] === 60 && r.notes.some((n) => n.startsWith('dropped:')), 'known items kept, drop is reported');
  ok(st.getItem(KEY + SV.SUFFIX.pre) === raw, 'dropped data stays recoverable in .premigrate'); }
{ const j = v1(); j.stash.items['9mm'] = -5; j.stash.items.bandage = 'NaN'; j.stash.items.water = 2.7; j.char.level = 'x'; j.char.stats.str = 9999; j.raids.n = null;
  const r = SV.load(mem({ [KEY]: JSON.stringify(j) }), C, KEY).save;
  ok(!('9mm' in r.stash.items) && !('bandage' in r.stash.items) && r.stash.items.water === 2 && r.char.level === 1 && r.char.stats.str === C.STATS.max && r.raids.n === 0, 'negative/NaN/huge numbers are clamped'); }
{ const j = v1(); j.pick = { w: [0, 0, 7, -1, 'a'], items: { '9mm': 999, ghost: 3 } }; const r = SV.load(mem({ [KEY]: JSON.stringify(j) }), C, KEY).save;
  ok(eq(r.pick.w, [0]) && r.pick.items['9mm'] === 60 && !('ghost' in r.pick.items), 'raid pick is trimmed to what the stash holds'); }
{ const a = SV.normalize(JSON.parse(JSON.stringify(v1())), C), b = SV.normalize(JSON.parse(JSON.stringify(a)), C); ok(eq(a, b), 'normalize is idempotent'); }

// ---- corrupt / newer / unavailable ----
{ const st = mem({ [KEY]: '{"v":1,"stash":{"items":{"9mm":60' }), r = SV.load(st, C, KEY);
  ok(r.status === 'corrupt' && st.getItem(KEY + SV.SUFFIX.bad) === '{"v":1,"stash":{"items":{"9mm":60', 'truncated JSON: raw copied to .corrupt, fresh game started'); }
{ const good = JSON.stringify(Object.assign(v1(), { v: 2, meta: { rev: 7, savedAt: 1 } })), st = mem({ [KEY]: 'garbage', [KEY + SV.SUFFIX.bak]: good }), r = SV.load(st, C, KEY);
  ok(r.status === 'recovered' && r.save.stash.items['9mm'] === 60 && st.getItem(KEY + SV.SUFFIX.bad) === 'garbage', 'corrupt main + valid backup: stash restored, garbage kept aside'); }
{ const raw = JSON.stringify(Object.assign(v1(), { v: 99 })), st = mem({ [KEY]: raw }), r = SV.load(st, C, KEY), w = SV.persist(st, r.save, KEY, r);
  ok(r.status === 'newer' && r.writable === false && !w.ok && w.error === 'write-disabled' && st.getItem(KEY) === raw, 'save from a newer build: never overwritten'); }
{ const st = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } }; const r = SV.load(st, C, KEY);
  ok(r.status === 'unavailable' && SV.persist(st, r.save, KEY, r).ok === false, 'storage that throws: reported, no crash'); }
ok(SV.load(null, C, KEY).status === 'unavailable', 'no storage object: unavailable');

// ---- persist ----
{ const st = mem(), s = SV.fresh(C); const r1 = SV.persist(st, s, KEY); s.stash.items.token = 99; const r2 = SV.persist(st, s, KEY);
  ok(r1.ok && r2.ok && JSON.parse(st.getItem(KEY)).stash.items.token === 99, 'persist writes and verifies');
  ok(JSON.parse(st.getItem(KEY + SV.SUFFIX.bak)).stash.items.token === 15, 'previous state rotates into .bak');
  ok(JSON.parse(st.getItem(KEY)).meta.rev === 2, 'revision counter increments'); }
{ const st = mem({ [KEY]: 'garbage', [KEY + SV.SUFFIX.bak]: JSON.stringify(SV.fresh(C)) }); SV.persist(st, SV.fresh(C), KEY);
  ok(JSON.parse(st.getItem(KEY + SV.SUFFIX.bak)).v === SV.CURRENT, 'garbage main never overwrites a good .bak'); }
{ const st = mem(); st.setItem = () => { const e = new Error('Quota'); e.name = 'QuotaExceededError'; throw e; }; const r = SV.persist(st, SV.fresh(C), KEY); ok(!r.ok && r.error === 'write-failed', 'quota error is returned to the caller'); }
{ const st = mem(); st.setItem = (k, v) => { if (k === KEY) st.m.set(k, v.slice(0, 20)); else st.m.set(k, v); }; const r = SV.persist(st, SV.fresh(C), KEY); ok(!r.ok && r.error === 'verify-failed', 'silent truncation is detected by read-back'); }

// ---- raid result: the stash must survive death and evacuation ----
const player = () => ({ level: 4, xp: 10, stats: { str: 3, agi: 3, per: 2, end: 2 }, skills: { shoot: 2, scav: 0, med: 0 }, statPts: 0, skillPts: 1,
  inv: [{ id: 'bandage', n: 2 }, { id: C.EXTRACTION.keyItem, n: 1 }, { id: 'token', n: 5 }], weapons: [{ id: 'pistol', mag: 7, att: {} }] });
{ const s = SV.fresh(C); s.stash.items['9mm'] = 100; s.stash.weapons.push({ id: 'pistol', att: {} }); s.pick = { w: [0], items: { '9mm': 12 } }; const before = JSON.parse(JSON.stringify(s.stash));
  SV.applyRaid(s, player(), false, C);
  ok(eq(s.stash, before) && s.raids.died === 1 && s.pick === null && s.char.level === 4, 'death: stash untouched, level/stats kept, pick cleared'); }
{ const s = SV.fresh(C); const before = JSON.parse(JSON.stringify(s.stash)); const b = SV.applyRaid(s, player(), true, C);
  ok(s.stash.items.bandage === before.items.bandage + 2 && s.stash.items.token === before.items.token + 5 && s.stash.weapons.length === before.weapons.length + 1 && s.stash.items['9mm'] === before.items['9mm'] + 7, 'evacuation: loot, weapon and loaded rounds reach the stash');
  ok(!(C.EXTRACTION.keyItem in before.items) || s.stash.items[C.EXTRACTION.keyItem] === before.items[C.EXTRACTION.keyItem], 'extraction key is not carried into the stash'); ok(b.length >= 3 && s.raids.out === 1, 'evacuation: report lines and counter'); }
{ const s = SV.fresh(C), st = mem(); SV.applyRaid(s, player(), true, C); SV.persist(st, s, KEY); const r = SV.load(st, C, KEY);
  ok(r.status === 'ok' && eq(r.save.stash, s.stash), 'save → load round trip keeps the stash exactly'); }
{ const s = SV.fresh(C); for (let i = 0; i < 40; i++) SV.applyRaid(s, player(), i % 3 !== 0, C);
  const b2 = SV.normalize(JSON.parse(JSON.stringify(s)), C); ok(eq(b2.stash, s.stash), '40 mixed raids: stash stays valid under normalisation'); }

// ---- safe DOM ----
const EV = '<img src=x onerror=alert(1)>', AT = '" onmouseover="x';
ok(D.esc(EV) === '&lt;img src=x onerror=alert(1)&gt;' && D.esc(AT).indexOf('"') < 0 && D.esc(null) === '', 'esc handles tags, quotes, null');
{ const f = String(D.html`<b class="${AT}">${EV}</b>`); ok(!/<img/.test(f) && f.startsWith('<b class="') && !/class="[^"]*"[^>]*onmouseover="x/.test(f), 'html`` escapes text and attribute values'); }
{ const f = String(D.html`<ul>${['a', EV].map((x) => D.html`<li>${x}</li>`)}</ul>${D.html`<i>${1 + 1}</i>`}`); ok(f === '<ul><li>a</li><li>&lt;img src=x onerror=alert(1)&gt;</li></ul><i>2</i>', 'nested fragments and arrays pass through once, data stays escaped'); }
{ const f = String(D.html`<p>${'<b>x</b>'}</p>`); ok(f === '<p>&lt;b&gt;x&lt;/b&gt;</p>', 'a plain string containing markup is never trusted'); }
{ const el = {}; D.setHtml(el, EV); ok(el.innerHTML === D.esc(EV), 'setHtml(plain string) shows text, does not parse'); const el2 = {}; D.setHtml(el2, D.html`<b>${EV}</b>`); ok(el2.innerHTML === '<b>&lt;img src=x onerror=alert(1)&gt;</b>', 'setHtml(fragment) writes the escaped fragment'); }
{ // source guard: nothing may assign innerHTML / outerHTML, call insertAdjacentHTML or document.write except modules/dom.js
  const root = H.ROOT, bad = [];
  const walk = (d) => { for (const n of fs.readdirSync(d)) { if (['node_modules', '.git', 'docs', 'tests', 'assets', 'release', 'qa'].includes(n)) continue; const p = path.join(d, n), st = fs.statSync(p); if (st.isDirectory()) walk(p); else if (/\.(js|html)$/.test(n)) scan(p); } };
  const scan = (p) => { const rel = path.relative(root, p).replace(/\\/g, '/'); if (rel === 'modules/dom.js') return; fs.readFileSync(p, 'utf8').split('\n').forEach((ln, i) => { const code = ln.replace(/\/\/.*$/, ''); if (/\.(innerHTML|outerHTML)\s*[+]?=[^=]|insertAdjacentHTML|document\.write\s*\(/.test(code)) bad.push(rel + ':' + (i + 1)); }); };
  walk(root); ok(bad.length === 0, 'no raw innerHTML/outerHTML/insertAdjacentHTML/document.write outside modules/dom.js' + (bad.length ? ' — ' + bad.join(', ') : '')); }
{ const h = fs.readFileSync(path.join(H.ROOT, 'index.html'), 'utf8'); ok(!/https?:\/\/(?!www\.w3\.org)/.test(h.replace(/<!--[\s\S]*?-->/g, '')), 'index.html makes no third-party requests (no http(s) URLs)'); }

console.log(`\n${pass} passed, ${fail} failed`); if (fail) { console.log(log.join('\n')); process.exit(1); }
