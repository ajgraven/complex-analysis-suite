// =============================================================================
// sym-worker-entry.mjs -- Native ES module worker entry for the Algebra tab's
// heavy symbolic ops (Phase 2). Replaces algebra/sym-worker.js's runtime-Blob
// bundle (complex + faber-analysis + sym-core + handler string): imports the
// exact-symbolic core directly and dispatches QD.Sym.runJob, echoing the jobId
// and throttling progress posts. Protocol unchanged.
//
// `self` is guarded so the module graph is importable headlessly.
// =============================================================================
import _QD from '../solvers/solver.mjs';
import '../sym/sym-core.mjs';          // QD.Sym (the exact-symbolic core: runJob)
import '../analysis/faber-analysis.mjs';    // QD.FaberAnalysis — Durand–Kerner used by solveZeroDim

if (typeof self !== 'undefined') {
  self.onmessage = function (e) {
    const msg = e.data;
    if (!msg || msg.jobId == null) return;
    const { jobId, op, payload } = msg;
    let steps = 0;
    const onProgress = function (info) { if ((++steps & 63) === 0) self.postMessage({ kind: 'progress', jobId, info }); };
    let result;
    try {
      result = _QD.Sym.runJob(op, payload, onProgress);
    } catch (err) {
      self.postMessage({ kind: 'done', jobId, error: String((err && err.stack) || err) });
      return;
    }
    self.postMessage({ kind: 'done', jobId, result });
  };
}
