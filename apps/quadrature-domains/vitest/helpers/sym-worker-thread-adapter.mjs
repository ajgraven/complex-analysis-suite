// =============================================================================
// sym-worker-thread-adapter.mjs -- TEST-ONLY bridge that runs the REAL browser
// Web-Worker entry (app/workers/sym-worker-entry.mjs) inside a node:worker_threads
// worker, so the live postMessage round-trip can be exercised headlessly.
//
// The entry installs its handler on the Web-Worker global `self` (self.onmessage /
// self.postMessage), which node:worker_threads does NOT provide -- it speaks
// `parentPort` instead. This adapter defines a minimal `self` on globalThis that
// forwards both directions to parentPort, then dynamically imports the entry
// (its file:// href arrives via workerData.entry). Nothing app-side is stubbed:
// the entry's own self.onmessage, its QD.Sym.runJob dispatch, and its progress
// throttling all run for real; only the self<->parentPort transport is bridged.
//
// Spawned by vitest/helpers/web-worker-shim.mjs. Not a test itself.
// =============================================================================
import { parentPort, workerData } from 'node:worker_threads';

let _handler = null;
const _queue = []; // messages that land before the entry installs self.onmessage

// A minimal Web-Worker `self`: postMessage -> parentPort; onmessage is settable and,
// once set, drains anything that queued during the (async) entry import. defineProperty
// (not a bare assignment) in case a future Node exposes `self` as a non-writable global.
Object.defineProperty(globalThis, 'self', {
  configurable: true,
  writable: true,
  value: {
    postMessage: (msg) => parentPort.postMessage(msg),
    get onmessage() { return _handler; },
    set onmessage(fn) { _handler = fn; if (fn) while (_queue.length) fn({ data: _queue.shift() }); },
  },
});

// Attach the parentPort listener synchronously: worker_threads buffers messages until a
// listener exists, and _queue further guards the window until the entry sets self.onmessage.
parentPort.on('message', (data) => { if (_handler) _handler({ data }); else _queue.push(data); });

await import(workerData.entry); // installs self.onmessage (guarded on `typeof self !== 'undefined'`)
