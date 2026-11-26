// Measure city generation separately from player creation and the first simulation tick.
// Run from the repository root with: node --expose-gc tests/profile-boot.js
const { performance } = require('node:perf_hooks');
const H = require('./harness');

const seeds = [31337, 12345, 424242];
const rounds = 2;
const start = performance.now();
const world = H.load();
const loadMs = performance.now() - start;
const S = world.WL_SIM;
const results = [];

for (let round = 1; round <= rounds; round++) {
  for (const seed of seeds) {
    if (global.gc) global.gc();

    const worldStart = performance.now();
    const state = S.newWorld(seed, null, [], 'pavlov_yar');
    const worldMs = performance.now() - worldStart;
    const walls = state.map.walls.length;
    const containers = state.containers.length;
    const buildings = state.map.city.buildings.length;

    state.h0 = 0;
    state.hour = 0;
    const playerStart = performance.now();
    S.addPlayer(state, 'p1', 'T', {
      inv: world.WL_CONFIG.START.inv,
      weapons: world.WL_CONFIG.START.weapons.map(id => ({ id })),
    });
    const playerMs = performance.now() - playerStart;

    const tickStart = performance.now();
    S.step(state, { p1: {} }, [], 1 / 60);
    const firstTickMs = performance.now() - tickStart;

    results.push({
      round,
      seed,
      worldMs,
      playerMs,
      firstTickMs,
      walls,
      containers,
      buildings,
      enemiesAfterFirstTick: state.enemies.length,
    });
  }
}

console.log(JSON.stringify({ node: process.version, loadMs, results }, null, 2));
