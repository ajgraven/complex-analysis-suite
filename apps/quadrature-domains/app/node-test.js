// =============================================================================
// node-test.js -- headless test-suite ENTRY (runnable via `node node-test.js`
// or `npm test`). The suite was split (Phase 2) into per-subsystem files under
// app/test/; this is now a thin ASYNC runner that boots the shared vm context +
// harness once (test/bootstrap.js installs the kernels + ok/approxEq/… on
// `global`), then awaits each subsystem's exported run() in turn. The "N passed,
// M failed" tally it prints is the source of truth for the test count.
//
// To add tests: drop a new app/test/<name>.test.js exporting `async function
// run()` and add its name to TESTS below. The file lists the loader once relied
// on are now DERIVED from asset-manifest.js (see test/bootstrap.js +
// test/parse-check.test.js) — no more hand-synced copies.
// =============================================================================
'use strict';

const bootstrap = require('./test/bootstrap'); // async init() imports ESM leaves + installs globals
const { ok, report } = require('./test/harness');

// Ordered for readable output. Order is not load-bearing: bootstrap eagerly
// loads every kernel, so each file's run() only reads already-resolved globals.
const TESTS = [
  'solvers',
  'direct',
  'schwarz',
  'param-slice',
  'sphere',
  'cusps',
  'cusp-accuracy',
  'symmetry',
  'thesis-examples',
  'faber',
  'riemann',
  'parse-check',
  'worker',
  'ui-inputs',
  'cmax',
  'observables',
  'sym-core',
  'sym-radical',
  'qd-equations',
  'qd-constraints',
  'algebra-store',
  'cas-export',
  'expr-parser',
  'define-subst',
  'cardioid-uniqueness',
];
// Note: manifest.test (retired with asset-manifest at the flip) and the jsdom DOM tests
// (ui-domain-plot, schwarz-ui) moved to Vitest — the latter import the .mjs in a jsdom env
// (vitest/ui-domain-plot.test.ts, vitest/schwarz-ui.test.ts).

// Per-file assertion floors — a LOCALIZED companion to the aggregate suite-size
// floor in manifest.test.js. The aggregate floor catches a large overall shrink
// but can't say WHICH file vanished; a file that early-returns or loses its body
// (a broken guard, a stray `return`, a throw swallowed upstream) drops its
// contribution to ~0 while the suite still exits 0 (assertions that never run
// leave fail=0). This asserts each registered file contributed at least a
// conservative minimum, so a silently-disabled subsystem fails the run.
//
// Floors are deliberately WELL BELOW current counts — raise one only on a
// measured, intentional increase. Optional-dep / jsdom-gated files legitimately
// skip to a single marker assertion when their dep is absent, so they floor at 1.
const FLOORS = {
  solvers: 30, direct: 1, schwarz: 20, 'param-slice': 15, sphere: 5,
  cusps: 5, 'cusp-accuracy': 5, symmetry: 2, 'thesis-examples': 8, faber: 8,
  riemann: 1, 'parse-check': 3, worker: 3,
  'ui-inputs': 1, cmax: 3, observables: 5, 'sym-core': 250, 'sym-radical': 45, 'qd-equations': 60, 'qd-constraints': 16,
  'algebra-store': 220, 'cas-export': 33, 'expr-parser': 18, 'define-subst': 36, 'cardioid-uniqueness': 19,
};
const DEFAULT_FLOOR = 3;

(async () => {
  await bootstrap.init();                     // async setup: imports the ESM-ported leaf modules
  let ran = 0;
  for (const name of TESTS) {
    const before = report();
    const run = require('./test/' + name + '.test.js');
    await run();
    const after = report();
    const contributed = (after.pass + after.fail) - (before.pass + before.fail);
    const floor = FLOORS[name] != null ? FLOORS[name] : DEFAULT_FLOOR;
    ok('runner: ' + name + '.test.js contributed ≥ ' + floor + ' assertions',
       contributed >= floor, 'contributed ' + contributed);
    ran++;
  }
  ok('runner: all ' + TESTS.length + ' registered test files ran', ran === TESTS.length,
     'ran ' + ran + '/' + TESTS.length);
  const { pass, fail } = report();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('test runner crashed:', (e && e.stack) || e);
  process.exit(1);
});
