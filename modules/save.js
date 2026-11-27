/* Block-96 save layer: versioned format, step-by-step migrations, normalisation, backup and recovery.
 * Pure logic (storage and config are injected), so it runs both in the browser and in Node tests.
 * Rules: (1) the stash is never dropped on a read problem; (2) an unreadable or newer-format save is never overwritten
 * without first being copied aside; (3) every storage failure is reported to the caller instead of being swallowed. */
(function (root) {
  'use strict';
  const CURRENT = 2; // v1: original format; v2: adds meta {rev, savedAt, migratedFrom}
  const SUFFIX = { bak: '.bak', bad: '.corrupt', pre: '.premigrate' };

  const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
  const num = (n, d, lo, hi) => { n = Number(n); if (!Number.isFinite(n)) n = d; if (lo != null && n < lo) n = lo; if (hi != null && n > hi) n = hi; return n; };
  const int = (n, d, lo, hi) => Math.floor(num(n, d, lo, hi));
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function fresh(C) {
    return { v: CURRENT, nodes: { n0: true }, node: 'n0', stash: clone(C.META.startStash), pick: null, raids: { n: 0, out: 0, died: 0 },
      char: { level: 1, xp: 0, stats: { str: C.STATS.base, agi: C.STATS.base, per: C.STATS.base, end: C.STATS.base }, skills: { shoot: 0, scav: 0, med: 0 }, statPts: 0, skillPts: 0 },
      meta: { rev: 0, savedAt: 0 } };
  }

  // ---- миграции: ключ N переводит формат vN в v(N+1); каждая работает на копии и не теряет данные ----
  const MIGRATIONS = {
    1: (j) => { j.meta = { rev: 0, savedAt: 0, migratedFrom: 1 }; return j; },
  };

  // Приводит объект к рабочему виду. Неизвестные предметы убираются (иначе UI падает на C.ITEMS[id].name), но попадают в report.dropped.
  function normalize(j, C, report) {
    report = report || { dropped: [], fixed: [] };
    const f = fresh(C), out = { v: CURRENT };
    out.nodes = isObj(j.nodes) ? Object.fromEntries(Object.keys(j.nodes).filter((k) => j.nodes[k]).map((k) => [k, true])) : { n0: true };
    if (!out.nodes.n0) out.nodes.n0 = true;
    out.node = typeof j.node === 'string' && out.nodes[j.node] ? j.node : 'n0';
    const st = isObj(j.stash) ? j.stash : {}, items = {}, weapons = [];
    const src = isObj(st.items) ? st.items : {};
    for (const id of Object.keys(src)) {
      if (!C.ITEMS[id]) { report.dropped.push('item:' + id); continue; }
      const n = int(src[id], 0, 0, 1e9); if (n > 0) items[id] = n;
    }
    for (const w of Array.isArray(st.weapons) ? st.weapons : []) {
      if (!isObj(w) || !C.WEAPONS[w.id]) { report.dropped.push('weapon:' + (w && w.id)); continue; }
      const att = {}; if (isObj(w.att)) for (const k of Object.keys(w.att)) { if (typeof w.att[k] === 'string' && C.ITEMS[w.att[k]]) att[k] = w.att[k]; else report.dropped.push('att:' + k); }
      weapons.push({ id: w.id, att });
    }
    out.stash = { items, weapons };
    const r = isObj(j.raids) ? j.raids : {};
    out.raids = { n: int(r.n, 0, 0), out: int(r.out, 0, 0), died: int(r.died, 0, 0) };
    const c = isObj(j.char) ? j.char : {}, sk = isObj(c.skills) ? c.skills : {}, ss = isObj(c.stats) ? c.stats : {};
    out.char = { level: int(c.level, 1, 1), xp: int(c.xp, 0, 0), stats: {}, skills: {}, statPts: int(c.statPts, 0, 0), skillPts: int(c.skillPts, 0, 0) };
    for (const k of Object.keys(f.char.stats)) out.char.stats[k] = int(ss[k], C.STATS.base, 1, C.STATS.max);
    for (const k of Object.keys(f.char.skills)) out.char.skills[k] = int(sk[k], 0, 0, C.SKILLS.max);
    // выбор снаряжения: индексы оружия в пределах склада, предметы не больше запаса
    const pk = isObj(j.pick) ? j.pick : null;
    if (pk) {
      const pw = (Array.isArray(pk.w) ? pk.w : []).map(Number).filter((i, ix, a) => Number.isInteger(i) && i >= 0 && i < weapons.length && a.indexOf(i) === ix).slice(0, 3), pi = {};
      if (isObj(pk.items)) for (const id of Object.keys(pk.items)) if (items[id]) { const n = int(pk.items[id], 0, 0, items[id]); if (n > 0) pi[id] = n; }
      out.pick = { w: pw, items: pi };
    } else out.pick = null;
    const m = isObj(j.meta) ? j.meta : {};
    out.meta = { rev: int(m.rev, 0, 0), savedAt: num(m.savedAt, 0, 0) };
    if (m.migratedFrom != null) out.meta.migratedFrom = int(m.migratedFrom, 1, 0);
    return out;
  }

  // Разбор сырой строки → { ok, save, report } либо { ok:false, reason }
  function parse(raw, C) {
    let j; try { j = JSON.parse(raw); } catch (e) { return { ok: false, reason: 'parse' }; }
    if (!isObj(j)) return { ok: false, reason: 'shape' };
    let v = j.v; if (!Number.isInteger(v) || v < 1) return { ok: false, reason: 'version' };
    if (v > CURRENT) return { ok: false, reason: 'newer', version: v };
    const report = { dropped: [], fixed: [], from: v }; j = clone(j);
    while (v < CURRENT) { if (!MIGRATIONS[v]) return { ok: false, reason: 'no-migration', version: v }; j = MIGRATIONS[v](j); v++; j.v = v; }
    return { ok: true, save: normalize(j, C, report), report };
  }

  function safeGet(st, k) { try { return st.getItem(k); } catch (e) { return undefined; } } // undefined = хранилище недоступно
  function safeSet(st, k, v) { try { st.setItem(k, v); return true; } catch (e) { return false; } }

  /* load(storage, C, key) → { save, status, notes[], writable }
   * status: fresh | ok | migrated | recovered (из резервной копии) | corrupt (нечитаемо, исходник сохранён) | newer (формат новее — запись отключена) | unavailable */
  function load(st, C, key) {
    const notes = [];
    if (!st) return { save: fresh(C), status: 'unavailable', notes: ['storage-unavailable'], writable: false };
    const raw = safeGet(st, key);
    if (raw === undefined) return { save: fresh(C), status: 'unavailable', notes: ['storage-unavailable'], writable: false };
    if (raw == null) return { save: fresh(C), status: 'fresh', notes, writable: true };
    const r = parse(raw, C);
    if (r.ok) {
      const migrated = r.report.from < CURRENT;
      if (migrated && !safeSet(st, key + SUFFIX.pre, raw)) notes.push('premigrate-copy-failed');
      if (r.report.dropped.length) { notes.push('dropped:' + r.report.dropped.join(',')); safeSet(st, key + SUFFIX.pre, raw); }
      return { save: r.save, status: migrated ? 'migrated' : 'ok', notes, writable: true, report: r.report };
    }
    if (r.reason === 'newer') return { save: fresh(C), status: 'newer', notes: ['newer-version:' + r.version], writable: false }; // не трогаем: старый клиент не должен портить новый формат
    // нечитаемо: сохранить исходник отдельно, пробуем резервную копию
    const copied = safeSet(st, key + SUFFIX.bad, raw); notes.push('unreadable:' + r.reason + (copied ? '' : ':copy-failed'));
    const bak = safeGet(st, key + SUFFIX.bak);
    if (bak) { const b = parse(bak, C); if (b.ok) { notes.push('restored-from-backup'); return { save: b.save, status: 'recovered', notes, writable: true }; } }
    return { save: fresh(C), status: 'corrupt', notes, writable: true };
  }

  /* persist(storage, save, key, state) → { ok, error }. Перед записью предыдущая валидная версия уходит в .bak;
   * после записи читаем обратно и сравниваем. state.writable === false — запись отключена (формат новее). */
  function persist(st, save, key, state) {
    if (!st) return { ok: false, error: 'storage-unavailable' };
    if (state && state.writable === false) return { ok: false, error: 'write-disabled' };
    let prev; try { prev = st.getItem(key); } catch (e) { return { ok: false, error: 'read-failed' }; }
    save.v = CURRENT; save.meta = Object.assign({}, save.meta, { rev: ((save.meta && save.meta.rev) | 0) + 1, savedAt: Date.now() });
    const body = JSON.stringify(save);
    if (prev && prev !== body) { try { if (JSON.parse(prev) && Number.isInteger(JSON.parse(prev).v)) safeSet(st, key + SUFFIX.bak, prev); } catch (e) { /* битое не затирает резерв */ } }
    if (!safeSet(st, key, body)) return { ok: false, error: 'write-failed' };
    if (safeGet(st, key) !== body) return { ok: false, error: 'verify-failed' };
    return { ok: true };
  }

  // Перенос добычи после рейда (вынесено из game.js без изменения правил). Склад не уменьшается ни при смерти, ни при эвакуации.
  function applyRaid(save, p, success, C) {
    const brought = [];
    save.char = { level: p.level, xp: p.xp, stats: clone(p.stats), skills: clone(p.skills), statPts: p.statPts, skillPts: p.skillPts };
    if (success) {
      save.raids.out++;
      const add = (id, n) => { if (id === C.EXTRACTION.keyItem || n <= 0) return; save.stash.items[id] = (save.stash.items[id] || 0) + n; brought.push(`${C.ITEMS[id].name} × ${n}`); };
      for (const it of p.inv) add(it.id, it.n);
      for (const w of p.weapons) { save.stash.weapons.push({ id: w.id, att: clone(w.att || {}) }); brought.push(C.WEAPONS[w.id].name + (Object.keys(w.att || {}).length ? ' (с навесным)' : '')); add(C.WEAPONS[w.id].ammo, w.mag); }
    } else { save.raids.died++; save.pick = null; }
    return brought;
  }

  const API = { CURRENT, SUFFIX, fresh, normalize, parse, load, persist, applyRaid, MIGRATIONS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.WL_SAVE = API;
})(typeof window !== 'undefined' ? window : globalThis);
