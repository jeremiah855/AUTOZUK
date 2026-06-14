// Exercise the pure two-phase helpers (sim-core) headlessly, like check-simcore.js.
// Tests buildSummary (the worker-side reduction) and selectAutozukSurvivors (the single
// confidence cut between phase 1 and phase 2).
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('index.html', 'utf8');
const simCore = /<script id="sim-core">([\s\S]*?)<\/script>/.exec(src)[1];

const report = {};
const ctx = vm.createContext({ console, Math, Set, Map, Uint8Array, Infinity, NaN, isNaN, parseInt, parseFloat, JSON, report });
try { vm.runInContext(simCore, ctx); } catch (e) { console.error('sim-core failed to load:', e.message); process.exit(1); }

const probe = `
const pillarConfig={S:true,W:true,N:true};
const loadout=LOADOUTS.ayak;
const region=createRegion(pillarConfig);

// 1. buildSummary over a few real rollouts.
const rolls=[]; for(let s=0;s<8;s++)rolls.push(runRollout('MRYBXOOOO',{x:15,y:15},pillarConfig,loadout,400,region,77,s));
const bs=buildSummary(rolls.filter(Boolean),'MRYBXOOOO',pillarConfig,loadout,400,true);
report.summaryKeys=Object.keys(bs);
report.summaryPrayerLen=bs.prayer.length;
report.summaryIsPartial=bs.isPartial;
// buildSummary must be order-independent for its scalar metrics (the app ingests async).
const bs2=buildSummary(rolls.filter(Boolean).slice().reverse(),'MRYBXOOOO',pillarConfig,loadout,400,false);
report.orderIndependent = (bs.avgDamage===bs2.avgDamage && bs.deathPct===bs2.deathPct && JSON.stringify(bs.prayer)===JSON.stringify(bs2.prayer));

// 2. selectAutozukSurvivors on synthetic phase-1 summaries (tight spreads -> small CIs).
function mk(mean,n,spread,deaths,invalids){
  const damages=[]; for(let i=0;i<n;i++)damages.push(mean+(i%2?spread:-spread));
  return {avgDamage:mean,damages,deathPct:n>0?deaths/n*100:0,deathCount:deaths,validCount:n,
    invalidCount:invalids,totalSims:n+invalids,markedDead:false,prayer:['mage','mage','range','range'],avgTicks:50,isPartial:true};
}
const norm={}; // not blood barrage
// good tiles ~10/12, a clearly-worse tile ~50, a hard-loser (90% death)
const set1={ 'a':mk(10,30,2,0,0), 'b':mk(12,30,2,0,0), 'c':mk(50,30,2,0,0), 'd':mk(20,30,2,27,0) };
const keep1=selectAutozukSurvivors(set1,{topK:2,alpha:0.02,loadout:norm});
report.keep1=[...keep1].sort();

// many near-equal tiles -> keep at least topK
const set2={}; for(let i=0;i<10;i++)set2['t'+i]=mk(10+i*0.1,30,2,0,0);
const keep2=selectAutozukSurvivors(set2,{topK:3,alpha:0.02,loadout:norm});
report.keep2Size=keep2.size;

// all hard-losers -> fallback keeps all (least-bad)
const set3={ 'x':mk(60,30,2,29,0), 'y':mk(70,30,2,30,0) };
const keep3=selectAutozukSurvivors(set3,{topK:2,alpha:0.02,loadout:norm});
report.keep3Size=keep3.size;

// determinism
report.keep1b=[...selectAutozukSurvivors(set1,{topK:2,alpha:0.02,loadout:norm})].sort();
`;
vm.runInContext(probe, ctx);

let failed = false;
const check = (c, l) => { if (c) console.log('OK ' + l); else { console.error('FAIL ' + l); failed = true; } };

const need = ['avgDamage', 'prayer', 'markedDead', 'deathPct', 'damages', 'totalSims', 'isPartial', 'deathCount', 'validCount', 'invalidCount'];
check(need.every(k => report.summaryKeys.includes(k)), 'buildSummary has load-bearing + count fields');
check(report.summaryPrayerLen === 4, 'buildSummary prayer length 4');
check(report.summaryIsPartial === true, 'buildSummary honors isPartial flag');
check(report.orderIndependent === true, 'buildSummary scalar metrics are order-independent');

check(JSON.stringify(report.keep1) === JSON.stringify(['a', 'b']), `selection keeps the two best, drops worse+hard-loser (got ${JSON.stringify(report.keep1)})`);
check(report.keep2Size >= 3, `selection keeps >= topK near-equal tiles (got ${report.keep2Size})`);
check(report.keep3Size === 2, `all-hard-loser fallback keeps all (got ${report.keep3Size})`);
check(JSON.stringify(report.keep1) === JSON.stringify(report.keep1b), 'selection is deterministic');

if (failed) process.exit(1);
console.log('OK coordinator: all checks passed');
