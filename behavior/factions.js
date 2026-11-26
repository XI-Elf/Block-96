// Block-96: behaviour data and rules (owner: enemies/behaviour thread). Pure data + pure functions, no DOM, no random.
// "Behaviour" here means scripted NPC/mob algorithms (state machines, rules, timers): no neural nets, no network.
// Source: BLOCK96_AI_AND_SIMULATION_TDD.md, adapted to project decisions (README v5, 16 m view, home-district rule, dogs).
// Units: world px (10 px = 1 m), seconds, game hours.
'use strict';
(function () {
  // ---------- clock ----------
  const CLOCK = {
    dayFrom: 10, dayTo: 16,            // GREY_WINDOW 10:00-16:00 (6 h); the other 18 h are DARK_TIME
    returnHomeFrom: 15.5,              // civilians start RETURN_HOME at 15:30 (TDD bug fixed: "now >= 15:30 OR now < 10:00")
    ambient: { day: 0.65, night: 0.12 },
    ppsMult: { day: 1.0, night: 0.2 }, gangPatrolMult: { day: 0.25, night: 1.0 },
  };
  const isDay = (h) => h >= CLOCK.dayFrom && h < CLOCK.dayTo;
  const returnHome = (h) => h >= CLOCK.returnHomeFrom || h < CLOCK.dayFrom;   // OR, not AND
  // Detection range may change slightly with light (project rule: view stays 16 m; light only +-25%).
  const lightRange = (ambient, underLamp) => Math.min(1.25, 0.75 + 0.25 * Math.max(0, Math.min(1, (ambient - 0.12) / 0.53)) + (underLamp ? 0.2 : 0));

  // ---------- factions ----------
  // internal faction key (enemies.js TYPES[].fac) -> TDD FactionId
  const FID = { admin: 'ADMIN_PPS', coalition: 'TRADE_COALITION', holodnogorskie: 'GANG_KHOLODNOGOR', vyshka: 'GANG_VYSHKA', brigada: 'GANG_BRIGADA', kooperativ: 'GANG_KOOPERATIV',
    kazanskie: 'GANG_KAZANSKIE', sobor: 'GANG_SOBOR', sektor: 'GANG_SEKTOR', cherdak: 'GANG_CHERDAK', street: 'SCAV_GANG', civ: 'CIVILIAN', dogs: 'DOGS' };
  const GANGS = ['GANG_KHOLODNOGOR', 'GANG_VYSHKA', 'GANG_BRIGADA', 'GANG_KOOPERATIV', 'GANG_KAZANSKIE', 'GANG_CHERDAK'];
  // TDD section 4. Columns: ADMIN_PPS, TRADE_COALITION, GANGS, SOBOR, SEKTOR, SCAV_GANG, CIVILIAN
  const COLS = ['ADMIN_PPS', 'TRADE_COALITION', 'GANGS', 'GANG_SOBOR', 'GANG_SEKTOR', 'SCAV_GANG', 'CIVILIAN'];
  const M = {
    ADMIN_PPS:       [100, 20, -80, -90, -90, -100, 40],
    TRADE_COALITION: [20, 100, 0, 0, 0, -60, 50],
    GANGS:           [-80, 0, -70, -85, -85, -75, 10],
    GANG_SOBOR:      [-90, 0, -85, 100, -95, -90, -10],
    GANG_SEKTOR:     [-90, 0, -85, -95, 100, -100, -80],
    SCAV_GANG:       [-100, -60, -75, -90, -100, -40, -70],
    CIVILIAN:        [40, 50, 10, -10, -80, -70, 100],
  };
  const rowOf = (f) => GANGS.includes(f) ? 'GANGS' : f;
  const colOf = (f) => GANGS.includes(f) ? 'GANGS' : f;
  // relation(a, b, ctx): how a feels about b, -100..100. ctx = { day, inPort, holstered, sameDistrict }.
  function relation(a, b, ctx) {
    ctx = ctx || {};
    if (a === 'DOGS' || b === 'DOGS') return a === b ? 100 : -100;
    if (a === b && a !== 'CIVILIAN' && GANGS.includes(a)) return 100;           // same gang
    const r = M[rowOf(a)], c = COLS.indexOf(colOf(b)); if (!r || c < 0) return 0;
    let v = r[c];
    if (a === 'ADMIN_PPS' && b === 'CIVILIAN') v = ctx.day ? 40 : 0;               // "+40 (day)"
    if (a === 'TRADE_COALITION' && ctx.inPort && ctx.holstered && v === 0) v = 0;
    if (rowOf(a) === 'GANGS' && b === 'CIVILIAN') v = ctx.sameDistrict ? 10 : -10;
    if (a === 'SCAV_GANG' && b === 'CIVILIAN') v = ctx.day ? 0 : -70;               // "-70 (night)"
    return v;
  }
  // Stance of a mob towards the player stranger. Returns 'hostile' | 'warn' | 'neutral'.
  // ctx: { fac (internal), zone, day, weaponOut, wanted, portShot, home (player's home district id) }
  const PORT = 'rechnoy_port', LEFT_BANK = 'levoberezhe';
  function stance(ctx) {
    const f = ctx.fac;
    if (f === 'dogs') return 'hostile';
    if (f === 'civ') return 'neutral';
    if (f === 'coalition') {                                           // Rule 1: the port is neutral ground while the gun is holstered
      if (ctx.portShot) return 'hostile';                              // any shot inside the port -> -100 against the shooter
      return ctx.weaponOut ? 'warn' : 'neutral';
    }
    if (f === 'admin') {                                               // v61: ППС reacts to order violations only (any variant, any hour)
      if (ctx.wanted) return 'hostile';                                // shot in their zone, attack on ППС / civilians, killed a civilian or officer
      return ctx.weaponOut ? 'warn' : 'neutral';                       // weapon in hands -> warning, then combat if not holstered
    }
    if (f === 'sektor' && ctx.zone === LEFT_BANK) return ctx.home === LEFT_BANK ? 'hostile-if-provoked' : 'hostile'; // Rule 3 (ZERO_TOLERANCE, no warning)
    return 'hostile';
  }

  // ---------- population ----------
  // Archetype shares and stats (TDD 2.1). speed in px/s (10 px = 1 m).
  const ARCH = {
    CIV_ADULT_M: { share: 0.42, walk: 25, run: 55, hp: 100, sight: 1.0, role: 'carrier' },
    CIV_ADULT_F: { share: 0.33, walk: 24, run: 52, hp: 90, sight: 1.0, role: 'medic' },
    CIV_ELDER:   { share: 0.17, walk: 16, run: 28, hp: 65, sight: 0.8, role: 'camera', leash: 600 },
    CIV_TEEN:    { share: 0.08, walk: 30, run: 64, hp: 75, sight: 1.15, role: 'scout' },
  };
  const archFor = (x01) => { let a = 0; for (const k in ARCH) { a += ARCH[k].share; if (x01 < a) return k; } return 'CIV_ADULT_M'; };
  // TDD section 6, by game district id. owner: faction key (internal) or array; 'CONTESTED' = street gangs.
  const SPAWN_TABLE = {
    novozavodskoy:       { owner: ['admin'], dayCap: 28, nightCap: 22, civRatio: 0.05 },
    kompressorny:        { owner: ['admin'], dayCap: 32, nightCap: 18, civRatio: 0.35 },
    nagorny:             { owner: ['admin'], dayCap: 42, nightCap: 22, civRatio: 0.50 },
    rechnoy_port:        { owner: ['coalition'], dayCap: 50, nightCap: 28, civRatio: 0.55 },
    holodnaya_gora:      { owner: ['holodnogorskie'], dayCap: 32, nightCap: 28, civRatio: 0.45 },
    saltov_bor:          { owner: ['vyshka'], dayCap: 22, nightCap: 22, civRatio: 0.25 },
    traktornaya_sloboda: { owner: ['brigada', 'kooperativ'], dayCap: 28, nightCap: 34, civRatio: 0.30 },
    kazanskaya_sloboda:  { owner: ['kazanskie', 'sobor'], dayCap: 38, nightCap: 38, civRatio: 0.40 },
    levoberezhe:         { owner: ['sektor', 'cherdak'], dayCap: 28, nightCap: 34, civRatio: 0.30 },
    aviastroika:         { owner: ['CONTESTED'], dayCap: 12, nightCap: 24, civRatio: 0.17 },
    pavlov_yar:          { owner: ['CONTESTED'], dayCap: 22, nightCap: 18, civRatio: 0.40 },
    sormovka:            { owner: ['CONTESTED'], dayCap: 18, nightCap: 14, civRatio: 0.50 },
    derbyshevka:         { owner: ['CONTESTED'], dayCap: 22, nightCap: 18, civRatio: 0.45 },
    muromsky_posad:      { owner: ['CONTESTED'], dayCap: 22, nightCap: 18, civRatio: 0.40 },
    zarechnaya_balka:    { owner: ['CONTESTED'], dayCap: 12, nightCap: 18, civRatio: 0.20 },
    pokrovskie_dvory:    { owner: ['CONTESTED'], dayCap: 18, nightCap: 18, civRatio: 0.35 },
  };
  // TDD ids -> game ids (kept for tools that read the TDD table)
  const TDD_ID = { kholodnaya_gora: 'holodnaya_gora', traktornaya: 'traktornaya_sloboda', kazanskaya: 'kazanskaya_sloboda', muromsky: 'muromsky_posad', zarechnaya: 'zarechnaya_balka', pokrovskie: 'pokrovskie_dvory' };
  // Starting density of hostile mobs: project rule "few enemies on the first levels" (TDD caps are the ceiling at level >= 8).
  const hostileK = (level) => 0.35 + 0.65 * Math.max(0, Math.min(1, ((level || 1) - 1) / 7));
  const NIGHT_MULT = 1.5;
  const dogsFor = (row) => Math.max(1, Math.round(row.nightCap * 0.08));
  // target head-count of a district: { civ, armed, dogs } (armed excludes dogs; at night dogs are part of nightCap)
  function target(zoneId, day, level, isHome) {
    const row = SPAWN_TABLE[zoneId]; if (!row) return null;
    const k = hostileK(level) * (isHome ? 0.6 : 1);
    if (!day) { const dogs = Math.min(dogsFor(row), row.nightCap); return { civ: 0, armed: Math.max(1, Math.round((row.nightCap - dogs) * NIGHT_MULT)), dogs: Math.round(dogs * NIGHT_MULT) }; } // v62: the night is the gangs' time: TDD table x1.5 from level 1, no home discount
    if (day) { const civ = Math.round(row.dayCap * row.civRatio); return { civ, armed: Math.max(1, Math.round((row.dayCap - civ) * k)), dogs: 0 }; }
    const dogs = Math.min(dogsFor(row), row.nightCap); return { civ: 0, armed: Math.max(1, Math.round((row.nightCap - dogs) * k)), dogs: Math.round(dogs * Math.max(0.5, k)) };
  }

  // ---------- combat profiles of the 8 big gangs (TDD 5.5) ----------
  // keepK: multiplier of the preferred distance (the 16 m view rule compresses the TDD distances, ratios are kept).
  const PROFILES = {
    holodnogorskie: { id: 'SWARM_RUSH', range: [5, 20], keepK: 0.5, whistle: 800 },
    vyshka:         { id: 'SNIPER_OVERWATCH', range: [35, 90], keepK: 1.0, relocateShots: [2, 3], high: true },
    brigada:        { id: 'HEAVY_ADVANCE', range: [5, 18], keepK: 0.45, noMoraleLoss: true, tight: true },
    kooperativ:     { id: 'GADGET_AMBUSH', range: [10, 30], keepK: 0.75, ambush: 100 },
    kazanskie:      { id: 'AGGRESSIVE_FLANK', range: [8, 25], keepK: 0.65, pairs: true },
    sobor:          { id: 'ZEALOT_PURGE', range: [4, 20], keepK: 0.45, noRetreat: true, meleeBelow: 0.5 },
    sektor:         { id: 'ZERO_TOLERANCE', range: [8, 28], keepK: 0.7, noWarn: true },
    cherdak:        { id: 'HIT_AND_RUN', range: [5, 22], keepK: 0.55, nightOnly: true, breakAfterHit: 2.5 },
  };

  // ---------- perception ----------
  const SOUND = { step: 80, run: 180, shotDay: 1400, shotNight: 2200, door: 450, civFlee: 450, shakalAvoidPPS: 400, shakalListen: 1800, shakalStandoff: 350, shakalWait: 10 };
  const MEMORY = { experienced: 8, scav: 4 };       // seconds a mob keeps lastKnownTargetPos after losing sight
  const WARN_HOLSTER = 3.0, REINFORCE_AFTER = 15, ELDER_ALERT_R = 1200, ELDER_SCAN = 150, ELDER_RATE = 25, TOKEN_DROP = 0.65, TEEN_RUN = 64;

  const G = typeof window !== 'undefined' ? window : globalThis;
  G.WL_BEH = { CLOCK, isDay, returnHome, lightRange, FID, GANGS, COLS, MATRIX: M, relation, stance, ARCH, archFor, SPAWN_TABLE, TDD_ID, hostileK, target, PROFILES, SOUND, MEMORY,
    WARN_HOLSTER, REINFORCE_AFTER, ELDER_ALERT_R, ELDER_SCAN, ELDER_RATE, TOKEN_DROP, PORT, LEFT_BANK, dogsFor };
  if (typeof module !== 'undefined') module.exports = G.WL_BEH;
})();
