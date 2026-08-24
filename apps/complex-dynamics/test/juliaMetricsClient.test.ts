import { describe, it, expect, beforeEach, afterEach } from "vitest";
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
  constructor(_url: URL | string, _opts?: unknown) {
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
