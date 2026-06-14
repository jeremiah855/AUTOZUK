// Simulate what buildWorkerBlobUrl will do: concat sim-core + worker glue and verify
// it parses + handles each message type correctly in a worker-like sandbox.
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('index.html', 'utf8');
const simCore = /<script id="sim-core">([\s\S]*?)<\/script>/.exec(src)[1];
const workerSrc = /<script id="autozuk-worker"[^>]*>([\s\S]*?)<\/script>/.exec(src)[1];
const combined = simCore + ';\n' + workerSrc;

// Fake `self` object that records postMessage calls
let posted = [];
const self = {
  postMessage(m){ posted.push(m); },
  onmessage: null,
};
const ctx = vm.createContext({ console, Math, Set, Map, Uint8Array, Infinity, NaN, isNaN, parseInt, parseFloat, JSON, self });

try { vm.runInContext(combined, ctx); } catch (e) {
  console.error('Worker combined source failed to load:', e.message);
  process.exit(1);
}
if (typeof self.onmessage !== 'function') { console.error('self.onmessage not registered'); process.exit(1); }

// Run probe inside the vm so it can see const-bound LOADOUTS
const probe = `
self._test = {};
self._test.cleanupThree = hlCleanupStopReason({
  initialEnemyCount:3, delayedBlobletSpawns:[],
  mobs:[{type:'ranger',dead:false,dying:-1}]
});
self._test.cleanupFour = hlCleanupStopReason({
  initialEnemyCount:4, delayedBlobletSpawns:[],
  mobs:[{type:'ranger',dead:false,dying:-1}]
});
self._test.cleanupBloblets = hlCleanupStopReason({
  initialEnemyCount:4, delayedBlobletSpawns:[],
  mobs:[
    {type:'blobletMage',dead:false,dying:-1},
    {type:'blobletRange',dead:false,dying:-1}
  ]
});
self._test.cleanupThreeBloblets = hlCleanupStopReason({
  initialEnemyCount:3, delayedBlobletSpawns:[],
  mobs:[
    {type:'blobletMage',dead:false,dying:-1},
    {type:'blobletRange',dead:false,dying:-1}
  ]
});
self._test.cleanupPendingBloblets = hlCleanupStopReason({
  initialEnemyCount:4, delayedBlobletSpawns:[{tick:10}],
  mobs:[{type:'blobletMage',dead:false,dying:-1}]
});
self._test.smallWaveTrapped = hlTrappedResultStatus(
  {initialEnemyCount:3},
  [{type:'ranger'}]
);
self._test.normalWaveTrapped = hlTrappedResultStatus(
  {initialEnemyCount:4},
  [{type:'ranger'}]
);
self._test.smallWaveTimeout = hlTimeoutResultStatus({initialEnemyCount:3});
self._test.normalWaveTimeout = hlTimeoutResultStatus({initialEnemyCount:4});
const testAttack = (tick,mobType,style) => ({
  tick, mobType, style, isScan:false, accRoll:0, dmgRoll:.9, mobId:tick,
  hitTick:tick+1, distAtFire:5
});
self._test.singleRangerPrayer = optimizePrayer(
  [{attacks:[testAttack(1,'ranger','range')],mobInitHP:{}}],
  'ROOOOOOOO', {S:true,W:true,N:true}, LOADOUTS.ayak
).sequence;
self._test.splitPrayer = optimizePrayer(
  [{attacks:[
    testAttack(0,'meleer','melee'),
    testAttack(2,'ranger','range')
  ],mobInitHP:{}}],
  'XOROOOOOO', {S:true,W:true,N:true}, LOADOUTS.ayak
).sequence;
self.onmessage({ data: { type:'init', pillarConfig:{S:true,W:true,N:true}, loadout: LOADOUTS.blowpipe } });
self.onmessage({ data: { type:'exclude', tiles:[{x:5,y:5},{x:15,y:15},{x:11,y:24}], spawnCode:'MRYBXOOOO' } });
self.onmessage({ data: { type:'simulate', tile:{x:15,y:15}, spawnCode:'MRYBXOOOO', maxTicks:400, maxSims:20, seedBase:42, isPartial:false } });
`;
vm.runInContext(probe, ctx);
function assertEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    console.error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    process.exit(1);
  }
  console.log(`OK ${label}:`, actual);
}
assertEqual(self._test.cleanupThree, null, 'three-enemy last target keeps running');
assertEqual(self._test.cleanupFour, 'last-enemy', 'four-enemy last target stops');
assertEqual(self._test.cleanupBloblets, 'bloblets', 'bloblet-only cleanup stops');
assertEqual(self._test.cleanupThreeBloblets, null, 'three-enemy bloblets require a full clear');
assertEqual(self._test.cleanupPendingBloblets, null, 'pending bloblet spawn keeps running');
assertEqual(self._test.smallWaveTrapped, 'invalid', 'three-enemy trapped result is invalid');
assertEqual(self._test.normalWaveTrapped, 'trapped', 'four-enemy trapped result stays valid');
assertEqual(self._test.smallWaveTimeout, 'invalid', 'three-enemy timeout is invalid');
assertEqual(self._test.normalWaveTimeout, 'timeout', 'four-enemy timeout is unchanged');
assertEqual(self._test.singleRangerPrayer, ['range','range','range','range'], 'single ranger prayer fill');
assertEqual(self._test.splitPrayer, ['melee','melee','range','range'], 'neighbor prayer fill');
console.log('OK init:', posted[0]);
console.log('OK exclude:', posted[1].excluded.length, 'excluded,', posted[1].eligible.length, 'eligible');
const sr = posted[2];
if (sr.type !== 'simulate-result' || sr.tile.x !== 15 || !sr.summary) {
  console.error('FAIL simulate: bad envelope', JSON.stringify({ type: sr.type, hasSummary: !!sr.summary }));
  process.exit(1);
}
const s = sr.summary;
for (const f of ['avgDamage', 'prayer', 'markedDead', 'deathPct', 'damages', 'totalSims', 'isPartial']) {
  if (!(f in s)) { console.error('FAIL simulate: summary missing ' + f); process.exit(1); }
}
if (s.prayer.length !== 4) { console.error('FAIL simulate: prayer length ' + s.prayer.length); process.exit(1); }
if (s.isPartial !== false) { console.error('FAIL simulate: isPartial flag not honored'); process.exit(1); }
console.log(`OK simulate: avgDamage=${s.avgDamage.toFixed(1)}, totalSims=${s.totalSims}, prayer=${JSON.stringify(s.prayer)}, isPartial=${s.isPartial}`);
