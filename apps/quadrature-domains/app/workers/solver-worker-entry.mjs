// =============================================================================
// solver-worker-entry.mjs -- Native ES module worker entry for the primary
// solver (Phase 2). Replaces the runtime-Blob bundle + the WORKER_HANDLER string
// that primary-solver-worker.js used to build: imports the ESM solver graph
// directly and handles the three job kinds the warm / aux / live workers post
// ('solve' → solveInverseQD, 'altSearch' → searchAlternates, 'liveSolve' →
// liveSolveStep), echoing each jobId.
//
// The envelope + kind-dispatch now go through workers/protocol.mjs (C2): each
// handler just returns its result (or throws); protocol.dispatch owns the
// { kind, jobId, result | error } reply, the try/catch, and — new in C2 — an
// error reply for an unrecognized kind (previously such a message was silently
// dropped and the caller hung; QD-UI-4). The main-thread side is unchanged: it
// still matches replies by kind + jobId.
//
// `self` is guarded so this module (and its whole import graph) can be imported
// headlessly by the worker-entry graph-load test — Node has no worker `self`, so
// the handler simply isn't installed there.
// =============================================================================
import QD from './solver-graph.mjs';
import { dispatch } from './protocol.mjs';

// kind -> (msg) => result. protocol.dispatch wraps each in the shared envelope + try/catch.
const handlers = {
  solve: (m) => QD.solveInverseQD(m.hData, m.opts || {}),
  altSearch: (m) => QD.searchAlternates(m.hData, m.norm, m.known || [], m.opts || {}),
  liveSolve: (m) => QD.liveSolveStep(m.hData, m.initPhi, m.opts || {}),
};

if (typeof self !== 'undefined') {
  self.onmessage = (e) => dispatch(e.data, handlers, (m) => self.postMessage(m));
}
