// =============================================================================
// bench.js -- Benchmark suite (D5).
//
// Runs each family's representative-hardness preset N times and reports
// median / p10 / p90 wall-clock per solve, plus median Newton iterations.
// Intended for local + CI use: pin a baseline JSON via --baseline-out, then
// run with --baseline to fail when median time regresses past a threshold.
//
// Usage:
//   node app/bench.js                            # print a report to stdout
//   node app/bench.js --runs 30                  # custom run count
//   node app/bench.js --baseline-out bench.json  # write current results as baseline
//   node app/bench.js --baseline bench.json      # compare to baseline; exit
//                                                  non-zero on >25% slowdown
//
// Output is also machine-readable: the final line is a JSON object with
// `{ scenarios: [{ name, n, medianMs, p10Ms, p90Ms, medianNewtonIter,
//                  meanCondEst, condEstMax }], totalMs }`.
// =============================================================================

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Boot the solver namespace the same way node-test.js does.
const ctx = { module: { exports: {} }, exports: {}, global, require, console, process, __dirname, __filename };
ctx.global = ctx;
vm.createContext(ctx);
// Canonical worker-bundle order (each solver-*.js needs its seeds-*.js loaded
// first — the solvers throw at load time otherwise). Kept in lock-step with
// asset-manifest.js WORKER_BUNDLE_FILES so every family (incl. the PQDs) loads.
for (const f of [
  'complex.js', 'taylor.js', 'solver.js', 'solver-faber.js',
  'solvers/seeds/seeds-qd.js', 'solver-qd.js',
  'solvers/seeds/seeds-uqd.js', 'solver-uqd.js',
  'solver-lqd-common.js', 'solvers/seeds/seeds-lqd.js', 'solver-lqd.js',
  'solvers/seeds/seeds-lqd-singular.js', 'solver-lqd-singular.js',
  'solvers/seeds/seeds-uqd-lqd.js', 'solver-uqd-lqd.js',
  'solvers/seeds/seeds-uqd-lqd-singular.js', 'solver-uqd-lqd-singular.js',
  'solver-pqd-common.js', 'solvers/seeds/seeds-pqd.js', 'solver-pqd.js',
  'solvers/seeds/seeds-pqd-singular.js', 'solver-pqd-singular.js',
  'solvers/seeds/seeds-uqd-pqd.js', 'solver-uqd-pqd.js',
  'solvers/seeds/seeds-uqd-pqd-singular.js', 'solver-uqd-pqd-singular.js',
  'poly-helpers.js', 'parse-h.js',
]) {
  const src = fs.readFileSync(path.join(__dirname, f), 'utf8')
    .replace(/typeof window !== 'undefined'/g, 'false');
  vm.runInContext(src, ctx, { filename: f });
}
const QD = vm.runInContext('module.exports', ctx);

// --------- CLI args ---------------------------------------------------------
const args = process.argv.slice(2);
function flag(name)        { return args.includes(name); }
function flagVal(name, dflt) {
  const i = args.indexOf(name);
  return (i >= 0 && i + 1 < args.length) ? args[i + 1] : dflt;
}
const RUNS = parseInt(flagVal('--runs', '15'), 10);
const BASELINE_PATH      = flagVal('--baseline', null);
const BASELINE_OUT_PATH  = flagVal('--baseline-out', null);
const REGRESSION_PCT     = parseFloat(flagVal('--threshold', '25'));

// --------- Scenarios --------------------------------------------------------
// Hand-picked "real but not trivial" presets per family. Each yields a
// successful solve in <1s on a modern laptop.
const SCENARIOS = [
  {
    name: 'boundedQD: 3-pole equilateral',
    hData: {
      poles: [
        { a: { re:  1,    im: 0          }, principal: [{ re: 1, im: 0 }] },
        { a: { re: -0.5,  im:  0.8660254 }, principal: [{ re: 1, im: 0 }] },
        { a: { re: -0.5,  im: -0.8660254 }, principal: [{ re: 1, im: 0 }] },
      ],
    },
    opts: { w0: { re: 0, im: 0 } },
  },
  {
    name: 'boundedQD: cardioid',
    hData: { poles: [{ a: { re: 0, im: 0 },
                        principal: [{ re: 1.5, im: 0 }, { re: 0.5, im: 0 }] }] },
    opts: { w0: { re: 0, im: 0 } },
  },
  {
    name: 'unboundedQD: 2-pole non-uniqueness',
    hData: {
      poles: [
        { a: { re:  1, im: 0 }, principal: [{ re: 1, im: 0 }] },
        { a: { re: -1, im: 0 }, principal: [{ re: 1, im: 0 }] },
      ],
    },
    opts: { unbounded: true, c: 0.4 },
  },
  {
    name: 'boundedLQD: 1-pt α=2',
    hData: { poles: [{ a: { re: 1, im: 0 }, principal: [{ re: 2, im: 0 }] }] },
    opts: { lqd: true, w0: { re: 1, im: 0 } },
  },
  {
    // Bounded power QD (Family.powerQD). Tracks per-solve cost of the αth-root /
    // continuous-arg branch machinery that dominates the param-slice PQD path.
    name: 'powerQD: 1-pt α=2',
    hData: { poles: [{ a: { re: 3, im: 0 }, principal: [{ re: 3, im: 0 }] }] },
    opts: { alpha: 2 },
  },
  {
    name: 'boundedLQD_singular: Thm 5.6.2',
    hData: { poles: [{ a: { re: 2, im: 0 }, principal: [{ re: 0.5, im: 0 }] }] },
    opts: { lqd: true, singular: true, w0: { re: 1, im: 0 }, q: { re: 0, im: 0 } },
  },
  {
    name: 'unboundedLQD: 1-pt c=0.6',
    hData: { poles: [{ a: { re: 2, im: 0 }, principal: [{ re: 1, im: 0 }] }] },
    opts: { lqd: true, unbounded: true, c: 0.6 },
  },
  {
    name: 'unboundedLQD_singular: q=0.1',
    hData: { poles: [{ a: { re: 2, im: 0 }, principal: [{ re: 1, im: 0 }] }] },
    opts: { lqd: true, singular: true, unbounded: true, c: 0.6, q: { re: 0.1, im: 0 } },
  },
];

// --------- Stats helpers ----------------------------------------------------
function median(xs) {
  const s = xs.slice().sort((a, b) => a - b);
  const n = s.length;
  return n % 2 === 1 ? s[(n - 1) / 2] : 0.5 * (s[n / 2 - 1] + s[n / 2]);
}
function percentile(xs, p) {
  const s = xs.slice().sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.round(p / 100 * (s.length - 1))));
  return s[idx];
}
function mean(xs) { return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0; }
function fmtMs(ms) { return ms < 10 ? ms.toFixed(2) : ms.toFixed(1); }

// --------- Bench a scenario -------------------------------------------------
function benchScenario(sc, runs) {
  // Warm-up (JIT + family-dispatch cache + solver internals).
  try { QD.solveInverseQD(sc.hData, sc.opts); } catch (_) { /* ignore */ }

  const timesMs = [];
  const iters = [];
  let condEstSum = 0, condEstMax = 0, condEstSamples = 0, lastError = null;
  let nSuccess = 0;
  for (let i = 0; i < runs; i++) {
    const t0 = process.hrtime.bigint();
    let result;
    try { result = QD.solveInverseQD(sc.hData, sc.opts); }
    catch (e) { lastError = e.message; continue; }
    const t1 = process.hrtime.bigint();
    timesMs.push(Number(t1 - t0) / 1e6);
    if (result && result.success) {
      nSuccess++;
      if (result.primary && typeof result.primary.iterations === 'number') {
        iters.push(result.primary.iterations);
      }
    } else {
      lastError = (result && result.error) || 'unknown';
    }
  }
  return {
    name: sc.name,
    n: runs,
    nSuccess,
    medianMs:   timesMs.length ? median(timesMs)        : null,
    p10Ms:      timesMs.length ? percentile(timesMs, 10) : null,
    p90Ms:      timesMs.length ? percentile(timesMs, 90) : null,
    meanMs:     timesMs.length ? mean(timesMs)          : null,
    medianNewtonIter: iters.length ? median(iters) : null,
    meanCondEst: condEstSamples ? condEstSum / condEstSamples : null,
    condEstMax,
    lastError,
  };
}

// --------- Run --------------------------------------------------------------
console.log('QD Solver — benchmark suite');
console.log('runs / scenario: ' + RUNS);
console.log('-'.repeat(72));
console.log(
  ['scenario'.padEnd(44), 'med(ms)'.padStart(8), 'p10'.padStart(7),
   'p90'.padStart(7), 'iter'.padStart(5)].join(' ')
);
console.log('-'.repeat(72));

const t0 = process.hrtime.bigint();
const scenarios = [];
for (const sc of SCENARIOS) {
  const r = benchScenario(sc, RUNS);
  scenarios.push(r);
  if (r.medianMs == null) {
    console.log(sc.name.padEnd(44) + '   FAILED (' + r.lastError + ')');
  } else {
    console.log(
      [r.name.padEnd(44),
       fmtMs(r.medianMs).padStart(8),
       fmtMs(r.p10Ms).padStart(7),
       fmtMs(r.p90Ms).padStart(7),
       (r.medianNewtonIter ?? '-').toString().padStart(5)].join(' ')
    );
  }
}
const totalMs = Number(process.hrtime.bigint() - t0) / 1e6;
console.log('-'.repeat(72));
console.log('total: ' + fmtMs(totalMs) + ' ms');

const report = { scenarios, totalMs, runs: RUNS, ts: new Date().toISOString() };

// --------- Baseline write / compare -----------------------------------------
if (BASELINE_OUT_PATH) {
  fs.writeFileSync(BASELINE_OUT_PATH, JSON.stringify(report, null, 2));
  console.log('Baseline written to ' + BASELINE_OUT_PATH);
}

let exitCode = 0;
if (BASELINE_PATH) {
  if (!fs.existsSync(BASELINE_PATH)) {
    console.error('Baseline file not found: ' + BASELINE_PATH);
    exitCode = 2;
  } else {
    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
    const byName = new Map(baseline.scenarios.map(s => [s.name, s]));
    let regressions = 0;
    for (const cur of scenarios) {
      const base = byName.get(cur.name);
      if (!base || base.medianMs == null || cur.medianMs == null) continue;
      const pct = (cur.medianMs - base.medianMs) / base.medianMs * 100;
      const tag = pct > REGRESSION_PCT ? '  REGRESS'
              : pct < -REGRESSION_PCT ? '  WIN'
              : '';
      console.log('  ' + cur.name.padEnd(44) + ' ' +
                  (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%' + tag);
      if (pct > REGRESSION_PCT) regressions++;
    }
    if (regressions > 0) {
      console.error('Regression check FAILED: ' + regressions + ' scenario(s) > ' +
                    REGRESSION_PCT + '% slower.');
      exitCode = 1;
    } else {
      console.log('Regression check PASSED (threshold ' + REGRESSION_PCT + '%).');
    }
  }
}

// Machine-readable trailing line for CI scrapers.
console.log('BENCH_JSON ' + JSON.stringify(report));

process.exit(exitCode);
