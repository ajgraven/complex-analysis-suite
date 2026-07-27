// @ts-nocheck
// =============================================================================
// schwarz-cpu-worker.js -- Dedicated Web Worker for the CPU Schwarz escape-time
// field (the fallback render path used when the GPU shader is unavailable or
// refuses a family, e.g. PQDs).
//
// Why: the CPU path builds an Int16 escape-count field by iterating σ per
// pixel (W×H, up to ~384²). Even time-sliced across requestAnimationFrame the
// work runs on the main thread and competes with input/paint. This worker
// rebuilds the Schwarz handle from the *serializable* φ + boundary samples
// (QD.Schwarz.buildSchwarzFromPhi takes plain data — no closures cross the
// wire) and computes the whole progressive pyramid off-thread, streaming one
// transferable field snapshot back per pass (4×4 → 2×2 → 1×1).
//
// The main thread still keeps its OWN sState.schwarz handle for interactivity
// (hover readout, orbit tracing, preimage tree, …) — only the heavy field
// compute is offloaded.
//
// API:
//   QD.SchwarzCpuWorker.isUsable() -> bool
//     Synchronous gate: false on file:// (workers can't fetch the bundle) or
//     when Worker is unavailable, or after a load failure. The Schwarz UI
//     checks this and falls back to its in-process pyramid when false.
//
//   QD.SchwarzCpuWorker.renderField(params, callbacks) -> { cancel() }
//     params:    { phi, boundaryPts, view:{cx,cy,scale,cssW,cssH}, W, H,
//                  maxIter, strides:[4,2,1] }
//     callbacks: { onPass(msg), onError(err), onUnavailable() }
//       onPass:  { stride, W, H, field:Int16Array, fieldKind:Uint8Array, done }
//                — fieldKind uses the same KIND+1 offset as the main thread
//                  (0 = unresolved; fundamental/escaped/interior/invalid = 1..4;
//                  outside = 5). One call per pyramid pass; `done` on the last.
//       onUnavailable: fired when no worker could be created — the caller
//                  should fall back to its in-process renderer.
//     A new renderField() preempts any in-flight render (terminate + recreate;
//     the bundle URL is cached, so respawn is cheap). The returned handle's
//     cancel() does the same.
//
//   QD.SchwarzCpuWorker.cancel() -> void   (terminate any in-flight render)
//
// Mirrors the bundle-building pattern of primary-solver-worker.js: fetch the
// shared WORKER_BUNDLE_FILES (cache-busted by CACHE_VERSION) plus
// schwarz-common.js, concatenate with `var window = self;` so the solver/
// schwarz files' `window.QD` registrations attach to the worker global, append
// a message handler, and Blob → object URL.
// =============================================================================

// ESM (Phase 2 port) — twin of schwarz/schwarz-cpu-worker.js (classic stays frozen). Main-thread API; spawns a
// NATIVE ES module worker (workers/schwarz-worker-entry.mjs) instead of the runtime-Blob
// bundle. isUsable() gates on Worker availability, so Node/file:// fall back to the
// caller's in-process renderer. Registers onto the QD namespace.
import _QD from '../solver.mjs';

(function () {
  'use strict';

  /** @type {Worker|null} */
  let _worker = null;
  /** @type {Promise<void>|null} */
  let _readyPromise = null;
  let _nextJobId = 1;
  /** @type {{ jobId:number, onMessage:(e:MessageEvent)=>void, cbs:object }|null} */
  let _inflight = null;
  let _mainThreadFallback = false;

  function _disposeWorker() {
    if (_worker) {
      try { _worker.terminate(); } catch (_) { /* ignore */ }
      _worker = null;
    }
    _readyPromise = null;
    _inflight = null;
  }

  async function ensureReady() {
    if (_mainThreadFallback) return;
    if (_worker) return;
    if (_readyPromise) { await _readyPromise; return; }
    _readyPromise = (async () => {
      if (typeof Worker === 'undefined') throw new Error('Worker unavailable in this environment');
      const w = new Worker(new URL('../workers/schwarz-worker-entry.mjs', import.meta.url), { type: 'module' });
      // Settle the in-flight render on a worker-LEVEL failure. Such a failure posts no
      // {kind:'schwarzError'} message, so logging alone left `_inflight` set and the caller
      // waiting on callbacks that could never fire: schwarz-render only clears
      // `sState.rendering` from the `m.done` path, and there is no watchdog anywhere in
      // schwarz-render / schwarz-ui — so the tab stuck on "Pass 1/3 (coarse) …" with a blank
      // canvas, permanently. Routing it to onError instead runs the caller's `fallback()`,
      // which restarts the render in-process and recovers.
      //
      // Reachable: schwarz-worker-entry guards only buildSchwarzFromPhi, leaving the
      // escapeTime loop unprotected, and a module-load failure of the entry (QD is a PWA —
      // stale service-worker caches) also fires `error` without throwing synchronously from
      // `new Worker`, so `_mainThreadFallback` is never set either.
      //
      // This is the fix the other three worker wrappers already carry; only this one lacked
      // it (primary-solver-worker.mjs has it with the same reasoning written down).
      const _failInflight = (detail) => {
        const job = _inflight;
        _inflight = null;
        if (job) {
          try { w.removeEventListener('message', job.onMessage); } catch (_) { /* ignore */ }
          if (job.cbs && job.cbs.onError) job.cbs.onError(detail);
        }
        _disposeWorker();
      };
      w.addEventListener('error', (ev) => {
        const detail = 'schwarz CPU worker crashed: ' + (ev.message || ev)
          + ' @ ' + (ev.filename || 'bundle') + ':' + (ev.lineno || '?');
        console.error('[schwarz-cpu worker] error: ' + detail);
        _failInflight(detail);
      });
      w.addEventListener('messageerror', (ev) => {
        console.error('[schwarz-cpu worker] messageerror (postMessage clone failed):', ev);
        _failInflight('schwarz CPU worker message error (structured-clone failed)');
      });
      _worker = w;
    })().catch((err) => {
      console.warn('[schwarz-cpu-worker] Worker unavailable (' + (err && err.message || err) +
        '). CPU Schwarz render will run on the main thread.');
      _mainThreadFallback = true;
      _readyPromise = null;
    });
    await _readyPromise;
  }

  // Synchronous viability gate for the caller's "use worker vs in-process"
  // decision. file:// can't fetch the bundle (same constraint as the other
  // workers), so report unusable there up front.
  function isUsable() {
    if (_mainThreadFallback) return false;
    if (typeof Worker === 'undefined') return false;
    if (typeof location !== 'undefined' && location.protocol === 'file:') return false;
    return true;
  }

  function renderField(params, cbs) {
    cbs = cbs || {};
    // Preempt any in-flight render. The worker can't be interrupted mid-pass,
    // so terminate + recreate (bundle URL is cached → cheap) to start the new
    // render immediately instead of queueing behind the stale one.
    if (_inflight) _disposeWorker();
    let cancelled = false;
    ensureReady().then(() => {
      if (cancelled) return;
      if (_mainThreadFallback || !_worker) { if (cbs.onUnavailable) cbs.onUnavailable(); return; }
      const jobId = _nextJobId++;
      const onMessage = (e) => {
        const m = e.data;
        if (!m || m.jobId !== jobId) return;
        if (m.kind === 'schwarzError') {
          _finish();
          if (cbs.onError) cbs.onError(m.error);
          return;
        }
        if (m.kind === 'schwarzPass') {
          if (cbs.onPass) cbs.onPass(m);
          if (m.done) _finish();
        }
      };
      function _finish() {
        try { _worker.removeEventListener('message', onMessage); } catch (_) { /* ignore */ }
        if (_inflight && _inflight.jobId === jobId) _inflight = null;
      }
      // `cbs` rides along so the worker-level error/messageerror handlers above can settle this
      // job through onError — they fire outside this closure and would otherwise have no way to
      // reach the caller.
      _inflight = { jobId, onMessage, cbs };
      _worker.addEventListener('message', onMessage);
      try {
        _worker.postMessage(Object.assign({ kind: 'schwarzRender', jobId }, params));
      } catch (err) {
        // Non-clonable payload (shouldn't happen — φ is plain data). Treat as
        // unavailable so the caller falls back to its in-process renderer.
        _finish();
        if (cbs.onUnavailable) cbs.onUnavailable();
      }
    }).catch(() => { if (cbs.onUnavailable) cbs.onUnavailable(); });
    return { cancel() { cancelled = true; _disposeWorker(); } };
  }

  function cancel() { _disposeWorker(); }
  function isBusy() { return _inflight !== null; }

  const ns = { ensureReady, isUsable, renderField, cancel, isBusy,
    _isMainThreadFallback() { return _mainThreadFallback; },
    _hasWorker() { return _worker !== null; },
  };
  _QD.SchwarzCpuWorker = ns;

})();
