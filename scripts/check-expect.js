// Expect test: rollouts must match the pinned baseline (expect/baseline.json).
// Run after any "behaviour-preserving" engine change; --update to re-bless.
//   node scripts/check-expect.js
//   node scripts/check-expect.js --update
const fs = require('fs');
const path = require('path');
const { loadCore } = require('./lib/load-core');

const core = loadCore();
const BASELINE = path.join(__dirname, 'expect', 'baseline.json');
const UPDATE = process.argv.includes('--update');
const MAX_TICKS = 400;

const ALL_PILLARS = { S: true, W: true, N: true };
const NO_PILLARS = { S: false, W: false, N: false };
const SEEDS = [0, 1, 2, 3, 4, 5, 6, 7];

// Corpus chosen to hit blob splits, nibbler spawns, the maxTicks boundary and
// every loadout (asserted by the coverage marks below).
const SCENARIOS = [
  { name: 'full/center/blowpipe', code: 'MRYBXOOOO', tile: { x: 15, y: 15 }, pillars: ALL_PILLARS, loadout: 'blowpipe' },
  { name: 'full/center/ayak', code: 'MRYBXOOOO', tile: { x: 15, y: 15 }, pillars: ALL_PILLARS, loadout: 'ayak' },
  { name: 'full/center/barrage', code: 'MRYBXOOOO', tile: { x: 15, y: 15 }, pillars: ALL_PILLARS, loadout: 'bloodBarrage' },
  { name: 'full/corner/blowpipe', code: 'MRYBXOOOO', tile: { x: 2, y: 29 }, pillars: ALL_PILLARS, loadout: 'blowpipe' },
  { name: 'blobs/blowpipe', code: 'BBBOO', tile: { x: 15, y: 15 }, pillars: ALL_PILLARS, loadout: 'blowpipe' },
  { name: 'blobs/ayak', code: 'BBBOO', tile: { x: 14, y: 16 }, pillars: ALL_PILLARS, loadout: 'ayak' },
  { name: 'meleers+blobs', code: 'XXXBB', tile: { x: 20, y: 20 }, pillars: ALL_PILLARS, loadout: 'blowpipe' },
  { name: 'magers+rangers', code: 'MMRRX', tile: { x: 10, y: 10 }, pillars: ALL_PILLARS, loadout: 'ayak' },
  { name: 'nopillar/nibblers', code: 'MRYBXOOOO', tile: { x: 15, y: 15 }, pillars: NO_PILLARS, loadout: 'blowpipe' },
  { name: 'nopillar/blobs', code: 'BBXOO', tile: { x: 16, y: 14 }, pillars: NO_PILLARS, loadout: 'bloodBarrage' },
  { name: 'full/center/shortcap', code: 'MRYBXOOOO', tile: { x: 15, y: 15 }, pillars: ALL_PILLARS, loadout: 'blowpipe', maxTicks: 40 },
];

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function digestRollout(r) {
  if (!r) return 'null';
  const atk = r.attacks.map(a =>
    a.tick + '|' + (a.mobId ?? '') + '|' + (a.style ?? '') + '|' + (a.isPlayerAttack ? 'P' : '') +
    '|' + (a.hitTick ?? '') + '|' + (a.dmgRoll ? Math.floor(a.dmgRoll * 1000) : '') +
    '|' + (a.accRoll ? Math.floor(a.accRoll * 1000) : '')
  ).join(',');
  const mobs = r.mobs.map(m => m.id + ':' + m.type + ':' + m.hp + ':' + (m.dead ? 'D' : '') + ':' + m.dying).join(',');
  return [r.status, r.completedTick, r.cleanupReason ?? '', 'A[' + atk + ']', 'M[' + mobs + ']'].join('~');
}

const perScenario = {};
const rollouts = [];
for (const sc of SCENARIOS) {
  const loadout = core.LOADOUTS[sc.loadout];
  const region = core.createRegion(sc.pillars);
  const ticks = sc.maxTicks ?? MAX_TICKS;
  const parts = [];
  for (const seed of SEEDS) {
    const r = core.hlRunSim(sc.code, sc.tile, sc.pillars, loadout, ticks, region, seed);
    parts.push(digestRollout(r));
    rollouts.push({ sc, ticks, r });
  }
  perScenario[sc.name] = fnv1a(parts.join('||'));
}
const overall = fnv1a(Object.keys(perScenario).sort().map(k => k + '=' + perScenario[k]).join(';'));

const statuses = new Set();
const loadoutsSeen = new Set();
let sawBloblet = false, sawNibbler = false, sawFullLength = false;
for (const { sc, ticks, r } of rollouts) {
  loadoutsSeen.add(sc.loadout);
  if (!r) continue;
  statuses.add(r.status);
  if (r.completedTick >= ticks) sawFullLength = true;
  for (const m of r.mobs) {
    if (typeof m.type === 'string' && m.type.startsWith('bloblet')) sawBloblet = true;
    if (m.type === 'nibbler') sawNibbler = true;
  }
}
const coverage = [
  ['>=3 statuses', statuses.size >= 3, [...statuses].sort().join(',')],
  ['blob split', sawBloblet, 'parentBlobId path'],
  ['nibbler spawn', sawNibbler, 'all-pillars-dead path'],
  ['maxTicks boundary', sawFullLength, 'completedTick==cap'],
  ['all 3 loadouts', loadoutsSeen.size === 3, [...loadoutsSeen].sort().join(',')],
];
let coverageOk = true;
console.log('Coverage:');
for (const [label, ok, detail] of coverage) {
  console.log(`  ${ok ? 'HIT ' : 'MISS'} ${label} (${detail})`);
  if (!ok) coverageOk = false;
}

if (UPDATE) {
  fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
  fs.writeFileSync(BASELINE, JSON.stringify({ maxTicks: MAX_TICKS, seeds: SEEDS, overall, scenarios: perScenario }, null, 2) + '\n');
  console.log(`\nWrote baseline: overall=${overall}`);
  process.exit(coverageOk ? 0 : 1);
}
if (!fs.existsSync(BASELINE)) { console.error('\nNo baseline. Run: node scripts/check-expect.js --update'); process.exit(1); }

const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
const mismatches = [];
for (const name of Object.keys(perScenario)) {
  if (base.scenarios[name] !== perScenario[name]) mismatches.push(`  CHANGED ${name}: ${base.scenarios[name] ?? '(new)'} -> ${perScenario[name]}`);
}
for (const name of Object.keys(base.scenarios)) if (!(name in perScenario)) mismatches.push(`  REMOVED ${name}`);

if (mismatches.length) {
  console.error(`\nFAIL expect: ${mismatches.length} scenario(s) diverged (re-bless with --update if intentional):`);
  console.error(mismatches.join('\n'));
  process.exit(1);
}
if (!coverageOk) { console.error('\nFAIL expect: coverage regressed.'); process.exit(1); }
console.log(`\nOK expect: overall=${overall}`);
