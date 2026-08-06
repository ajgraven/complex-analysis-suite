// =============================================================================
// sym-worker.js -- Off-main-thread runner for the heavy symbolic ops
// (QD.SymWorker). Gröbner bases and zero-dimensional solving can run for
// hundreds of ms to seconds; on the main thread that freezes the Algebra tab.
// This wraps QD.Sym.runJob in a Web Worker built from a Blob bundle of the
// exact-symbolic core (mirrors primary-solver-worker.js), with progress
// callbacks and terminate-and-recreate on BOTH cancel and supersede (the entry
// runs runJob synchronously, so a stale job is only stopped by killing the thread).
//
// API (QD.SymWorker):
//   ensureReady() -> Promise<void>                       lazy-create the worker
//   run(op, payload, { onProgress?, signal? }) -> Promise<result>
//       op ∈ {'groebner','solveZeroDim','dimension'}; payload/result are SERIALIZED
//       (term lists, plain objects) exactly as QD.Sym.runJob expects/returns.
//   cancel() -> void                                     abort the in-flight job
//   isBusy() -> bool
//
// Fallback: if Worker / fetch / Blob is unavailable (file:// origin, Node test
// context, older browsers), run() executes QD.Sym.runJob on the main thread
// inside a resolved Promise — same result shape, no special-casing for callers.
// =============================================================================

// ESM (Phase 2 port) — twin of algebra/sym-worker.js (classic stays frozen). Main-thread API; spawns a
// NATIVE ES module worker (workers/sym-worker-entry.mjs) instead of the runtime-Blob bundle,
// and falls back to the imported main-thread QD.Sym.runJob when Worker is unavailable
// (Node tests, file://). Registers QD.SymWorker.
import _QD from '../solvers/solver.mjs';
import { formatWorkerErrorDetail } from '../workers/worker-crash-detail.mjs';

(function () {
  'use strict';

  let _worker = null;
  let _readyPromise = null;
  let _nextJobId = 1;
  let _inflight = null;       // { jobId, resolve, reject, onMessage, op, payload, onProgress }
  let _fallback = false;      // true once the worker can't be built (file://, Node, …) OR a load fails
  let _everWorked = false;    // set once THIS worker returns a message — tells a bundle/load failure
                              // (never worked → self-heal to main thread) from a mid-run transient crash

  // Hard-stop the worker: terminate the thread (killing any in-flight computation) and
  // drop it so the next ensureReady() rebuilds a fresh one. Does NOT settle _inflight —
  // the caller decides how the pending promise resolves (cancel → aborted; supersede →
  // superseded), then clears it.
  function _teardownWorker() {
    if (_worker) { try { _worker.terminate(); } catch (_) { /* ignore */ } _worker = null; }
    _readyPromise = null;
  }

  function _dispose() {
    _teardownWorker();
    if (_inflight) { if (_inflight.detachAbort) _inflight.detachAbort(); _inflight.reject({ aborted: true }); _inflight = null; }
  }

  async function ensureReady() {
    if (_fallback) return;
    if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof fetch === 'undefined') { _fallback = true; return; }
    if (_worker) return;
    if (_readyPromise) { await _readyPromise; return; }
    _readyPromise = (async () => {
      _everWorked = false; // a freshly-built worker hasn't proven it loads until it returns a message
      const w = new Worker(new URL('../workers/sym-worker-entry.mjs', import.meta.url), { type: 'module' });
      w.addEventListener('error', (ev) => {
        const detail = formatWorkerErrorDetail(ev);
        if (typeof console !== 'undefined') console.error('[sym-worker] error: ' + detail);
        const job = _inflight; _inflight = null;
        if (job) {
          try { w.removeEventListener('message', job.onMessage); } catch (_) { /* ignore */ }
          if (job.detachAbort) job.detachAbort();                    // F3: drop this job's signal listener too
        }
        _teardownWorker();
        if (!_everWorked) {
          // LOAD failure — the worker module never ran (bundle 404 / stale-cache chunk hash / syntax error).
          // Rebuilding would re-fail identically, so latch to the main thread PERMANENTLY (F4, now also for the
          // had-a-job case — QD-SYM-LOAD). And SELF-HEAL the in-flight op: re-run it on the main thread and settle
          // the ORIGINAL promise, so ★ Auto-reduce & solve keeps working instead of surfacing "sym-worker crashed".
          _fallback = true;
          if (job) {
            try { job.resolve(_QD.Sym.runJob(job.op, job.payload, job.onProgress)); }
            catch (err) { job.reject(err instanceof Error ? err : new Error(String(err))); }
          }
          return;
        }
        // A worker that HAD returned a message then errored = a transient mid-run crash: reject the in-flight
        // job; the next run() rebuilds a fresh worker (a crash is NOT a permanent latch).
        if (job) job.reject(new Error('sym-worker crashed: ' + detail));
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

  async function run(op, payload, runOpts) {
    runOpts = runOpts || {};
    await ensureReady();
    // Main-thread fallback — run the exact-same dispatcher synchronously. The fallback
    // never sets _inflight, so there is nothing to supersede on this path.
    if (_fallback || !_worker) return _QD.Sym.runJob(op, payload, runOpts.onProgress);
    // Supersede any prior in-flight job — checked AFTER ensureReady() so we observe a job
    // posted by a run() call that resolved just ahead of us (e.g. two runs issued before
    // the first worker finished building). The entry runs runJob synchronously in its
    // onmessage, so a busy worker can't start a newly-posted job until the old one
    // finishes; merely rejecting the old promise (the pre-fix behavior) left the discarded
    // Gröbner/solve burning a core and delayed the new op by the old one's full remaining
    // runtime. So TERMINATE the worker (matching cancel()) and rebuild a fresh thread.
    if (_inflight) {
      const stale = _inflight;
      _inflight = null;
      try { _worker.removeEventListener('message', stale.onMessage); } catch (_) { /* ignore */ }
      if (stale.detachAbort) stale.detachAbort();                                  // F3: drop the stale signal listener
      _teardownWorker();
      stale.reject({ aborted: true, superseded: true });
      await ensureReady();                                                        // rebuild
      if (_fallback || !_worker) return _QD.Sym.runJob(op, payload, runOpts.onProgress);
    }
    const jobId = _nextJobId++;
    return new Promise((resolve, reject) => {
      const signal = runOpts.signal;
      const onAbort = () => cancel();
      // F3: a removable abort listener — detach it whenever the job settles, so a LATE abort on THIS
      // (already-finished) signal can't fire cancel() and tear down a SUCCESSOR job.
      const detachAbort = () => { if (signal) { try { signal.removeEventListener('abort', onAbort); } catch (_) { /* ignore */ } } };
      const onMessage = (e) => {
        const m = e.data;
        if (m) _everWorked = true; // any message from THIS worker proves its bundle loaded and ran
        if (!m || m.jobId !== jobId) return;
        if (m.kind === 'progress') { if (runOpts.onProgress) { try { runOpts.onProgress(m.info); } catch (_) { /* ignore */ } } return; }
        if (m.kind === 'done') {
          try { _worker.removeEventListener('message', onMessage); } catch (_) { /* ignore */ }
          detachAbort();
          _inflight = null;
          if (m.error) reject(new Error(m.error)); else resolve(m.result);
        }
      };
      _inflight = { jobId, resolve, reject, onMessage, detachAbort, op, payload, onProgress: runOpts.onProgress };
      _worker.addEventListener('message', onMessage);
      if (signal) {
        if (signal.aborted) { detachAbort(); cancel(); return; }
        signal.addEventListener('abort', onAbort, { once: true });
      }
      _worker.postMessage({ jobId, op, payload });
    });
  }

  function cancel() { _dispose(); }
  function isBusy() { return _inflight !== null; }

  const ns = { ensureReady, run, cancel, isBusy, _isFallback() { return _fallback; }, _hasWorker() { return _worker !== null; } };
  _QD.SymWorker = ns;

})();
