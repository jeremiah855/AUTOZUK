// Extract the <script id="sim-core"> block from index.html and evaluate it,
// exposing the engine symbols. Math.random is seeded by default so rollouts are
// reproducible, since spawnNibblers uses unseeded Math.random. Pass
// { deterministicRandom: false } for the engine's real behaviour.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const EXPORTS = [
  'createRegion', 'hlRunSim', 'parseSpawnCode', 'optimizePrayer', 'calcSimDamage',
  'checkTileExcluded', 'LOADOUTS', 'MOB_DEFS',
  'ARENA_X_MIN', 'ARENA_X_MAX', 'ARENA_Y_MIN', 'ARENA_Y_MAX',
];

function seededMath(seed) {
  let a = seed >>> 0;
  const m = Object.create(Math);
  m.random = function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return m;
}

function loadCore(opts = {}) {
  const file = opts.indexPath || path.join(__dirname, '..', '..', 'index.html');
  const m = /<script id="sim-core">([\s\S]*?)<\/script>/.exec(fs.readFileSync(file, 'utf8'));
  if (!m) throw new Error('No <script id="sim-core"> block found in ' + file);

  const mathForCtx = opts.deterministicRandom === false ? Math : seededMath(opts.randomSeed ?? 0x9e3779b9);
  const ctx = vm.createContext({
    console, Math: mathForCtx, Set, Map, Uint8Array, Uint32Array, Float64Array, Array,
    Infinity, NaN, isNaN, parseInt, parseFloat, JSON,
  });
  vm.runInContext(m[1] + '\n;globalThis.__core = {' + EXPORTS.join(',') + '};', ctx, { filename: 'sim-core.js' });

  const core = ctx.__core;
  for (const name of EXPORTS) if (core[name] === undefined) throw new Error('sim-core did not export: ' + name);
  return core;
}

module.exports = { loadCore, EXPORTS };
