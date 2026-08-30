// Runs each check as a child process and exits non-zero if any fail.
const { spawnSync } = require('child_process');
const path = require('path');

const TESTS = [
  'check-syntax.js',
  'check-simcore.js',
  'check-worker.js',
  'equiv-hash.js',
  'check-determinism.js',
  'check-expect.js',
];

let failed = 0;
const results = [];
for (const file of TESTS) {
  const r = spawnSync(process.execPath, [path.join(__dirname, file)], { encoding: 'utf8' });
  const ok = r.status === 0;
  if (!ok) failed++;
  results.push({ file, ok, out: (r.stdout || '') + (r.stderr || '') });
  console.log(`\n── ${file}`);
  process.stdout.write(r.stdout || '');
  if (r.stderr) process.stderr.write(r.stderr);
}

console.log('\n' + '='.repeat(40));
for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.file}`);
console.log('='.repeat(40));
if (failed) { console.log(`${failed}/${results.length} failed`); process.exit(1); }
console.log(`all ${results.length} passed`);
