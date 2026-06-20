// Throughput bench for the current sim engine. Runs the full eligible-tile
// MRYBXOOOO wave single-threaded and reports sims/sec. Runs at real global scope
// (not a vm sandbox) so numbers reflect the browser worker.
//
//   node scripts/profile.js           # print sims/sec
//   node scripts/profile.js --prof    # also write a flamegraph (.cpuprofile)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PROF = process.argv.includes('--prof');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const core = /<script id="sim-core">([\s\S]*?)<\/script>/.exec(html)[1];
const harness = `
const pc={S:true,W:true,N:true},lo=LOADOUTS['blowpipe'],code='MRYBXOOOO',region=createRegion(pc);
let p=parseSpawnCode(code),tm=[];for(let s of p.spawns){if(s.type==='nothing')continue;tm.push({x:s.x,y:s.y,size:MOB_DEFS[s.type].size,type:s.type,range:MOB_DEFS[s.type].range,dead:false});}
let tiles=[];for(let y=ARENA_Y_MIN;y<=ARENA_Y_MAX;y++)for(let x=ARENA_X_MIN;x<=ARENA_X_MAX;x++)if(!checkTileExcluded(x,y,tm,region))tiles.push({x,y});
function sim(t,sb){let all=[];for(let s=0;s<400;s++){let seed=(sb^(t.x*73856093)^(t.y*19349663)^(s*83492791))>>>0;let r=hlRunSim(code,t,pc,lo,400,region,seed);if(r)all.push(r);if(s===2&&all.length>=3){let qp=optimizePrayer(all,code,pc,lo);if(all.every(r=>calcSimDamage(r.attacks,qp.sequence,lo,r.mobInitHP).died))break;}if(s===9&&all.length>=10){let qp=optimizePrayer(all,code,pc,lo);let d=all.map(r=>calcSimDamage(r.attacks,qp.sequence,lo,r.mobInitHP).damage);if(d.reduce((a,b)=>a+b,0)/d.length>80)break;}}if(!all.length)return 0;let pr=optimizePrayer(all,code,pc,lo);for(let r of all){if(r.status==='invalid')continue;calcSimDamage(r.attacks,pr.sequence,lo,r.mobInitHP);}return all.length;}
let total=0;const t0=performance.now();for(let i=0;i<tiles.length;i++)total+=sim(tiles[i],(i*2654435761)>>>0);const wall=performance.now()-t0;
console.log(JSON.stringify({tiles:tiles.length,sims:total,wall}));`;

const tmp = path.join(os.tmpdir(), `autozuk-bench-${process.pid}.js`);
fs.writeFileSync(tmp, core + '\n' + harness);

const nodeArgs = PROF
  ? ['--cpu-prof', '--cpu-prof-dir', ROOT, '--cpu-prof-name', 'autozuk.cpuprofile', tmp]
  : [tmp];
const r = spawnSync(process.execPath, nodeArgs, { encoding: 'utf8', maxBuffer: 1 << 26 });
fs.unlinkSync(tmp);
if (r.status !== 0) { console.error(r.stderr); process.exit(1); }

const out = JSON.parse(r.stdout.trim().split('\n').pop());
const rate = Math.round(out.sims / out.wall * 1000);
console.log(`${out.sims} sims  ${out.wall.toFixed(0)} ms  ${rate} sims/sec  (${out.tiles} tiles)`);
if (PROF) console.log('wrote autozuk.cpuprofile — open in https://www.speedscope.app or Chrome DevTools (Performance → load profile)');
