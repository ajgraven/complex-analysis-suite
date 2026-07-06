// =============================================================================
// solver-worker-entry.mjs -- Native ES module worker entry for the primary
// solver (Phase 2). Replaces the runtime-Blob bundle + the WORKER_HANDLER string
// that primary-solver-worker.js used to build: imports the ESM solver graph
// directly and handles the three job kinds the warm / aux / live workers post
// ('solve' → solveInverseQD, 'altSearch' → searchAlternates, 'liveSolve' →
// liveSolveStep), echoing each jobId. Message protocol unchanged from the classic
// handler so the main-thread side is untouched semantically.
//
// `self` is guarded so this module (and its whole import graph) can be imported
// headlessly by the worker-entry graph-load test — Node has no worker `self`, so
// the handler simply isn't installed there.
// =============================================================================
import QD from './solver-graph.mjs';

if (typeof self !== 'undefined') {
  self.onmessage = function (e) {
    const msg = e.data;
    if (!msg) return;
    if (msg.kind === 'solve') {
      const { jobId, hData, opts } = msg;
      let result;
      try {
        result = QD.solveInverseQD(hData, opts || {});
      } catch (err) {
        self.postMessage({ kind: 'solve', jobId, error: String((err && err.stack) || err) });
        return;
      }
      self.postMessage({ kind: 'solve', jobId, result });
    } else if (msg.kind === 'altSearch') {
      const { jobId, hData, norm, known, opts } = msg;
      let result;
      try {
        result = QD.searchAlternates(hData, norm, known || [], opts || {});
      } catch (err) {
        self.postMessage({ kind: 'altSearch', jobId, error: String((err && err.stack) || err) });
        return;
      }
      self.postMessage({ kind: 'altSearch', jobId, result });
    } else if (msg.kind === 'liveSolve') {
      const { jobId, hData, initPhi, opts } = msg;
      let result;
      try {
        result = QD.liveSolveStep(hData, initPhi, opts || {});
      } catch (err) {
        self.postMessage({ kind: 'liveSolve', jobId, error: String((err && err.stack) || err) });
        return;
      }
      self.postMessage({ kind: 'liveSolve', jobId, result });
    }
  };
}
