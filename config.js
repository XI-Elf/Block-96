// Block-96 — игровые данные. Время игры: 1 игр. минута = 2 с; день 10:00–16:00 (6 ч), ночь 18 ч (см. enemies.js isDay). ТОЧКА РАСШИРЕНИЯ: оружие, предметы, лут, враги, статы.
// Меняется без правки логики. Единицы: пиксели мира (10 px = 1 м), секунды, градусы.
'use strict';
window.WL_CONFIG = {
  // ЕДИНАЯ ШКАЛА МИРА. Всё считается в метрах, пиксели — только производные. Менять только здесь.
  // Сетка стройки 2 м = 20 px; тайлы арта (32 px) масштабируются на ART_SCALE = 20/32 = 0.625.
  WORLD: { pxPerM: 10, buildCellM: 2, artTilePx: 32 },
  PX_PER_M: 10, // = WORLD.pxPerM (оставлено для кода, который уже на него ссылается)
  MAP: { w: 3200, h: 2400, buildings: 16, cars: 22, blocks: 34, crates: 22 },

  // Баллистика: dmg на попадание (на пеллету), speed px/с, eff — дистанция полного урона,
  // max — дальше пуля «падает» (исчезает); между eff и max урон линейно падает до dmg*minDmg.
  // spread — базовый разброс (полный угол), moveSpread — штраф за движение, bloom — прирост за выстрел.
  WEAPONS: {
    pistol:  { name: 'Пистолет ПМ',        ammo: '9mm', dmg: 20, pellets: 1, speed: 950,  eff: 360, max: 560,  minDmg: 0.45, spread: 2.5, moveSpread: 4, bloom: 2.0, rof: 0.22, mag: 12, reload: 1.3, kick: 2, color: '#7df9ff', sound: 900 },
    shotgun: { name: 'Обрез «Бочка»',     ammo: '12g', dmg: 11, pellets: 8, speed: 720,  eff: 170, max: 320,  minDmg: 0.15, spread: 12,  moveSpread: 4, bloom: 3.0, rof: 0.75, mag: 2,  reload: 2.0, kick: 6, color: '#ffb23d', sound: 380 },
    rifle:   { name: 'Винтовка «Игла»',   ammo: '762', dmg: 65, pellets: 1, speed: 1700, eff: 720, max: 1050, minDmg: 0.6,  spread: 0.5, moveSpread: 8, bloom: 4.0, rof: 1.1,  mag: 5,  reload: 2.4, kick: 4, color: '#ff3ea5', sound: 600 },
  },
  // Ближний бой — второстепенный: удар прикладом (V).
  MELEE: { dmg: 14, range: 16, arc: 70, cooldown: 0.7 },

  // Эвакуация: ключ лежит в одном контейнере; на воротах удерживать E holdTime секунд. guards — стража у ворот.
  EXTRACTION: { keyItem: 'gate_key', holdTime: 3, guards: 5 },
  // Бег (Shift): тратит выносливость; spreadAdd — прибавка к разбросу, noiseMul — множитель слышимости выстрела.
  STAMINA: { base: 70, perEnd: 6, drain: 15.6, regen: 15, regenDelay: 0.9, recover: 30, sprintMul: 2.4, spreadAdd: 3, noiseMul: 1.3 },
  // Навесное на оружие: slot — гнездо, mod — множители (eff/max дальность, spread разброс, bloom набор разброса, kick отдача, dmg урон, noise слышимость).
  ATTACH: {
    silencer: { slot: 'muzzle', mod: { noise: 0.3, dmg: 0.94, eff: 0.94, max: 0.94 } },
    scope:    { slot: 'optic',  mod: { eff: 1.22, max: 1.18, spread: 0.88 } },
    grip:     { slot: 'grip',   mod: { bloom: 0.6, kick: 0.65, spread: 0.92 } },
  },
  ITEMS: {
    gate_key: { name: 'Пропуск блокпоста',  w: 0.1, kind: 'quest' },
    token:    { name: 'Жетон метро',      w: 0.01, kind: 'cash' }, // валюта: падает с врагов (enemies.js), тратится у торговца в убежище
    silencer: { name: 'Глушитель',        w: 0.4, kind: 'attach' },
    scope:    { name: 'Оптика ×3',        w: 0.5, kind: 'attach' },
    grip:     { name: 'Рукоять',          w: 0.3, kind: 'attach' },
    '9mm':    { name: 'Патроны 9 мм',     w: 0.01, kind: 'ammo' },
    '12g':    { name: 'Дробь 12 к.',      w: 0.04, kind: 'ammo' },
    '762':    { name: 'Патроны 7.62',     w: 0.02, kind: 'ammo' },
    bandage:  { name: 'Бинт',             w: 0.1,  kind: 'heal', heal: 15 },
    medkit:   { name: 'Аптечка',          w: 0.5,  kind: 'heal', heal: 45 },
    food:     { name: 'Консервы',         w: 0.4,  kind: 'food', food: 35 },
    water:    { name: 'Вода (фильтр.)',   w: 0.5,  kind: 'food', water: 40 },
    scrap:    { name: 'Металлолом',       w: 1.0,  kind: 'mat' },
    wires:    { name: 'Провода',          w: 0.3,  kind: 'mat' },
    cell:     { name: 'Аккумулятор',      w: 0.5,  kind: 'mat' },
    fuel:     { name: 'Канистра бензина', w: 4.0,  kind: 'mat' }, // заливается в машину (R за рулём); лежит в багажниках и гаражах
    pistol:   { name: 'Пистолет ПМ',      w: 1.2,  kind: 'weapon' },
    shotgun:  { name: 'Обрез «Бочка»',    w: 2.5,  kind: 'weapon' },
    rifle:    { name: 'Винтовка «Игла»',  w: 4.0,  kind: 'weapon' },
  },

  // Контейнеры: время обыска (с), таблица [id, min, max, вес шанса], сколько бросков.
  CONTAINERS: {
    crate:  { name: 'Ящик',     time: 1.2, rolls: [1, 3], table: [['9mm',8,20,30],['12g',3,8,16],['762',2,6,9],['scrap',1,3,28],['wires',1,2,16],['food',1,1,14],['water',1,1,14],['bandage',1,2,16],['medkit',1,1,4],['shotgun',1,1,3],['rifle',1,1,1.5],['silencer',1,1,1.4],['scope',1,1,1.2],['grip',1,1,1.6]] },
    locker: { name: 'Шкафчик',  time: 1.8, rolls: [2, 4], table: [['9mm',10,24,20],['12g',4,10,16],['762',3,8,14],['bandage',1,3,18],['medkit',1,1,10],['food',1,2,10],['water',1,2,10],['cell',1,1,8],['shotgun',1,1,6],['rifle',1,1,4],['silencer',1,1,2.5],['scope',1,1,2],['grip',1,1,2.5]] },
    car:    { name: 'Багажник', time: 2.0, rolls: [1, 3], table: [['fuel',1,1,9],['scrap',2,4,30],['wires',1,3,24],['cell',1,2,10],['water',1,2,14],['12g',2,6,10],['9mm',6,14,10]] },
    entrance: { name: 'Почтовые ящики',  time: 1.8, rolls: [1, 3], table: [['9mm',6,16,18],['12g',2,6,10],['762',2,5,6],['bandage',1,2,16],['medkit',1,1,6],['food',1,2,14],['water',1,2,14],['scrap',1,3,16],['wires',1,2,10],['cell',1,1,5],['shotgun',1,1,3],['rifle',1,1,1.2],['silencer',1,1,1.5],['scope',1,1,1.2],['grip',1,1,1.8]] },
    bin:      { name: 'Мусорный бак', time: 1.0, rolls: [1, 2], table: [['scrap',1,3,30],['wires',1,2,16],['food',1,1,12],['water',1,1,12],['bandage',1,1,10],['9mm',4,10,10]] },
    garage:   { name: 'Гараж',     time: 2.2, rolls: [2, 4], table: [['fuel',1,1,10],['scrap',2,5,28],['wires',1,3,22],['cell',1,2,12],['9mm',8,20,14],['12g',3,8,12],['762',2,6,8],['medkit',1,1,6],['shotgun',1,1,4],['rifle',1,1,2],['silencer',1,1,2],['scope',1,1,1.6],['grip',1,1,2]] },
    body:   { name: 'Тело',     time: 0.8, rolls: [1, 2], table: [['9mm',6,15,30],['12g',2,5,12],['762',1,4,8],['food',1,1,12],['water',1,1,12],['bandage',1,1,14],['wires',1,1,8]] },
  },

  ENEMIES: {
    raider: { name: 'Бандит', hp: 60, r: 3.5, speed: 25, sight: 480, keep: 230, xp: 35, color: '#ff2bd6',
              ai: { cover: true, fleeHp: 0.2, keep: 230, peek: [0.9, 2.0] }, // ai: укрытия, порог бегства (доля HP), дистанция, время выглядывания (с)
              gun: { dmg: 9, pellets: 1, speed: 800, eff: 280, max: 520, minDmg: 0.5, spread: 7, rof: 0.6, mag: 6, reload: 1.8, color: '#ff6b9d' } },
    ghoul:  { name: 'Одичавший пёс',   hp: 45, r: 3.3, speed: 41, sight: 380, xp: 20, color: '#ff7a9c', bite: { dmg: 11, range: 5, cd: 0.8 } },
  },
  // Город Pavlov Yar (данные уровня — pavlov_yar.js, метры). Зоны: rect [x0,y0,x1,y1] в метрах или park:i (полигон парка из уровня).
  // Классы застройки по высоте: частный дом 3.2 м, 9-этажка 25.2 м и т.д. (правила репозитория Block-96).
  // 16 districts (map legend): 3 Administration, 1 Trade Coalition, 5 held by 8 gangs, 7 unclaimed. Names/ids live in world15.js (B96_WORLD.districts); gangs in enemies.js FACTIONS.
  CITY: { objScale: 1, districts: 16, // здания ×1.8 по планам (машина 10×4.6 м против игрока 2.4 м)
    marginM: 15, vk: 4, // vk — пикселей экрана на метр высоты здания (вид сверху с лёгким наклоном)
    zones: [
      { id: 'park',   name: 'Парк',           park: 0, raiders: 1, ghouls: 6 },
      { id: 'park2',  name: 'Лесопарк',       park: 1, raiders: 1, ghouls: 6 },
      { id: 'micro',  name: 'Микрорайон',     rect: [165, 118, 322, 238], raiders: 10, ghouls: 2 },
      { id: 'rail',   name: 'Гаражи и железная дорога', rect: [0, 240, 170, 320], raiders: 4, ghouls: 5 },
      { id: 'priv',   name: 'Частный сектор', rect: [30, 70, 165, 240], raiders: 6, ghouls: 6 },
      { id: 'embank', name: 'Набережная',     rect: [270, 60, 360, 330], raiders: 5, ghouls: 3 },
    ],
    base: 'Block-96',
    nodes: [['n0', 'Метро «Павлов Яр»'], ['n1', 'Метро «Муромский Посад»'], ['n2', 'Метро «Дербышевка»']],
    gate: { name: 'Блокпост на мосту', at: [253.5, 7.5] }, // bridge_pavlov_yar_north
  },
  SPAWN: { raiders: 9, ghouls: 12, cap: 40, every: 45, batch: 3, minDistFromPlayer: 420 },

  // РеалРПГ. Базовые статы и их влияние (линейные коэффициенты на очко).
  STATS: {
    names: { str: 'Сила', agi: 'Ловкость', per: 'Восприятие', end: 'Выносливость' },
    hint:  { str: 'грузоподъёмность, урон прикладом', agi: 'скорость бега, перезарядка', per: 'эффективная дальность, точность', end: 'здоровье, медленнее голод и жажда' },
    base: 3, max: 10,
  },
  SKILLS: {
    names: { shoot: 'Стрельба', scav: 'Мародёрство', med: 'Полевая медицина' },
    hint:  { shoot: '−8% разброса за уровень', scav: 'быстрее обыск, шанс лишней находки', med: '+20% к лечению' },
    max: 5,
  },
  ABILITIES: { adrenaline: { name: 'Адреналин', key: 'Q', dur: 5, cd: 30, speed: 1.4, reload: 0.6 } },
  XP: { container: 8, levelBase: 60, levelSq: 25 }, // нужно XP: base + level² * sq
  NEEDS: { hunger: 0.22, thirst: 0.32, starve: 1.5, regenAbove: 60, regen: 0.6 }, // в секунду

  START: { inv: [['9mm', 36], ['bandage', 2], ['water', 1], ['food', 1]], weapons: ['pistol'] },
};
// Производные от WORLD — не править руками.
WL_CONFIG.BUILD_CELL_PX = WL_CONFIG.WORLD.buildCellM * WL_CONFIG.WORLD.pxPerM;
WL_CONFIG.ART_SCALE = WL_CONFIG.BUILD_CELL_PX / WL_CONFIG.WORLD.artTilePx;
WL_CONFIG.PX_PER_M = WL_CONFIG.WORLD.pxPerM;
// Убежище: что лежит на складе при первом запуске и ограничение на выбор в рейд.
WL_CONFIG.META = {
  saveKey: 'wastland.save.v1', // ключ localStorage НЕ менять: иначе у игроков пропадут сохранения (имя историческое)
  startStash: { items: { '9mm': 60, bandage: 3, water: 2, food: 2, token: 15 }, weapons: [{ id: 'pistol', att: {} }] },
  rescueKit: { items: { '9mm': 24, bandage: 1 }, weapons: [{ id: 'pistol', att: {} }] }, // если на складе пусто — выдать, чтобы не застрять
  carryKinds: ['ammo', 'heal', 'food', 'attach'], // материалы остаются в убежище (на базу)
};
