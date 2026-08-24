import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createComputeClient } from "../src/computeClient.js";

// jsdom has no Worker, so the sync-fallback tests exercise coalescing-to-latest, the busy affordance,
// deferSync scheduling, and cancel directly. The worker-path tests below stub globalThis.Worker with a
// controllable MockWorker (as CD's own metrics-client test does) to cover send-side coalescing, stale
// drop, and — the behavior this shell primitive gained when it was proven against CD — recovery of the
// in-flight request when the worker dies mid-flight (cd-metricsworker-01). The real module worker is
// verified in-browser at app-adoption time.

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe("createComputeClient (sync fallback)", () => {
  it("deferSync (default) computes on a macrotask and toggles busy", async () => {
    const busy: boolean[] = [];
    const client = createComputeClient<number, number>({
      compute: (n) => n * 2,
      onBusy: (b) => busy.push(b),
    });
    let result: number | null = null;
    client.request(21, (r) => {
      result = r;
    });
    // Deferred: not computed yet, but already marked busy.
    expect(result).toBeNull();
    expect(client.busy()).toBe(true);
    await tick();
    expect(result).toBe(42);
    expect(client.busy()).toBe(false);
    expect(busy).toEqual([true, false]);
  });

  it("coalesces rapid requests — only the latest computes and paints", async () => {
    let computeCalls = 0;
    const client = createComputeClient<number, number>({
      compute: (n) => {
        computeCalls += 1;
        return n;
      },
    });
    const seen: number[] = [];
    client.request(1, (r) => seen.push(r));
    client.request(2, (r) => seen.push(r));
    client.request(3, (r) => seen.push(r));
    await tick();
    expect(computeCalls).toBe(1);
    expect(seen).toEqual([3]);
  });

  it("deferSync:false computes synchronously", () => {
    const client = createComputeClient<string, string>({
      compute: (s) => s.toUpperCase(),
      deferSync: false,
    });
    let result = "";
    client.request("hi", (r) => {
      result = r;
    });
    expect(result).toBe("HI");
    expect(client.busy()).toBe(false);
  });

  it("cancel drops a queued deferred request and clears busy", async () => {
    let computeCalls = 0;
    const client = createComputeClient<number, number>({
      compute: (n) => {
        computeCalls += 1;
        return n;
      },
    });
    let fired = false;
    client.request(7, () => {
      fired = true;
    });
    expect(client.busy()).toBe(true);
    client.cancel();
    expect(client.busy()).toBe(false);
    await tick();
    expect(computeCalls).toBe(0);
    expect(fired).toBe(false);
  });
});

// A controllable stand-in for a module Worker: captures posts, delivers responses on demand, and can be
// made to fail. Mirrors CD's metrics-client MockWorker so the shared primitive owns the coverage.
class MockWorker {
  static instances: MockWorker[] = [];
  posted: Array<{ reqId: number; n: number }> = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  terminated = false;
  constructor() {
    MockWorker.instances.push(this);
  }
  postMessage(m: { reqId: number; n: number }): void {
    this.posted.push(m);
  }
  terminate(): void {
    this.terminated = true;
  }
  respond(reqId: number, result?: number): void {
    this.onmessage?.({ data: { reqId, result } } as MessageEvent);
  }
  fail(): void {
    this.onerror?.(new Error("worker died"));
  }
}

function workerClient() {
  let calls = 0;
  const got: number[] = [];
  const client = createComputeClient<number, number>({
    compute: (n) => {
      calls += 1;
      return n * 10; // distinct from the worker's result so a sync recovery is visible
    },
    worker: () => new Worker("mock"),
    toMessage: (n, reqId) => ({ reqId, n }),
    fromMessage: (data) => {
      const d = data as { reqId: number; result?: number };
      return { reqId: d.reqId, result: d.result };
    },
  });
  return { client, w: MockWorker.instances[0], got, computeCalls: () => calls };
}

describe("createComputeClient (worker path)", () => {
  let saved: unknown;
  beforeEach(() => {
    saved = (globalThis as { Worker?: unknown }).Worker;
    (globalThis as { Worker?: unknown }).Worker = MockWorker as unknown;
    MockWorker.instances = [];
  });
  afterEach(() => {
    (globalThis as { Worker?: unknown }).Worker = saved;
  });

  it("coalesces to the latest while one is in flight, then posts it", () => {
    const c = workerClient();
    c.client.request(1, (r) => c.got.push(r));
    expect(c.w.posted.map((p) => p.n)).toEqual([1]); // sent immediately
    c.client.request(2, (r) => c.got.push(r));
    c.client.request(3, (r) => c.got.push(r)); // supersedes 2
    expect(c.w.posted.length).toBe(1); // nothing else on the wire yet
    c.w.respond(c.w.posted[0].reqId, 100); // first returns
    expect(c.got).toEqual([100]);
    expect(c.w.posted.map((p) => p.n)).toEqual([1, 3]); // latest sent, 2 dropped
    c.w.respond(c.w.posted[1].reqId, 300);
    expect(c.got).toEqual([100, 300]);
  });

  it("drops a stale response without freeing the lane", () => {
    const c = workerClient();
    c.client.request(1, (r) => c.got.push(r));
    c.w.respond(999, 42); // never issued
    expect(c.got).toEqual([]);
    c.client.request(2, (r) => c.got.push(r));
    expect(c.w.posted.length).toBe(1); // still in flight ⇒ coalesced
  });

  it("a result-less response frees the lane without painting", () => {
    const c = workerClient();
    c.client.request(1, (r) => c.got.push(r));
    c.client.request(2, (r) => c.got.push(r));
    c.w.respond(c.w.posted[0].reqId); // no result
    expect(c.got).toEqual([]);
    expect(c.w.posted.map((p) => p.n)).toEqual([1, 2]); // lane freed ⇒ 2 posted
  });

  it("recovers the in-flight request on the main thread when the worker dies", () => {
    const c = workerClient();
    c.client.request(7, (r) => c.got.push(r));
    expect(c.computeCalls()).toBe(0); // ran on the worker, not sync
    c.w.fail(); // worker error mid-flight
    expect(c.w.terminated).toBe(true);
    expect(c.computeCalls()).toBe(1); // recovered via the sync compute
    expect(c.got).toEqual([70]); // 7 * 10 (sync), not the worker's 7
    expect(c.client.busy()).toBe(false);
  });
});
