// =============================================================================
// sym-worker.js -- Off-main-thread runner for the heavy symbolic ops
// (QD.SymWorker). Gröbner bases and zero-dimensional solving can run for
// hundreds of ms to seconds; on the main thread that freezes the Algebra tab.
// This wraps QD.Sym.runJob in a Web Worker built from a Blob bundle of the
// exact-symbolic core (mirrors primary-solver-worker.js), with progress
// callbacks and cooperative cancellation (terminate-and-recreate).
//
// API (QD.SymWorker):
//   ensureReady() -> Promise<void>                       lazy-create the worker
//   run(op, payload, { onProgress?, signal? }) -> Promise<result>
//       op ∈ {'groebner','solveZeroDim'}; payload/result are SERIALIZED
//       (term lists, plain objects) exactly as QD.Sym.runJob expects/returns.
//   cancel() -> void                                     abort the in-flight job
//   isBusy() -> bool
//
// Fallback: if Worker / fetch / Blob is unavailable (file:// origin, Node test
// context, older browsers), run() executes QD.Sym.runJob on the main thread
// inside a resolved Promise — same result shape, no special-casing for callers.
// =============================================================================

(function (global) {
  'use strict';

  // The exact-symbolic core + its root-finder dependency. Fetched relative to the
  // page origin (like primary-solver-worker.js) and concatenated into the bundle.
  const SRC_FILES = ['complex.js', 'faber-analysis.js', 'sym-core.js'];

  // Worker-side handler: dispatches QD.Sym.runJob, throttling onProgress posts by
  // step count (no Date dependency), and echoes the jobId on the final message.
  const WORKER_HANDLER = `
;(function () {
  'use strict';
  self.onmessage = function (e) {
    const msg = e.data;
    if (!msg || msg.jobId == null) return;
    const { jobId, op, payload } = msg;
    let steps = 0;
    const onProgress = function (info) { if ((++steps & 63) === 0) self.postMessage({ kind: 'progress', jobId, info }); };
    let result;
    try { result = self.QD.Sym.runJob(op, payload, onProgress); }
    catch (err) { self.postMessage({ kind: 'done', jobId, error: String((err && err.stack) || err) }); return; }
    self.postMessage({ kind: 'done', jobId, result });
  };
})();
`;

  let _bundlePromise = null;
  function getBundleURL() {
    if (_bundlePromise) return _bundlePromise;
    _bundlePromise = (async () => {
      const parts = ['var window = self;\n'];   // solver files register on window.QD → alias to self
      const ver = (global.QD_ASSET_MANIFEST && global.QD_ASSET_MANIFEST.CACHE_VERSION) || '0';
      for (const f of SRC_FILES) {
        let resp;
        try { resp = await fetch(f + '?v=' + encodeURIComponent(ver)); }
        catch (e) { throw new Error('sym-worker: network error fetching ' + f + ': ' + ((e && e.message) || e)); }
        if (!resp.ok) throw new Error('sym-worker: failed to fetch ' + f + ' (' + resp.status + ')');
        parts.push('/*===== ' + f + ' =====*/\n', await resp.text(), '\n');
      }
      parts.push('/*===== sym-worker handler =====*/\n', WORKER_HANDLER);
      return URL.createObjectURL(new Blob(parts, { type: 'application/javascript' }));
    })();
    return _bundlePromise;
  }

  let _worker = null;
  let _readyPromise = null;
  let _nextJobId = 1;
  let _inflight = null;       // { jobId, resolve, reject, onMessage }
  let _fallback = false;      // true once the worker can't be built (file://, Node, …)

  function _dispose() {
    if (_worker) { try { _worker.terminate(); } catch (_) { /* ignore */ } _worker = null; }
    _readyPromise = null;
    if (_inflight) { _inflight.reject({ aborted: true }); _inflight = null; }
  }

  async function ensureReady() {
    if (_fallback) return;
    if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof fetch === 'undefined') { _fallback = true; return; }
    if (_worker) return;
    if (_readyPromise) { await _readyPromise; return; }
    _readyPromise = (async () => {
      const url = await getBundleURL();
      const w = new Worker(url);
      w.addEventListener('error', (ev) => {
        const detail = (ev.message || ev) + ' @ ' + (ev.filename || 'bundle') + ':' + (ev.lineno || '?');
        if (typeof console !== 'undefined') console.error('[sym-worker] error: ' + detail);
        if (_inflight) {
          const job = _inflight; _inflight = null;
          try { w.removeEventListener('message', job.onMessage); } catch (_) { /* ignore */ }
          job.reject(new Error('sym-worker crashed: ' + detail));
        }
        _dispose();
      });
      _worker = w;
    })().catch((err) => {
      if (typeof console !== 'undefined') {
        console.warn('[sym-worker] Worker unavailable (' + ((err && err.message) || err) +
          '). Heavy symbolic ops will run on the main thread.');
      }
      _fallback = true;
      _readyPromise = null;
    });
    await _readyPromise;
  }

  function run(op, payload, runOpts) {
    runOpts = runOpts || {};
    return ensureReady().then(() => {
      // Main-thread fallback — run the exact-same dispatcher synchronously.
      if (_fallback || !_worker) {
        return Promise.resolve().then(() => global.QD.Sym.runJob(op, payload, runOpts.onProgress));
      }
      // Supersede any prior job.
      if (_inflight) {
        _inflight.reject({ aborted: true, superseded: true });
        try { _worker.removeEventListener('message', _inflight.onMessage); } catch (_) { /* ignore */ }
        _inflight = null;
      }
      const jobId = _nextJobId++;
      return new Promise((resolve, reject) => {
        const onMessage = (e) => {
          const m = e.data;
          if (!m || m.jobId !== jobId) return;
          if (m.kind === 'progress') { if (runOpts.onProgress) { try { runOpts.onProgress(m.info); } catch (_) { /* ignore */ } } return; }
          if (m.kind === 'done') {
            try { _worker.removeEventListener('message', onMessage); } catch (_) { /* ignore */ }
            _inflight = null;
            if (m.error) reject(new Error(m.error)); else resolve(m.result);
          }
        };
        _inflight = { jobId, resolve, reject, onMessage };
        _worker.addEventListener('message', onMessage);
        const signal = runOpts.signal;
        if (signal) {
          if (signal.aborted) { cancel(); return; }
          signal.addEventListener('abort', () => cancel(), { once: true });
        }
        _worker.postMessage({ jobId, op, payload });
      });
    });
  }

  function cancel() { _dispose(); }
  function isBusy() { return _inflight !== null; }

  const ns = { ensureReady, run, cancel, isBusy, _isFallback() { return _fallback; }, _hasWorker() { return _worker !== null; } };
  if (global.QD) global.QD.SymWorker = ns;
  else if (global.module && global.module.exports) global.module.exports = ns;
  else global.QD_SymWorker = ns;

})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : globalThis));
