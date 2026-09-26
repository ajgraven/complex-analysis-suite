// The worker pool that drives the root sweep.
//
// **Why not `@cas/ui`'s `createComputeClient`.** That primitive is exactly right for one question with
// one answer, coalescing while it waits — Complex Dynamics' Julia metrics. This is the other shape: one
// request fans out to thousands of chunks across every core, each chunk's answer is wanted AS IT
// ARRIVES (the picture fills in while the reader watches), and a superseded request must be abandoned
// mid-flight rather than finished and thrown away. `createComputeClient` has no vocabulary for any of
// that. Quadrature Domains' `param-slice-pool.mjs` is the suite's prior art for the pattern and is
// `.mjs` inside another app, so it cannot be imported here; when a second consumer appears this becomes
// the extraction (ADR-0007), and until then it is app-local.
//
// **Degrees ascend, and that is a UX decision.** The cheap degrees finish in milliseconds, so the reader
// sees the whole cloud immediately and watches it sharpen, instead of staring at nothing while degree 20
// computes. Chunks are ISSUED in degree order across the pool; the last chunks of one degree and the
// first of the next can be in flight together, so a degree's layer is not guaranteed complete before
// the one above it begins (this said it was until the 2026-09-26 review — the pool's own test says
// otherwise).
import type { AlphabetSpec } from "./alphabet.js";
import type { RootsRequest, RootsResponse } from "./roots.worker.js";
import type { SweepStats } from "./sweep.js";

/** What the pool is asked to compute. */
export interface PoolJob {
  readonly spec: AlphabetSpec;
  readonly minDegree: number;
  readonly maxDegree: number;
  /** Size of each degree's index space, in order `minDegree … maxDegree`. */
  readonly totals: readonly number[];
  readonly circleDelta: number;
  /** Egan's hue: coefficients to colour by, or 0 for none (see `sweep.ts`). */
  readonly hueDigits: number;
}

/**
 * Called as each chunk lands. `points` is `[x, y, weight]` triples for that degree; `hues` is present
 * exactly when the job asked for them, `|G|` per point.
 */
export interface PoolHandlers {
  onChunk: (degree: number, points: Float32Array, stats: SweepStats, hues?: Float32Array) => void;
  onProgress: (done: number, total: number) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

/** How many raw indices one chunk covers. Big enough to amortise the message, small enough to stay live. */
const CHUNK = 16384;

/** The pool's view of one issued chunk. */
interface Pending {
  degree: number;
  lo: number;
  hi: number;
}

/**
 * A fixed pool of module workers sweeping one job at a time.
 *
 * `run` replaces whatever was running: the job id is bumped, every reply carrying the old id is dropped,
 * and the cursor is reset. The workers themselves are torn down only when one DIES — recreating them on
 * every parameter change was measurably the slowest thing a slider could do.
 *
 * **The queue is a cursor, not an array.** It used to be materialised up front, one `Pending` per 16,384
 * indices, on the main thread: choosing `{−2 … 2}` at degree 16 pushed 18.6 million of them (6.9 s
 * blocked, 1 GB of heap) before the first chunk was sent. The cost gate (`engine/cost.ts`) now stops
 * such a job reaching here at all, and the cursor makes a job's size cost nothing until it is worked —
 * which also retires `queue.shift()`, O(n) on a large array.
 *
 * **A failed job stays failed.** A chunk error used to clear the queue while replies from the same job
 * were still in flight, so the progress count reached its total and `onDone` fired — a partial sweep
 * reported as the whole family. And a worker that died (`onerror`) was never returned to `idle` nor
 * counted out of `inFlight`, so the job hung at "computing" and the pool was one worker smaller for
 * ever. Both are reported once, the job is ended with `onError` and never `onDone`, and a dead worker is
 * replaced.
 */
export class RootPool {
  private readonly workers: Worker[] = [];
  private readonly idle: Worker[] = [];
  /** What each busy worker is holding, so a death can be attributed to its job. */
  private readonly holding = new Map<Worker, number>();
  private jobId = 0;
  private job: PoolJob | null = null;
  /** The cursor: the degree and the next index to issue within it. */
  private cursorDegree = 0;
  private cursorLo = 0;
  private inFlight = 0;
  private issued = 0;
  private answered = 0;
  private totalChunks = 0;
  private failed = false;
  private handlers: PoolHandlers | null = null;
  private disposed = false;

  constructor(
    size: number,
    /** Injected so a test can drive the pool without a real Worker. */
    private readonly spawn: () => Worker = () =>
      new Worker(new URL("./roots.worker.ts", import.meta.url), { type: "module" }),
  ) {
    const n = Math.max(1, Math.min(16, Math.floor(size)));
    for (let i = 0; i < n; i++) this.addWorker();
  }

  private addWorker(): void {
    const w = this.spawn();
    w.onmessage = (e: MessageEvent<RootsResponse>): void => this.receive(w, e.data);
    w.onerror = (): void => this.died(w);
    this.workers.push(w);
    this.idle.push(w);
  }

  /** How many workers are running. */
  get size(): number {
    return this.workers.length;
  }

  /** Start a job, abandoning any job already in flight. */
  run(job: PoolJob, handlers: PoolHandlers): void {
    if (this.disposed) return;
    this.jobId++;
    this.handlers = handlers;
    this.job = job;
    this.issued = 0;
    this.answered = 0;
    this.inFlight = 0;
    this.failed = false;
    this.holding.clear();
    this.cursorDegree = job.minDegree;
    this.cursorLo = 0;
    let chunks = 0;
    for (let degree = job.minDegree; degree <= job.maxDegree; degree++) {
      chunks += Math.ceil((job.totals[degree - job.minDegree] ?? 0) / CHUNK);
    }
    this.totalChunks = chunks;
    if (this.totalChunks === 0) {
      handlers.onProgress(0, 0);
      handlers.onDone();
      return;
    }
    handlers.onProgress(0, this.totalChunks);
    this.pump();
  }

  /** Abandon the current job; replies still in flight are ignored. */
  cancel(): void {
    this.jobId++;
    this.job = null;
    this.inFlight = 0;
    this.holding.clear();
  }

  /** Terminate every worker. The pool cannot be used afterwards. */
  dispose(): void {
    this.disposed = true;
    this.cancel();
    for (const w of this.workers) {
      w.onmessage = null;
      w.onerror = null;
      w.terminate();
    }
    this.workers.length = 0;
    this.idle.length = 0;
  }

  /** The next chunk the cursor stands on, advancing it; null when the job is issued in full. */
  private nextChunk(): Pending | null {
    const job = this.job;
    if (job === null) return null;
    while (this.cursorDegree <= job.maxDegree) {
      const total = job.totals[this.cursorDegree - job.minDegree] ?? 0;
      if (this.cursorLo < total) {
        const chunk = { degree: this.cursorDegree, lo: this.cursorLo, hi: Math.min(total, this.cursorLo + CHUNK) };
        this.cursorLo = chunk.hi;
        return chunk;
      }
      this.cursorDegree++;
      this.cursorLo = 0;
    }
    return null;
  }

  private pump(): void {
    const job = this.job;
    if (job === null || this.failed) return;
    while (this.idle.length > 0) {
      const next = this.nextChunk();
      if (next === null) break;
      const w = this.idle.pop();
      if (w === undefined) break;
      const req: RootsRequest = {
        jobId: this.jobId,
        chunkId: this.issued++,
        spec: job.spec,
        degree: next.degree,
        lo: next.lo,
        hi: next.hi,
        circleDelta: job.circleDelta,
        hueDigits: job.hueDigits,
      };
      this.inFlight++;
      this.holding.set(w, this.jobId);
      w.postMessage(req);
    }
  }

  /** End the current job as a failure, once. */
  private fail(message: string): void {
    if (this.failed) return;
    this.failed = true;
    this.handlers?.onError(message);
  }

  private died(worker: Worker): void {
    const heldFor = this.holding.get(worker);
    this.holding.delete(worker);
    worker.onmessage = null;
    worker.onerror = null;
    worker.terminate();
    const at = this.workers.indexOf(worker);
    if (at >= 0) this.workers.splice(at, 1);
    const idleAt = this.idle.indexOf(worker);
    if (idleAt >= 0) this.idle.splice(idleAt, 1);
    if (!this.disposed) this.addWorker();
    // Its chunk is lost, so the job it belonged to cannot be complete. A worker that died holding a
    // chunk of a SUPERSEDED job says nothing about the current one.
    if (heldFor === this.jobId) {
      this.inFlight--;
      this.fail("a worker failed; the sweep is incomplete");
    }
    this.pump();
  }

  private receive(worker: Worker, res: RootsResponse): void {
    this.holding.delete(worker);
    this.idle.push(worker);
    // A reply from a job that has been replaced: the picture it belongs to is gone.
    if (res.jobId !== this.jobId) {
      this.pump();
      return;
    }
    this.inFlight--;
    const handlers = this.handlers;
    if (handlers === null) return;
    if (this.failed) return;
    if (res.error !== undefined) {
      this.fail(res.error);
      return;
    }
    if (res.points !== undefined && res.stats !== undefined) {
      handlers.onChunk(res.degree, res.points, res.stats, res.hues);
    }
    this.answered++;
    handlers.onProgress(this.answered, this.totalChunks);
    if (this.answered === this.totalChunks) {
      handlers.onDone();
      return;
    }
    this.pump();
  }
}

/** The pool size to use: one worker per core, less the main thread, clamped to something sane. */
export function defaultPoolSize(hardwareConcurrency: number | undefined): number {
  const cores = typeof hardwareConcurrency === "number" && hardwareConcurrency > 0 ? hardwareConcurrency : 4;
  return Math.max(1, Math.min(12, cores - 1));
}
