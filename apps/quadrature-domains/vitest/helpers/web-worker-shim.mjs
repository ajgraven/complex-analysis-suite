// =============================================================================
// web-worker-shim.mjs -- install a node:worker_threads-backed global `Worker` that
// presents the browser Web-Worker API: new Worker(url, {type:'module'}),
// add/removeEventListener('message'|'error'), postMessage, terminate.
//
// This lets the REAL app main-thread wrapper (app/algebra/sym-worker.mjs, QD.SymWorker)
// take its WORKER branch -- ensureReady() sees a defined `Worker` (plus Node's global
// Blob/fetch) so _fallback stays false -- and drive the live worker round-trip in Node,
// instead of the synchronous main-thread fallback that the 2100+ headless assertions
// otherwise hit (proving nothing about the worker path). The spawned node worker loads
// sym-worker-thread-adapter.mjs, which bridges self<->parentPort and imports whatever
// entry URL the wrapper passed to `new Worker(...)`.
//
// installWorkerThreadsWorker() returns an uninstall() that terminates any spawned
// workers and restores the prior global. See vitest/sym-worker-thread.test.ts.
// =============================================================================
import { Worker as NodeWorker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

const ADAPTER_PATH = fileURLToPath(new URL('./sym-worker-thread-adapter.mjs', import.meta.url));
const _live = new Set(); // spawned NodeWorkers, so uninstall() can terminate stragglers

// Observable lifecycle counters (module-level; vitest isolates files, so they reset per
// test file). Lets a test prove terminate-on-supersede deterministically -- superseding an
// in-flight job must bump `terminated` -- instead of a flaky wall-clock "was it prompt?".
export const workerStats = { spawned: 0, terminated: 0 };

// A Web-Worker-API facade over one node:worker_threads Worker. The app calls
// `new Worker(entryUrl, {type:'module'})`; we instead spawn the ADAPTER and hand it the
// entry via workerData, since the entry speaks `self` and worker_threads speaks parentPort.
class WebWorkerThreadShim {
  constructor(url) {
    workerStats.spawned++;
    this._terminated = false;
    this._nw = new NodeWorker(ADAPTER_PATH, {
      workerData: { entry: url instanceof URL ? url.href : String(url) },
    });
    this._listeners = { message: new Set(), error: new Set() };
    this._nw.on('message', (data) => this._emit('message', { data }));
    this._nw.on('error', (err) => this._emit('error', { message: (err && err.message) || String(err), filename: '', lineno: 0 }));
    _live.add(this._nw);
    this._nw.once('exit', () => _live.delete(this._nw));
  }
  addEventListener(type, fn) { (this._listeners[type] || (this._listeners[type] = new Set())).add(fn); }
  removeEventListener(type, fn) { const s = this._listeners[type]; if (s) s.delete(fn); }
  postMessage(msg) { this._nw.postMessage(msg); }
  terminate() {
    if (this._terminated) return; // count each worker's termination once
    this._terminated = true;
    workerStats.terminated++;
    try { this._nw.terminate(); } catch (_) { /* ignore */ }
  }
  _emit(type, ev) { const s = this._listeners[type]; if (s) for (const fn of [...s]) { try { fn(ev); } catch (_) { /* ignore */ } } }
}

export function installWorkerThreadsWorker() {
  const prev = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  Object.defineProperty(globalThis, 'Worker', { configurable: true, writable: true, value: WebWorkerThreadShim });
  return function uninstall() {
    for (const nw of [..._live]) { try { nw.terminate(); } catch (_) { /* ignore */ } }
    _live.clear();
    if (prev) Object.defineProperty(globalThis, 'Worker', prev);
    else delete globalThis.Worker;
  };
}
