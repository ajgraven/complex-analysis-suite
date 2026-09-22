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
// computes. Each degree's chunks are handed out in order across the pool; the next degree starts only
// when the previous one is drained, so a degree's texture is complete before the one above it begins.
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
}

/** Called as each chunk lands. `points` is `[x, y, weight]` triples for that degree. */
export interface PoolHandlers {
  onChunk: (degree: number, points: Float32Array, stats: SweepStats) => void;
  onProgress: (done: number, total: number) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

/** How many raw indices one chunk covers. Big enough to amortise the message, small enough to stay live. */
const CHUNK = 16384;

/** The pool's view of one queued chunk. */
interface Pending {
  degree: number;
  lo: number;
  hi: number;
}

/**
 * A fixed pool of module workers sweeping one job at a time.
 *
 * `run` replaces whatever was running: the job id is bumped, every reply carrying the old id is dropped,
 * and the queue is rebuilt. The workers themselves are never torn down — recreating them on every
 * parameter change was measurably the slowest thing a slider could do.
 */
export class RootPool {
  private readonly workers: Worker[] = [];
  private readonly idle: Worker[] = [];
  private jobId = 0;
  private queue: Pending[] = [];
  private inFlight = 0;
  private issued = 0;
  private totalChunks = 0;
  private handlers: PoolHandlers | null = null;
  private disposed = false;

  constructor(
    size: number,
    /** Injected so a test can drive the pool without a real Worker. */
    spawn: () => Worker = () => new Worker(new URL("./roots.worker.ts", import.meta.url), { type: "module" }),
  ) {
    const n = Math.max(1, Math.min(16, Math.floor(size)));
    for (let i = 0; i < n; i++) {
      const w = spawn();
      w.onmessage = (e: MessageEvent<RootsResponse>): void => this.receive(w, e.data);
      w.onerror = (): void => {
        this.handlers?.onError("a worker failed; the sweep is incomplete");
      };
      this.workers.push(w);
      this.idle.push(w);
    }
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
    this.queue = [];
    this.issued = 0;
    this.inFlight = 0;
    for (let degree = job.minDegree; degree <= job.maxDegree; degree++) {
      const total = job.totals[degree - job.minDegree] ?? 0;
      for (let lo = 0; lo < total; lo += CHUNK) {
        this.queue.push({ degree, lo, hi: Math.min(total, lo + CHUNK) });
      }
    }
    this.totalChunks = this.queue.length;
    this.job = job;
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
    this.queue = [];
    this.inFlight = 0;
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

  private job: PoolJob | null = null;

  private pump(): void {
    const job = this.job;
    if (job === null) return;
    while (this.idle.length > 0 && this.queue.length > 0) {
      const w = this.idle.pop();
      const next = this.queue.shift();
      if (w === undefined || next === undefined) break;
      const req: RootsRequest = {
        jobId: this.jobId,
        chunkId: this.issued++,
        spec: job.spec,
        degree: next.degree,
        lo: next.lo,
        hi: next.hi,
        circleDelta: job.circleDelta,
      };
      this.inFlight++;
      w.postMessage(req);
    }
  }

  private receive(worker: Worker, res: RootsResponse): void {
    this.idle.push(worker);
    // A reply from a job that has been replaced: the picture it belongs to is gone.
    if (res.jobId !== this.jobId) {
      this.pump();
      return;
    }
    this.inFlight--;
    const handlers = this.handlers;
    if (handlers === null) return;
    if (res.error !== undefined) {
      handlers.onError(res.error);
      this.queue = [];
      return;
    }
    if (res.points !== undefined && res.stats !== undefined) {
      handlers.onChunk(res.degree, res.points, res.stats);
    }
    const done = this.totalChunks - this.queue.length - this.inFlight;
    handlers.onProgress(done, this.totalChunks);
    if (this.queue.length === 0 && this.inFlight === 0) {
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
