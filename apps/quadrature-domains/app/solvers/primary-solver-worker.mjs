// @ts-nocheck
// =============================================================================
// primary-solver-worker.js -- Single warm Web Worker for the Inverse-tab
// primary solve path.
//
// Why: the full QD.solveInverseQD pipeline (multistart + continuation +
// deflation + diverse-seeds) runs for 50-500 ms on hard h's. On the main
// thread that freezes input + repaint, forcing a 250 ms debounce on
// solveAndRender. A single warm worker doing the same work keeps the UI
// responsive.
//
// API:
//   QD.PrimarySolverWorker.ensureReady() -> Promise<void>
//     Lazy-create the worker. Idempotent.
//
//   QD.PrimarySolverWorker.solve(hData, opts, { signal? }) -> Promise<result>
//     Post a solve request to the worker. Resolves with the same
//     { success, primary, alternates, attempts, error } shape that
//     QD.solveInverseQD returns on the main thread. `signal.aborted` (or
//     calling cancel()) terminates the in-flight job and rejects with
//     { aborted: true }.
//
//   QD.PrimarySolverWorker.cancel() -> void
//     Abort any in-flight solve. The worker is terminated and recreated on
//     the next solve() — the easiest way to interrupt deeply-nested Newton
//     iteration since the worker thread can't otherwise be preempted.
//
//   QD.PrimarySolverWorker.isBusy() -> bool
//
//   QD.PrimarySolverWorker.searchAlternates(hData, norm, known, opts)
//       -> Promise<solution[]>
//     Background alternate-solution search (QD.searchAlternates) on a SEPARATE
//     aux worker, so it never blocks or preempts an interactive primary solve
//     (A3). Posting a new request supersedes any prior in-flight aux job.
//
//   QD.PrimarySolverWorker.cancelAux() -> void
//     Abort any in-flight alternate search (terminates the aux worker).
//
//   QD.PrimarySolverWorker.analyze(phi, hData, opts) -> Promise<status>
//     Run geometry, cusp, observables, accuracy, and symmetry work on a
//     dedicated deferred-analysis worker. A newer analysis terminates stale
//     work so it cannot queue ahead of current status data.
//
// Fallback: if Worker / fetch fails (e.g. file:// origin), solve() runs
// on the main thread synchronously inside a Promise.resolve().then(...) so
// callers don't need to special-case anything. Logged once at console.warn.
//
// Reuses the same solver-source list as param-slice-pool.js, with its own
// worker-side handler.
// =============================================================================

// ESM (Phase 2 port). Main-thread API; spawns a
// NATIVE ES module workers (a lean solver entry plus a deferred analysis entry)
// instead of the runtime-Blob bundle, and falls back to imported main-thread
// functions when Worker is unavailable (Node tests, file://). Registers onto QD.
import _QD from './solver.mjs';
import { formatWorkerErrorDetail } from '../workers/worker-crash-detail.mjs';

(function () {
  'use strict';

  // createWorkerLane -- the shared lifecycle for ONE warm ES-module Worker lane (refactor Stage C1).
  //
  // The lanes below (primary solve / aux alt-search / live drag-solve / status analysis) were near-verbatim copies of
  // the SAME shape: `_worker/_readyPromise/_inflight/_fallback` module-lets -> _disposeWorker -> ensureReady
  // -> run (supersede-then-post-then-settle, with a main-thread fallback) -> cancel -> isBusy, plus a
  // per-lane spawn-failure latch. They differed only in: the message `kind`, the posted payload's shape, the
  // main-thread fallback fn + its args, whether the lane installs a `messageerror` handler (PRIMARY does;
  // aux/live do NOT), and the crash/log labels. This factory collapses those to config.
  //
  // Each call gets its OWN closure state, so the three fallback latches remain INDEPENDENT — a background
  // alt-search / live-drag spawn failure must not demote the interactive primary lane to the main thread
  // (qd-psw-fallback-latch-01). Behaviour is preserved EXACTLY: pinned by psw-lifecycle.test.ts
  // (round-trip / supersede / cancel / spawn-fault) and psw-crash-char.test.ts (error / messageerror /
  // the primary-only-messageerror asymmetry).
  //
  // cfg: { messageKind, buildPost(jobId, ...args), fallback(...args), hasMessageError,
  //        crashLabel, logLabel, warnPrefix, warnSuffix, getSignal?(args) }
  // cfg additionally supplies `createWorker()`, whose body keeps the worker URL a
  // literal so Vite can emit that entry chunk.
  function createWorkerLane(cfg) {
    /** @type {Worker|null} */
    let _worker = null;
    /** @type {Promise<void>|null} */
    let _readyPromise = null;
    let _nextJobId = 1;
    /** @type {{jobId:number, resolve:Function, reject:Function, onMessage:Function}|null} */
    let _inflight = null;      // current outstanding job on THIS lane, if any
    let _fallback = false;     // set true after THIS lane's worker fails to load once (its own latch)
    let _everWorked = false;   // set once THIS worker returns a message — tells a bundle/load failure (never
                               // worked → latch fallback) apart from a mid-run crash on a worker that worked.

    function _disposeWorker(reason = { aborted: true }) {
      if (_worker) { try { _worker.terminate(); } catch (_) { /* ignore */ } _worker = null; }
      _readyPromise = null;
      if (_inflight) { _inflight.reject(reason); _inflight = null; }
    }

    async function ensureReady() {
      if (_fallback) return;
      if (_worker) return;
      if (_readyPromise) { await _readyPromise; return; }
      _readyPromise = (async () => {
        if (typeof Worker === 'undefined') throw new Error('Worker unavailable in this environment');
        const w = cfg.createWorker();
        w.addEventListener('error', (ev) => {
          const detail = formatWorkerErrorDetail(ev);
          console.error('[primary-solver ' + cfg.logLabel + '] error: ' + detail);
          // A worker-level error (bundle load/syntax error, crash, OOM) posts NO {error} message, so
          // without this the in-flight promise would never settle and the UI would spin forever. Reject it
          // as a REAL error (not an abort, so the pipeline surfaces it) and respawn on the next run().
          if (_inflight) {
            const job = _inflight; _inflight = null;
            try { w.removeEventListener('message', job.onMessage); } catch (_) { /* ignore */ }
            job.reject(new Error(cfg.crashLabel + ' crashed: ' + detail));
          }
          // If the worker errored WITHOUT ever having returned a message, its bundle never loaded (e.g. a
          // 404 entry chunk / syntax error); respawning would re-fail identically and hang every future
          // run(). Latch this lane to the main-thread fallback so it SELF-HEALS instead of hard-failing. A
          // worker that HAD worked keeps terminate-and-retry (a transient crash retries on the fast worker
          // path) — the asymmetry is pinned by psw-crash-char.test.ts. See QD-BUILD-1.
          if (!_everWorked) _fallback = true;
          _disposeWorker();
        });
        if (cfg.hasMessageError) {
          w.addEventListener('messageerror', (ev) => {
            console.error('[primary-solver ' + cfg.logLabel + '] messageerror (postMessage clone failed):', ev);
            if (_inflight) {
              const job = _inflight; _inflight = null;
              try { w.removeEventListener('message', job.onMessage); } catch (_) { /* ignore */ }
              job.reject(new Error(cfg.crashLabel + ' message error (structured-clone failed)'));
            }
            _disposeWorker();
          });
        }
        _worker = w;
      })().catch((err) => {
        console.warn('[primary-solver-worker] ' + cfg.warnPrefix + ' (' + ((err && err.message) || err) +
          '). ' + cfg.warnSuffix);
        _fallback = true;
        _readyPromise = null;
      });
      await _readyPromise;
    }

    function run(...args) {
      return ensureReady().then(() => {
        // Main-thread fallback path — used when the Worker bundle could not be built. Yields one microtask
        // so callers are still .then-able.
        if (_fallback || !_worker) {
          return Promise.resolve().then(() => cfg.fallback(...args));
        }
        // Supersede any prior in-flight job before posting a new one; the previous caller's promise rejects
        // with { aborted: true, superseded: true }. The worker is REUSED (not terminated) on supersede.
        if (_inflight) {
          if (cfg.terminateOnSupersede) {
            // Analysis is entirely discardable once a newer solve/overlay request
            // exists. Terminate rather than queue it ahead of current status work.
            _disposeWorker({ aborted: true, superseded: true });
            return run(...args);
          }
          _inflight.reject({ aborted: true, superseded: true });
          try { _worker.removeEventListener('message', _inflight.onMessage); } catch (_) { /* ignore */ }
          _inflight = null;
        }
        const jobId = _nextJobId++;
        return new Promise((resolve, reject) => {
          const onMessage = (e) => {
            const m = e.data;
            if (!m || m.kind !== cfg.messageKind || m.jobId !== jobId) return;
            _everWorked = true; // the worker's bundle loaded and round-tripped a message
            try { _worker.removeEventListener('message', onMessage); } catch (_) { /* ignore */ }
            _inflight = null;
            if (m.error) reject(new Error(m.error));
            else resolve(m.result);
          };
          _inflight = { jobId, resolve, reject, onMessage };
          _worker.addEventListener('message', onMessage);

          // Forward an optional AbortSignal -> cancel() (primary lane only; aux/live pass none).
          const signal = cfg.getSignal ? cfg.getSignal(args) : null;
          if (signal) {
            if (signal.aborted) { cancel(); return; }
            const onAbort = () => { cancel(); };
            signal.addEventListener('abort', onAbort, { once: true });
          }

          _worker.postMessage(cfg.buildPost(jobId, ...args));
        });
      });
    }

    // Terminate-and-recreate is the cheap way to preempt deeply-nested Newton; the next run() rebuilds.
    function cancel() { _disposeWorker(); }
    function isBusy() { return _inflight !== null; }

    return { ensureReady, run, cancel, isBusy, _isFallback: () => _fallback, _hasWorker: () => _worker !== null };
  }

  // Keep the solve lanes on their lean entry. Status analysis has its own entry so
  // the primary solve does not parse or retain the optional analysis graph.
  const createSolverWorker = () =>
    new Worker(new URL('../workers/solver-worker-entry.mjs', import.meta.url), { type: 'module' });
  const createAnalysisWorker = () =>
    new Worker(new URL('../workers/analysis-worker-entry.mjs', import.meta.url), { type: 'module' });

  const primary = createWorkerLane({
    messageKind: 'solve', logLabel: 'worker', crashLabel: 'solver worker',
    hasMessageError: true,
    warnPrefix: 'Worker unavailable',
    warnSuffix: 'Falling back to main-thread solver. Serve via a local web server (e.g. `python -m http.server`) to enable.',
    createWorker: createSolverWorker,
    buildPost: (jobId, hData, opts) => ({ kind: 'solve', jobId, hData, opts: opts || {} }),
    fallback: (hData, opts) => _QD.solveInverseQD(hData, opts || {}),
    getSignal: (args) => args[2] && args[2].signal,   // solve(hData, opts, { signal? })
  });

  // Aux worker — background alternate-solution search (A3).
  const aux = createWorkerLane({
    messageKind: 'altSearch', logLabel: 'aux worker', crashLabel: 'alt-search worker',
    hasMessageError: true, // settle a structured-clone failure (reject + dispose) instead of hanging the lane
    warnPrefix: 'Aux worker unavailable',
    warnSuffix: 'Alternate search will run on the main thread.',
    createWorker: createSolverWorker,
    buildPost: (jobId, hData, norm, known, opts) =>
      ({ kind: 'altSearch', jobId, hData, norm, known: known || [], opts: opts || {} }),
    fallback: (hData, norm, known, opts) => _QD.searchAlternates(hData, norm, known || [], opts || {}),
  });

  // Live worker — per-drag-frame warm-start solve (QD.liveSolveStep).
  const live = createWorkerLane({
    messageKind: 'liveSolve', logLabel: 'live worker', crashLabel: 'live-solve worker',
    hasMessageError: true, // settle a structured-clone failure (reject + dispose) instead of hanging the lane
    warnPrefix: 'Live worker unavailable',
    warnSuffix: 'Live drag solve will run on the main thread.',
    createWorker: createSolverWorker,
    buildPost: (jobId, hData, initPhi, opts) =>
      ({ kind: 'liveSolve', jobId, hData, initPhi, opts: opts || {} }),
    fallback: (hData, initPhi, opts) => _QD.liveSolveStep(hData, initPhi, opts || {}),
  });

  // Status-panel analyses are materially heavier than the solve-display path.
  // Give them a dedicated lane so their geometry/accuracy sweeps cannot block
  // input or compete with a newly requested primary solve.
  const analysis = createWorkerLane({
    messageKind: 'analyze', logLabel: 'analysis worker', crashLabel: 'analysis worker',
    hasMessageError: true,
    warnPrefix: 'Analysis worker unavailable',
    warnSuffix: 'Status analyses will run on the main thread.',
    createWorker: createAnalysisWorker,
    terminateOnSupersede: true,
    buildPost: (jobId, phi, hData, opts) => ({ kind: 'analyze', jobId, phi, hData, opts: opts || {} }),
    fallback: (phi, hData, opts) => {
      const geom = _QD.classifyUnivalence ? _QD.classifyUnivalence(phi, { samples: opts?.samples, univalent: opts?.univalent }) : null;
      const cuspProps = _QD.classifyCusps ? _QD.classifyCusps(phi, {}) : null;
      const obs = _QD.boundaryObservables ? _QD.boundaryObservables(phi, { samples: opts?.observableSamples }) : null;
      const acc = !opts?.live && hData && _QD.estimateAccuracy ? _QD.estimateAccuracy(phi, hData, {}) : null;
      const symmetry = _QD.detectSymmetry ? _QD.detectSymmetry(phi) : null;
      const observables = obs && !opts?.includeObservableSeries
        ? (() => {
            const summary = { ...obs };
            delete summary.w;
            delete summary.curvature;
            return { obs: summary, acc, hasSeries: false };
          })()
        : (obs ? { obs, acc, hasSeries: true } : null);
      return { geom, cuspProps, observables, symmetry };
    },
  });

  // Expose under the QD namespace — the SAME public surface + per-lane diagnostics as before the C1 factory.
  _QD.PrimarySolverWorker = {
    ensureReady: primary.ensureReady,
    solve: (hData, opts, runOpts) => primary.run(hData, opts, runOpts || {}),
    cancel: primary.cancel,
    isBusy: primary.isBusy,
    // Background alternate-search (A3) — dedicated aux worker.
    searchAlternates: (hData, norm, known, opts) => aux.run(hData, norm, known, opts),
    cancelAux: aux.cancel,
    isAuxBusy: aux.isBusy,
    // Live drag-frame solve — dedicated live worker (Tier-2 pole-drag).
    liveSolve: (hData, initPhi, opts) => live.run(hData, initPhi, opts),
    cancelLive: live.cancel,
    isLiveBusy: live.isBusy,
    // Deferred geometry/cusp/accuracy work. A newer analysis request terminates
    // stale work rather than queueing it ahead of the current status panel.
    analyze: (phi, hData, opts) => analysis.run(phi, hData, opts),
    cancelAnalysis: analysis.cancel,
    isAnalysisBusy: analysis.isBusy,
    // Diagnostics — one pair per lane; the latches are independent, so a test can prove one lane's
    // failure leaves the others on the worker path.
    _isMainThreadFallback: primary._isFallback,
    _hasWorker: primary._hasWorker,
    _isAuxFallback: aux._isFallback,
    _hasAuxWorker: aux._hasWorker,
    _isLiveFallback: live._isFallback,
    _hasLiveWorker: live._hasWorker,
    _isAnalysisFallback: analysis._isFallback,
    _hasAnalysisWorker: analysis._hasWorker,
  };

})();
