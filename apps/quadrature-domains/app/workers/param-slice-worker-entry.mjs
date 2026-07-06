// =============================================================================
// param-slice-worker-entry.mjs -- Native ES module worker entry for the
// Parameter-slice sweep pool (Phase 2). Replaces param-slice-pool.js's runtime-
// Blob bundle (WORKER_BUNDLE_FILES + param-slice-common.js + handler string):
// side-effect-imports the ESM solver graph (so QD.solveInverseQD & the family
// registry are live) and imports the ParamSlice kernel directly. Handles the
// 'tile' job kind, caching the base scenario across tiles (A5). Protocol
// unchanged from the classic handler.
//
// `self` is guarded so the module graph is importable headlessly.
// =============================================================================
import './solver-graph.mjs';                              // loads the solver families (side effect)
import PS from '../param-slice/param-slice-common.mjs';   // the ParamSlice API (default export)

if (typeof self !== 'undefined') {
  self.onmessage = function (e) {
    const msg = e.data;
    if (!msg || msg.kind !== 'tile') return;
    const { jobId, sweepPoints, warmHints } = msg;
    // Refresh the cached scenario when the pool sends a new one; otherwise
    // reuse the last one this worker received (A5).
    if (msg.scenario) self._psScenario = msg.scenario;
    const scenario = self._psScenario;
    if (!scenario) {
      self.postMessage({ kind: 'tile', jobId, error: 'param-slice worker: no scenario cached for scenarioId ' + msg.scenarioId });
      return;
    }
    const expectedFamilyTag = scenario.expectedFamilyTag || undefined;
    const results = new Array(sweepPoints.length);
    // One scratch scenario per tile message — mutated in place between pixels so
    // we pay the cloneScenario cost only once per tile rather than once per pixel.
    const scratch = PS.cloneScenario(scenario);
    let chainWarm = null;
    for (let i = 0; i < sweepPoints.length; i++) {
      const hint = (warmHints && warmHints[i]) || chainWarm;
      const r = PS.solveOnePointWithScratch(scratch, sweepPoints[i], hint, expectedFamilyTag);
      if (r.phiSerialized) chainWarm = r.phiSerialized;
      results[i] = r;
    }
    self.postMessage({ kind: 'tile', jobId, results });
  };
}
