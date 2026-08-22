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
    // Tier-2 pole-drag: dedicated live-worker surface for per-frame drag solves.
    ok('PrimarySolverWorker: has liveSolve()', typeof PSW.liveSolve === 'function');
    ok('PrimarySolverWorker: has cancelLive()', typeof PSW.cancelLive === 'function');
    ok('PrimarySolverWorker: has isLiveBusy()', typeof PSW.isLiveBusy === 'function');
    ok('PrimarySolverWorker: has analyze()', typeof PSW.analyze === 'function');
    ok('PrimarySolverWorker: has cancelAnalysis()', typeof PSW.cancelAnalysis === 'function');
    ok('PrimarySolverWorker: has isAnalysisBusy()', typeof PSW.isAnalysisBusy === 'function');
    // Functional: in the Node fallback (no Worker), liveSolve resolves via the
    // main-thread QD.liveSolveStep. Warm-start from a solved disk φ.
    if (typeof PSW.liveSolve === 'function') {
      const R = 1.4;
      const hData = { poles: [{ a: { re: 0, im: 0 }, principal: [{ re: R * R, im: 0 }] }] };
      const base = QD_NS.solveInverseQD(hData);
      if (base.success) {
        const seed = QD_NS.clonePhi(base.primary.phi);
        const res = await PSW.liveSolve(hData, seed, { newton: { maxIter: 30 }, numSamples: 64 });
        ok('PrimarySolverWorker: liveSolve fallback resolves a valid live result',
           !!res && res.success === true && res.univalent === true,
           res ? (res.error || '') : 'no result');
      }
    }
    if (typeof PSW.analyze === 'function') {
      const phi = { family: 'boundedQD', unbounded: false, w0: { re: 0, im: 0 },
        branches: [{ z: { re: 0, im: 0 }, A: [{ re: 1, im: 0 }, { re: 0.5, im: 0 }] }] };
      const res = await PSW.analyze(phi, { poles: [] }, { samples: 96, observableSamples: 128 });
      ok('PrimarySolverWorker: analyze fallback returns the cardioid cusp',
         !!res && !!res.cuspProps && res.cuspProps.cusps.length === 1,
         res && res.cuspProps && res.cuspProps.notes ? res.cuspProps.notes.join('; ') : 'no cusp result');
    }
  }

  ok('SchwarzCpuWorker: exported', !!SCW);
  if (SCW) {
    ok('SchwarzCpuWorker: has renderField()', typeof SCW.renderField === 'function');
    ok('SchwarzCpuWorker: has isUsable()', typeof SCW.isUsable === 'function');
    ok('SchwarzCpuWorker: has cancel()', typeof SCW.cancel === 'function');
    ok('SchwarzCpuWorker: has ensureReady()', typeof SCW.ensureReady === 'function');
  }
};
