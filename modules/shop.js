// Block-96: торговец в убежище. Покупка/продажа за жетоны метро, работает прямо по save.stash (склад убежища).
// Чистая логика (buy/sell/…) без DOM и без случайности; UI — mount()/open() ниже. Все цены — стартовые догадки для теста.
(function () {
  'use strict';
  const { html: hx, setHtml } = window.WL_DOM;
  const CUR = 'token';          // id предмета-валюты (ITEMS.token, см. NOTE.md: сейчас его нет в config.js)
  const SELL_RATIO = 0.35;      // как в hub/economy.json: разрыв покупка/продажа ≈ 2,9×, чтобы нельзя было крутить прибыль
  // Покупка: id, pack — сколько штук за одну покупку (патроны пачкой), price — жетонов за пачку.
  const BUY = [
    { id: '9mm', pack: 12, price: 3 }, { id: '12g', pack: 6, price: 4 }, { id: '762', pack: 10, price: 6 },
    { id: 'bandage', pack: 1, price: 3 }, { id: 'medkit', pack: 1, price: 12 },
    { id: 'food', pack: 1, price: 3 }, { id: 'water', pack: 1, price: 3 },
    { id: 'silencer', pack: 1, price: 25 }, { id: 'grip', pack: 1, price: 18 }, { id: 'scope', pack: 1, price: 30 },
  ];
  const BUYW = [{ id: 'pistol', price: 25 }, { id: 'shotgun', price: 90 }, { id: 'rifle', price: 160 }];
  // Продажа: цена за ОДНУ единицу в «ценности» (value); итог = floor(value * n * SELL_RATIO) не меньше 1 за любую продажу.
  // Для остального берётся BUY (price / pack), для материалов — таблица ниже.
  const MAT = { scrap: 2, wires: 5, cell: 12 };
  const NOT_SOLD = new Set([CUR, 'gate_key']);

  const buyRow = (id) => BUY.find((r) => r.id === id);
  const value = (id) => { const r = buyRow(id); return r ? r.price / r.pack : MAT[id] || 0; };
  const wvalue = (id) => (BUYW.find((r) => r.id === id) || {}).price || 0;
  const have = (save, id) => (save.stash.items[id] || 0);
  const purse = (save) => have(save, CUR);
  const sellPrice = (id, n) => (NOT_SOLD.has(id) || !value(id)) ? 0 : Math.max(1, Math.floor(value(id) * n * SELL_RATIO));
  const sellWPrice = (w) => { let v = wvalue(w.id) * SELL_RATIO; return Math.max(1, Math.floor(v)); };

  function buy(save, id) {
    const r = buyRow(id); if (!r) return { ok: false, msg: 'Такого нет в продаже' };
    if (purse(save) < r.price) return { ok: false, msg: `Не хватает жетонов: нужно ${r.price}` };
    save.stash.items[CUR] -= r.price; save.stash.items[id] = have(save, id) + r.pack;
    return { ok: true, msg: `Куплено: ${r.pack > 1 ? r.pack + ' × ' : ''}${id} за ${r.price}` , spent: r.price };
  }
  function buyWeapon(save, id) {
    const r = BUYW.find((q) => q.id === id); if (!r) return { ok: false, msg: 'Такого нет в продаже' };
    if (purse(save) < r.price) return { ok: false, msg: `Не хватает жетонов: нужно ${r.price}` };
    save.stash.items[CUR] -= r.price; save.stash.weapons.push({ id, att: {} });
    return { ok: true, msg: `Куплено оружие за ${r.price}`, spent: r.price };
  }
  // n — сколько продаём (пачкой: для патронов шаг = pack)
  function sell(save, id, n) {
    const step = (buyRow(id) || { pack: 1 }).pack; n = Math.min(n == null ? step : n, have(save, id));
    if (n <= 0) return { ok: false, msg: 'Нечего продавать' };
    const gain = sellPrice(id, n); if (!gain) return { ok: false, msg: 'Это торговец не берёт' };
    save.stash.items[id] = have(save, id) - n; save.stash.items[CUR] = purse(save) + gain;
    return { ok: true, msg: `Продано ${n} шт. за ${gain}`, gain, n };
  }
  // Оружие: навесное возвращается на склад отдельными предметами. Последний ствол продать нельзя (иначе в рейд не с чем идти).
  function sellWeapon(save, i) {
    const w = save.stash.weapons[i]; if (!w) return { ok: false, msg: 'Нет такого оружия' };
    if (save.stash.weapons.length < 2) return { ok: false, msg: 'Последний ствол не продаётся' };
    const gain = sellWPrice(w); save.stash.weapons.splice(i, 1);
    for (const k in (w.att || {})) save.stash.items[w.att[k]] = have(save, w.att[k]) + 1;
    save.stash.items[CUR] = purse(save) + gain;
    if (save.pick) { save.pick.w = save.pick.w.filter((x) => x !== i).map((x) => (x > i ? x - 1 : x)); }
    return { ok: true, msg: `Оружие продано за ${gain}`, gain };
  }

  // ---------------- UI ----------------
  let el = null, hooks = null;
  const NAME = (id) => ((hooks && hooks.C && hooks.C.ITEMS[id]) || { name: id }).name;
  function html(save) {
    const t = purse(save);
    const brows = BUY.map((r) => hx`<tr><td>${NAME(r.id)}${r.pack > 1 ? hx`<small>пачка ${r.pack}</small>` : ''}</td><td class="num">${have(save, r.id)}</td><td class="num">${r.price}</td><td class="act"><button class="ghost" data-sh="buy" data-id="${r.id}" ${t < r.price ? 'disabled' : ''}>Купить</button></td></tr>`);
    const bwrows = BUYW.map((r) => hx`<tr><td>${(hooks && hooks.C && hooks.C.WEAPONS && hooks.C.WEAPONS[r.id] || { name: r.id }).name}</td><td class="num"></td><td class="num">${r.price}</td><td class="act"><button class="ghost" data-sh="buyw" data-id="${r.id}" ${t < r.price ? 'disabled' : ''}>Купить</button></td></tr>`);
    const sids = Object.keys(save.stash.items).filter((id) => have(save, id) > 0 && sellPrice(id, 1) > 0);
    const srows = sids.map((id) => { const st = (buyRow(id) || { pack: 1 }).pack, n = Math.min(st, have(save, id)); return hx`<tr><td>${NAME(id)}</td><td class="num">${have(save, id)}</td><td class="num">${sellPrice(id, n)}${n > 1 ? hx`<small>за ${n}</small>` : ''}</td><td class="act"><button class="ghost" data-sh="sell" data-id="${id}">Продать ${n > 1 ? n : ''}</button> <button class="ghost" data-sh="sellall" data-id="${id}">Все</button></td></tr>`; });
    const swrows = save.stash.weapons.map((w, i) => hx`<tr><td>${(hooks && hooks.C && hooks.C.WEAPONS && hooks.C.WEAPONS[w.id] || { name: w.id }).name}</td><td class="num"></td><td class="num">${sellWPrice(w)}</td><td class="act"><button class="ghost" data-sh="sellw" data-i="${i}" ${save.stash.weapons.length < 2 ? hx`disabled title="Последний ствол не продаётся"` : ''}>Продать</button></td></tr>`);
    return hx`<h2>Торговец <small>Esc — закрыть</small></h2>
      <p class="muted">Жетоны метро: <b style="color:var(--amber)" id="shopTok">${t}</b>. Берёт лишнее за треть цены. Жетоны и всё на складе остаются твоими, даже если погибнешь в рейде: пропадает только то, что было при тебе.</p>
      <h3>Купить <span>цена · жетонов</span></h3><table><thead><tr><th>Товар</th><th class="num">Склад</th><th class="num">Цена</th><th></th></tr></thead><tbody>${brows}${bwrows}</tbody></table>
      <h3>Продать <span>со склада</span></h3><table><tbody>${srows.length ? srows : hx`<tr><td class="muted">Нечего продавать.</td></tr>`}${swrows}</tbody></table>`;
  }
  function render() { if (el && hooks) { const sc = el.scrollTop; setHtml(el, html(hooks.save())); el.scrollTop = sc; } }
  function act(b) {
    const save = hooks.save(), d = b.dataset; let r;
    if (d.sh === 'buy') r = buy(save, d.id); else if (d.sh === 'buyw') r = buyWeapon(save, d.id);
    else if (d.sh === 'sell') r = sell(save, d.id); else if (d.sh === 'sellall') r = sell(save, d.id, have(save, d.id));
    else if (d.sh === 'sellw') r = sellWeapon(save, +d.i);
    if (!r) return; if (r.ok && hooks.persist) hooks.persist(); if (hooks.toast) hooks.toast(r.msg, !r.ok); render();
  }
  // hooks: { save: () => save, persist, toast(text, hot), C, onClose }
  function mount(h) {
    hooks = h; if (el) return;
    const st = document.createElement('style'); st.textContent = '#shop th.num{text-align:right}#shop td.act{text-align:right;white-space:nowrap}#shop button:disabled{opacity:.4;cursor:default}'; document.head.appendChild(st);
    el = document.createElement('section'); el.className = 'panel'; el.id = 'shop'; el.hidden = true; document.body.appendChild(el);
    el.addEventListener('click', (e) => { const b = e.target.closest('button[data-sh]'); if (b && !b.disabled) act(b); });
    document.addEventListener('keydown', (e) => { if (!el.hidden && (e.code === 'Escape' || e.code === 'KeyE')) { e.preventDefault(); e.stopPropagation(); close(); } }, true);
  }
  function open() { if (!el) return; render(); el.hidden = false; }
  function close() { if (!el || el.hidden) return; el.hidden = true; if (hooks && hooks.onClose) hooks.onClose(); }
  window.WL_SHOP = { CUR, BUY, BUYW, SELL_RATIO, sellPrice, sellWPrice, buy, buyWeapon, sell, sellWeapon, purse, mount, open, close, isOpen: () => !!el && !el.hidden };
})();
