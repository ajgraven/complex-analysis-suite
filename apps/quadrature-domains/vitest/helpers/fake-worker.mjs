// Test-only fake `Worker` (refactor Stage B4-2). A single class that unifies the two inline fakes
// the lane tests grew independently:
//   · psw-lifecycle.test.ts `makeStubWorker` — spawn-FAILURE injection (an inert ctor that throws).
//   · schwarz-cpu-worker-crash.test.ts `FakeWorker` — message/crash DELIVERY (`.fire`) + inspection
//     (`.posted`, `.terminated`, a static `last`).
// This superset gives both: spawn-fault via `failNext`, event delivery via `fire`, and an instance
// registry (`lastInstance` / `instances`) so a multi-lane test can grab the worker a specific lane just
// spawned (by spawn order). Install it with `vi.stubGlobal("Worker", FakeWorker)` before the code under
// test lazily constructs its worker.
//
// ADDITIVE: this does not replace the two existing fakes (they are part of the green safety net the
// worker-lane dedup — Group C — leans on; rewriting passing behavior-pins for no coverage gain is churn
// that risks the net). They can DRY onto this helper DURING C1/C2, when those files may change anyway.
export class FakeWorker {
  /** @type {FakeWorker[]} every construction, in order (for multi-lane spawn-order lookup). */
  static instances = [];
  /** Number of upcoming constructions that should throw (spawn-failure injection). */
  static failures = 0;

  static get lastInstance() {
    return FakeWorker.instances.length ? FakeWorker.instances[FakeWorker.instances.length - 1] : null;
  }
  /** Make the next `n` constructions throw (like `makeStubWorker({failures})`). */
  static failNext(n = 1) {
    FakeWorker.failures += n;
  }
  /** Clear the registry + pending failures. Call at the start of each test (Vitest isolates files, so
   *  this only guards intra-file leakage). */
  static reset() {
    FakeWorker.instances = [];
    FakeWorker.failures = 0;
  }

  constructor(url, opts) {
    if (FakeWorker.failures > 0) {
      FakeWorker.failures--;
      throw new Error("fake-worker: spawn failed");
    }
    this.url = url;
    this.opts = opts;
    /** @type {Record<string, Set<Function>>} type -> listeners */
    this.listeners = Object.create(null);
    /** @type {any[]} messages the code under test posted to this worker. */
    this.posted = [];
    this.terminated = false;
    FakeWorker.instances.push(this);
  }

  addEventListener(type, fn) {
    (this.listeners[type] || (this.listeners[type] = new Set())).add(fn);
  }
  removeEventListener(type, fn) {
    if (this.listeners[type]) this.listeners[type].delete(fn);
  }
  postMessage(msg) {
    this.posted.push(msg);
  }
  terminate() {
    this.terminated = true;
  }

  /** Deliver a worker-level event (`message` | `error` | `messageerror`) to its listeners, synchronously.
   *  A no-op if nothing is listening for `type` — which is exactly how a lane with NO `messageerror`
   *  handler behaves, so a test can assert that absence by firing and observing that nothing settled. */
  fire(type, ev) {
    const set = this.listeners[type];
    if (!set) return;
    for (const fn of [...set]) fn(ev || {});
  }
}

export default FakeWorker;
