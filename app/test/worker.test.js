'use strict';
// worker tests — PrimarySolverWorker + SchwarzCpuWorker main-thread fallback API
// surface. Split from the former monolithic node-test.js (Phase 2). The modules
// are loaded into the shared vm context by test/bootstrap.js (with window/self
// masked, so the Node fallback path runs); here we just assert the exported
// surface that ui.js / schwarz-ui.js rely on. PSW/SCW are bootstrap globals.
require('./bootstrap');

module.exports = async function run() {
  ok('PrimarySolverWorker: exported', !!PSW);
  if (PSW) {
    ok('PrimarySolverWorker: has solve()', typeof PSW.solve === 'function');
    ok('PrimarySolverWorker: has ensureReady()', typeof PSW.ensureReady === 'function');
    ok('PrimarySolverWorker: has cancel()', typeof PSW.cancel === 'function');
    ok('PrimarySolverWorker: has isBusy()', typeof PSW.isBusy === 'function');
    // A3: dedicated aux-worker surface for background alternate search.
    ok('PrimarySolverWorker: has searchAlternates()', typeof PSW.searchAlternates === 'function');
    ok('PrimarySolverWorker: has cancelAux()', typeof PSW.cancelAux === 'function');
    ok('PrimarySolverWorker: has isAuxBusy()', typeof PSW.isAuxBusy === 'function');
  }

  ok('SchwarzCpuWorker: exported', !!SCW);
  if (SCW) {
    ok('SchwarzCpuWorker: has renderField()', typeof SCW.renderField === 'function');
    ok('SchwarzCpuWorker: has isUsable()', typeof SCW.isUsable === 'function');
    ok('SchwarzCpuWorker: has cancel()', typeof SCW.cancel === 'function');
    ok('SchwarzCpuWorker: has ensureReady()', typeof SCW.ensureReady === 'function');
  }
};
