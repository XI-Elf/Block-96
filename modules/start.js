// Block-96: стартовый экран. Интро-текст, v61: выбор банды перед рейдом (район, внешний вид, экипировка, свои/чужие), старт в 00:00.
// Модуль самостоятельный: UI не зависит от game.js, sim-часть (friendly/provoke) без DOM и без Math.random.
// Подключать ПОСЛЕ world15.js (нужны полигоны районов), ДО game.js.
(function () {
  'use strict';
  const { html: hx, setHtml, h: el_ } = window.WL_DOM;
  const KEY = 'b96.home';
  const DEFAULT_ID = 'pavlov_yar';

  // Короткая фраза в шапке старта. Название города намеренно НЕ упоминается.
  const INTRO = {
    tag: '2003. Семь лет после катастрофы город поделили банды, и перемирий здесь не бывает.',
    sub: 'На своей улице тебя знают. За углом — уже нет. Бери, что плохо лежит, и возвращайся живым.',
  };

  // Описания — из состава застройки в world15.js (число домов/панелек/промзданий по полигону района), не из лора.
  // line = одна строка в списке; соседние районы для старта выбираются игроком, а не сюжетом.
  const DISTRICTS = [
    { n: 1,  id: 'saltov_bor',          line: 'Частный сектор и пара десятков панелек на северо-западе.' },
    { n: 2,  id: 'aviastroika',         line: 'Склады и заводские цеха среди частных домов. Север, далеко от центра.' },
    { n: 3,  id: 'traktornaya_sloboda', line: 'Корпуса, склады, гаражи. Мало жилья, много стен для засад.' },
    { n: 4,  id: 'pavlov_yar',          line: 'Частный сектор рядом с блокпостом. Самый простой старт.' },
    { n: 5,  id: 'derbyshevka',         line: 'Плотный частный сектор и гаражные ряды в центре города.' },
    { n: 6,  id: 'kompressorny',        line: 'Небольшой промрайон. Цеха, склады, гаражи; домов мало.' },
    { n: 7,  id: 'muromsky_posad',      line: 'Тихий частный сектор, почти без высоток.' },
    { n: 8,  id: 'kazanskaya_sloboda',  line: 'Частный сектор с панельными блоками и гаражами.' },
    { n: 9,  id: 'nagorny',             line: 'Панельки, склады и заводы вперемешку: тесно и опасно.' },
    { n: 10, id: 'levoberezhe',         line: 'Огромный район частных домов на левом берегу.' },
    { n: 11, id: 'holodnaya_gora',      line: 'Частный сектор на западной окраине, склады у края.' },
    { n: 12, id: 'zarechnaya_balka',    line: 'Самый застроенный район: больше трёхсот домов и сараев.' },
    { n: 13, id: 'pokrovskie_dvory',    line: 'Дворы, панельки и склады среди частных домов.' },
    { n: 14, id: 'novozavodskoy',       line: 'Заводы и склады, жилья мало. Юго-запад.' },
    { n: 15, id: 'rechnoy_port',        line: 'Порт: склады, цеха и гаражи у воды. Юго-восток.' },
    { n: 16, id: 'sormovka',            line: 'Жилые кварталы за рекой на севере, между Салтовым Бором и Авиастройкой.' },
  ];
  const NAMES = {}; // заполняется из B96_WORLD.districts, если он есть, иначе из запасного списка
  const FALLBACK = ['Салтов Бор', 'Авиастройка', 'Тракторная Слобода', 'Павлов Яр', 'Дербышевка', 'Компрессорный', 'Муромский Посад', 'Казанская Слобода', 'Нагорный', 'Левобережье', 'Холодная Гора', 'Заречная Балка', 'Покровские Дворы', 'Новозаводской', 'Речной Порт', 'Сормовка'];
  DISTRICTS.forEach((d, i) => { d.name = FALLBACK[i]; NAMES[d.id] = d.name; });

  const byId = (id) => DISTRICTS.find((d) => d.id === id);
  function load() { try { const v = localStorage.getItem(KEY); return byId(v) ? v : DEFAULT_ID; } catch (e) { return DEFAULT_ID; } }
  let chosen = load();
  const GKEY = 'b96.gender';
  let gender = 'male'; try { const g = localStorage.getItem(GKEY); if (g === 'female' || g === 'male') gender = g; } catch (e) { /* приватный режим */ }
  function setGender(g) { gender = g === 'female' ? 'female' : 'male'; try { localStorage.setItem(GKEY, gender); } catch (e) { /* приватный режим */ } }
  const listeners = [];
  function setChosen(id) {
    if (!byId(id)) return; chosen = id;
    try { localStorage.setItem(KEY, id); } catch (e) { /* приватный режим */ }
    listeners.forEach((f) => f(id));
  }

  // ---------------- sim-часть: свои и чужие ----------------
  // s.homeZone = id района старта (его ставит sim.newWorld). Отряд «домашний», если sq.zone (или sq.dz, район создания
  // для отрядов без зоны) равен s.homeZone. Собаки враждебны всегда. Первый выстрел по члену отряда делает весь отряд врагом.
  function squadOf(s, e) { return s.sq && s.sq[e.sq]; }
  function friendly(s, e) {
    if (!s || !(s.homeDistrict || s.homeZone) || !e || e.type === 'dog') return false;
    const q = squadOf(s, e); if (!q || q.angry) return false;
    return (q.zone || q.dz) === s.homeZone;
  }
  function provoke(s, e) { const q = squadOf(s, e); if (q && !q.angry) { q.angry = true; return true; } return false; }

  // ---------------- v61: банды ----------------
  // Район, внешний вид (стиль в modules/characters.js STYLES: g_<id>), экипировка. Оружие игрока в движке бывает трёх типов (pistol / shotgun / rifle),
  // поэтому «ТТ», «обрез», «Сайга» — это pistol/shotgun/rifle с подписью банды. Вражда: enemies.js stanceOf по s.playerFac.
  const START_HOUR = 0;                       // рейд стартует в полночь: все банды в активной фазе
  const UNCLAIMED = ['pavlov_yar', 'aviastroika', 'derbyshevka', 'muromsky_posad', 'zarechnaya_balka', 'pokrovskie_dvory', 'sormovka'];
  const GANGS = [
    { id: 'holodnogorskie', name: 'Холодногорские', dist: 'holodnaya_gora', mate: null,
      look: 'олимпийка с полосками, анорак поверх жилета, красная повязка', gear: 'ТТ, обрез, 30 патронов 9 мм, 8 патронов 12 к.',
      kit: { weapons: [{ id: 'pistol' }, { id: 'shotgun' }], inv: [['9mm', 42], ['12g', 8], ['bandage', 2]] } },
    { id: 'vyshka', name: 'Вышка', dist: 'saltov_bor', mate: null,
      look: 'тёмная стёганка, монтажный пояс, шапка-маска, красная лампа', gear: 'охотничья винтовка с оптикой и глушителем, 20 патронов',
      kit: { weapons: [{ id: 'rifle', att: { optic: 'scope', muzzle: 'silencer' } }], inv: [['762', 25], ['bandage', 2]] } },
    { id: 'brigada', name: 'Бригада', dist: 'traktornaya_sloboda', mate: 'kooperativ',
      look: 'промасленный бушлат, шахтёрская каска, стальные листы', gear: 'тяжёлый самопал (обрез 12 к.), 16 патронов',
      kit: { weapons: [{ id: 'shotgun' }], inv: [['12g', 16], ['bandage', 2], ['scrap', 2]] } },
    { id: 'kooperativ', name: 'Кооператив', dist: 'traktornaya_sloboda', mate: 'brigada',
      look: 'косуха, потёртый пуховик, мотошлем', gear: 'переточенный пистолет, 48 патронов 9 мм',
      kit: { weapons: [{ id: 'pistol', att: { grip: 'grip' } }], inv: [['9mm', 60], ['bandage', 1], ['wires', 2]] } },
    { id: 'kazanskie', name: 'Казанские', dist: 'kazanskaya_sloboda', mate: 'sobor',
      look: 'длинный чёрный кожаный плащ, формовка, трофейный жилет', gear: 'ТТ, обрез, 24 патрона 9 мм, 8 патронов 12 к.',
      kit: { weapons: [{ id: 'pistol' }, { id: 'shotgun' }], inv: [['9mm', 36], ['12g', 8], ['bandage', 2]] } },
    { id: 'sobor', name: 'Собор', dist: 'kazanskaya_sloboda', mate: 'kazanskie',
      look: 'чёрный прорезиненный плащ, капюшон, медная канитель', gear: 'двустволка, 14 патронов 12 к., аптечка',
      kit: { weapons: [{ id: 'shotgun' }], inv: [['12g', 14], ['medkit', 1], ['bandage', 1]] } },
    { id: 'sektor', name: 'Сектор', dist: 'levoberezhe', mate: 'cherdak',
      look: 'короткий бомбер, камуфляжные штаны, белые шнурки, белая нашивка', gear: 'обрез «Сайги», переделанный газовый пистолет',
      kit: { weapons: [{ id: 'shotgun' }, { id: 'pistol' }], inv: [['12g', 12], ['9mm', 24], ['bandage', 1]] } },
    { id: 'cherdak', name: 'Чердак', dist: 'levoberezhe', mate: 'sektor',
      look: 'чёрная толстовка с капюшоном, шапка-маска, хоккейные щитки', gear: 'пистолет, 48 патронов 9 мм, бинты',
      kit: { weapons: [{ id: 'pistol', att: { grip: 'grip' } }], inv: [['9mm', 60], ['bandage', 2]] } },
    { id: 'none', name: 'Без банды', dist: null, mate: null,
      look: 'потёртая куртка, кепка, ничего лишнего', gear: 'один пистолет и 12 патронов',
      kit: { weapons: [{ id: 'pistol' }], inv: [['9mm', 24]] } },
  ];
  const gangById = (id) => GANGS.find((g) => g.id === id) || GANGS[GANGS.length - 1];
  const GKEY2 = 'b96.gang';
  let gang = 'none'; try { const v = localStorage.getItem(GKEY2); if (GANGS.some((g) => g.id === v)) gang = v; } catch (e) { /* приватный режим */ }
  function setGang(id) { gang = gangById(id).id; try { localStorage.setItem(GKEY2, gang); } catch (e) { /* приватный режим */ } listeners.forEach((f) => f(gang)); }
  const distName = (id) => (byId(id) || {}).name || id;
  // Что решает выбор: { fac, district, kit, hour }. seed нужен только для «Без банды» (случайный незахваченный район).
  function resolve(seed, id) {
    const g = gangById(id || gang), district = g.dist || UNCLAIMED[Math.abs(seed | 0) % UNCLAIMED.length];
    return { fac: g.id, district, kit: g.kit, hour: START_HOUR, gang: g };
  }

  // ---------------- UI ----------------
  const CSS = `
  .gp{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:14px;margin:12px 0 6px}
  .gp-list{max-height:230px;overflow:auto;border:1px solid var(--line);background:rgba(8,6,14,.5)}
  .gp-row{display:block;width:100%;text-align:left;background:none;border:0;border-bottom:1px solid rgba(43,36,66,.6);color:var(--dim);padding:7px 10px;font:inherit;font-size:13px;cursor:pointer}
  .gp-row b{color:var(--ink);font-weight:600;letter-spacing:.04em}.gp-row small{display:block;color:var(--dim);font-size:11px}
  .gp-row:hover,.gp-row:focus-visible{background:rgba(61,242,255,.07);outline:none}
  .gp-row.on{border-left:3px solid var(--cyan);background:rgba(61,242,255,.12);color:var(--ink)}
  .gp-info{font-size:13px;color:var(--dim);line-height:1.45;border:1px solid var(--line);background:rgba(8,6,14,.5);padding:10px 12px;max-height:300px;overflow:auto}
  .gp-info b{color:var(--cyan);letter-spacing:.06em}.gp-info em{font-style:normal;color:var(--amber)}.gp-info u{text-decoration:none;color:var(--ink)}
  .gp-map{position:relative;border:1px solid var(--line);background:rgba(8,6,14,.7);aspect-ratio:3/2;margin-top:8px}
  .gp-map canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
  .hg{display:flex;gap:8px;align-items:center;margin:10px 0 0}
  .hg-b{background:rgba(8,6,14,.7);border:1px solid var(--line);color:var(--dim);padding:6px 14px;font:inherit;font-size:13px;cursor:pointer}
  .hg-b.on{border-color:var(--cyan);color:var(--ink);background:rgba(61,242,255,.12)}
  .homeh{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--cyan);margin:16px 0 0}
  @media (max-width:620px){.gp{grid-template-columns:1fr}}`;

  // el — контейнер. opts.onChange(id). Возвращает { refresh, destroy }.
  function mountGang(el, opts) {
    opts = opts || {};
    if (!document.getElementById('gp-css')) { const st = document.createElement('style'); st.id = 'gp-css'; st.textContent = CSS; document.head.appendChild(st); }
    const W = window.B96_WORLD, polys = {};
    if (W && W.districts) for (const z of W.districts) { polys[z.id] = z.poly; if (byId(z.id)) byId(z.id).name = z.name; }
    el.replaceChildren(el_('div', { class: 'hg' }, el_('span', { class: 'homeh', style: { margin: '0' } }, 'Персонаж'), el_('button', { type: 'button', class: 'hg-b', 'data-g': 'male' }, 'Мужчина'), el_('button', { type: 'button', class: 'hg-b', 'data-g': 'female' }, 'Женщина')),
      el_('div', { class: 'gp' }, el_('div', { class: 'gp-list', role: 'listbox', 'aria-label': 'Банда' }), el_('div', null, el_('div', { class: 'gp-info', 'aria-live': 'polite' }, ), el_('div', { class: 'gp-map' }, el_('canvas', { 'aria-label': 'Район появления' })))));
    const gbs = [...el.querySelectorAll('.hg-b')], syncG = () => gbs.forEach((b) => b.classList.toggle('on', b.dataset.g === gender));
    gbs.forEach((b) => b.addEventListener('click', () => { setGender(b.dataset.g); syncG(); })); syncG();
    const list = el.querySelector('.gp-list'), info = el.querySelector('.gp-info'), cv = el.querySelector('canvas');
    list.replaceChildren(...GANGS.map((g) => el_('button', { type: 'button', class: 'gp-row', role: 'option', 'data-id': g.id }, el_('b', null, g.name), el_('small', null, g.dist ? distName(g.dist) : 'случайный незахваченный район'))));
    const rows = [...list.children];
    function draw() {
      const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1, w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      const ctx = cv.getContext('2d'); if (!ctx) return; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, h);
      const MW = (W && W.w ? W.w * W.mPerPx : 2916.5), MH = (W && W.h ? W.h * W.mPerPx : 1945.6), k = Math.min(w / MW, h / MH), ox = (w - MW * k) / 2, oy = (h - MH * k) / 2, g = gangById(gang);
      const on = g.dist ? [g.dist] : UNCLAIMED;
      for (const d of DISTRICTS) {
        const p = polys[d.id]; if (!p) continue;
        ctx.beginPath(); p.forEach((q, i) => { const x = ox + q[0] * k, y = oy + q[1] * k; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath();
        const sel = on.includes(d.id);
        ctx.fillStyle = sel ? 'rgba(61,242,255,.30)' : 'rgba(120,110,170,.10)'; ctx.fill();
        ctx.strokeStyle = sel ? '#3df2ff' : 'rgba(143,136,173,.55)'; ctx.lineWidth = (sel ? 2 : 1) * dpr; ctx.stroke();
      }
    }
    function describe() {
      const g = gangById(gang), mate = g.mate ? gangById(g.mate) : null;
      const where = g.dist ? hx`<u>${distName(g.dist)}</u>` : 'один из семи незахваченных районов (случайный)';
      const rel = g.id === 'none'
        ? hx`<em>Тебе враждебны все: банды, уличные шайки, собаки.</em> Никто не прикроет. ППС и Коалиция трогают только за нарушение порядка.`
        : hx`<em>Свои:</em> «${g.name}» не враждебны, пока ты их не бьёшь.${mate ? hx` <em>В районе также «${mate.name}»: они враждебны.</em>` : ''} Остальные банды, шайки и собаки враждебны.`;
      setHtml(info, hx`<b>${g.name.toUpperCase()}</b><br>Появление: ${where}.<br>Одежда: ${g.look}.<br>Снаряжение: ${g.gear}.<br>${rel}<br>ППС (Администрация) и охрана Коалиции в Речном Порту начинают стрелять только при нарушении порядка: оружие в руках после окрика, выстрел в их районе, нападение на них или на мирных.<br><em>Старт рейда: 00:00.</em>`);
      rows.forEach((r) => { const on = r.dataset.id === gang; r.classList.toggle('on', on); r.setAttribute('aria-selected', on); });
    }
    function pick(id) { setGang(id); describe(); draw(); if (opts.onChange) opts.onChange(id); }
    list.addEventListener('click', (e) => { const b = e.target.closest('.gp-row'); if (b) pick(b.dataset.id); });
    const ro = window.ResizeObserver ? new ResizeObserver(draw) : null; if (ro) ro.observe(cv);
    window.addEventListener('resize', draw);
    describe(); requestAnimationFrame(draw);
    return { refresh() { describe(); draw(); }, destroy() { if (ro) ro.disconnect(); window.removeEventListener('resize', draw); el.replaceChildren(); } };
  }
  const mount = mountGang; // совместимость со старым именем

  // Подставляет новый текст в шапку стартового экрана (#intro .tag) и добавляет .sub под ней.
  function applyIntro(root) {
    root = root || document; const tag = root.querySelector('#intro .tag'); if (!tag) return;
    tag.textContent = INTRO.tag;
    if (!root.querySelector('#intro .sub')) { const p = document.createElement('p'); p.className = 'muted sub'; p.textContent = INTRO.sub; tag.after(p); }
  }

  window.WL_START = { INTRO, DISTRICTS, NAMES, GANGS, UNCLAIMED, START_HOUR, gang: () => gang, setGang, gangById, resolve, chosen: () => chosen, setChosen, gender: () => gender, setGender, onChange: (f) => listeners.push(f), mount, mountGang, applyIntro, friendly, provoke, DEFAULT_ID };
})();
