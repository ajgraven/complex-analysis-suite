// A worker-LEVEL failure must settle the in-flight Schwarz render.
//
// schwarz-cpu-worker's `error` listener used to be a bare console.error. Such a failure posts no
// {kind:'schwarzError'} message, so `_inflight` stayed set and the caller waited on callbacks that
// could never fire — and schwarz-render only clears `sState.rendering` from the `m.done` path, with
// no watchdog anywhere in schwarz-render / schwarz-ui. The tab stuck on "Pass 1/3 (coarse) …" with a
// blank canvas, permanently. It was the only one of the four worker wrappers missing the fix.
//
// These drive the wrapper with a fake Worker so the crash paths are exercised directly. Pre-fix,
// `onError` was never called and `isBusy()` stayed true — both assertions below fail.
import { describe, expect, it, beforeAll, afterEach } from "vitest";

type Listener = (ev: unknown) => void;

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

interface SCW {
  renderField(p: unknown, cbs: unknown): { cancel(): void };
  isBusy(): boolean;
  cancel(): void;
  _hasWorker(): boolean;
}
let SCW: SCW;

const PARAMS = { phi: {}, domain: "z", W: 8, H: 8, maxIter: 4, strides: [4, 2, 1] };
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

beforeAll(async () => {
  (globalThis as Record<string, unknown>).Worker = FakeWorker;
  const QD = (await import("../app/solvers/solver.mjs")).default as Record<string, unknown>;
  await import("../app/schwarz/schwarz-cpu-worker.mjs");
  SCW = QD.SchwarzCpuWorker as SCW;
});

afterEach(() => {
  SCW.cancel(); // drop any worker/job left over, so each case starts clean
});

describe("schwarz-cpu-worker: worker-level failures settle the render", () => {
  it("exposes the wrapper", () => {
    expect(typeof SCW?.renderField).toBe("function");
  });

  it("a worker `error` calls onError and clears the in-flight job", async () => {
    let errored: unknown = null;
    let passes = 0;
    SCW.renderField(PARAMS, {
      onPass: () => { passes++; },
      onError: (e: unknown) => { errored = e; },
      onUnavailable: () => { /* not this path */ },
    });
    await flush();
    expect(SCW.isBusy()).toBe(true); // job registered

    FakeWorker.last!.fire("error", { message: "boom", filename: "bundle", lineno: 42 });

    expect(errored).not.toBeNull();                        // pre-fix: stayed null
    expect(String(errored)).toContain("boom");             // the detail reaches the caller
    expect(SCW.isBusy()).toBe(false);                      // pre-fix: stayed true → stuck forever
    expect(passes).toBe(0);
  });

  it("a `messageerror` settles it too (structured-clone failure)", async () => {
    let errored: unknown = null;
    SCW.renderField(PARAMS, { onPass: () => {}, onError: (e: unknown) => { errored = e; } });
    await flush();
    expect(SCW.isBusy()).toBe(true);

    FakeWorker.last!.fire("messageerror", { data: null });

    expect(errored).not.toBeNull();
    expect(SCW.isBusy()).toBe(false);
  });

  it("the crashed worker is disposed, so the next render starts a fresh one", async () => {
    SCW.renderField(PARAMS, { onPass: () => {}, onError: () => {} });
    await flush();
    const first = FakeWorker.last!;

    first.fire("error", { message: "boom" });
    expect(first.terminated).toBe(true); // _disposeWorker ran

    SCW.renderField(PARAMS, { onPass: () => {}, onError: () => {} });
    await flush();
    expect(FakeWorker.last).not.toBe(first); // a new worker, not the dead one
    expect(SCW.isBusy()).toBe(true);
  });

  it("a normal completion still settles through the done path (no regression)", async () => {
    let done = false;
    SCW.renderField(PARAMS, {
      onPass: (m: { done?: boolean }) => { if (m.done) done = true; },
      onError: () => {},
    });
    await flush();
    const w = FakeWorker.last!;
    const jobId = (w.posted[0] as { jobId: number }).jobId;

    w.fire("message", { data: { kind: "schwarzPass", jobId, stride: 1, done: true, field: [], fieldKind: "x", W: 8, H: 8 } });

    expect(done).toBe(true);
    expect(SCW.isBusy()).toBe(false);
  });
});
