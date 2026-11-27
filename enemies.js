// Block-96: enemies and AI (owner: enemies/AI thread).
// Replaces the built-in enemy step: window.WL_ENEMIES.step(s, dt, API) is called by sim.js every tick.
// Setting: Ukrainian city, 2003. Types: gopnik, stray dog, marauder, bandit, militia patrol.
// Everything tunable is in TYPES / ZONE_SPAWN / DIFF below. Units: px (10 px = 1 m), seconds.
'use strict';
(function () {
  const C = window.WL_CONFIG, NAV = window.WL_NAV, hyp = Math.hypot, TAU = Math.PI * 2;
  const B = window.WL_BEH; // behaviour data and rules: load behavior/factions.js before this file
  if (!B) throw new Error('enemies.js needs behavior/factions.js (window.WL_BEH)');

  // Global difficulty knobs (multiplied into damage / enemy accuracy spread / reaction time).
  const DIFF = { dmg: 1, spread: 1, react: 1, ffCheck: true }; // ffCheck: enemies hold fire when an ally is in the line of fire

  // ---------------- visibility / fire ranges ----------------
  // Nobody should shoot or spot someone the other side cannot see on screen. VIEW.r = radius (px) of the area that is always
  // visible around the player (inscribed circle of the isometric screen). game.js calls WL_ENEMIES.setView(W, H, Kx) on resize;
  // the default fits a 1920x1080 window (Kx = 3.99).
  // Mobs notice / shoot only within VIEW.r of the player AND inside the BASE (unshifted, player-centred) viewport, by their own
  // line of sight. The right-mouse look-around does NOT affect mobs (otherwise looking ahead would blind everything behind the
  // player). The client reports the viewport with setView(W, H, Kx) on resize; setCamera(ox, oy) (camera offset from the player,
  // world px) is used only by the incoming-fire indicator in threat.js.
  const VIEW = { r: 165, has: false, halfU: 0, halfV: 0, Kx: 1, ox: 0, oy: 0 };
  function setView(W, H, Kx) { const r = 0.97 * Math.min(W / 2 / Kx / Math.SQRT2, (H / 2 / Kx) * Math.SQRT2); if (r > 40) VIEW.r = r; VIEW.halfU = W / 2 / Kx; VIEW.halfV = H / 2 / Kx; VIEW.Kx = Kx; VIEW.has = true; return VIEW.r; }
  function setCamera(ox, oy) { VIEW.ox = ox || 0; VIEW.oy = oy || 0; }
  function onScreen(p, x, y) {
    if (!VIEW.has) return hyp(x - p.x, y - p.y) < VIEW.r;
    const dx = x - p.x, dy = y - p.y, u = dx - dy, v = (dx + dy) / 2;
    return Math.abs(u) < VIEW.halfU * 0.96 && Math.abs(v) < VIEW.halfV * 0.96;
  }
  // Player weapon ranges (px, 10 px = 1 m): eff = full damage up to, max = bullet disappears. Applied to WL_CONFIG.WEAPONS at load.
  const WEAPON_RANGES = { pistol: { eff: 110, max: 190 }, shotgun: { eff: 55, max: 120 }, rifle: { eff: 170, max: 250 } };
  for (const k in WEAPON_RANGES) if (C.WEAPONS && C.WEAPONS[k]) Object.assign(C.WEAPONS[k], WEAPON_RANGES[k]);

  // ---------------- enemy types ----------------
  // role 'rush' = melee pack, 'gun' = firearm. look: hint for the renderer (see WL_ENEMIES.look).
  // idle: behaviour when unaware: 'loiter' (stand around home), 'roam' (wander far), 'scav' (walk between containers),
  //       'patrol' (follow a route), 'post' (stand guard).
  // fov: half-angle (deg) of the vision cone while unaware; once alerted vision is 360 deg (still needs line of sight).
  // sense: radius at which it notices the player even without line of sight (smell / footsteps).
  const GUNS = {
    obrez:  { dmg: 10, pellets: 6, speed: 700, eff: 90, max: 170, minDmg: 0.15, spread: 12, rof: 0.8,  mag: 2,  reload: 2.2, burst: 1, burstCd: 0.2, color: '#ffb23d', sound: 380 },
    ak:     { dmg: 7,  pellets: 1, speed: 900, eff: 130, max: 230, minDmg: 0.5,  spread: 9,  rof: 0.12, mag: 24, reload: 2.6, burst: 3, burstCd: 1.4, color: '#ff6b9d', sound: 700 },
    // README v5 factions: guns by faction (px, 10 px = 1 m)
    pm:     { dmg: 9,  pellets: 1, speed: 800, eff: 90,  max: 170, minDmg: 0.4,  spread: 8,  rof: 0.35, mag: 8,  reload: 1.8, burst: 1, burstCd: 0.55, color: '#ffd27a', sound: 900 },
    tt:     { dmg: 11, pellets: 1, speed: 850, eff: 100, max: 190, minDmg: 0.4,  spread: 7,  rof: 0.3,  mag: 8,  reload: 2.0, burst: 2, burstCd: 0.8,  color: '#ffd27a', sound: 900 },
    nagan:  { dmg: 12, pellets: 1, speed: 780, eff: 85,  max: 160, minDmg: 0.4,  spread: 9,  rof: 0.6,  mag: 7,  reload: 3.0, burst: 1, burstCd: 0.8,  color: '#d9b36a', sound: 850 },
    odnostvol: { dmg: 8, pellets: 5, speed: 680, eff: 75, max: 150, minDmg: 0.15, spread: 11, rof: 1.0, mag: 1, reload: 2.2, burst: 1, burstCd: 0.6, color: '#c9a45a', sound: 380 },
    dvustvolka: { dmg: 10, pellets: 7, speed: 700, eff: 85, max: 165, minDmg: 0.15, spread: 11, rof: 0.5, mag: 2, reload: 2.4, burst: 2, burstCd: 0.7, color: '#ffb23d', sound: 380 },
    pump:   { dmg: 10, pellets: 7, speed: 720, eff: 100, max: 190, minDmg: 0.15, spread: 9,  rof: 0.9,  mag: 5,  reload: 2.8, burst: 1, burstCd: 0.5,  color: '#ffb23d', sound: 380 },
    saiga:  { dmg: 9,  pellets: 6, speed: 720, eff: 95,  max: 180, minDmg: 0.15, spread: 9,  rof: 0.35, mag: 8,  reload: 2.8, burst: 2, burstCd: 1.0,  color: '#ffb23d', sound: 380 },
    vepr:   { dmg: 8,  pellets: 1, speed: 950, eff: 150, max: 250, minDmg: 0.5,  spread: 6,  rof: 0.2,  mag: 10, reload: 2.8, burst: 2, burstCd: 1.1,  color: '#cfe3ff', sound: 700 },
    ak74:   { dmg: 8,  pellets: 1, speed: 950, eff: 150, max: 250, minDmg: 0.5,  spread: 7,  rof: 0.12, mag: 30, reload: 2.8, burst: 3, burstCd: 1.3,  color: '#cfe3ff', sound: 700 },
    svd:    { dmg: 28, pellets: 1, speed: 1200, eff: 230, max: 330, minDmg: 0.6, spread: 2,  rof: 1.3,  mag: 10, reload: 3.0, burst: 1, burstCd: 1.4,  color: '#cfe3ff', sound: 650 },
    rpk:    { dmg: 8,  pellets: 1, speed: 950, eff: 150, max: 250, minDmg: 0.5,  spread: 9,  rof: 0.1,  mag: 45, reload: 4.0, burst: 6, burstCd: 1.6,  color: '#cfe3ff', sound: 700 },
    hunt:   { dmg: 24, pellets: 1, speed: 1150, eff: 220, max: 320, minDmg: 0.6, spread: 2.5, rof: 1.4, mag: 5,  reload: 2.8, burst: 1, burstCd: 1.5,  color: '#ff9acb', sound: 600 },
    mk22:   { dmg: 12, pellets: 1, speed: 1000, eff: 200, max: 300, minDmg: 0.5, spread: 3,  rof: 0.7,  mag: 10, reload: 2.4, burst: 1, burstCd: 1.0,  color: '#ff9acb', sound: 220 }, // small-bore with a home-made suppressor
    smg:    { dmg: 6,  pellets: 1, speed: 800, eff: 80,  max: 150, minDmg: 0.4,  spread: 11, rof: 0.09, mag: 30, reload: 2.4, burst: 5, burstCd: 1.1,  color: '#ff6b9d', sound: 600 },
    gaspist: { dmg: 7, pellets: 1, speed: 760, eff: 70,  max: 140, minDmg: 0.4,  spread: 10, rof: 0.3,  mag: 8,  reload: 2.2, burst: 1, burstCd: 0.6,  color: '#e8e8ff', sound: 800 },
    aks:    { dmg: 8,  pellets: 1, speed: 950, eff: 150, max: 250, minDmg: 0.5,  spread: 7,  rof: 0.12, mag: 30, reload: 2.8, burst: 3, burstCd: 1.3, color: '#cfe3ff', sound: 700 },
  };
  const TYPES = {
    gopnik: { name: 'Гопник', hp: 55, r: 3.5, speed: 34, sight: 420, sense: 60, fov: 70, xp: 18, color: '#ffa84a', look: 'melee',
      role: 'rush', idle: 'loiter', react: 0.45, lose: 7, fleeHp: 0.3, packFlee: true,
      melee: { dmg: 12, range: 7, cd: 0.9, wind: 0.28 },
      loot: { chance: 0.6, rolls: [1, 2], table: [['scrap',1,3,18],['food',1,1,14],['water',1,1,8],['9mm',4,10,12],['bandage',1,1,10],['token',1,2,20]] } },
    dog:    { name: 'Бродячая собака', hp: 35, r: 3.3, speed: 47, sight: 340, sense: 190, fov: 110, xp: 10, color: '#b9a98a', look: 'beast',
      role: 'rush', idle: 'roam', react: 0.2, lose: 9, fleeHp: 0.2, packFlee: false,
      melee: { dmg: 9, range: 5, cd: 0.7, wind: 0.18 },
      loot: { chance: 0.12, rolls: [1, 1], table: [['food',1,1,1]] } },
    civ:    { name: 'Прохожий', hp: 30, r: 3.5, speed: 24, sight: 200, sense: 0, fov: 90, xp: 0, color: '#9aa3ad', look: 'melee',
      role: 'rush', idle: 'roam', react: 9, lose: 1, fleeHp: 1, packFlee: true, melee: { dmg: 0, range: 0, cd: 9, wind: 1 },
      loot: { chance: 0.35, rolls: [1, 1], table: [['food',1,1,10],['water',1,1,8],['scrap',1,2,10],['token',1,1,6]] } },
    marauder: { name: 'Мародёр', hp: 60, r: 3.5, speed: 30, sight: 460, sense: 50, fov: 80, xp: 30, color: '#9ccf5a', look: 'armed',
      role: 'gun', idle: 'scav', react: 0.55, lose: 8, fleeHp: 0.4, keep: 70, gun: GUNS.obrez, cover: true,
      loot: { chance: 0.9, rolls: [2, 3], table: [['12g',3,8,22],['9mm',6,14,14],['wires',1,2,14],['scrap',1,3,14],['bandage',1,2,14],['medkit',1,1,6],['cell',1,1,8],['food',1,1,10],['shotgun',1,1,4],['silencer',1,1,2],['token',1,3,18]] } },
    bandit: { name: 'Бандит', hp: 80, r: 3.5, speed: 26, sight: 520, sense: 50, fov: 85, xp: 40, color: '#ff2bd6', look: 'armed',
      role: 'gun', idle: 'loiter', react: 0.5, lose: 9, fleeHp: 0.2, keep: 120, gun: GUNS.ak, cover: true, flank: true,
      loot: { chance: 0.9, rolls: [2, 3], table: [['762',4,10,20],['9mm',6,14,14],['bandage',1,2,12],['medkit',1,1,8],['rifle',1,1,3],['scope',1,1,3],['grip',1,1,3],['silencer',1,1,2.5],['cell',1,1,6],['token',1,3,22]] } },
    militia: { name: 'Патруль', hp: 95, r: 3.5, speed: 26, sight: 560, sense: 60, fov: 90, xp: 55, color: '#7fb7ff', look: 'armed',
      role: 'gun', idle: 'patrol', react: 0.4, lose: 12, fleeHp: 0.12, keep: 130, gun: GUNS.aks, cover: true, radio: 900, bound: true,
      loot: { chance: 1, rolls: [2, 3], table: [['762',6,14,26],['medkit',1,1,14],['bandage',1,2,14],['9mm',6,12,10],['food',1,1,8],['rifle',1,1,5],['scope',1,1,2.5],['grip',1,1,2.5],['token',2,4,24]] } },
  };
  // ---------------- factions (README v5) ----------------
  // fac: faction id; gear: what the mob wears / carries (for the renderer, inspection and loot); when: 'day' | 'night' | null.
  const mk = (base, o) => Object.assign({}, TYPES[base], o);
  const L_GANG = { chance: 0.9, rolls: [2, 3], table: [['9mm',6,14,18],['12g',3,8,14],['762',2,6,8],['bandage',1,2,12],['food',1,1,10],['water',1,1,8],['wires',1,2,8],['scrap',1,2,8],['medkit',1,1,5],['token',1,3,20]] };
  const L_ADMIN = { chance: 1, rolls: [2, 3], table: [['762',6,14,26],['medkit',1,1,14],['bandage',1,2,14],['9mm',6,12,10],['food',1,1,10],['water',1,1,8],['rifle',1,1,4],['scope',1,1,2],['grip',1,1,2],['token',2,4,24],['gate_key',1,1,1.5]] };
  const gang = (fac, name, gun, o) => mk('bandit', Object.assign({ name, fac, gun, role: 'gun', idle: 'loiter', loot: L_GANG, color: '#ff2bd6' }, o || {}));
  TYPES.militia.name = 'Наряд ППС'; TYPES.militia.fac = 'admin'; TYPES.militia.gear = 'бушлат, каска СШ-68, бронежилет, рация, АКС-74У'; TYPES.militia.loot = L_ADMIN; TYPES.militia.gun = GUNS.aks;
  Object.assign(TYPES, {
    pps_ak:  mk('militia', { name: 'ППС (АК-74)', gun: GUNS.ak74, gear: 'олива, каска «Сфера», бронежилет, АК-74' }),
    pps_svd: mk('militia', { name: 'ППС: снайпер', gun: GUNS.svd, keep: 200, idle: 'post', hp: 90, gear: 'бушлат, каска, СВД', loot: L_ADMIN }),
    pps_rpk: mk('militia', { name: 'ППС: пулемётчик', gun: GUNS.rpk, idle: 'post', hp: 110, gear: 'тяжёлый бронежилет, каска, РПК', loot: L_ADMIN }),
    pps_pm:  mk('militia', { name: 'ППС (ПМ)', gun: GUNS.pm, hp: 80, keep: 90, gear: 'бушлат, ПМ' }),
    torg:    mk('militia', { name: 'Охрана Коалиции', fac: 'coalition', gun: GUNS.pump, hp: 90, keep: 80, idle: 'patrol', radio: 700, color: '#ffc04a', gear: 'прорезиненный плащ, утеплённый жилет, жетон-пропуск, помповое ружьё', loot: { chance: 0.95, rolls: [2, 3], table: [['12g',4,10,24],['9mm',6,14,14],['bandage',1,2,12],['medkit',1,1,10],['water',1,2,10],['food',1,1,8],['shotgun',1,1,5],['token',3,6,30]] } }),
    torg_sg: mk('torg', { name: 'Охрана Коалиции (Сайга)', gun: GUNS.saiga, gear: 'плащ, жилет с барж, «Сайга»' }),
    torg_vp: mk('torg', { name: 'Охрана Коалиции (Вепрь)', gun: GUNS.vepr, gear: 'плащ, бронежилет с барж, «Вепрь»' }),
    torg_ak: mk('torg', { name: 'Охрана Коалиции (АКС-74)', gun: GUNS.aks, gear: 'плащ, бронежилет с барж, АКС-74' }),
    torg_tt: mk('torg', { name: 'Охрана Коалиции (ТТ)', gun: GUNS.tt, hp: 80, keep: 90, gear: 'плащ, ТТ' }),
    // 8 big gangs (README): who wears and carries what
    holod:   gang('holodnogorskie', 'Холодногорский', GUNS.pm, { gear: 'олимпийка с полосками, анорак, повязка (белая/красная), ПМ', hp: 70, keep: 90, color: '#ff5a5a' }),
    holod_t: gang('holodnogorskie', 'Холодногорский (ТТ)', GUNS.tt, { gear: 'олимпийка, анорак, повязка, ТТ', hp: 70, keep: 90, color: '#ff5a5a' }),
    holod_o: gang('holodnogorskie', 'Холодногорский (обрез)', GUNS.obrez, { gear: 'анорак поверх жилета, обрез', hp: 75, keep: 60, color: '#ff5a5a' }),
    vyshka:  gang('vyshka', 'Вышка', GUNS.hunt, { gear: 'стёганка, монтажный пояс, шапка-маска, лампа с красным стеклом, охотничья винтовка с оптикой', hp: 65, keep: 210, color: '#8a7dff' }),
    vyshka_s: gang('vyshka', 'Вышка (мелкашка)', GUNS.mk22, { gear: 'стёганка, обвязка, шапка-маска, мелкашка с глушителем', hp: 60, keep: 190, color: '#8a7dff' }),
    brigada: gang('brigada', 'Бригада', GUNS.obrez, { gear: 'промасленный бушлат, сварочная маска, каска, нагрудник из стальных листов, обрез 12 к.', hp: 110, keep: 50, speed: 24, color: '#ff9a3a' }),
    brigada_s: gang('brigada', 'Бригада (самопал)', GUNS.odnostvol, { gear: 'бушлат, шахтёрская каска, стальной щит, тяжёлый самопал', hp: 120, keep: 50, speed: 22, color: '#ff9a3a' }),
    koop:    gang('kooperativ', 'Кооператив', GUNS.smg, { gear: 'косуха, мотошлем, сварочные очки, самодельный ПП', hp: 70, keep: 80, color: '#ffd23a' }),
    koop_p:  gang('kooperativ', 'Кооператив (переточка)', GUNS.pm, { gear: 'пуховик, мотошлем, переточенный ствол, самодельные гранаты', hp: 70, keep: 90, color: '#ffd23a' }),
    kazan:   gang('kazanskie', 'Казанский', GUNS.tt, { gear: 'длинный чёрный кожаный плащ, формовка, трофейный бронежилет, ТТ', hp: 80, keep: 100, color: '#c0405a' }),
    kazan_o: gang('kazanskie', 'Казанский (обрез)', GUNS.obrez, { gear: 'дублёнка, формовка, обрез', hp: 80, keep: 60, color: '#c0405a' }),
    kazan_a: gang('kazanskie', 'Казанский (укороченный)', GUNS.aks, { gear: 'кожаный плащ, трофейный бронежилет, укороченный автомат', hp: 85, keep: 120, color: '#c0405a' }),
    sobor:   gang('sobor', 'Послушник «Собора»', GUNS.dvustvolka, { gear: 'чёрный прорезиненный плащ, противогаз со шлангом, тяжёлый крест, двустволка', hp: 90, keep: 60, color: '#b0a050' }),
    sobor_k: mk('gopnik', { name: 'Послушник (кистень)', fac: 'sobor', gear: 'плащ, противогаз, цепной кистень', hp: 100, color: '#b0a050', melee: { dmg: 16, range: 8, cd: 1.0, wind: 0.35 }, loot: L_GANG }),
    sobor_h: gang('sobor', 'Настоятель «Собора»', GUNS.dvustvolka, { gear: 'острый капюшон, маска, епитрахиль с канителью, двустволка', hp: 130, keep: 70, color: '#e0c060', speed: 22 }),
    sektor:  gang('sektor', 'Сектор', GUNS.gaspist, { gear: 'короткий бомбер, камуфляжные штаны, берцы с белыми шнурками, шарф, газовый пистолет под боевой', hp: 80, keep: 80, color: '#9ac05a' }),
    sektor_s: gang('sektor', 'Сектор (Сайга)', GUNS.saiga, { gear: 'бомбер, камуфляж, белая нашивка, обрез «Сайги»', hp: 85, keep: 60, color: '#9ac05a' }),
    cherdak: gang('cherdak', 'Чердак', GUNS.smg, { gear: 'чёрная толстовка с капюшоном, шапка-маска, хоккейные щитки, ПП, дымовые шашки', hp: 60, speed: 32, keep: 80, color: '#4fd0c0', idle: 'roam' }),
    // street gangs and loners of the 7 unclaimed districts: rust, nagans, worn PM, rebar
    shaika:  gang('street', 'Шайка', GUNS.odnostvol, { gear: 'ватник, ушанка, ржавая одностволка', hp: 55, keep: 70, color: '#9ccf5a', when: 'night' }),
    shaika_n: gang('street', 'Шайка (наган)', GUNS.nagan, { gear: 'лыжная куртка, наган', hp: 55, keep: 70, color: '#9ccf5a', when: 'night' }),
    shaika_p: gang('street', 'Шайка (ПМ)', GUNS.pm, { gear: 'ватник, изношенный ПМ', hp: 55, keep: 80, color: '#9ccf5a', when: 'night' }),
  });
  for (const k of ['torg_sg', 'torg_vp', 'torg_ak', 'torg_tt']) TYPES[k] = Object.assign({}, TYPES.torg, TYPES[k]); // fix: they were built from TYPES.torg before it existed (hp/r undefined -> never spawned)
  TYPES.gopnik.fac = 'street'; TYPES.gopnik.gear = 'ватник, арматура'; TYPES.gopnik.when = 'night';
  TYPES.marauder.fac = 'street'; TYPES.marauder.gear = 'лыжная куртка, ржавый обрез'; TYPES.marauder.when = 'night';
  TYPES.dog.fac = 'dogs'; TYPES.dog.gear = 'шерсть, оскал'; TYPES.dog.when = 'night';
  // Which force holds which district (assets: map legend). Shared districts list every gang that lives there.
  const FACTIONS = {
    admin: { name: 'Комендатура Администрации', districts: ['novozavodskoy', 'kompressorny', 'nagorny'] },
    coalition: { name: 'Торговая коалиция', districts: ['rechnoy_port'] },
    gangs: { name: 'Крупные банды', districts: { holodnaya_gora: ['holodnogorskie'], saltov_bor: ['vyshka'], traktornaya_sloboda: ['brigada', 'kooperativ'], kazanskaya_sloboda: ['kazanskie', 'sobor'], levoberezhe: ['sektor', 'cherdak'] } },
    unclaimed: { name: 'Не захвачены (оспариваются)', districts: ['pavlov_yar', 'aviastroika', 'derbyshevka', 'muromsky_posad', 'zarechnaya_balka', 'pokrovskie_dvory', 'sormovka'] },
  };
  const ADMIN_SET = new Set(FACTIONS.admin.districts);
  // target memory (TDD 7.3): 8 s for PPS / big gangs / Coalition, 4 s for street gangs; combat profiles of the 8 gangs (TDD 5.5)
  for (const k in TYPES) {
    const d = TYPES[k];
    if (d.fac === 'street') d.lose = B.MEMORY.scav; else if (d.fac && d.fac !== 'dogs') d.lose = B.MEMORY.experienced;
    const pr = d.fac && B.PROFILES[d.fac]; if (pr) { d.prof = pr; if (pr.noMoraleLoss || pr.noRetreat) d.fleeHp = 0; if (pr.id === 'AGGRESSIVE_FLANK') d.flank = true; }
    if (pr && pr.meleeBelow && !d.melee) d.melee = { dmg: 16, range: 8, cd: 1.0, wind: 0.35 }; // Sobor: knuckle-duster / chain flail when hurt
    if (pr && pr.nightOnly) d.when = 'night';
    if (d.fac === 'admin' || d.fac === 'coalition') d.cmdRadio = true;
  }
  for (const k in TYPES) { const d = TYPES[k]; d.ai = { cover: !!d.cover, fleeHp: d.fleeHp, keep: d.keep || 0, peek: [0.9, 2.0] }; if (!C.ENEMIES[k]) C.ENEMIES[k] = d; }

  // Squads per zone id: [type, headcount], ordered from mild to hard: a low-tier zone keeps only the first squads.
  // A zone in config.js CITY.zones may carry its own `spawn: [[type, n], ...]` (used as is, no tier scaling).
  const ZONE_SPAWN = {
    // 16 districts of the city map. Entry: [type, headcount, when?]; 'day' squads walk only in daylight (ППС), 'night' only at night.
    // Administration: ППС everywhere inside, snipers and machine gunners hold posts; night: they stay in their own quarters.
    novozavodskoy: [['militia', 3], ['pps_ak', 3], ['pps_svd', 1], ['militia', 3], ['pps_rpk', 1]],
    kompressorny:  [['militia', 3], ['pps_ak', 3], ['pps_svd', 1], ['militia', 3], ['pps_rpk', 1]],
    nagorny:       [['militia', 3], ['pps_ak', 3], ['pps_svd', 1], ['militia', 3], ['pps_rpk', 2]],
    rechnoy_port:  [['torg', 3], ['torg_sg', 2], ['torg_vp', 2], ['torg_ak', 2], ['torg_tt', 2]],
    holodnaya_gora: [['holod', 3], ['holod_t', 3], ['holod_o', 2], ['holod', 3]],
    saltov_bor:    [['vyshka', 2], ['vyshka_s', 2], ['vyshka', 2]],
    traktornaya_sloboda: [['brigada', 3], ['koop', 3], ['brigada_s', 2], ['koop_p', 2]],
    kazanskaya_sloboda: [['kazan', 3], ['sobor', 3], ['kazan_o', 2], ['sobor_k', 2], ['kazan_a', 2], ['sobor_h', 1]],
    levoberezhe:   [['sektor', 3], ['cherdak', 3, 'night'], ['sektor_s', 2], ['cherdak', 3, 'night']],
    // Unclaimed: street gangs by night, ППС patrols by day, dogs only at night (spawned by the day/night step)
    pavlov_yar:       [['gopnik', 3], ['shaika', 3, 'night'], ['militia', 3, 'day'], ['marauder', 1, 'night']],
    aviastroika:      [['shaika_p', 3], ['marauder', 1, 'night'], ['shaika_n', 3, 'night'], ['militia', 3, 'day'], ['marauder', 1, 'night']],
    derbyshevka:      [['gopnik', 3], ['shaika', 3, 'night'], ['militia', 3, 'day'], ['gopnik', 3, 'night']],
    muromsky_posad:   [['gopnik', 3], ['shaika_n', 3, 'night'], ['militia', 3, 'day'], ['marauder', 1, 'night']],
    zarechnaya_balka: [['shaika', 3], ['marauder', 1, 'night'], ['militia', 3, 'day'], ['shaika_p', 3, 'night']],
    pokrovskie_dvory: [['gopnik', 3], ['shaika_p', 3, 'night'], ['militia', 3, 'day'], ['marauder', 1, 'night']],
    sormovka:         [['gopnik', 3], ['shaika', 3, 'night'], ['militia', 3, 'day'], ['shaika_n', 3, 'night']],
    // older zone ids (small prototype map)
    park:   [['dog', 3], ['marauder', 1]],
    park2:  [['dog', 3], ['dog', 2], ['marauder', 1]],
    micro:  [['gopnik', 4], ['gopnik', 3], ['bandit', 3], ['militia', 2]],
    rail:   [['gopnik', 3], ['dog', 3], ['marauder', 1], ['marauder', 1], ['bandit', 2]],
    priv:   [['gopnik', 3], ['marauder', 1], ['marauder', 1], ['dog', 2]],
    embank: [['militia', 2], ['militia', 2], ['bandit', 3]],
    salt:   [['gopnik', 4], ['gopnik', 3], ['gopnik', 3], ['bandit', 3], ['militia', 2], ['dog', 3]],
    trakt:  [['bandit', 3], ['bandit', 2], ['marauder', 1], ['marauder', 1], ['gopnik', 3], ['dog', 3], ['militia', 2]],
    ily:    [['gopnik', 3], ['dog', 3], ['marauder', 1], ['marauder', 1], ['bandit', 2]],
  };
  const GATE_GUARDS = 4, RESPAWN_EVERY = 60;
  // Squad share kept per distance rank from the player's home district (home itself is the quietest).
  const TIER_MULT = [0.5, 0.6, 0.6, 0.6, 0.85, 0.85, 0.85, 0.85, 0.85];
  const MIXED = [['dog', 2], ['gopnik', 3], ['marauder', 1], ['bandit', 3]];
  function zoneBase(z) {
    const cz = (C.CITY.zones || []).find(q => q.id === z.id);
    if (cz && cz.spawn) return { list: cz.spawn, fixed: true };
    return { list: ZONE_SPAWN[z.id] || MIXED, fixed: false };
  }
  const centroid = (z) => { const P = z.poly || [], n = P.length || 1; let x = 0, y = 0; for (const q of P) { x += q.x; y += q.y; } return { x: x / n, y: y / n }; };
  // Plan: per zone, which squads to spawn. Zones near the home district get fewer, milder squads.
  function makePlan(s) {
    const E = s._e, home = (s.map.zones || []).find(z => z.id === E.home), hc = home ? centroid(home) : null, plan = {};
    const ranked = s.map.zones.map(z => { const c = centroid(z); return { z, d: hc ? hyp(c.x - hc.x, c.y - hc.y) : 0 }; }).sort((a, b) => a.d - b.d);
    ranked.forEach((r, i) => {
      const b = zoneBase(r.z), mult = b.fixed || !hc ? 1 : (i < TIER_MULT.length ? TIER_MULT[i] : 1);
      plan[r.z.id] = b.list.slice(); // head-count is scaled by the director (hostileK(level), home district x0.6), not by trimming the list
    });
    return plan;
  }

  // Legacy spawner in sim.js (every 45 s) is switched off: this module owns spawning.
  C.SPAWN.batch = 0;

  // ---------------- helpers ----------------
  const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
  function turn(e, want, rate, dt) { const d = angDiff(want, e.ang), m = rate * dt; e.ang += Math.abs(d) <= m ? d : Math.sign(d) * m; }
  function freeFn(s, API) {
    if (!s._eFree) Object.defineProperty(s, '_eFree', { value: (x, y) => API.freeSpot(s, x, y, 11), enumerable: false, writable: true });
    return s._eFree;
  }

  // Vector towards (gx,gy) along a path (straight line when clear, A* otherwise). Same scheme as the built-in step.
  function navDir(s, e, gx, gy, dt, bud, free) {
    e.rp -= dt; e.dk -= dt;
    if (e.dk <= 0) { e.dk = 0.2; e.direct = hyp(gx - e.x, gy - e.y) < 700 && NAV.lineFree(e.x, e.y, gx, gy, free); }
    const dx0 = gx - e.x, dy0 = gy - e.y, d0 = hyp(dx0, dy0);
    if (e.direct) { e.path = null; return d0 < 8 ? { x: 0, y: 0, done: true } : { x: dx0 / d0, y: dy0 / d0, done: false }; }
    if ((!e.path || e.rp <= 0 || hyp(gx - e.gx, gy - e.gy) > 60) && bud.n > 0) {
      bud.n--; e.path = NAV.find(s, e.x, e.y, gx, gy, free, 2500); e.pi = 0; e.gx = gx; e.gy = gy; e.rp = (e.path ? 0.8 : 2.5) + ((e.id * 7) % 10) / 20; // путь не найден: не пересчитывать 2,5 с
    }
    if (!e.path) return null;
    while (e.pi < e.path.length && hyp(e.path[e.pi].x - e.x, e.path[e.pi].y - e.y) < 14) e.pi++;
    if (e.pi >= e.path.length) return { x: 0, y: 0, done: true };
    const w = e.path[e.pi], dx = w.x - e.x, dy = w.y - e.y, d = hyp(dx, dy) || 1;
    return { x: dx / d, y: dy / d, done: false };
  }

  // Cover point: out of the target's line of fire. far = run away, otherwise the closest one that keeps the distance.
  function findCover(s, API, e, tx, ty, far, free) {
    const td = hyp(e.x - tx, e.y - ty); let best = null, bs = 1e9;
    for (let k = 0; k < 24; k++) {
      const a = API.rr(s, 0, TAU), r = API.rr(s, 50, 230), x = e.x + Math.cos(a) * r, y = e.y + Math.sin(a) * r;
      if (!free(x, y) || API.rayWallAll(s, x, y, tx, ty) < 0) continue;
      const dT = hyp(x - tx, y - ty);
      let sc = r + (far ? -dT * 0.5 : Math.max(0, td - dT) * 0.8);
      if (!NAV.lineFree(e.x, e.y, x, y, free)) sc += 150;
      if (sc < bs) { bs = sc; best = { x, y }; }
    }
    return best;
  }

  function randFree(s, API, free, cx, cy, r0, r1, zone, tries) {
    for (let k = 0; k < (tries || 12); k++) {
      const a = API.rr(s, 0, TAU), r = API.rr(s, r0, r1), x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (free(x, y) && (!zone || API.zoneAt(s, x, y) === zone)) return { x, y };
    }
    return null;
  }

  // ---------------- squads and spawning ----------------
  function setup(s, API, e, type, sq, idx) {
    const d = TYPES[type];
    e.type = type; e.faction = d.role === 'gun' ? 'raiders' : 'beasts'; e.sq = sq.id; e.idx = idx;
    e.m = 'idle'; e.mode = 'idle'; e.rt = 0; e.lost = 0; e.pa = 0; e.mag = d.gun ? d.gun.mag : 0; e.burst = 0;
    e.fled = false; e.neu = false; e.php = e.hp; e.wind = 0; e.carry = 0; e.pause = API.rr(s, 0, 2); e.goal = null; e.look = 0; e.vis = []; e.sub = 'adv';
    e.cool = API.rr(s, 0.5, 1.5);
    if (type === 'civ') { const k = B.archFor(API.rnd(s)), A = B.ARCH[k]; e.arch = k; e.maxHp = e.hp = A.hp; e.spdK = A.walk / d.speed; e.runK = A.run / A.walk; e.susp = 0; e.sightK = A.sight; } // TDD 2.1
    if (d.cmdRadio && idx === 0) e.cmd = true; // squad commander carries the radio
    if (idx === 0 && d.role === 'gun' && type !== 'militia') { e.maxHp = e.hp = Math.round(d.hp * 1.25); e.leader = true; } // squad leader is tougher
    return e;
  }

  // дом отряда: ближайшая дверь здания (не дальше 30 м); отряд держится у неё, жители уходят туда вечером и при стрельбе
  function doorHome(s, x, y) {
    const CT = s.map.city; if (!CT || !CT.buildings) return null; let best = null, bd = 300;
    for (const b of CT.buildings) {
      if (!b.poly || b.door == null || b.kind === 'barrier' || Math.abs(b.c.x - x) > 400 || Math.abs(b.c.y - y) > 400) continue;
      const A = b.poly[b.door], B = b.poly[(b.door + 1) % b.poly.length]; if (!A || !B) continue; const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, d = hyp(mx - x, my - y); if (d >= bd) continue;
      let nx = mx - b.c.x, ny = my - b.c.y; const nl = hyp(nx, ny) || 1; bd = d; best = { x: mx + nx / nl * 14, y: my + ny / nl * 14 };
    }
    return best;
  }
  const MAX_SQUAD = 3; // user rule: raid groups (squads, gangs, night patrols) have at most three members
  function spawnSquad(s, API, zone, type, n, near, radius) {
    n = Math.min(n, MAX_SQUAD);
    const free = freeFn(s, API), d = TYPES[type];
    const sq = { id: s.nextId++, type, zone: zone ? zone.id : null, home: null, route: [], ri: 0, members: [], known: null, size0: n, rot: API.rr(s, 0, TAU), post: false };
    for (let i = 0; i < n; i++) {
      const e = API.spawnEnemy(s, type, i === 0 ? near : null, radius || 0, zone);
      if (!e) break;
      if (i > 0) { const L = s.enemies.find(q => q.id === sq.members[0]); const p = L && randFree(s, API, free, L.x, L.y, 24, 52, null, 8); if (p) { e.x = p.x; e.y = p.y; } }
      setup(s, API, e, type, sq, i); sq.members.push(e.id); if (type === 'civ') e.homeD = sq.home;
      if (i === 0) {
        sq.home = { x: e.x, y: e.y };
        if (d.idle !== 'patrol' && type !== 'dog') { const dh = doorHome(s, e.x, e.y); if (dh) { sq.home = dh; sq.homeDoor = true; } } // у отряда есть дом (собаки без дома)
        if (d.idle === 'patrol') for (let k = 0; k < 4; k++) { const p = randFree(s, API, free, e.x, e.y, 120, 320, zone); if (p) sq.route.push(p); }
      }
    }
    if (!sq.members.length) return null;
    sq.fac = d.fac || null; sq.lead0 = sq.members[0];
    if (d.fac === 'vyshka') { // "Vyshka" holds high ground: only Z>=+2 in the TDD. The sim has one floor, so they stand at the foot of tall buildings (Z=0 marker z:2)
      const hs = highSpot(s, API, zone, free); if (hs) { sq.home = hs; sq.post = true; sq.high = true; sq.members.forEach((id, i) => { const m = s.enemies.find(q => q.id === id); const p = m && randFree(s, API, free, hs.x, hs.y, i ? 14 : 0, i ? 40 : 0.1, null, 8); if (m && p) { m.x = p.x; m.y = p.y; m.z = 2; } }); }
    }
    s.sq[sq.id] = sq;
    return sq;
  }
  // a free spot next to the wall of a tall building (h >= 9 m) of the zone: rooftop / upper-window stand-in
  function highSpot(s, API, zone, free) {
    const CT = s.map.city; if (!CT || !CT.buildings) return null; const list = [];
    for (const b of CT.buildings) { if (b.h < 9 || b.kind === 'barrier') continue; if (zone && API.zoneAt(s, b.c.x, b.c.y) !== zone) continue; list.push(b); }
    for (let k = 0; k < 20 && list.length; k++) { const b = list[API.ri(s, 0, list.length - 1)], a = API.rr(s, 0, TAU), R = Math.max(b.w, b.d) / 2 + 22, x = b.c.x + Math.cos(a) * R, y = b.c.y + Math.sin(a) * R; if (free(x, y)) return { x, y }; }
    return null;
  }

  function init(s, API) {
    const first = Object.values(s.players)[0], at = first || s.map.spawn;
    const hz = at && API.zoneAt(s, at.x, at.y);
    s._e = { rt: RESPAWN_EVERY, alive: {}, nextCont: 0, home: s.homeDistrict || (hz ? hz.id : null), rep: {}, plan: {}, cyc: {}, off: {}, wanted: false, portShot: false, lastShotT: null, dn: 0 };
    s.sq = {}; s.enemies.length = 0; // drop what sim.js spawned: this module owns the population
    const E = s._e; E.plan = makePlan(s);
    if (s.map.gate) { const sq = spawnSquad(s, API, null, 'pps_rpk', 1, s.map.gate, 320), sq2 = spawnSquad(s, API, null, 'militia', GATE_GUARDS - 1, s.map.gate, 320); if (sq) sq.post = true; if (sq2) sq2.post = true; }
    // a couple of small groups near the entry point so the first contact is not far away (they belong to the district they stand in)
    if (s.map.spawn) for (const [t2, n2] of [['gopnik', 3], ['marauder', 1]]) { const sq = spawnSquad(s, API, null, t2, n2, s.map.spawn, 800); if (sq && !isDay(s)) sq.when = 'night'; if (sq) { const z = API.zoneAt(s, sq.home.x, sq.home.y); sq.zone = z ? z.id : null; } }
    population(s, API, E, Object.values(s.players), 1e9, false); // fill every district up to its table target
    if (!isDay(s)) for (let i = 0; i < 12; i++) nightPressure(s, API, E, Object.values(s.players).filter(p => !p.dead)); // v62: the first minute at night already has contact
  }

  // ---------------- district factions ----------------
  // Mobs of the player's home district start neutral (except dogs); other districts are hostile. Hitting a neutral mob
  // angers its squad and witnesses nearby; HOSTILE_HITS hits on one district turns the whole district hostile.
  const HOSTILE_HITS = 4;
  const firstPlayer = (s) => { for (const id in s.players) { const p = s.players[id]; if (!p.dead && !p.extracted) return p; } return null; };
  const weaponOut = (s, p) => { const E = s._e; return !!(p && (p.aiming || (E && E.lastShotT != null && s.t - E.lastShotT < 4))); };
  // stance of a mob towards the player: 'neutral' | 'warn' (WARN_HOLSTER first) | 'hostile'. Faction rules: behavior/factions.js stance().
  function stanceOf(s, e) {
    const E = s._e, q = s.sq[e.sq], def = TYPES[e.type]; if (!def) return 'hostile';
    if (e.type === 'civ') return 'neutral'; // civilians never attack
    if (e.type === 'dog') return 'hostile';
    if (!E) return 'hostile';
    if (q && q.angry) return 'hostile';
    const fac = def.fac || null, P = firstPlayer(s), PF = s.playerFac;
    // v61: the player's gang (chosen before the raid) decides who is local. Own gang is not hostile; every other gang, street gang and dog is.
    // ППС and the Trade Coalition act on order violations only (see behavior/factions.js stance), identically for every variant including "no gang".
    if (PF) {
      if (PF !== 'none' && fac === PF) { const r = E.rep['f:' + fac]; return r && r.hostile ? 'hostile' : 'neutral'; }
      const st2 = fac ? B.stance({ fac, zone: q && q.zone, day: isDay(s), weaponOut: weaponOut(s, P), wanted: !!E.wanted, portShot: !!E.portShot, home: E.home }) : 'hostile';
      return st2 === 'hostile-if-provoked' ? 'hostile' : st2;
    }
    let st = fac ? B.stance({ fac, zone: q && q.zone, day: isDay(s), weaponOut: weaponOut(s, P), wanted: !!E.wanted, portShot: !!E.portShot, home: E.home }) : 'hostile';
    const homeSoft = q && q.zone && q.zone === E.home && !(E.rep[q.zone] && E.rep[q.zone].hostile) && !(fac === 'admin' && E.wanted) && !(fac === 'coalition' && E.portShot);
    if (homeSoft) return 'neutral'; // legacy (no gang chosen): mobs of the player's own district are not hostile
    return st === 'hostile-if-provoked' ? 'hostile' : st;
  }
  const neutral = (s, e) => stanceOf(s, e) === 'neutral';
  function provoke(s, e) {
    const E = s._e, q = s.sq[e.sq]; if (!q) return;
    q.angry = true; const dfac = TYPES[e.type] && TYPES[e.type].fac;
    if (s.playerFac && s.playerFac !== 'none' && dfac === s.playerFac) { const rf = E.rep['f:' + dfac] || (E.rep['f:' + dfac] = { hits: 0, hostile: false }); if (++rf.hits >= HOSTILE_HITS && !rf.hostile) { rf.hostile = true; s.events.push({ t: 'district_hostile', zone: 'f:' + dfac }); } }
    const r = E.rep[q.zone] || (E.rep[q.zone] = { hits: 0, hostile: false });
    if (++r.hits >= HOSTILE_HITS && !r.hostile) { r.hostile = true; s.events.push({ t: 'district_hostile', zone: q.zone }); }
    for (const o of s.enemies) { const oq = s.sq[o.sq]; if (oq && oq.zone === q.zone && hyp(o.x - e.x, o.y - e.y) < 400) oq.angry = true; } // witnesses
    s.events.push({ t: 'provoked', zone: q.zone, x: e.x, y: e.y });
  }
  const nearPlayer = (s, x, y, r) => Object.values(s.players).some(p => !p.dead && hyp(p.x - x, p.y - y) < r);

  // ---------------- day / night + population director ----------------
  // Day 10:00-16:00 (6 h), night 18 h. Civilians walk home from 15:30 (RETURN_HOME), street gangs/dogs only at night, ППС outside the Administration only by day.
  // The director keeps every district at its table target (behavior/factions.js SPAWN_TABLE): civ = dayCap*civRatio by day; armed = (cap-civ)*hostileK(level).
  const hourOf = (s) => s.hour == null ? 15 : s.hour;
  const isDay = (s) => B.isDay(hourOf(s)); const homeTime = (s) => B.returnHome(hourOf(s));
  const MAX_ENEMIES = 760;
  function despawn(s, E, e) {
    const i = s.enemies.indexOf(e); if (i >= 0) s.enemies.splice(i, 1);
    delete E.alive[e.id]; const q = s.sq[e.sq]; if (q) q.members = q.members.filter(id => id !== e.id);
  }
  const isCiv = (e) => e.type === 'civ', isDog = (e) => e.type === 'dog';
  function templatesFor(s, E, zid, day) {
    const list = (E.plan[zid] || []).filter(q => (q[2] ? (q[2] === 'day') === day : (!TYPES[q[0]].when || (TYPES[q[0]].when === 'day') === day)));
    return list;
  }
  function census(s, API) { // { zoneId: { civ, armed, dogs } } by the squad's district
    const T = {}; if (!s.sq || !s.map || !s.map.zones) return T; for (const z of s.map.zones) T[z.id] = { civ: 0, armed: 0, dogs: 0 };
    for (const e of s.enemies) { if (e.hp <= 0 || e.dead) continue; const q = s.sq[e.sq], zid = q && q.zone; if (!zid || !T[zid]) continue; if (q.leaving) continue; if (isCiv(e)) T[zid].civ++; else if (isDog(e)) T[zid].dogs++; else T[zid].armed++; }
    return T;
  }
  function population(s, API, E, players, budget, popIn) {
    const day = isDay(s), civOk = day && !homeTime(s), V = window.WL_VISION, free = freeFn(s, API);
    let lvl = 1; for (const p of players) lvl = Math.max(lvl, p.level || 1);
    const T = census(s, API); let made = 0;
    for (const z of s.map.zones) {
      const tg = B.target(z.id, day, lvl, z.id === E.home); if (!tg) continue; const c = T[z.id];
      if (!civOk) tg.civ = 0;
      const place = (sq) => { // runtime spawns must not pop up in sight of a player
        if (!popIn || !sq) return sq;
        for (const id of sq.members) { const m = s.enemies.find(q => q.id === id); if (m && players.some(p => hyp(p.x - m.x, p.y - m.y) < 260 || (V && V.playerSees(s, p, m)))) { for (const i2 of sq.members.slice()) { const m2 = s.enemies.find(q => q.id === i2); if (m2) despawn(s, E, m2); } return null; } }
        return sq;
      };
      // civilians: appear at doors of the district
      for (let k = 0; k < 40 && c.civ < tg.civ && made < budget && s.enemies.length < MAX_ENEMIES; k++) {
        const sq = place(spawnSquad(s, API, z, 'civ', 1)); if (!sq) { if (popIn) break; continue; }
        const m = s.enemies.find(q => q.id === sq.members[0]); if (m) { const dh = doorHome(s, m.x, m.y); if (dh) { sq.home = dh; sq.homeDoor = true; if (m.arch === 'CIV_ADULT_M' || !popIn || API.rnd(s) < 0.6) { const o = randFree(s, API, free, dh.x, dh.y, 10, 30, null, 6); if (o) { m.x = o.x; m.y = o.y; } } } m.homeD = sq.home; }
        c.civ++; made++;
      }
      // dogs (night only, no home)
      for (let k = 0; k < 10 && c.dogs < tg.dogs && made < budget && s.enemies.length < MAX_ENEMIES; k++) { const n = Math.min(2, tg.dogs - c.dogs), sq = place(spawnSquad(s, API, z, 'dog', n)); if (!sq) { if (popIn) break; continue; } c.dogs += sq.members.length; made++; }
      // armed squads from the district's template list, round-robin; the last squad is trimmed to the target
      const tl = templatesFor(s, E, z.id, day);
      for (let k = 0; k < 20 && tl.length && c.armed < tg.armed && made < budget && s.enemies.length < MAX_ENEMIES; k++) {
        const i = (E.cyc[z.id] = ((E.cyc[z.id] == null ? API.ri(s, 0, tl.length - 1) : E.cyc[z.id]) + 1) % tl.length), [t, n0, w] = tl[i], def = TYPES[t];
        let n = n0; if (def.fac === 'street' && def.role === 'gun') n = API.ri(s, 3, 3); // "Shakal" street gangs: 3-5
        const room = tg.armed - c.armed; if (n > room && room >= 1 && (n > 3 || room < n)) n = Math.max(def.fac === 'admin' ? 3 : 1, room); // PPS patrols are always triples
        const sq = place(spawnSquad(s, API, z, t, n)); if (!sq) { if (popIn) break; continue; }
        sq.when = w || def.when || null; c.armed += sq.members.length; made++;
      }
    }
    return made;
  }
  function dayNight(s, API, E, players) {
    const day = isDay(s), V = window.WL_VISION;
    E.dn = (E.dn || 0) - 1; if (E.dn > 0) return; E.dn = 30; // twice per second
    if (E.phase !== day) { if (E.phase !== undefined) { E.burst = 16; } E.phase = day; } // clock flipped: refill the streets quickly
    for (const e of s.enemies.slice()) { // those whose time is over go home / hide, but only out of sight of the players
      const sqE = s.sq[e.sq], tw = sqE && sqE.when;
      if (!isCiv(e) && !isDog(e) && !tw) continue; if (e.hp <= 0 || e.dead) continue;
      const wrong = isCiv(e) ? !day : isDog(e) ? day : (tw === 'day') !== day;
      if (wrong && sqE) sqE.leaving = true;
      if (wrong && !(e.m === 'combat' || e.m === 'flee') && !players.some(p => V ? V.playerSees(s, p, e) : hyp(p.x - e.x, p.y - e.y) < 200)) despawn(s, E, e);
    }
    const budget = E.burst > 0 ? 8 : 2; if (E.burst > 0) E.burst--;
    if (s.enemies.length < MAX_ENEMIES) population(s, API, E, players, budget, true);
    nearLife(s, API, E, players, day); // живые улицы рядом с игроком
    if (!day) nightPressure(s, API, E, players); // v62: ночью рядом с игроком всегда есть с кем драться
  }
  // v62: ночью в радиусе 120 м от игрока держим не меньше NIGHT_NEAR враждебных вооружённых; недостающие отряды появляются в 55-110 м вне поля зрения
  // и сразу идут к игроку (SUSPICIOUS: «слышали шум»), так что встреча на любом районе гарантирована. Своя банда не считается и не спавнится.
  const NIGHT_NEAR = 16, NEAR_R = 1200;
  function nightPressure(s, API, E, players) {
    const V = window.WL_VISION, free = freeFn(s, API);
    for (const p of players) {
      if (s.enemies.length >= MAX_ENEMIES + 12) return;
      let have = 0; for (const e of s.enemies) { if (e.hp <= 0 || e.dead || isCiv(e) || isDog(e) || hyp(e.x - p.x, e.y - p.y) > NEAR_R) continue; if (stanceOf(s, e) === 'hostile') have++; }
      if (have >= NIGHT_NEAR) continue;
      for (let k = 0; k < 16; k++) {
        const pt = randFree(s, API, free, p.x, p.y, 550, 1100, null, 3); if (!pt || (V && V.playerSees(s, p, pt))) continue;
        const z = API.zoneAt(s, pt.x, pt.y); if (!z) continue;
        { const tg0 = B.target(z.id, false, 1, false), ca = (census(s, API)[z.id] || {}).armed || 0; if (tg0 && ca > Math.max(40, tg0.armed * 2.5)) continue; } // a district never gets more than 2.5x its night table
        let tl = templatesFor(s, E, z.id, false).filter(q => { const f = TYPES[q[0]].fac; return f !== s.playerFac && f !== 'admin' && f !== 'coalition'; });
        if (!tl.length) tl = Object.keys(TYPES).filter(t => TYPES[t].fac === 'street' && TYPES[t].role === 'gun').map(t => [t, 3]);
        if (!tl.length) continue;
        const [t, n0] = tl[API.ri(s, 0, tl.length - 1)], def = TYPES[t]; let n = n0; if (def.fac === 'street' && def.role === 'gun') n = API.ri(s, 3, 3);
        const sq = spawnSquad(s, API, z, t, n); if (!sq) continue; // spawned in the district, then carried to the ring point (spawnEnemy refuses 'near' spots under 9 m)
        sq.when = 'night'; sq.zone = z.id; const leader = s.enemies.find(q => q.id === sq.members[0]);
        if (leader) { leader.x = pt.x; leader.y = pt.y; sq.home = { x: pt.x, y: pt.y }; sq.homeDoor = false; sq.members.forEach((id, i) => { const m = s.enemies.find(q => q.id === id); if (m && i > 0) { const o = randFree(s, API, free, pt.x, pt.y, 24, 52, null, 8); if (o) { m.x = o.x; m.y = o.y; } } if (m) { m.path = null; m.lx = m.x; m.ly = m.y; } });
          if (sq.route && sq.route.length) { sq.route = []; for (let k2 = 0; k2 < 4; k2++) { const o = randFree(s, API, free, pt.x, pt.y, 120, 320, z, 8); if (o) sq.route.push(o); } } }
        if (leader && V && V.playerSees(s, p, leader)) { for (const id of sq.members.slice()) { const m = s.enemies.find(q => q.id === id); if (m) despawn(s, E, m); } continue; }
        sq.known = { x: p.x, y: p.y, t: s.t - 2 }; for (const id of sq.members) { const m = s.enemies.find(q => q.id === id); if (m) { m.alert = Math.max(m.alert || 0, 2); m.lx = p.x; m.ly = p.y; } }
        break;
      }
    }
  }
  // днём не меньше 3 жителей в 15-45 м от игрока, ночью не меньше 2 собак; появляются вне конуса обзора (иначе игрок их не видит: обзор 35 м, а районные жители могут стоять дальше)
  function nearLife(s, API, E, players, day) {
    const civOk = day && !homeTime(s), want = civOk ? 'civ' : !day ? 'dog' : null, V = window.WL_VISION; if (!want) return;
    const free = freeFn(s, API), need = want === 'civ' ? 3 : 4;
    for (const p of players) {
      let have = 0; for (const e of s.enemies) if ((want === 'civ' ? isCiv(e) : isDog(e)) && e.hp > 0 && !e.dead && hyp(e.x - p.x, e.y - p.y) < 450) have++;
      if (have >= need || s.enemies.length >= MAX_ENEMIES + 12) continue;
      let q = null;
      for (let k = 0; k < 14 && !q; k++) { const pt = randFree(s, API, free, p.x, p.y, 150, 440, null, 3); if (!pt || (V && V.playerSees(s, p, pt))) continue; const z = API.zoneAt(s, pt.x, pt.y); if (z) q = { pt, z }; }
      if (!q) continue;
      // численность района не растёт: переносим к игроку жителя из того же района, которого игрок не видит
      let m = null, bd = 0; for (const e of s.enemies) { if (!(want === 'civ' ? isCiv(e) : isDog(e)) || e.hp <= 0 || e.dead || e.m === 'combat' || e.m === 'flee') continue; const sq0 = s.sq[e.sq]; if (!sq0 || sq0.zone !== q.z.id || (sq0.members && sq0.members.length > 1)) continue; const d = hyp(e.x - p.x, e.y - p.y); if (d < 450 || players.some(pp => V && V.playerSees(s, pp, e))) continue; if (d > bd) { bd = d; m = e; } }
      if (!m) continue; const sq = s.sq[m.sq];
      m.x = q.pt.x; m.y = q.pt.y; m.path = null; sq.home = { x: m.x, y: m.y };
      if (want === 'civ') { const dh = doorHome(s, m.x, m.y); if (dh) { sq.home = dh; sq.homeDoor = true; } m.homeD = sq.home; }
    }
  }

  // ---------------- main step ----------------
  const SIM_R = 2600; // 260 m: the active bubble around the player (TDD: 250 m); everything farther sleeps
  // --- spatial hash grid, 50 m cells (TDD 7) ---
  const CELL = 500;
  function buildGrid(list) { const g = new Map(); for (const e of list) { const k = Math.floor(e.x / CELL) * 100003 + Math.floor(e.y / CELL); let a = g.get(k); if (!a) g.set(k, a = []); a.push(e); } return g; }
  function gridNear(g, x, y, r, fn) { const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL), y0 = Math.floor((y - r) / CELL), y1 = Math.floor((y + r) / CELL); for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) { const a = g.get(i * 100003 + j); if (a) for (const e of a) fn(e); } }
  function setWanted(s, E, why) { // minimal wanted flag (README has none yet): killing a civilian or a ППС officer
    if (!E.wanted) for (const id in s.players) s.events.push({ t: 'msg', pid: id, text: 'РОЗЫСК: ' + why + '. ППС стреляет без предупреждения' });
    E.wanted = true; E.wantedUntil = s.t + 600; for (const id in s.players) s.players[id].wanted = true;
  }
  // --- event bus: sounds (TDD 7.2). Events are consumed once (ev._b). Builder hook: WL_ENEMIES.noise(s, x, y, 'door') for door breaking / glass ---
  function sounds(s, API, E, players) {
    const day = isDay(s);
    for (const ev of s.events) { // attack on ППС / Coalition guards / civilians = order violation
      if (ev.t !== 'hit' || ev._h || ev.player || ev.why !== 'player' || !ev.tt) continue; ev._h = 1;
      const td = TYPES[ev.tt]; if (!td) continue;
      if (ev.tt === 'civ') setWanted(s, E, 'нападение на мирного'); else if (td.fac === 'admin') setWanted(s, E, 'нападение на ППС');
      else if (td.fac === 'coalition' && !E.portShot) { E.portShot = true; for (const id in s.players) s.events.push({ t: 'msg', pid: id, text: 'Нападение на охрану Коалиции: Коалиция теперь враждебна' }); }
    }
    for (const ev of s.events) {
      if (ev._b || (ev.t !== 'shot' && ev.t !== 'noise')) continue; ev._b = 1;
      let R = ev.t === 'noise' ? B.SOUND.door : (day ? B.SOUND.shotDay : B.SOUND.shotNight); if (ev.quiet) R *= 0.25;
      if (ev.t === 'shot' && ev.by === 'players') {
        E.lastShotT = s.t; const z = API.zoneAt(s, ev.x, ev.y);
        if (z && ADMIN_SET.has(z.id)) setWanted(s, E, 'выстрел в зоне Администрации');
        if (z && z.id === B.PORT && !E.portShot) { E.portShot = true; for (const id in s.players) s.events.push({ t: 'msg', pid: id, text: 'Выстрел в порту: Коалиция теперь враждебна' }); }
      }
      gridNear(E.g, ev.x, ev.y, R, (e) => {
        const d = hyp(e.x - ev.x, e.y - ev.y); if (d > R || e.hp <= 0 || e.dead) return;
        if (isCiv(e)) { if (ev.t === 'shot' && d < B.SOUND.civFlee) { e.fleeT = 10; e.rep = null; } return; } // civilians within 45 m: FLEE_COVER
        if (isDog(e) || e.m === 'combat' || e.m === 'flee') return;
        const q = s.sq[e.sq], def = TYPES[e.type]; if (!q) return;
        if (def.fac === 'street' && ev.t === 'shot') { if (d < B.SOUND.shakalListen) { if (!q.shk) q.shk = { x: ev.x, y: ev.y, last: s.t }; else { q.shk.x = ev.x; q.shk.y = ev.y; q.shk.last = s.t; } } return; } // "Shakal": wait at the edge, loot later
        if (q.heardT != null && s.t - q.heardT < 5) return; // one reaction per squad per 5 s
        if (API.rnd(s) > 0.5 * (1 - d / R)) { q.heardT = s.t; return; }
        q.heardT = s.t; q.known = { x: ev.x, y: ev.y, t: s.t - 2 }; // SUSPICIOUS: go and look
        e.alert = Math.max(e.alert, 2); e.lx = ev.x; e.ly = ev.y;
      });
    }
  }
  function step(s, dt, API) {
    if (s.mode === 'base' || !s.map || !s.map.zones || !s.map.zones.length) return; // base is empty; legacy maps are not supported here
    if (!s._e) init(s, API);
    const E = s._e, free = freeFn(s, API), bud = { n: 1 }; // A*: at most 1 request per tick
    if (s.homeDistrict && s.homeDistrict !== E.home) E.home = s.homeDistrict; // selector may set it after init
    const players = Object.values(s.players).filter(p => !p.dead && !p.extracted);
    if (E.wanted && s.t > E.wantedUntil) { E.wanted = false; for (const id in s.players) s.players[id].wanted = false; }

    // deaths since the previous tick: custom loot, squad reaction
    const alive = {};
    for (const e of s.enemies) { alive[e.id] = e; e.neu = neutral(s, e); }
    for (const id in E.alive) if (!alive[id]) onDeath(s, API, E.alive[id]);
    E.alive = alive;
    E.g = buildGrid(s.enemies);
    sounds(s, API, E, players);

    // LOD: only enemies near a player are simulated; the rest sleep (the world is ~29000 px wide)
    const act = [];
    for (const e of s.enemies) { let near = e.alert > 0 || e.m === 'combat' || e.m === 'flee' || e.m === 'search'; if (!near) for (const p of players) if (Math.abs(p.x - e.x) < SIM_R && Math.abs(p.y - e.y) < SIM_R) { near = true; break; } if (near || !players.length) act.push(e); }
    for (const e of act) tick(s, API, e, dt, players, bud, free);

    const ag = buildGrid(act); // separation through the grid
    for (const a of act) gridNear(ag, a.x, a.y, 16, (b) => {
      if (b.id <= a.id) return; const dx = b.x - a.x, dy = b.y - a.y, d = hyp(dx, dy), m = a.r + b.r;
      if (d > 0 && d < m) { const k = (m - d) / 2 / d; a.x -= dx * k; a.y -= dy * k; b.x += dx * k; b.y += dy * k; }
    });

    dayNight(s, API, E, players);
    E.nextCont = s.nextId; // bodies created later this tick (by bullets) get ids >= this
    for (const k in s.sq) if (!s.sq[k].members.length) delete s.sq[k];
  }

  function onDeath(s, API, d) {
    const def = TYPES[d.type]; if (!def) return;
    const byPlayer = nearPlayer(s, d.lx, d.ly, 14), E0 = s._e;
    if (d.neu && byPlayer) provoke(s, d); // killed by the player while neutral
    if (byPlayer && E0) { if (d.type === 'civ') setWanted(s, E0, 'убит гражданский'); else if (def.fac === 'admin') setWanted(s, E0, 'убит сотрудник ППС'); }
    { const sq0 = s.sq[d.sq]; // "Shakal": leader dead or half of the group dead -> the group runs
      if (sq0 && def.fac === 'street' && sq0.size0 >= 3 && d.type !== 'dog') { const alv = sq0.members.filter(id => id !== d.id && s.enemies.some(q => q.id === id)); if (d.id === sq0.lead0 || alv.length * 2 <= sq0.size0) for (const id of alv) { const m = s.enemies.find(q => q.id === id); if (m && m.m !== 'flee') { m.lx = d.x; m.ly = d.y; setM(m, 'flee'); m.mt = 7; } } } }
    for (const o of s.enemies) { // squad mates and close neighbours hear / see it
      const own = o.sq === d.sq, dd = hyp(o.x - d.x, o.y - d.y);
      if ((own && dd < 600) || dd < 220) { o.alert = Math.max(o.alert, 5); o.lx = d.x; o.ly = d.y; }
      if (own && def.role === 'rush') o.morale = (o.morale || 0) + 1;
    }
    const sq = s.sq[d.sq]; if (sq) sq.members = sq.members.filter(id => s.enemies.some(q => q.id === id));
    // sim.js already dropped a generic body: replace its contents with the type's own table
    let body = null;
    for (const c of s.containers) if (c.kind === 'body' && !c.searched && !c.loot && c.id >= s._e.nextCont && hyp(c.x - d.x, c.y - d.y) < 3) { body = c; break; }
    const L = def.loot; if (!L) return;
    if (API.rnd(s) >= L.chance) { if (body) s.containers = s.containers.filter(c => c !== body); return; }
    if (!body) { body = { id: s.nextId++, kind: 'body', x: d.x, y: d.y, searched: false }; s.containers.push(body); }
    body.loot = rollLoot(s, API, L, d.carry);
    if (!body.loot.length) s.containers = s.containers.filter(c => c !== body);
  }
  function rollLoot(s, API, L, bonus) {
    const table = L.table.filter(r => C.ITEMS[r[0]]); if (!table.length) return [];
    const total = table.reduce((a, r) => a + r[3], 0), out = [], n = API.ri(s, L.rolls[0], L.rolls[1]) + Math.min(2, bonus || 0);
    for (let i = 0; i < n; i++) {
      let x = API.rnd(s) * total;
      for (const r of table) { x -= r[3]; if (x <= 0) { out.push([r[0], API.ri(s, r[1], r[2])]); break; } }
    }
    return out;
  }

  // ---------------- one enemy ----------------
  function tick(s, API, e, dt, players, bud, free) {
    const def = TYPES[e.type]; if (!def || !e.m) return; // not ours (should not happen)
    const sq = s.sq[e.sq] || null;
    const stim = e.alert > e.pa + 1e-6; // noise / damage raised alert since our last tick (sim.js sets lx,ly)
    e.alert = Math.max(0, e.alert - dt); e.cool -= dt; e.st -= dt; e.hitFlash = Math.max(0, e.hitFlash - dt);
    e.pause -= dt; e.mt -= dt; e.ct -= dt;

    const stc = stanceOf(s, e), neu = stc === 'neutral', warnSt = stc === 'warn'; e.neu = neu;
    if (e.type === 'civ') civBrain(s, API, s._e, e, sq, players, dt);
    if (e.hp < e.php - 1e-6) { // took damage: if the player did it to a neutral mob, the squad turns hostile
      if ((neu || warnSt) && stim && nearPlayer(s, e.lx, e.ly, 12)) { provoke(s, e); if (e.m === 'warn') setM(e, 'combat'); }
      e.php = e.hp;
    }
    let tgt = null, td = 1e9;
    for (const p of neu ? [] : players) { const dd = hyp(p.x - e.x, p.y - e.y); if (dd < td) { td = dd; tgt = p; } }
    const aware = e.m === 'combat' || e.m === 'flee' || e.m === 'search';
    let sees = false;
    const sightR = Math.min(def.sight, VIEW.r);
    const stl = window.WL_COMBAT ? WL_COMBAT.stealth(tgt) : 1; // prone / still / in bushes: noticed from closer
    const lk = Math.min(1.25, B.lightRange(isDay(s) ? 0.65 : 0.12, false) * (e.sightK || 1)); // light changes the 16 m detection range by +-25% at most (project rule)
    if (window.WL_VISION && tgt) sees = WL_VISION.mobSees(s, e, tgt, API, stl * lk); // shared cone: 110 deg, 16 m, 3 m circle, line of sight (also for alerted mobs)
    else if (tgt && td < sightR * stl && API.los(s, e, tgt)) {
      const inCone = Math.abs(angDiff(Math.atan2(tgt.y - e.y, tgt.x - e.x), e.ang)) < def.fov * Math.PI / 180;
      sees = (aware || inCone || td < 90) && (aware || onScreen(tgt, e.x, e.y)); // unaware mobs only notice what the player can see
    }
    const noiseR = tgt ? (tgt.sprinting ? B.SOUND.run : tgt.moving ? B.SOUND.step : 0) * stl : 0; // footsteps 8 m, running 18 m (TDD 7.2)
    const smells = !!tgt && td < Math.min(VIEW.r, Math.max(def.sense * (tgt.sprinting ? 2.5 : 1), noiseR));
    let mx = 0, my = 0, sp = def.speed * (e.spdK || 1), want = false;
    const push = (a, b) => { mx += a; my += b; want = true; };
    const go = (gx, gy) => { const v = navDir(s, e, gx, gy, dt, bud, free); if (v) { mx += v.x; my += v.y; want = want || !v.done; } return v; };

    const known = sq && sq.known && s.t - sq.known.t < 6 ? sq.known : null; // squad / radio shared sighting
    if (sees) {
      e.lost = 0; e.lx = tgt.x; e.ly = tgt.y; e.alert = Math.max(e.alert, 4);
      if (sq) { sq.known = { x: tgt.x, y: tgt.y, t: s.t }; if (def.radio) radio(s, def, e, sq); }
    } else if (e.m === 'combat') e.lost += dt;

    // --- transitions ---
    if (e.m === 'combat') {
      if (!sees && e.lost > def.lose) { e.goal = { x: e.lx, y: e.ly }; setM(e, 'search'); e.mt = API.rr(s, 5, 8); }
    } else if (e.m === 'warn') { // WARN_HOLSTER: resolved in the behaviour block below
    } else if (e.m !== 'flee') {
      if (warnSt && sees) { // PPS by day / Coalition: weapon out -> 3 s to holster it
        setM(e, 'warn'); e.wt = B.WARN_HOLSTER; e.wlost = 0; e.look = 0; for (const id in s.players) s.events.push({ t: 'msg', pid: id, text: (def.fac === 'coalition' ? 'Охрана Коалиции: «Убери ствол!»' : 'ППС: «Убрать оружие! Три секунды!»') });
        s.events.push({ t: 'warn', x: e.x, y: e.y, type: e.type });
      } else if ((sees || smells) && !warnSt) {
        e.rt += dt; e.look = 0;
        turn(e, Math.atan2(tgt.y - e.y, tgt.x - e.x), 8, dt);
        if (e.rt >= def.react * DIFF.react * (td < 150 ? 0.5 : 1) * (e.m === 'search' ? 0.4 : 1)) { setM(e, 'combat'); e.rt = 0; e.lost = 0; s.events.push({ t: 'notice', x: e.x, y: e.y, type: e.type }); if (def.prof && def.prof.whistle && sq && !(sq.whT > s.t)) { sq.whT = s.t + 10; whistle(s, e, sq, def.prof.whistle); } }
        else { e.mode = e.m + '?'; e.pa = e.alert; return; } // noticing: freeze and stare
      } else {
        e.rt = Math.max(0, e.rt - dt * 2);
        if (known && e.m !== 'invest') { e.goal = { x: known.x, y: known.y }; setM(e, 'invest'); }
        else if (stim) { e.goal = { x: e.lx, y: e.ly }; if (e.m !== 'search' || hyp(e.lx - e.x, e.ly - e.y) > 80) setM(e, 'invest'); }
      }
    }

    // --- behaviour ---
    const face = () => { if (mx || my) turn(e, Math.atan2(my, mx), 6, dt); };
    if (e.m === 'warn') {
      sp = 0; if (tgt) turn(e, Math.atan2(tgt.y - e.y, tgt.x - e.x), 8, dt);
      e.wt -= dt; e.wlost = sees ? 0 : (e.wlost || 0) + dt;
      if (stc === 'hostile') { setM(e, 'combat'); e.rt = 0; e.lost = 0; }
      else if (stc === 'neutral' || e.wlost > 2.5) { setM(e, 'idle'); e.pause = API.rr(s, 1, 2); if (stc === 'neutral') for (const id in s.players) s.events.push({ t: 'msg', pid: id, text: 'Оружие убрано — вас пропускают' }); }
      else if (e.wt <= 0) { setM(e, 'combat'); e.rt = 0; e.lost = 0; s.events.push({ t: 'notice', x: e.x, y: e.y, type: e.type }); }
    } else if (e.m === 'combat') {
      if (e.cmd && sq) { sq.cT = (sq.cT || 0) + dt; if (sq.cT >= B.REINFORCE_AFTER && !sq.called) { sq.called = true; reinforce(s, e, sq, 2000); } } // commander calls the nearest post by radio after 15 s of fighting
      const tx = sees ? tgt.x : known ? known.x : e.lx, ty = sees ? tgt.y : known ? known.y : e.ly;
      turn(e, Math.atan2(ty - e.y, tx - e.x), 9, dt);
      sp = def.role === 'rush' ? combatRush(s, API, e, def, sq, tgt, td, sees, smells, tx, ty, go, free, dt) : combatGun(s, API, e, def, sq, tgt, td, sees, tx, ty, go, free, push, sp, dt);
    } else if (e.m === 'flee') {
      sp *= 1.1;
      if (!e.cover || e.ct <= 0) {
        e.cover = findCover(s, API, e, e.lx, e.ly, true, free);
        if (!e.cover) { const a = Math.atan2(e.y - e.ly, e.x - e.lx); e.cover = { x: e.x + Math.cos(a) * 200, y: e.y + Math.sin(a) * 200 }; }
        e.ct = 2.5;
      }
      go(e.cover.x, e.cover.y); face();
      if (e.mt <= 0 && !sees) { setM(e, 'combat'); e.fled = true; }
    } else if (e.m === 'invest') {
      sp *= 0.7;
      if (e.goal) { const v = go(e.goal.x, e.goal.y); if (!v || v.done) { setM(e, 'search'); e.mt = API.rr(s, 4, 7); } else face(); }
      else setM(e, 'return');
    } else if (e.m === 'search') { // look around at the last known position, then give up
      if (e.goal && hyp(e.goal.x - e.x, e.goal.y - e.y) > 40) { go(e.goal.x, e.goal.y); sp *= 0.6; face(); }
      else { e.look += dt; e.ang += Math.sin(e.look * 1.4) * 1.6 * dt; sp = 0; }
      if (e.mt <= 0) { e.goal = null; setM(e, 'return'); }
    } else if (e.m === 'return') {
      sp *= 0.55; const h = sq && sq.home ? sq.home : { x: e.x, y: e.y };
      const v = go(h.x, h.y);
      if (!v || v.done || hyp(h.x - e.x, h.y - e.y) < 70) { setM(e, 'idle'); e.goal = null; e.pause = API.rr(s, 1, 3); } else face();
    } else sp *= idle(s, API, e, def, sq, go, free, dt, face);

    // --- movement + stuck check ---
    const ml = hyp(mx, my); if (ml > 1) { mx /= ml; my /= ml; }
    e.x += mx * sp * dt; e.y += my * sp * dt; API.collide(s, e);
    e.moving = ml > 0.1 && sp > 0;
    e.sk -= dt;
    if (e.sk <= 0) {
      e.sk = 0.5;
      if (want && hyp(e.x - e.sx, e.y - e.sy) < sp * 0.5 * 0.25) { e.rp = 0; e.dk = 0; e.direct = false; e.path = null; e.goal = null; e.ct = 0; e.cover = null; }
      e.sx = e.x; e.sy = e.y;
    }
    if (e.cmd && sq && e.m !== 'combat') { sq.cT = 0; sq.called = false; }
    e.pa = e.alert; e.php = e.hp; e.ai = aiName(e, def, sq);
  }

  // names of the TDD finite-state machine for HUD / tests
  function aiName(e, def, sq) {
    if (e.m === 'warn') return 'WARN_HOLSTER'; if (e.m === 'combat') return 'COMBAT_ENGAGE'; if (e.m === 'flee') return 'FLEE_COVER'; if (e.m === 'invest' || e.m === 'search') return 'SUSPICIOUS';
    if (e.type === 'civ') return e.report ? 'REPORT_THREAT' : e.fleeT > 0 ? 'FLEE_COVER' : e.homing ? 'RETURN_HOME' : 'DAILY_ROUTINE';
    if (sq && sq.shk && e.lootT) return 'LOOT_BODY';
    return def.idle === 'patrol' && !(sq && sq.post) ? 'PATROL' : 'IDLE_GUARD';
  }
  // GADGET: whistle (Kholodnogorskie): squads of the same gang within R run to the sighting
  function whistle(s, e, sq, R) { for (const k in s.sq) { const o = s.sq[k]; if (o === sq || o.fac !== sq.fac || !o.home) continue; if (hyp(o.home.x - e.x, o.home.y - e.y) < R) o.known = { x: sq.known ? sq.known.x : e.x, y: sq.known ? sq.known.y : e.y, t: s.t }; } }
  // commander's radio: other Administration squads (posts, blockposts) get the sighting
  function reinforce(s, e, sq, R) { for (const k in s.sq) { const o = s.sq[k]; if (o === sq || o.fac !== 'admin' || !o.members.length) continue; const lead = s.enemies.find(q => q.id === o.members[0]); if (lead && hyp(lead.x - e.x, lead.y - e.y) < R) o.known = { x: sq.known ? sq.known.x : e.x, y: sq.known ? sq.known.y : e.y, t: s.t }; } s.events.push({ t: 'radio', x: e.x, y: e.y }); }
  function setM(e, m) { e.m = m; e.mode = m; e.path = null; e.rp = 0; e.cover = null; e.ct = 0; e.peek = null; }

  // share a sighting with other squads of the same type within radio range (militia)
  function radio(s, def, e, sq) {
    for (const k in s.sq) {
      const o = s.sq[k]; if (o === sq || o.type !== sq.type || !o.home) continue;
      if (hyp(o.home.x - e.x, o.home.y - e.y) < def.radio && (!o.known || s.t - o.known.t > 3)) o.known = { x: sq.known.x, y: sq.known.y, t: s.t };
    }
  }

  // ---------------- idle behaviours; returns a speed multiplier ----------------
  function idle(s, API, e, def, sq, go, free, dt, face) {
    if (e.type === 'civ') {
      const home = e.homeD || (sq && sq.home), E = s._e;
      if (e.report) { // REPORT_THREAT (teens): run to the nearest squad of the gang and give the player's position
        let tg = e.rSq && s.sq[e.rSq]; if (!tg || !tg.members.length) { tg = null; let bd = 1e9; for (const k in s.sq) { const o = s.sq[k]; if (!o.members.length || o.type === 'civ' || o.type === 'dog' || !o.fac || (sq && o.zone !== sq.zone)) continue; const l = s.enemies.find(q => q.id === o.members[0]); const d = l ? hyp(l.x - e.x, l.y - e.y) : 1e9; if (d < bd) { bd = d; tg = o; } } e.rSq = tg ? tg.id : null; }
        const lead = tg && s.enemies.find(q => q.id === tg.members[0]);
        if (!lead) e.report = null;
        else if (hyp(lead.x - e.x, lead.y - e.y) < 50) { tg.known = { x: e.report.x, y: e.report.y, t: s.t }; for (const id of tg.members) { const m = s.enemies.find(q => q.id === id); if (m) { m.alert = Math.max(m.alert, 4); m.lx = e.report.x; m.ly = e.report.y; } } e.report = null; e.rSq = null; e.fleeT = 3; s.events.push({ t: 'district_alert', x: e.x, y: e.y, severity: 1, by: 'scout' }); }
        else { go(lead.x, lead.y); face(); e.pause = 0; return e.runK || 2; }
      }
      e.fleeT = Math.max(0, (e.fleeT || 0) - dt);
      e.homing = e.fleeT > 0 || homeTime(s); // RETURN_HOME from 15:30 until 10:00 (TDD fix: OR), or FLEE_COVER from gunfire
      if (e.homing && home) { if (hyp(home.x - e.x, home.y - e.y) < 26) { const zid = sq && sq.zone; if (E && zid) E.off[zid] = (E.off[zid] || 0) + 1; despawn(s, E, e); return 0; } const v = go(home.x, home.y); if (v && !v.done) face(); e.pause = 0; return e.fleeT > 0 ? (e.runK || 2) : 1; }
      if (e.arch === 'CIV_ELDER' && home && hyp(home.x - e.x, home.y - e.y) > B.ARCH.CIV_ELDER.leash) { go(home.x, home.y); face(); e.pause = 0; return 1; } // leash 60 m from the entrance
    }
    const lead = sq && sq.members.length ? s.enemies.find(q => q.id === sq.members[0]) : null;
    const follower = lead && lead !== e && def.idle !== 'scav' && def.idle !== 'roam';
    if (e.pause > 0) { e.look += dt; e.ang += Math.sin(e.look * 0.9 + e.id) * 0.5 * dt; return 0; } // standing, looking around
    if (follower) { // hold formation behind the leader
      const back = lead.ang + Math.PI + (e.idx % 2 ? 0.5 : -0.5), k = 34 * Math.pow(e.idx, 0.7), sx = lead.x + Math.cos(back) * k, sy = lead.y + Math.sin(back) * k;
      if (hyp(sx - e.x, sy - e.y) > 30) { const v = go(sx, sy); if (v && !v.done) face(); return hyp(lead.x - e.x, lead.y - e.y) > 120 ? 0.8 : 0.45; }
      e.pause = API.rr(s, 0.5, 1.5); return 0;
    }
    if (def.fac === 'street' && e.type !== 'dog' && !follower) { const r = shakal(s, API, e, def, sq, go, free, dt, face); if (r != null) return r; }
    if (def.idle === 'patrol' && sq && sq.route.length && !sq.post) {
      const wp = sq.route[sq.ri % sq.route.length], v = go(wp.x, wp.y);
      if (!v || v.done || hyp(wp.x - e.x, wp.y - e.y) < 40) { sq.ri++; e.pause = API.rr(s, 2, 4); } else face();
      return 0.45;
    }
    if (def.idle === 'scav') { // walk to a nearby unsearched container and "search" it; may carry extra loot afterwards
      if (!e.goal) {
        let best = null, bd = 450;
        for (const c of s.containers) { if (c.searched || e.vis.includes(c.id)) continue; const d = hyp(c.x - e.x, c.y - e.y); if (d < bd) { bd = d; best = c; } }
        if (best) e.goal = { x: best.x, y: best.y, cid: best.id };
        else { e.goal = randFree(s, API, free, sq ? sq.home.x : e.x, sq ? sq.home.y : e.y, 80, 260, null); e.pause = API.rr(s, 2, 5); }
      }
      if (e.goal) {
        const v = go(e.goal.x, e.goal.y);
        if (!v || v.done || hyp(e.goal.x - e.x, e.goal.y - e.y) < 26) {
          if (e.goal.cid) { e.vis.push(e.goal.cid); if (e.vis.length > 4) e.vis.shift(); if (API.rnd(s) < 0.5) e.carry++; }
          e.goal = null; e.pause = API.rr(s, 2.5, 4.5);
        } else face();
      }
      return 0.4;
    }
    // loiter / roam / post: short walks around home
    const home = sq && sq.home ? sq.home : { x: e.x, y: e.y }, R = def.idle === 'roam' ? 300 : sq && sq.post ? 35 : 100;
    if (!e.goal) { e.goal = randFree(s, API, free, home.x, home.y, 20, R, null); if (!e.goal) e.pause = 2; }
    if (e.goal) {
      const v = go(e.goal.x, e.goal.y);
      if (!v || v.done || hyp(e.goal.x - e.x, e.goal.y - e.y) < 22) { e.goal = null; e.pause = def.idle === 'roam' ? API.rr(s, 0.5, 2) : API.rr(s, 2, sq && sq.post ? 9 : 6); } else face();
    }
    return def.idle === 'roam' ? 0.5 : 0.35;
  }

  // "Shakal" street gangs: keep away from ППС and big gangs, wait at the edge of the sound, loot bodies afterwards. Returns a speed multiplier or null.
  function shakal(s, API, e, def, sq, go, free, dt, face) {
    const E = s._e; let thr = null; const R = B.SOUND.shakalAvoidPPS;
    gridNear(E.g, e.x, e.y, R, (o) => { if (thr || o.hp <= 0 || o.dead || o.type === 'civ' || o.type === 'dog') return; const od = TYPES[o.type]; if (od && od.fac && od.fac !== 'street' && hyp(o.x - e.x, o.y - e.y) < R) thr = o; });
    if (thr) { const a = Math.atan2(e.y - thr.y, e.x - thr.x), gx = e.x + Math.cos(a) * 150, gy = e.y + Math.sin(a) * 150; if (free(gx, gy)) { go(gx, gy); face(); e.pause = 0; e.lootT = 0; return 0.9; } }
    const k = sq && sq.shk; if (!k) { e.lootT = 0; return null; }
    if (s.t - k.last < B.SOUND.shakalWait) { // wait ~35 m from the epicentre, 10 s after the last shot
      if (!k.wp) { const a0 = Math.atan2(e.y - k.y, e.x - k.x); k.wp = { x: e.x, y: e.y }; for (let j = 0; j < 8; j++) { const a = a0 + (j % 2 ? 1 : -1) * Math.ceil(j / 2) * 0.35, x = k.x + Math.cos(a) * B.SOUND.shakalStandoff, y = k.y + Math.sin(a) * B.SOUND.shakalStandoff; if (free(x, y)) { k.wp = { x, y }; break; } } }
      e.lootT = 0; if (hyp(k.wp.x - e.x, k.wp.y - e.y) > 30) { go(k.wp.x, k.wp.y); face(); e.pause = 0; return 0.9; } e.look += dt; e.ang += Math.sin(e.look * 1.2) * 0.8 * dt; return 0;
    }
    let body = null, bd = 700; for (const c of s.containers) { if (c.kind !== 'body' || c.searched) continue; const d = hyp(c.x - k.x, c.y - k.y); if (d < bd) { bd = d; body = c; } }
    if (!body) { sq.shk = null; e.lootT = 0; return null; }
    e.lootT = 1; if (hyp(body.x - e.x, body.y - e.y) < 20) { body.searched = true; body.loot = []; e.carry++; e.pause = 1.5; return 0; } go(body.x, body.y); face(); e.pause = 0; return 0.8; // LOOT_BODY
  }
  // Civilian scripts: tokens at gunpoint, elders as "living cameras", teens as scouts / pickpockets (TDD 5.1-5.3)
  function civBrain(s, API, E, e, sq, players, dt) {
    const P = players[0]; if (!P || !E) return;
    const d = hyp(P.x - e.x, P.y - e.y), z = sq && sq.zone, gangZone = !!(z && FACTIONS.gangs.districts[z]), stranger = !!z && z !== E.home;
    if (!e.paid && d < 40 && P.aiming) { // aimed at point blank (< 4 m): 65% to drop 1-3 metro tokens
      const a = Math.atan2(e.y - P.y, e.x - P.x), w = Math.atan2((P.ay || P.y) - P.y, (P.ax || P.x) - P.x);
      if (Math.abs(angDiff(a, w)) < 0.35) { e.paid = true; e.fleeT = Math.max(e.fleeT || 0, 6); if (API.rnd(s) < B.TOKEN_DROP && C.ITEMS.token) { const n = API.ri(s, 1, 3); API.invAdd(P, 'token', n); s.events.push({ t: 'msg', pid: P.id, text: 'Прохожий сунул жетоны: ×' + n }); } }
    }
    if (e.fleeT > 0 || e.report) return;
    if (e.arch === 'CIV_ELDER' && gangZone) { // living camera: 15 m scan, suspicion +25/s, at 100 -> into the entrance + alert to the gang patrol within 120 m
      if (d < B.ELDER_SCAN * (e.sightK || 1) && stranger && API.los(s, e, P)) e.susp += B.ELDER_RATE * dt * (weaponOut(s, P) ? 2 : 1); else e.susp = Math.max(0, e.susp - 10 * dt);
      if (e.susp >= 100) { e.susp = 0; e.fleeT = 8; let n = 0; for (const k in s.sq) { const o = s.sq[k]; if (!o.members.length || !o.fac || o.type === 'civ' || o.zone !== z) continue; const l = s.enemies.find(q => q.id === o.members[0]); if (l && hyp(l.x - e.x, l.y - e.y) < B.ELDER_ALERT_R) { o.known = { x: P.x, y: P.y, t: s.t }; n++; } } s.events.push({ t: 'district_alert', x: e.x, y: e.y, severity: 1, n, by: 'elder' }); }
    } else if (e.arch === 'CIV_TEEN') {
      if (gangZone && stranger && d < 160 * (e.sightK || 1) && Math.abs(angDiff(Math.atan2(P.y - e.y, P.x - e.x), e.ang)) < 0.96 && API.los(s, e, P)) { e.report = { x: P.x, y: P.y }; e.rSq = null; }
      else if (!gangZone && z && P.search && d < 30 && !e.stole && API.rnd(s) < dt * 0.5 && Math.abs(angDiff(Math.atan2(e.y - P.y, e.x - P.x), P.face || 0)) > 1.9) { // pickpocket from behind while the player rummages
        const its = (P.inv || []).filter(i => i.n > 0 && i.id !== 'token'); if (its.length) { const it = its[API.ri(s, 0, its.length - 1)]; API.invTake(P, it.id, 1); e.stole = true; e.fleeT = 12; s.events.push({ t: 'msg', pid: P.id, text: 'Подросток стащил из рюкзака: ' + ((C.ITEMS[it.id] && C.ITEMS[it.id].name) || it.id) }); }
      }
    }
  }

  // ---------------- melee pack (gopnik, dogs); returns speed ----------------
  function combatRush(s, API, e, def, sq, tgt, td, sees, smells, tx, ty, go, free, dt) {
    const M = def.melee; let sp = def.speed;
    const mates = sq ? sq.members.length : 1;
    if (!e.fled && (e.hp / e.maxHp < def.fleeHp || (def.packFlee && sq && sq.size0 >= 3 && mates <= 1 && (e.morale || 0) >= 2))) { setM(e, 'flee'); e.mt = 5; e.lx = tx; e.ly = ty; return sp; }
    if (!tgt) return sp;
    if (e.wind > 0) { // winding up a strike: stand still; the hit lands only if the player stays within reach
      e.wind -= dt; sp = 0;
      if (e.wind <= 0) {
        if (td < e.r + tgt.r + M.range + 10) { API.damage(s, tgt, M.dmg * DIFF.dmg, e); s.events.push({ t: 'bite', x: tgt.x, y: tgt.y }); }
        e.cool = M.cd;
      }
      return sp;
    }
    if (sees && td < e.r + tgt.r + M.range && e.cool <= 0) { e.wind = M.wind; s.events.push({ t: 'threat', x: e.x, y: e.y, melee: true }); return 0; }
    let gx = tx, gy = ty; // surround: approach from different angles while far, straight in once close
    if ((sees || smells) && td > 120 && mates > 1) {
      const idx = sq.members.indexOf(e.id), a = sq.rot + (idx / mates) * TAU, R = Math.min(90, td * 0.6);
      gx = tx + Math.cos(a) * R; gy = ty + Math.sin(a) * R; if (!free(gx, gy)) { gx = tx; gy = ty; }
    } else if ((sees || smells) && td < e.r + tgt.r + M.range - 1.5) return 0;
    go(gx, gy);
    return sp;
  }

  // ---------------- firearm users (marauder, bandit, militia); returns speed ----------------
  function combatGun(s, API, e, def, sq, tgt, td, sees, tx, ty, go, free, push, sp, dt) {
    const pr = def.prof, g = def.gun, keep = Math.min(Math.max(20, Math.min(def.keep, VIEW.r * 0.7) * (pr ? pr.keepK / 0.6 : 1)), VIEW.r * 0.7), mates = sq ? sq.members.length : 1;
    if (!e.fled && e.hp / e.maxHp < def.fleeHp) { setM(e, 'flee'); e.mt = 5; e.lx = tx; e.ly = ty; return sp; }
    if (pr && pr.meleeBelow && e.hp / e.maxHp < pr.meleeBelow) return combatRush(s, API, e, def, sq, tgt, td, sees, sees, tx, ty, go, free, dt); // ZEALOT_PURGE: hurt -> melee, never retreat
    if (pr && pr.ambush && !e.amb) { if (td > pr.ambush && e.hp >= e.maxHp - 1e-6 && sees) { e.mode = 'combat'; return 0; } e.amb = true; } // GADGET_AMBUSH: wait until the target is within 10 m (traps themselves: not implemented)
    if (e.mag <= 0 && e.cool <= 0) e.mag = g.mag;
    const reloading = e.mag <= 0, idx = sq ? Math.max(0, sq.members.indexOf(e.id)) : 0;
    const hold = def.bound && mates >= 2 && sees && td > 100 && ((idx + Math.floor(s.t / 3.5)) % 2 === 0); // leapfrog: one shoots while the other moves
    let sub = e.sub;
    if (def.cover && sub !== 'cover' && (reloading || (e.hp < e.maxHp * 0.5 && API.rnd(s) < dt * 0.6))) { sub = 'cover'; e.cover = null; e.ct = 0; e.peek = null; }
    if (!sees) { // no line of fire: go to the last known position (or stay in cover)
      if (sub === 'cover' && e.cover && reloading) go(e.cover.x, e.cover.y); else { sub = 'adv'; go(tx, ty); }
      e.sub = sub; e.mode = 'combat'; return sp * 0.85;
    }
    if (sub === 'cover') {
      if (!e.cover || e.ct <= 0) { e.cover = findCover(s, API, e, tx, ty, false, free); e.ct = 2.5; }
      let inCover = false;
      if (e.cover) { const v = go(e.cover.x, e.cover.y); inCover = !!(v && v.done); }
      if (!e.cover || (td < 110 && !inCover)) sub = 'shoot'; // nowhere to hide / cornered
      else if (inCover && !reloading) { if (e.peek == null) e.peek = API.rr(s, 0.9, 2.0); e.peek -= dt; if (e.peek <= 0) { e.peek = null; sub = 'adv'; e.cover = null; } }
    } else if (sub === 'flank') {
      if (!e.flankPt || e.ct <= 0) {
        const dir = Math.atan2(e.y - ty, e.x - tx), side = idx % 2 ? 1 : -1; e.flankPt = null;
        for (let k = 0; k < 6 && !e.flankPt; k++) { const a = dir + side * (0.9 + k * 0.1), R = Math.max(keep * 0.8, 120), p = { x: tx + Math.cos(a) * R, y: ty + Math.sin(a) * R }; if (free(p.x, p.y)) e.flankPt = p; }
        e.ct = 1.5;
      }
      const v = e.flankPt ? go(e.flankPt.x, e.flankPt.y) : null;
      if (!v || v.done || td < keep + 40) { sub = 'shoot'; e.flankPt = null; e.mt = API.rr(s, 2.5, 5); }
    } else if (sub === 'shoot') {
      if (td > keep + 130) sub = 'adv';
      else {
        if (e.st <= 0) { e.strafe = API.rnd(s) < 0.5 ? -1 : 1; e.st = API.rr(s, 0.8, 2); }
        const dx = tgt.x - e.x, dy = tgt.y - e.y;
        if (td < keep - 60) push(-dx / td, -dy / td);
        if (!hold) { push(-dy / td * e.strafe * 0.6, dx / td * e.strafe * 0.6); sp *= 0.7; } else sp = 0;
        if (e.mt <= 0 && def.cover && API.rnd(s) < 1.2 * dt) { sub = 'cover'; e.cover = null; e.ct = 0; }
      }
    } else { // adv
      if (td <= keep + 50) { sub = 'shoot'; e.mt = API.rr(s, 2.5, 5); }
      else if (def.flank && mates >= 2 && idx > 0 && td > 85 && (!pr || !pr.pairs || idx % 2 === 1)) { sub = 'flank'; e.flankPt = null; e.ct = 0; }
      else if (!hold) go(tgt.x, tgt.y); else sp = 0;
    }
    e.sub = sub; e.mode = sub;
    // friendly fire is on: never shoot through an ally; sidestep to open the line, and keep a gap from squad mates
    if (pr && pr.breakAfterHit) { // HIT_AND_RUN: when hurt, break the distance for a moment
      if (e.hitFlash > 0 && !(e.brk > 0)) e.brk = pr.breakAfterHit;
      if (e.brk > 0) { e.brk -= dt; push(-(tgt.x - e.x) / td, -(tgt.y - e.y) / td); sp = def.speed * 1.15; }
    }
    const blocker = DIFF.ffCheck === false ? null : lineBlocker(s, e, tgt.x, tgt.y, td, g.pellets > 1 ? 0.22 : 0.06);
    if (blocker) { const cr = (tgt.x - e.x) * (blocker.y - e.y) - (tgt.y - e.y) * (blocker.x - e.x); e.strafe = cr > 0 ? -1 : 1; e.st = 0.6; push(-(tgt.y - e.y) / td * e.strafe * 0.9, (tgt.x - e.x) / td * e.strafe * 0.9); sp = Math.max(sp, def.speed * 0.7); }
    if (sq) for (const id of sq.members) { if (id === e.id) continue; const o = s.enemies.find(q => q.id === id); if (!o) continue; const d = hyp(o.x - e.x, o.y - e.y); if (d > 0 && d < 16) push((e.x - o.x) / d * 0.6, (e.y - o.y) / d * 0.6); }
    if (!blocker && e.cool <= 0 && e.mag > 0 && td < Math.min(g.max * 0.95, VIEW.r * 0.97) && sub !== 'flank' && onScreen(tgt, e.x, e.y)) { // fire: bursts, longer pause between them
      const ang = Math.atan2(tgt.y - e.y, tgt.x - e.x), spread = g.spread * DIFF.spread * (e.moving ? 1.3 : 1) * (td < 80 ? 0.6 : 1);
      API.fire(s, e, g, ang, spread, Math.min(g.eff, VIEW.r * 0.6), Math.min(g.max, VIEW.r * 1.25)); e.mag--;
      if (e.burst <= 0) e.burst = (g.burst || 1) + (def.fac === 'admin' && g.burst >= 3 ? API.ri(s, 0, 1) : 0); // PPS: bursts of 3-4
      if (pr && pr.relocateShots) { e.sh = (e.sh || 0) + 1; if (!e.shLim) e.shLim = API.ri(s, pr.relocateShots[0], pr.relocateShots[1]); if (e.sh >= e.shLim) { e.sh = 0; e.shLim = API.ri(s, pr.relocateShots[0], pr.relocateShots[1]); e.sub = 'cover'; e.cover = null; e.ct = 0; e.peek = null; } } // SNIPER_OVERWATCH: new position every 2-3 shots
      e.burst--;
      e.cool = e.mag <= 0 ? g.reload : e.burst > 0 ? g.rof : g.burstCd * API.rr(s, 0.8, 1.3);
      for (const o of s.enemies) if (o.m !== 'combat' && o.sq !== e.sq && hyp(o.x - e.x, o.y - e.y) < 420) { o.alert = Math.max(o.alert, 4); o.lx = e.x; o.ly = e.y; } // other groups hear the firefight
    }
    return sp;
  }

  // First enemy standing in the line of fire e -> (tx,ty), or null. spreadK widens the corridor with distance (shotgun cone).
  function lineBlocker(s, e, tx, ty, td, spreadK) {
    const dx = tx - e.x, dy = ty - e.y, L2 = dx * dx + dy * dy; if (L2 < 1) return null;
    let best = null, bt = 2;
    for (const o of s.enemies) {
      if (o === e) continue;
      const ox = o.x - e.x, oy = o.y - e.y, u = (ox * dx + oy * dy) / L2; if (u <= 0 || u >= 1) continue;
      const px = ox - dx * u, py = oy - dy * u, w = o.r + 1.5 + td * u * spreadK;
      if (px * px + py * py < w * w && u < bt) { bt = u; best = o; }
    }
    return best;
  }

  // Hints for the renderer (game.js): draw by look instead of hard-coding type names.
  function look(e) {
    const d = TYPES[e.type] || C.ENEMIES[e.type] || {};
    return { armed: d.look === 'armed', gunLen: d.look === 'armed' ? 16 : 0, shape: d.look === 'beast' ? 'ring' : 'shoulders',
      fac: d.fac || null, gear: d.gear || '', color: d.color, neutral: !!e.neu, mark: e.neu ? '' : (e.m === 'combat' || e.m === 'warn') ? '!' : (e.m === 'invest' || e.m === 'search') ? '?' : '' };
  }

    function districtFaction(id) { if (FACTIONS.admin.districts.includes(id)) return 'admin'; if (FACTIONS.coalition.districts.includes(id)) return 'coalition'; if (FACTIONS.gangs.districts[id]) return 'gangs'; return 'unclaimed'; }
  // ---- public API for the district selector / HUD ----
  // setHome(s, districtId): the player's home district (mobs there are neutral, except dogs). Call before the first step or any time later.
  // hostile(s, e): true if enemy e attacks the player right now. standing(s): [{id, name, home, hostile, hits}] per district.
  function setHome(s, id) { s.homeDistrict = id; if (s._e) s._e.home = id; }
  function hostile(s, e) { return !neutral(s, e); }
  function standing(s) { const E = s._e || { home: s.homeDistrict, rep: {} }; return (s.map.zones || []).map(z => { const r = E.rep[z.id] || {}; return { id: z.id, name: z.name, home: z.id === E.home, hostile: z.id !== E.home || !!r.hostile, hits: r.hits || 0 }; }); }

  // census(s) -> { zoneId: { civ, armed, dogs } } live head-count by district; wanted(s) -> bool; noise(s, x, y, kind): push a sound the mobs hear ('door' = door/window broken, 45 m)
  function noise(s, x, y, kind) { s.events.push({ t: 'noise', kind: kind || 'door', x, y }); }
  const wanted = (s) => !!(s._e && s._e.wanted);
  window.WL_ENEMIES = { stanceOf, step, TYPES, ZONE_SPAWN, DIFF, VIEW, setView, setCamera, onScreen, WEAPON_RANGES, look, setHome, hostile, standing, FACTIONS, isDay, districtFaction, census: (s) => census(s, window.WL_SIM && WL_SIM.API), noise, wanted, stanceOf, version: 5 };
})();
