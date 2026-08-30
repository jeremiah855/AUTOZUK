# AUTOZUK

A single-file web app for simulating and solving TzKal-Zuk waves. Everything
lives in `index.html`. The simulation engine is the inline
`<script id="sim-core">` block, which is shared between the main thread and
the web workers that run the solver.

## Running the tests

```
npm test
```

This runs the headless engine suite under Node: syntax and load checks for
the sim core and the worker, an output equivalence hash, a determinism check
for seeded rollouts, and a scenario corpus that must match the pinned
baseline in `scripts/expect/baseline.json`. CI runs the same suite on every
push and pull request.

The baseline pins engine behaviour so that performance work can be verified
as behaviour preserving. After an intentional behaviour change, re-bless it
with:

```
node scripts/check-expect.js --update
```

## Running the benchmark

```
node scripts/profile.js
```

This extracts the sim-core block and runs the full eligible-tile MRYBXOOOO
wave single-threaded, then reports throughput in sims per second. It runs at
real global scope rather than a vm sandbox, so the numbers reflect what the
browser worker sees.

```
node scripts/profile.js --prof
```

The `--prof` flag additionally writes `autozuk.cpuprofile` to the repository
root. Open it as a flamegraph in Chrome DevTools under Performance, or at
https://www.speedscope.app.
