import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { JuliaMetricsClient, type JuliaMetricsRequest } from "../src/render/juliaMetricsClient.js";
import type { JuliaMetricsMessage } from "../src/render/juliaMetrics.worker.js";
import type { JuliaImageMetrics } from "../src/render/juliaProperties.js";

// A controllable stand-in for the module Worker: it captures every postMessage payload and lets the test
// deliver responses on demand. The client constructs `new Worker(...)` internally, so instances register
// themselves here. This exercises the WORKER path (send-side coalescing) that the sync fallback never hits.
class MockWorker {
  static instances: MockWorker[] = [];
  posted: JuliaMetricsMessage[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  constructor() {
    // The client calls `new Worker(url, { type: "module" })`; JS ignores the extra constructor args here.
    MockWorker.instances.push(this);
  }
  postMessage(m: JuliaMetricsMessage): void {
    this.posted.push(m);
  }
  terminate(): void {}
  /** Deliver a worker response for `reqId` (metrics omitted ⇒ the errored / metrics-less case). */
  respond(reqId: number, metrics?: JuliaImageMetrics): void {
    this.onmessage?.({ data: { reqId, metrics } } as MessageEvent);
  }
  /** Deliver the `{ reqId, error }` the worker posts when its compute throws. */
  fail(reqId: number, error: string): void {
    this.onmessage?.({ data: { reqId, error } } as MessageEvent);
  }
}

const METRICS = { tag: "m" } as unknown as JuliaImageMetrics; // sentinel — the test checks identity, not shape

function req(tag: string): JuliaMetricsRequest {
  return {
    fSource: tag,
    escSource: "|z|>2",
    a: [0, 0],
    c: [0, 0],
    centerX: 0,
    centerY: 0,
    zoom: 1,
    boundingRadius: null,
    escapes: true,
    rigorousConnectivity: false,
    size: 8,
  };
}

describe("JuliaMetricsClient — send-side coalescing (single-in-flight lane)", () => {
  let savedWorker: unknown;
  beforeEach(() => {
    savedWorker = (globalThis as { Worker?: unknown }).Worker;
    (globalThis as { Worker?: unknown }).Worker = MockWorker as unknown;
    MockWorker.instances = [];
  });
  afterEach(() => {
    (globalThis as { Worker?: unknown }).Worker = savedWorker;
  });

  const sources = (w: MockWorker): string[] => w.posted.map((p) => p.fSource);

  it("holds requests behind the in-flight one, then posts only the LATEST coalesced request", () => {
    const client = new JuliaMetricsClient();
    const w = MockWorker.instances[0];
    expect(w).toBeDefined();
    const got: JuliaImageMetrics[] = [];
    const cb = (m: JuliaImageMetrics): void => void got.push(m);

    client.request(req("r1"), cb);
    expect(sources(w)).toEqual(["r1"]); // r1 sent immediately (lane was free)

    client.request(req("r2"), cb); // in-flight ⇒ coalesced, not sent
    client.request(req("r3"), cb); // still in-flight ⇒ supersedes r2 (only the latest is kept)
    expect(w.posted.length).toBe(1); // nothing else on the wire yet — the worker queue is not flooded

    w.respond(w.posted[0].reqId, METRICS); // r1 returns
    expect(got).toEqual([METRICS]); // painted
    expect(sources(w)).toEqual(["r1", "r3"]); // r3 (latest) now sent; r2 was dropped, never computed

    w.respond(w.posted[1].reqId, METRICS); // r3 returns
    expect(got).toEqual([METRICS, METRICS]);
    expect(w.posted.length).toBe(2); // no further pending ⇒ no extra post
  });

  it("a metrics-less (errored) response still frees the lane so the coalesced request goes out", () => {
    const client = new JuliaMetricsClient();
    const w = MockWorker.instances[0];
    const got: JuliaImageMetrics[] = [];
    client.request(req("r1"), (m) => void got.push(m));
    client.request(req("r2"), (m) => void got.push(m)); // coalesced behind r1
    w.respond(w.posted[0].reqId); // r1 errors (no metrics)
    expect(got).toEqual([]); // nothing painted from the errored response
    expect(sources(w)).toEqual(["r1", "r2"]); // but the lane freed ⇒ r2 posted
  });

  it("ignores a stale/duplicate response without freeing the lane or double-painting", () => {
    const client = new JuliaMetricsClient();
    const w = MockWorker.instances[0];
    const got: JuliaImageMetrics[] = [];
    client.request(req("r1"), (m) => void got.push(m));
    w.respond(999, METRICS); // a response for a reqId we never issued
    expect(got).toEqual([]); // dropped
    client.request(req("r2"), (m) => void got.push(m));
    expect(w.posted.length).toBe(1); // r1 still considered in flight ⇒ r2 coalesced, not sent
  });
});

// WP6 (review 2026-09-16). `juliaMetrics.worker.ts` has always posted `{ reqId, error }` on a throw,
// and the client mapped it to `result: undefined` — which `createComputeClient` drops WITHOUT calling
// back. Nothing downstream ever learned, so the five Julia-properties rows sat at "measuring…" for the
// rest of the session with no message anywhere saying why. The reason now reaches the caller.
describe("JuliaMetricsClient — a worker failure is reported, not swallowed", () => {
  let savedWorker: unknown;
  beforeEach(() => {
    savedWorker = (globalThis as { Worker?: unknown }).Worker;
    (globalThis as { Worker?: unknown }).Worker = MockWorker as unknown;
    MockWorker.instances = [];
  });
  afterEach(() => {
    (globalThis as { Worker?: unknown }).Worker = savedWorker;
  });

  it("delivers the worker's error message to onError, and paints nothing", () => {
    const client = new JuliaMetricsClient();
    const w = MockWorker.instances[0];
    const errors: string[] = [];
    const got: JuliaImageMetrics[] = [];
    client.onError((m) => void errors.push(m));
    client.request(req("r1"), (m) => void got.push(m));

    w.fail(w.posted[0].reqId, "boundingRadius must be finite");
    expect(errors).toEqual(["boundingRadius must be finite"]);
    expect(got).toEqual([]); // a failure is not a result
  });

  it("a SUCCESS never reaches onError (the anti-vacuity clause)", () => {
    const client = new JuliaMetricsClient();
    const w = MockWorker.instances[0];
    const errors: string[] = [];
    client.onError((m) => void errors.push(m));
    client.request(req("r1"), () => {});
    w.respond(w.posted[0].reqId, METRICS);
    expect(errors).toEqual([]);
  });

  it("a metrics-less response with NO error stays silent — absence is not a failure", () => {
    const client = new JuliaMetricsClient();
    const w = MockWorker.instances[0];
    const errors: string[] = [];
    client.onError((m) => void errors.push(m));
    client.request(req("r1"), () => {});
    w.respond(w.posted[0].reqId); // neither metrics nor error
    expect(errors).toEqual([]);
  });
});

// WP7/S2 (review 2026-09-16). "Copy properties" fired the Tier-2 measurement and read the rows in
// the SAME TICK, so the clipboard got the placeholder `measuring…` instead of a number. The copy
// path needs to know when a result has landed — which is not the same question as "did MY request
// return", because the client coalesces and a superseded request's callback never fires at all.
describe("JuliaMetricsClient — settled()", () => {
  let savedWorker: unknown;
  beforeEach(() => {
    savedWorker = (globalThis as { Worker?: unknown }).Worker;
    (globalThis as { Worker?: unknown }).Worker = MockWorker as unknown;
    MockWorker.instances = [];
  });
  afterEach(() => {
    (globalThis as { Worker?: unknown }).Worker = savedWorker;
  });

  /** Whether `p` has settled by the time the microtask queue drains. */
  async function settledYet(p: Promise<void>): Promise<boolean> {
    const marker = Symbol("pending");
    return (await Promise.race([p, Promise.resolve(marker)])) !== marker;
  }

  it("does not resolve before anything has landed, and does once a result paints", async () => {
    const client = new JuliaMetricsClient();
    const w = MockWorker.instances[0];
    const landed = client.settled();
    client.request(req("r1"), () => {});
    expect(await settledYet(landed)).toBe(false); // the anti-vacuity clause
    w.respond(w.posted[0].reqId, METRICS);
    expect(await settledYet(landed)).toBe(true);
  });

  it("resolves on a FAILURE too — otherwise a caller waiting on it would hang", async () => {
    const client = new JuliaMetricsClient();
    const w = MockWorker.instances[0];
    const landed = client.settled();
    client.request(req("r1"), () => {});
    w.fail(w.posted[0].reqId, "boom");
    expect(await settledYet(landed)).toBe(true);
  });

  // The reason it is not a per-request promise: r1 is superseded by r2 and its callback never runs.
  // A promise tied to r1 would wait for a result that is not coming; what the caller actually needs
  // is "the panel has been refreshed since I asked", and r2's result is a fresher answer to that.
  it("a SUPERSEDING result settles the wait", async () => {
    const client = new JuliaMetricsClient();
    const w = MockWorker.instances[0];
    const painted: string[] = [];
    client.request(req("r1"), () => void painted.push("r1"));
    const landed = client.settled();
    client.request(req("r2"), () => void painted.push("r2")); // coalesced behind r1
    w.respond(w.posted[0].reqId); // r1 comes back with no metrics ⇒ never painted, lane freed
    w.respond(w.posted[1].reqId, METRICS); // r2 paints
    expect(await settledYet(landed)).toBe(true);
    expect(painted).toEqual(["r2"]);
  });

  it("has a backstop, so a worker that never answers does not disable a button for ever", async () => {
    vi.useFakeTimers();
    try {
      const client = new JuliaMetricsClient();
      client.request(req("r1"), () => {});
      const landed = client.settled(5000);
      vi.advanceTimersByTime(4999);
      expect(await settledYet(landed)).toBe(false);
      vi.advanceTimersByTime(2);
      expect(await settledYet(landed)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("one delivery releases every waiter", async () => {
    const client = new JuliaMetricsClient();
    const w = MockWorker.instances[0];
    const a = client.settled();
    const b = client.settled();
    client.request(req("r1"), () => {});
    w.respond(w.posted[0].reqId, METRICS);
    expect(await settledYet(a)).toBe(true);
    expect(await settledYet(b)).toBe(true);
  });
});
