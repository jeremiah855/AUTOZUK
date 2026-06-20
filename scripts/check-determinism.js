// A seeded rollout must be reproducible. (spawnNibblers uses unseeded
// Math.random, so nibbler waves only reproduce under the seeded harness.)
const { loadCore } = require('./lib/load-core');

const PILLARS = { S: true, W: true, N: true };
const NO_PILLARS = { S: false, W: false, N: false };
const CASES = [
  { code: 'MRYBXOOOO', tile: { x: 15, y: 15 }, pillars: PILLARS, loadout: 'blowpipe' },
  { code: 'BBBOO', tile: { x: 15, y: 15 }, pillars: PILLARS, loadout: 'ayak' },
  { code: 'XXXBB', tile: { x: 20, y: 20 }, pillars: PILLARS, loadout: 'bloodBarrage' },
  { code: 'MRYBXOOOO', tile: { x: 15, y: 15 }, pillars: NO_PILLARS, loadout: 'blowpipe' },
];
const SEEDS = [0, 1, 2, 3, 4];

function digest(r) {
  if (!r) return 'null';
  return r.status + '~' + r.completedTick + '~' + r.attacks.map(a => a.tick + (a.dmgRoll ?? '') + (a.accRoll ?? '')).join(',');
}
function rolloutsFor(core) {
  const out = [];
  for (const c of CASES) {
    const region = core.createRegion(c.pillars);
    for (const seed of SEEDS) out.push(digest(core.hlRunSim(c.code, c.tile, c.pillars, core.LOADOUTS[c.loadout], 400, region, seed)));
  }
  return out;
}

const a = rolloutsFor(loadCore({ randomSeed: 12345 }));
const b = rolloutsFor(loadCore({ randomSeed: 12345 }));
let fails = 0;
for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { console.error(`FAIL: case ${i} differs across runs`); fails++; }
console.log(`Reproducibility: ${a.length - fails}/${a.length} seeded rollouts identical.`);

if (fails) { console.error('\nFAIL determinism'); process.exit(1); }
console.log('OK determinism');
