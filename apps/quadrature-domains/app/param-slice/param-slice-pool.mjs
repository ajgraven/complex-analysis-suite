// =============================================================================
// param-slice-pool.js -- Web Worker pool for the Parameter-slice tab.
//
// Builds a self-contained Worker bundle by fetching the existing solver
// source files and concatenating them with param-slice-common.js plus a
// thin worker-side message handler.  No build step required — works
// directly from the static site.
//
// API:
//   const pool = await ParamSlicePool.create();
//   const handle = pool.runSweep({
//     scenario,         // { hData, norm, opts } (base, never mutated)
//     mode,             // mode string (used by classifier)
//     axes,             // 1-D: [{ ref, min, max, n }]
//                       // 2-D: [{ ref, min, max, n }, { ref, min, max, n }]
//     onTile,           // (tile) => void   // tile = { row, results: [{cls,...}, ...] }
//     onDone,           // ({ tilesDone, totalTiles, msTotal }) => void
//     onError,          // (err) => void  (optional)
//   });
//   // handle.cancel() stops further dispatch.
//
// One "tile" = one row of pixels (1-D mode: a single tile with all pixels).
// Workers warm-start within a row by chaining the previous pixel's valid
// φ into the next QD.newtonSolve call.
// =============================================================================

// ESM (Phase 2 port) — twin of param-slice/param-slice-pool.js (classic stays frozen). Web Worker pool; spawns
// NATIVE ES module workers (workers/param-slice-worker-entry.mjs) instead of the runtime-
// Blob bundle, with a main-thread MainThreadPool fallback. Exposes ParamSlicePool as the
// default export (was a bare global). Imports the ParamSlice kernel it orchestrates.
import PS from './param-slice-common.mjs';

const _pool = (function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Pool
  // ---------------------------------------------------------------------------
  class Pool {
    constructor(workers, bundleURL) {
      this.workers = workers;
      this.bundleURL = bundleURL;
      this.idle = workers.slice();         // queue of available workers
      this.pending = [];                   // tile jobs awaiting a worker
      this.activeJobs = new Map();         // jobId → { worker, resolve }
      this._nextJobId = 1;
      this._scenarioSeq = 0;               // assigns scenarioIds (A5)
      this._cancelled = false;
    }

    // Allocate a stable id for a base scenario so workers can cache it across
    // tiles instead of receiving a fresh clone every tile (A5).
    nextScenarioId() { return ++this._scenarioSeq; }

    _dispatch() {
      while (this.idle.length > 0 && this.pending.length > 0 && !this._cancelled) {
        const worker = this.idle.shift();
        const job = this.pending.shift();
        const jobId = this._nextJobId++;
        this.activeJobs.set(jobId, { worker, resolve: job.resolve });
        const onMessage = (e) => {
          const m = e.data;
          if (!m || m.jobId !== jobId) return;
          worker.removeEventListener('message', onMessage);
          this.activeJobs.delete(jobId);
          this.idle.push(worker);
          if (m.error) console.error('[param-slice worker] tile error:', m.error);
          job.resolve(m.results);
          this._dispatch();
        };
        worker.addEventListener('message', onMessage);
        // Send the full scenario only when this worker hasn't yet cached this
        // scenarioId; otherwise the worker reuses its cached copy (A5).
        const sendScenario = worker._loadedScenarioId !== job.scenarioId;
        if (sendScenario) worker._loadedScenarioId = job.scenarioId;
        worker.postMessage({
          kind: 'tile',
          jobId,
          scenarioId: job.scenarioId,
          scenario: sendScenario ? job.scenario : undefined,
          sweepPoints: job.sweepPoints,
          warmHints: job.warmHints || null,
        });
      }
    }

    submitTile(scenario, scenarioId, sweepPoints, warmHints) {
      return new Promise((resolve) => {
        this.pending.push({ scenario, scenarioId, sweepPoints, warmHints, resolve });
        this._dispatch();
      });
    }

    // Dispatch a batch of `points` (param-assignment arrays, one per pixel)
    // by splitting evenly across workers. Each worker gets a contiguous
    // chunk so it can chain its own implicit warm-start within the chunk.
    // `warmHints` is an optional parallel array of φ objects (or null) used
    // as the explicit per-pixel seed; nearby cells in the parent caller
    // produce these hints from already-evaluated valid pixels.
    async solveBatch(scenario, mode, points, warmHints) {
      if (!points || points.length === 0) return [];
      const scenarioWithTag = _attachFamilyTag(scenario, mode);
      const scenarioId = this.nextScenarioId();      // shared across this batch's chunks (A5)
      const nChunks = Math.min(this.workers.length, points.length);
      const out = new Array(points.length);
      const chunkSize = Math.ceil(points.length / nChunks);
      const promises = [];
      for (let c = 0; c < nChunks; c++) {
        const start = c * chunkSize;
        const end = Math.min(points.length, start + chunkSize);
        if (start >= end) break;
        const chunkPoints = points.slice(start, end);
        const chunkHints  = warmHints ? warmHints.slice(start, end) : null;
        const p = this.submitTile(scenarioWithTag, scenarioId, chunkPoints, chunkHints).then((results) => {
          if (!results) return;
          for (let i = 0; i < results.length; i++) out[start + i] = results[i];
        });
        promises.push(p);
      }
      await Promise.all(promises);
      return out;
    }

    cancel() {
      this._cancelled = true;
      // Resolve outstanding pending jobs with empty results so the
      // orchestration code's awaits don't hang forever.
      for (const job of this.pending) job.resolve(null);
      this.pending.length = 0;
    }

    terminate() {
      this.cancel();
      for (const w of this.workers) {
        try { w.terminate(); } catch (e) { /* ignore */ }
      }
      this.workers.length = 0;
    }

    // Linear (non-adaptive) sweep — dispatch the full grid row-by-row.
    // Used by the 1-D path; the 2-D path uses solveBatch via the adaptive
    // renderer in param-slice-ui.js.
    runSweep({ scenario, mode, axes, onTile, onError }) {
      if (this._cancelled) this._cancelled = false;
      const n0 = axes[0].n;
      const has2 = axes.length === 2;
      const n1 = has2 ? axes[1].n : 1;
      const xs = sampleAxis(axes[0]);
      const ys = has2 ? sampleAxis(axes[1]) : [null];
      const scenarioWithTag = _attachFamilyTag(scenario, mode);
      const scenarioId = this.nextScenarioId();      // one id for the whole sweep (A5)

      const t0 = performance.now();
      let tilesDone = 0;
      const promises = [];
      for (let row = 0; row < n1; row++) {
        const yVal = ys[row];
        const sweepPoints = new Array(n0);
        for (let col = 0; col < n0; col++) {
          const pt = [{ ref: axes[0].ref, value: xs[col] }];
          if (has2) pt.push({ ref: axes[1].ref, value: yVal });
          sweepPoints[col] = pt;
        }
        const p = this.submitTile(scenarioWithTag, scenarioId, sweepPoints, null).then((results) => {
          if (results == null) return;
          tilesDone++;
          if (onTile) {
            try { onTile({ row, results, xs, yVal, tilesDone, totalTiles: n1 }); }
            catch (e) { if (onError) onError(e); }
          }
        }).catch((e) => { if (onError) onError(e); });
        promises.push(p);
      }
      const donePromise = Promise.all(promises).then(() => ({
        tilesDone, totalTiles: n1, msTotal: performance.now() - t0,
      }));
      return { cancel: () => this.cancel(), done: donePromise };
    }
  }

  // Attach the expected family tag to the scenario so workers can quickly
  // gate warm-start applicability (mismatched-family phis would crash).
  function _attachFamilyTag(scenario, mode) {
    const ps = PS;
    return Object.assign({}, scenario, {
      expectedFamilyTag: (ps && ps.MODE_FAMILY_TAG) ? ps.MODE_FAMILY_TAG[mode] : undefined,
    });
  }

  function sampleAxis(axis) {
    const { min, max, n } = axis;
    if (n === 1) return [(min + max) / 2];
    const out = new Array(n);
    const step = (max - min) / (n - 1);
    for (let i = 0; i < n; i++) out[i] = min + i * step;
    return out;
  }

  async function createPool(opts = {}) {
    if (typeof Worker === 'undefined') throw new Error('Worker unavailable in this environment');
    const n = Math.max(1, Math.min(opts.maxWorkers || (navigator.hardwareConcurrency || 4), 16));
    const workers = [];
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('../workers/param-slice-worker-entry.mjs', import.meta.url), { type: 'module' });
      // Surface worker-level errors (script-parse, uncaught throw inside
      // the message handler) to the console so misconfigurations don't get
      // silently absorbed and mis-classified as solver capability refusals.
      w.addEventListener('error', (e) => {
        console.error('[param-slice worker] error: '
          + (e.message || e) + ' @ ' + (e.filename || 'bundle') + ':' + (e.lineno || '?'));
      });
      w.addEventListener('messageerror', (e) => {
        console.error('[param-slice worker] messageerror (postMessage clone failed):', e);
      });
      workers.push(w);
    }
    return new Pool(workers, null);
  }

  // ---------------------------------------------------------------------------
  // Main-thread fallback "pool"
  // ---------------------------------------------------------------------------
  // Used when the Worker bundle fails to build — most commonly when the page
  // is opened via file:// and the browser refuses fetch() of relative paths.
  // Exposes the same `.runSweep` shape as the real Pool; runs solves
  // synchronously on the main thread, yielding via setTimeout(0) between
  // rows so the UI stays responsive.
  class MainThreadPool {
    constructor() {
      this._cancelled = false;
      this.kind = 'main-thread';
    }
    cancel()    { this._cancelled = true; }
    terminate() { this.cancel(); }

    // solveBatch: process all points sequentially on the main thread, yielding
    // between chunks of `chunkYieldEvery` so the UI stays responsive. Per-point
    // explicit warmHints take precedence over the implicit chain.
    async solveBatch(scenario, mode, points, warmHints) {
      const ps = PS;
      if (!ps || !points || points.length === 0) return [];
      const scenarioWithTag = _attachFamilyTag(scenario, mode);
      const expectedFamilyTag = scenarioWithTag.expectedFamilyTag;
      const out = new Array(points.length);
      // Scratch-scenario reuse — one clone per batch, mutated in place between pixels.
      const scratch = ps.cloneScenario(scenarioWithTag);
      let chainWarm = null;
      const yieldEvery = 8;
      for (let i = 0; i < points.length; i++) {
        if (this._cancelled) break;
        const hint = (warmHints && warmHints[i]) || chainWarm;
        const r = ps.solveOnePointWithScratch(scratch, points[i], hint, expectedFamilyTag);
        if (r.phiSerialized) chainWarm = r.phiSerialized;
        out[i] = r;
        if ((i & (yieldEvery - 1)) === (yieldEvery - 1)) {
          await new Promise(res => setTimeout(res, 0));
        }
      }
      return out;
    }

    runSweep({ scenario, mode, axes, onTile, onError }) {
      const has2 = axes.length === 2;
      const n0 = axes[0].n;
      const n1 = has2 ? axes[1].n : 1;
      const xs = sampleAxis(axes[0]);
      const ys = has2 ? sampleAxis(axes[1]) : [null];
      const t0 = performance.now();
      let tilesDone = 0;
      this._cancelled = false;

      const donePromise = (async () => {
        for (let row = 0; row < n1; row++) {
          if (this._cancelled) break;
          const yVal = ys[row];
          const sweepPoints = new Array(n0);
          for (let col = 0; col < n0; col++) {
            const pt = [{ ref: axes[0].ref, value: xs[col] }];
            if (has2) pt.push({ ref: axes[1].ref, value: yVal });
            sweepPoints[col] = pt;
          }
          let results;
          try { results = await this.solveBatch(scenario, mode, sweepPoints, null); }
          catch (e) { if (onError) onError(e); continue; }
          tilesDone++;
          if (onTile) {
            try { onTile({ row, results, xs, yVal, tilesDone, totalTiles: n1 }); }
            catch (e) { if (onError) onError(e); }
          }
        }
        return { tilesDone, totalTiles: n1, msTotal: performance.now() - t0 };
      })();
      return { cancel: () => this.cancel(), done: donePromise };
    }
  }

  // Try the Worker pool first; on any failure (fetch blocked on file://,
  // CSP, etc.) fall back to the main-thread pool with a warning.
  async function createPoolWithFallback(opts = {}) {
    try {
      return await createPool(opts);
    } catch (e) {
      console.warn('[param-slice] Worker pool unavailable (' + (e.message || e) +
        '). Falling back to main-thread solver. Open the app via a local web ' +
        'server (e.g. `python -m http.server`) to enable the Worker pool.');
      return new MainThreadPool();
    }
  }

  return {
    create: createPoolWithFallback,
    createWorkerOnly: createPool,        // explicit opt-out of the main-thread fallback
    MainThreadPool,                       // exposed so tests can drive it directly
  };
})();

export default _pool;
export { _pool as ParamSlicePool };
