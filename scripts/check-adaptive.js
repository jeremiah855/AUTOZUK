// Replay-equivalence regression for the TWO-PHASE adaptive sampler.
// For a corpus of (spawn code, seedBase), runs BOTH the full oracle (nmax sims on every
// eligible tile) and the two-phase adaptive flow (cheap phase-1 pass on all tiles -> one
// confidence cut via selectAutozukSurvivors -> phase-2 deep pass on survivors at full
// nmax), on the SAME seeds. Phase-2 survivors use seeds 0..nmax-1, identical to the oracle,
// so a survivor's summary is byte-identical to the oracle's. The adaptive winner therefore
// differs from the oracle only if the true best tile was dropped at the phase-1 cut.
// Asserts: winner-mismatch rate <= DELTA, and adaptive uses fewer sims.
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('index.html', 'utf8');
const simCore = /<script id="sim-core">([\s\S]*?)<\/script>/.exec(src)[1];

const report = {};
const ctx = vm.createContext({ console, Math, Set, Map, Uint8Array, Infinity, NaN, isNaN, parseInt, parseFloat, JSON, report });
vm.runInContext(simCore, ctx);

const probe = `
const pillarConfig={S:true,W:true,N:true};
const loadout=LOADOUTS.ayak;        // normal mode -> rank by avgDamage
const maxTicks=160, nmax=120, phase1Sims=40, topK=3, selectAlpha=0.02;
const codes=['MRYBXOOOO','XXXBB','MMRRX'];
const seeds=[101,202,303,404,505,606,707,808];

function betterThan(c,cur){ // mirror isBetterAutozukResult (normal path)
  if(!cur)return true;
  if(c.avgDamage!==cur.avgDamage)return c.avgDamage<cur.avgDamage;
  if(c.deathPct!==cur.deathPct)return c.deathPct<cur.deathPct;
  return c.avgTicks<cur.avgTicks;
}
function computeEligible(code,region){
  const parsed=parseSpawnCode(code); const testMobs=[];
  if(!parsed.error)for(const sp of parsed.spawns){if(sp.type==='nothing')continue;
    testMobs.push({x:sp.x,y:sp.y,size:MOB_DEFS[sp.type].size,type:sp.type,range:MOB_DEFS[sp.type].range,dead:false});}
  const tiles=[];
  for(let x=11;x<=19;x++)for(let y=11;y<=20;y++)if(!checkTileExcluded(x,y,testMobs,region))tiles.push({x,y});
  return tiles;
}
function bestOf(summaries,partialOk){
  let bk=null,br=null,anyFinal=false;
  for(const k in summaries){const r=summaries[k];if(!r)continue;if(!partialOk&&r.isPartial)continue;anyFinal=true;if(betterThan(r,br)){br=r;bk=k;}}
  if(!anyFinal&&!partialOk)for(const k in summaries){const r=summaries[k];if(!r)continue;if(betterThan(r,br)){br=r;bk=k;}}
  return bk;
}
function simTile(code,t,seedBase,region,n,isPartial){
  const rolls=[]; for(let s=0;s<n;s++)rolls.push(runRollout(code,t,pillarConfig,loadout,maxTicks,region,seedBase,s));
  return buildSummary(rolls,code,pillarConfig,loadout,maxTicks,isPartial);
}
function oracle(code,seedBase,eligible,region){
  const res={}; let sims=0;
  for(const t of eligible){res[t.x+','+t.y]=simTile(code,t,seedBase,region,nmax,false);sims+=nmax;}
  return {res,sims};
}
function adaptive(code,seedBase,eligible,region){
  const res={}; let sims=0;
  for(const t of eligible){res[t.x+','+t.y]=simTile(code,t,seedBase,region,phase1Sims,true);sims+=phase1Sims;}
  const keep=selectAutozukSurvivors(res,{topK,alpha:selectAlpha,loadout});
  const survivors=[];
  for(const t of eligible){const key=t.x+','+t.y; if(keep.has(key)){res[key]=simTile(code,t,seedBase,region,nmax,false);sims+=nmax;survivors.push(key);}}
  return {res,sims,survivors};
}

report.runs=[];
for(const code of codes){
  const region=createRegion(pillarConfig);
  const eligible=computeEligible(code,region);
  if(eligible.length===0)continue;
  for(const seedBase of seeds){
    const o=oracle(code,seedBase,eligible,region);
    const a=adaptive(code,seedBase,eligible,region);
    const oBest=bestOf(o.res,true), aBest=bestOf(a.res,false);
    report.runs.push({ code, seedBase, eligible:eligible.length, oBest, aBest, match:oBest===aBest,
      oracleSims:o.sims, adaptiveSims:a.sims, survivorCount:a.survivors.length,
      winnerInSurvivors:a.survivors.indexOf(aBest)>=0 });
  }
}
`;
vm.runInContext(probe, ctx);

const runs = report.runs, DELTA = 0.05;
let failed = false;
const check = (c, l) => { if (c) console.log('OK ' + l); else { console.error('FAIL ' + l); failed = true; } };

const mismatches = runs.filter(r => !r.match);
const rate = mismatches.length / runs.length;
const oracleTotal = runs.reduce((s, r) => s + r.oracleSims, 0);
const adaptiveTotal = runs.reduce((s, r) => s + r.adaptiveSims, 0);
const ratio = adaptiveTotal / oracleTotal;

console.log(`runs=${runs.length}  eligible/run≈${runs[0].eligible}  mismatches=${mismatches.length} (rate ${(rate*100).toFixed(1)}%)  sims adaptive/oracle=${adaptiveTotal}/${oracleTotal} = ${ratio.toFixed(3)} (${(1/ratio).toFixed(2)}x fewer)`);
for (const m of mismatches) console.error(`  mismatch ${m.code}@${m.seedBase}: oracle=${m.oBest} adaptive=${m.aBest}`);

check(rate <= DELTA, `winner-mismatch rate <= DELTA (${(rate*100).toFixed(1)}% <= ${DELTA*100}%)`);
check(runs.every(r => r.winnerInSurvivors || r.survivorCount === 0), 'winner is a survivor (or all tiles hard-eliminated)');
check(ratio < 1, `adaptive uses fewer sims than the oracle (ratio ${ratio.toFixed(3)})`);

if (failed) process.exit(1);
console.log('OK adaptive: two-phase replay-equivalence holds');
