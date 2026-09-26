import { describe, it, expect } from "vitest";
import { defaultPoolSize, RootPool } from "../src/engine/pool";
import type { RootsRequest, RootsResponse } from "../src/engine/roots.worker";
import { sweepChunk } from "../src/engine/sweep";

// The node environment has no `Worker`, so the pool takes its spawn function as a parameter and this
// suite supplies one that runs the real sweep synchronously on a queue. What is being tested is the
// pool's own behaviour — chunking, fan-out, and above all ABANDONING a superseded job — not the sweep,
// which `sweep.test.ts` covers against brute force.

/** A worker that answers on demand, so a test can interleave replies as a real pool would. */
class FakeWorker {
  onmessage: ((e: MessageEvent<RootsResponse>) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  readonly inbox: RootsRequest[] = [];
  terminated = false;
  constructor(
    pool: FakeWorker[],
    /** Shared across the pool: the order chunks were HANDED OUT, which is the pool's own decision. */
    private readonly dispatched: RootsRequest[] = [],
  ) {
    pool.push(this);
  }
  postMessage(req: RootsRequest): void {
    this.dispatched.push(req);
    this.inbox.push(req);
  }
  terminate(): void {
    this.terminated = true;
  }
  /** Answer the oldest queued request by really running the sweep. Returns false if there is none. */
  flushOne(): boolean {
    const req = this.inbox.shift();
    if (req === undefined) return false;
    const result = sweepChunk(req);
    const res: RootsResponse =
      "error" in result
        ? { jobId: req.jobId, chunkId: req.chunkId, degree: req.degree, error: result.error }
        : {
            jobId: req.jobId,
            chunkId: req.chunkId,
            degree: result.degree,
            points: result.points,
            ...(result.hues !== undefined ? { hues: result.hues } : {}),
            representatives: result.representatives,
            stats: result.stats,
          };
    this.onmessage?.({ data: res } as MessageEvent<RootsResponse>);
    return true;
  }
  /** Answer with a failure, as a worker whose sweep threw would. */
  failOne(message: string): void {
    const req = this.inbox.shift();
    if (req === undefined) return;
    this.onmessage?.({
      data: { jobId: req.jobId, chunkId: req.chunkId, degree: req.degree, error: message },
    } as MessageEvent<RootsResponse>);
  }
}

function makePool(size: number): { pool: RootPool; workers: FakeWorker[]; dispatched: RootsRequest[] } {
  const workers: FakeWorker[] = [];
  const dispatched: RootsRequest[] = [];
  const pool = new RootPool(size, () => new FakeWorker(workers, dispatched) as unknown as Worker);
  return { pool, workers, dispatched };
}

/** Drain every worker until none has anything queued. */
function drain(workers: FakeWorker[], limit = 10000): number {
  let flushed = 0;
  for (let guard = 0; guard < limit; guard++) {
    let any = false;
    for (const w of workers) {
      if (w.flushOne()) {
        any = true;
        flushed++;
      }
    }
    if (!any) break;
  }
  return flushed;
}

const spec = { preset: "littlewood" } as const;

describe("the pool", () => {
  it("sweeps a whole job across its workers and reports the same totals as one sweep", () => {
    const { pool, workers } = makePool(4);
    const degree = 12;
    const whole = sweepChunk({ spec, degree, lo: 0, hi: Infinity, circleDelta: 0.02, hueDigits: 0 });
    if ("error" in whole) throw new Error(whole.error);

    let roots = 0;
    let points = 0;
    let done = false;
    pool.run(
      { spec, minDegree: degree, maxDegree: degree, totals: [1 << degree], circleDelta: 0.02, hueDigits: 0 },
      {
        onChunk: (_d, p, stats) => {
          points += p.length;
          roots += stats.roots;
        },
        onProgress: () => {},
        onDone: () => {
          done = true;
        },
        onError: (m) => {
          throw new Error(m);
        },
      },
    );
    drain(workers);
    expect(done).toBe(true);
    expect(roots).toBe(whole.stats.roots);
    expect(points).toBe(whole.points.length);
    pool.dispose();
  });

  it("carries the job's hue request to the workers and each chunk's hues back, |G| per point", () => {
    // A job without hues gets none (the default modes never pay for them); one with hues gets them on
    // every chunk, aligned with the points. Forwarding is one line each way and an unforwarded field
    // is a picture painted in a single colour.
    for (const hueDigits of [0, 2]) {
      const { pool, workers } = makePool(2);
      let chunks = 0;
      let aligned = 0;
      pool.run(
        { spec, minDegree: 9, maxDegree: 9, totals: [1 << 9], circleDelta: 0.02, hueDigits },
        {
          onChunk: (_d, p, _s, hues) => {
            chunks++;
            if (hues !== undefined && hues.length === (p.length / 3) * 4) aligned++;
          },
          onProgress: () => {},
          onDone: () => {},
          onError: (m) => {
            throw new Error(m);
          },
        },
      );
      drain(workers);
      expect(chunks).toBeGreaterThan(0);
      expect(aligned, `hueDigits ${hueDigits}`).toBe(hueDigits > 0 ? chunks : 0);
      pool.dispose();
    }
  });

  it("DISPATCHES the degrees in ascending order, so the cheap picture is computed first", () => {
    // The assertion is about the order chunks are HANDED OUT, not the order they come back: with N
    // workers, chunks of two adjacent degrees are in flight at once and either can finish first. The
    // first draft of this test asserted the arrival order and failed on its own harness, which is the
    // honest outcome — the pool never promised that, and could not.
    const { pool, workers, dispatched } = makePool(2);
    const arrived: number[] = [];
    pool.run(
      { spec, minDegree: 2, maxDegree: 6, totals: [4, 8, 16, 32, 64], circleDelta: 0.02, hueDigits: 0 },
      {
        onChunk: (d) => arrived.push(d),
        onProgress: () => {},
        onDone: () => {},
        onError: (m) => {
          throw new Error(m);
        },
      },
    );
    drain(workers);
    const order = dispatched.map((r) => r.degree);
    expect(order).toEqual([2, 3, 4, 5, 6]);
    expect(arrived).toHaveLength(5);
    expect([...arrived].sort((a, b) => a - b)).toEqual([2, 3, 4, 5, 6]);
    pool.dispose();
  });

  it("ABANDONS a superseded job — a reply from the old picture never reaches the new one", () => {
    // This is the pool's reason to exist. A reader dragging the degree slider replaces the job several
    // times a second; if a stale chunk were painted, the stage would carry roots from an alphabet or a
    // degree that is no longer on screen, and nothing downstream could tell.
    const { pool, workers } = makePool(2);
    const first: number[] = [];
    pool.run(
      { spec, minDegree: 8, maxDegree: 8, totals: [1 << 8], circleDelta: 0.02, hueDigits: 0 },
      {
        onChunk: (d) => first.push(d),
        onProgress: () => {},
        onDone: () => {},
        onError: () => {},
      },
    );
    // Requests are queued in the fake workers but not yet answered.
    expect(workers.some((w) => w.inbox.length > 0)).toBe(true);

    const second: number[] = [];
    let secondDone = false;
    pool.run(
      { spec, minDegree: 3, maxDegree: 3, totals: [1 << 3], circleDelta: 0.02, hueDigits: 0 },
      {
        onChunk: (d) => second.push(d),
        onProgress: () => {},
        onDone: () => {
          secondDone = true;
        },
        onError: () => {},
      },
    );
    drain(workers);
    // Every chunk the FIRST job queued is answered — and discarded.
    expect(first).toHaveLength(0);
    expect(second.every((d) => d === 3)).toBe(true);
    expect(second.length).toBeGreaterThan(0);
    expect(secondDone).toBe(true);
    pool.dispose();
  });

  it("finishes exactly once, and progress reaches its total", () => {
    const { pool, workers } = makePool(3);
    let doneCount = 0;
    const progress: [number, number][] = [];
    pool.run(
      { spec, minDegree: 5, maxDegree: 7, totals: [32, 64, 128], circleDelta: 0.02, hueDigits: 0 },
      {
        onChunk: () => {},
        onProgress: (d, t) => progress.push([d, t]),
        onDone: () => {
          doneCount++;
        },
        onError: () => {},
      },
    );
    drain(workers);
    expect(doneCount).toBe(1);
    const last = progress[progress.length - 1];
    expect(last[0]).toBe(last[1]);
    // Progress never goes backwards or past its total.
    for (const [d, t] of progress) {
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(t);
    }
    pool.dispose();
  });

  it("an empty job completes rather than hanging", () => {
    const { pool, workers } = makePool(2);
    let done = false;
    pool.run(
      { spec, minDegree: 5, maxDegree: 5, totals: [0], circleDelta: 0.02, hueDigits: 0 },
      {
        onChunk: () => {
          throw new Error("nothing should be swept");
        },
        onProgress: () => {},
        onDone: () => {
          done = true;
        },
        onError: () => {},
      },
    );
    expect(done).toBe(true);
    expect(workers.every((w) => w.inbox.length === 0)).toBe(true);
    pool.dispose();
  });

  it("an error stops the job and is reported, not swallowed", () => {
    const { pool, workers } = makePool(2);
    const seen: string[] = [];
    let done = false;
    pool.run(
      { spec, minDegree: 9, maxDegree: 9, totals: [1 << 9], circleDelta: 0.02, hueDigits: 0 },
      {
        onChunk: () => {},
        onProgress: () => {},
        onDone: () => {
          done = true;
        },
        onError: (m) => seen.push(m),
      },
    );
    // Fail whichever worker actually holds a chunk: with one chunk and two workers, only one does.
    const busy = workers.find((w) => w.inbox.length > 0);
    expect(busy).toBeDefined();
    busy?.failOne("the alphabet cannot be read");
    drain(workers);
    expect(seen).toContain("the alphabet cannot be read");
    expect(done).toBe(false); // a job that failed did not finish
    pool.dispose();
  });

  it("a chunk error with other chunks still in flight never ends as DONE, and is reported once", () => {
    // The review's reproduction: 10 chunks, 3 workers, two errors and a success. The old pool cleared
    // its queue on the first error while the job's other replies were still in flight, so the count
    // reached its total and `onDone` fired — the shell then called a partial sweep the whole family.
    const { pool, workers } = makePool(3);
    const log: string[] = [];
    pool.run(
      { spec, minDegree: 18, maxDegree: 18, totals: [10 * 16384], circleDelta: 0.02, hueDigits: 0 },
      {
        onChunk: () => log.push("chunk"),
        onProgress: () => {},
        onDone: () => log.push("DONE"),
        onError: (m) => log.push(`ERR ${m}`),
      },
    );
    const busy = workers.filter((w) => w.inbox.length > 0);
    expect(busy).toHaveLength(3);
    busy[0].failOne("first");
    busy[1].failOne("second");
    busy[2].flushOne();
    drain(workers);
    expect(log).toEqual(["ERR first"]);
    pool.dispose();
  });

  it("a worker that DIES fails its job once and is replaced, so the next job has the whole pool", () => {
    const { pool, workers } = makePool(2);
    const log: string[] = [];
    const handlers = {
      onChunk: () => {},
      onProgress: () => {},
      onDone: () => log.push("DONE"),
      onError: (m: string) => log.push(`ERR ${m}`),
    };
    pool.run({ spec, minDegree: 10, maxDegree: 10, totals: [1 << 10], circleDelta: 0.02, hueDigits: 0 }, handlers);
    const dying = workers.find((w) => w.inbox.length > 0);
    if (dying === undefined) throw new Error("no busy worker");
    dying.inbox.length = 0;
    dying.onerror?.(new Event("error"));
    drain(workers);
    expect(log).toEqual(["ERR a worker failed; the sweep is incomplete"]);
    expect(dying.terminated).toBe(true);
    expect(pool.size).toBe(2);
    // The next job is dispatched across two LIVE workers, not one.
    log.length = 0;
    pool.run({ spec, minDegree: 16, maxDegree: 16, totals: [4 * 16384], circleDelta: 0.02, hueDigits: 0 }, handlers);
    expect(workers.filter((w) => !w.terminated && w.inbox.length > 0)).toHaveLength(2);
    drain(workers);
    expect(log).toEqual(["DONE"]);
    pool.dispose();
  });

  it("a worker dying on a SUPERSEDED job's chunk says nothing about the current job", () => {
    const { pool, workers } = makePool(2);
    const log: string[] = [];
    const handlers = {
      onChunk: () => {},
      onProgress: () => {},
      onDone: () => log.push("DONE"),
      onError: (m: string) => log.push(`ERR ${m}`),
    };
    pool.run({ spec, minDegree: 16, maxDegree: 16, totals: [4 * 16384], circleDelta: 0.02, hueDigits: 0 }, handlers);
    const old = workers.filter((w) => w.inbox.length > 0);
    // A new job replaces it while both workers still hold the old one's chunks.
    pool.run({ spec, minDegree: 8, maxDegree: 8, totals: [1 << 8], circleDelta: 0.02, hueDigits: 0 }, handlers);
    old[0].inbox.length = 0;
    old[0].onerror?.(new Event("error"));
    drain(workers);
    expect(log).toEqual(["DONE"]);
    pool.dispose();
  });

  it("after a failure, reports it ONCE and dispatches nothing more for that job", () => {
    const { pool, workers, dispatched } = makePool(2);
    const log: string[] = [];
    pool.run(
      { spec, minDegree: 18, maxDegree: 18, totals: [10 * 16384], circleDelta: 0.02, hueDigits: 0 },
      { onChunk: () => {}, onProgress: () => {}, onDone: () => log.push("DONE"), onError: (m) => log.push(m) },
    );
    const [a, b] = workers.filter((w) => w.inbox.length > 0);
    a.inbox.length = 0;
    a.onerror?.(new Event("error"));
    const issued = dispatched.length;
    b.inbox.length = 0;
    b.onerror?.(new Event("error"));
    drain(workers);
    expect(log).toEqual(["a worker failed; the sweep is incomplete"]);
    expect(dispatched.length).toBe(issued);
    pool.dispose();
  });

  it("issues a job lazily — a vast index space costs nothing until it is worked", () => {
    // The queue used to be materialised up front on the main thread: 18.6 million entries for {−2…2}
    // at degree 16. A cursor issues exactly one chunk per idle worker, whatever the total.
    const { pool, dispatched } = makePool(4);
    const t = performance.now();
    pool.run(
      { spec, minDegree: 30, maxDegree: 30, totals: [2 ** 45], circleDelta: 0.02, hueDigits: 0 },
      { onChunk: () => {}, onProgress: () => {}, onDone: () => {}, onError: () => {} },
    );
    expect(performance.now() - t).toBeLessThan(50);
    expect(dispatched).toHaveLength(4);
    expect(dispatched.map((r) => r.lo)).toEqual([0, 16384, 32768, 49152]);
    pool.cancel();
    pool.dispose();
  });

  it("dispose terminates every worker", () => {
    const { pool, workers } = makePool(3);
    expect(pool.size).toBe(3);
    pool.dispose();
    expect(workers).toHaveLength(3);
    expect(workers.every((w) => w.terminated)).toBe(true);
  });
});

describe("the pool size", () => {
  it("leaves a core for the main thread, and copes with a browser that will not say", () => {
    expect(defaultPoolSize(8)).toBe(7);
    expect(defaultPoolSize(1)).toBe(1); // never zero
    expect(defaultPoolSize(undefined)).toBe(3); // the 4-core assumption, less the main thread
    expect(defaultPoolSize(64)).toBe(12); // capped: more workers than that only adds message overhead
  });
});
