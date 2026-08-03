// Schwarz CPU-worker LIFECYCLE contract — the paths the crash net (schwarz-cpu-worker-crash.test.ts)
// does NOT pin, frozen before the Group-C lane dedup can touch them (QD-UI-1 / B4-2c).
//
// schwarz-cpu-worker is the one lane that does NOT fit the createWorkerLane factory (C1a): its public
// surface is `isUsable()` (a synchronous viability gate) + `renderField(params, cbs)` which returns a
// `{ cancel() }` HANDLE and streams the progressive pyramid back through onPass/onError/onUnavailable
// callbacks — not a single resolve/reject Promise. This net pins exactly those lane-specific behaviors
// (the gate, the no-worker onUnavailable path, multi-pass streaming, in-flight preempt, handle.cancel,
// and the cancel-before-spawn guard) so a later refactor that shares the crash-handling fragment across
// lanes can't silently change them. Every case is mutation-verified to bite.
import { describe, expect, it, vi, afterEach } from "vitest";

type Listener = (ev: unknown) => void;

// The same fake Worker the crash net uses (addEventListener/postMessage/terminate + `fire`), plus a
// static `last` so a test can grab the instance the wrapper just created.
class FakeWorker {
  static last: FakeWorker | null = null;
  listeners: Record<string, Listener[]> = {};
  posted: unknown[] = [];
  terminated = false;
  constructor() {
    FakeWorker.last = this;
  }
  addEventListener(type: string, fn: Listener): void {
    (this.listeners[type] ||= []).push(fn);
  }
  removeEventListener(type: string, fn: Listener): void {
    this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn);
  }
  postMessage(msg: unknown): void {
    this.posted.push(msg);
  }
  terminate(): void {
    this.terminated = true;
  }
  /** Deliver a worker-level event, as the browser would. */
  fire(type: string, ev: unknown): void {
    for (const f of [...(this.listeners[type] || [])]) f(ev);
  }
}

// A Worker whose constructor throws — models a bundle load / module-init failure. `new Worker(...)`
// throws inside ensureReady's readyPromise, whose .catch latches _mainThreadFallback.
class ThrowingWorker {
  constructor() {
    throw new Error("bundle load failed");
  }
}

interface SCW {
  renderField(p: unknown, cbs: unknown): { cancel(): void };
  isUsable(): boolean;
  isBusy(): boolean;
  cancel(): void;
  ensureReady(): Promise<void>;
  _hasWorker(): boolean;
  _isMainThreadFallback(): boolean;
}

const PARAMS = {
  phi: {}, boundaryPts: [], view: { cx: 0, cy: 0, scale: 1, cssW: 8, cssH: 8 },
  W: 8, H: 8, maxIter: 4, strides: [4, 2, 1],
};
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

// A pristine wrapper per test — resetModules + re-import so a test that latches _mainThreadFallback
// (ThrowingWorker) can't poison the next (mirrors the freshPSW/freshSym pattern). Pass `null` to run
// with NO Worker global at all; omit for the working FakeWorker.
async function freshSCW(WorkerImpl: unknown = FakeWorker): Promise<SCW> {
  vi.resetModules();
  if (WorkerImpl === null) delete (globalThis as Record<string, unknown>).Worker;
  else (globalThis as Record<string, unknown>).Worker = WorkerImpl as unknown;
  FakeWorker.last = null;
  const QD = (await import("../app/solvers/solver.mjs")).default as Record<string, unknown>;
  await import("../app/schwarz/schwarz-cpu-worker.mjs");
  return QD.SchwarzCpuWorker as SCW;
}

afterEach(() => { delete (globalThis as Record<string, unknown>).Worker; });

describe("schwarz-cpu-worker: isUsable() viability gate", () => {
  it("is true when a Worker constructor is available (and not file://)", async () => {
    const S = await freshSCW();
    expect(S.isUsable()).toBe(true);
  });

  it("is false when Worker is unavailable (Node/headless — the caller renders in-process)", async () => {
    const S = await freshSCW(null);
    expect(S.isUsable()).toBe(false);
  });

  it("is false after a worker load-failure latches the main-thread fallback", async () => {
    const S = await freshSCW(ThrowingWorker);
    await S.ensureReady();                       // new Worker() throws → readyPromise.catch latches
    expect(S._isMainThreadFallback()).toBe(true);
    expect(S.isUsable()).toBe(false);            // isUsable() short-circuits on the latch, before the Worker check
  });
});

describe("schwarz-cpu-worker: renderField streaming / preempt / handle (QD-UI-1, B4-2c)", () => {
  it("fires onUnavailable (not onError/onPass) when no worker can be built", async () => {
    const S = await freshSCW(ThrowingWorker);
    let unavailable = 0, passes = 0, errors = 0;
    S.renderField(PARAMS, {
      onPass: () => { passes++; },
      onError: () => { errors++; },
      onUnavailable: () => { unavailable++; },
    });
    await flush();
    expect(unavailable).toBe(1);   // the caller's cue to fall back to its in-process renderer
    expect(passes).toBe(0);
    expect(errors).toBe(0);
    expect(S.isBusy()).toBe(false);
  });

  it("streams every pyramid pass through onPass; only the last carries done and clears busy", async () => {
    const S = await freshSCW();
    const strides: number[] = [];
    let doneSeen = false;
    S.renderField(PARAMS, {
      onPass: (m: { stride: number; done?: boolean }) => { strides.push(m.stride); if (m.done) doneSeen = true; },
      onError: () => {},
    });
    await flush();
    const w = FakeWorker.last!;
    const jobId = (w.posted[0] as { jobId: number }).jobId;

    w.fire("message", { data: { kind: "schwarzPass", jobId, stride: 4, done: false } });
    expect(S.isBusy()).toBe(true);                             // still rendering after a non-final pass
    w.fire("message", { data: { kind: "schwarzPass", jobId, stride: 2, done: false } });
    expect(S.isBusy()).toBe(true);
    w.fire("message", { data: { kind: "schwarzPass", jobId, stride: 1, done: true } });

    expect(strides).toEqual([4, 2, 1]);                        // one onPass per pass, in order
    expect(doneSeen).toBe(true);
    expect(S.isBusy()).toBe(false);                            // the done pass finished the job
  });

  it("a stale-jobId pass is ignored (a superseded render can't paint over the new one)", async () => {
    const S = await freshSCW();
    let passes = 0;
    S.renderField(PARAMS, { onPass: () => { passes++; }, onError: () => {} });
    await flush();
    const w = FakeWorker.last!;
    const jobId = (w.posted[0] as { jobId: number }).jobId;
    w.fire("message", { data: { kind: "schwarzPass", jobId: jobId + 999, stride: 4, done: false } });
    expect(passes).toBe(0);       // jobId mismatch → dropped
    expect(S.isBusy()).toBe(true);
  });

  it("a second renderField preempts the in-flight one (terminate + fresh worker)", async () => {
    const S = await freshSCW();
    S.renderField(PARAMS, { onPass: () => {}, onError: () => {} });
    await flush();
    const first = FakeWorker.last!;
    expect(first.terminated).toBe(false);

    S.renderField(PARAMS, { onPass: () => {}, onError: () => {} });
    await flush();
    expect(first.terminated).toBe(true);          // the old render was terminated, not queued behind
    expect(FakeWorker.last).not.toBe(first);      // a fresh worker drives the new render
    expect(S.isBusy()).toBe(true);
  });

  it("the returned handle.cancel() terminates the worker and clears busy", async () => {
    const S = await freshSCW();
    const handle = S.renderField(PARAMS, { onPass: () => {}, onError: () => {} });
    await flush();
    const w = FakeWorker.last!;
    expect(S.isBusy()).toBe(true);

    handle.cancel();
    expect(w.terminated).toBe(true);
    expect(S.isBusy()).toBe(false);
  });

  it("a render cancelled before the worker is ready posts no job and fires no callback", async () => {
    const S = await freshSCW();
    let passes = 0, errors = 0, unavailable = 0;
    const handle = S.renderField(PARAMS, {
      onPass: () => { passes++; },
      onError: () => { errors++; },
      onUnavailable: () => { unavailable++; },
    });
    handle.cancel();                 // cancel BEFORE ensureReady resolves — the `cancelled` guard must hold
    await flush();
    // The wrapper created a worker (ensureReady is already in flight) but the cancelled guard returns
    // before posting, so nothing is dispatched and no callback fires.
    if (FakeWorker.last) expect(FakeWorker.last.posted.length).toBe(0);
    expect(passes).toBe(0);
    expect(errors).toBe(0);
    expect(unavailable).toBe(0);
    expect(S.isBusy()).toBe(false);
  });
});
