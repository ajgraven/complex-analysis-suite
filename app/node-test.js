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

require('./test/bootstrap');                 // builds the vm ctx + installs shared globals (once)
const { report } = require('./test/harness');

// Ordered for readable output. Order is not load-bearing: bootstrap eagerly
// loads every kernel, so each file's run() only reads already-resolved globals.
const TESTS = [
  'solvers',
  'direct',
  'schwarz',
  'param-slice',
  'sphere',
  'cusps',
  'riemann',
  'parse-check',
  'worker',
  'ui-domain-plot',
  'schwarz-ui',
  'ui-inputs',
  'manifest',
];

(async () => {
  for (const name of TESTS) {
    const run = require('./test/' + name + '.test.js');
    await run();
  }
  const { pass, fail } = report();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('test runner crashed:', (e && e.stack) || e);
  process.exit(1);
});
