const H = require('./harness');
const hour = +(process.argv[2] ?? 12), wait = +(process.argv[3] ?? 20), home = process.argv[4] || 'pavlov_yar';
const h = H.boot({ hour, home }); h.step(wait);
const A = h.S.API, T = {};
for (const z of h.s.map.zones) T[z.id] = { mob: 0, civ: 0, dog: 0 };
for (const e of h.s.enemies) { const z = A.zoneAt(h.s, e.x, e.y); const id = z ? z.id : '(out)'; T[id] = T[id] || { mob: 0, civ: 0, dog: 0 }; T[id][e.type === 'civ' || /^civ_/.test(e.type) ? 'civ' : e.type === 'dog' ? 'dog' : 'mob']++; }
console.log('hour', h.s.hour.toFixed(1), 'total', h.s.enemies.length);
for (const id in T) console.log(id.padEnd(22), JSON.stringify(T[id]));
