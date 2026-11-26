// Compare ray query results and cost on a deterministic city.
// Run with: node --expose-gc tests/benchmark-rays.js
const { performance } = require('node:perf_hooks');
const { createHash } = require('node:crypto');
const H = require('./harness');

const S = H.load().WL_SIM;
const state = S.newWorld(31337, null, [], 'pavlov_yar');
const queries = [];

for (let i = 0; i < 10000; i++) {
  const x = (i * 7919) % state.map.w;
  const y = (i * 6029) % state.map.h;
  queries.push([x, y, x + 300, y + 170]);
}

function run() {
  const results = [];
  const start = performance.now();
  for (const [x0, y0, x1, y1] of queries) {
    results.push(S.API.rayWall(state, x0, y0, x1, y1));
    results.push(S.API.rayWallAll(state, x0, y0, x1, y1));
  }
  const elapsedMs = performance.now() - start;
  const hash = createHash('sha256').update(JSON.stringify(results)).digest('hex');
  return { elapsedMs, hash };
}

run(); // warm the VM and spatial index
const samples = [];
for (let i = 0; i < 3; i++) {
  if (global.gc) global.gc();
  samples.push(run());
}
console.log(JSON.stringify(samples, null, 2));
