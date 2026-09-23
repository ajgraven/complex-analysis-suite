// The root engine's worker: a thin wrapper around `sweepPrepared`.
//
// It is thin on purpose. Everything that decides what the picture SHOWS — which polynomials are
// enumerated, what weight each root deposits, how many are real — is in `sweep.ts`, where the node gate
// runs it directly. What is here and nowhere else is the part a test cannot reach anyway: keeping the
// compiled alphabet and the scratch buffers alive across the chunks of one degree, and transferring the
// point buffer instead of copying it.
//
// No `webworker` lib in tsconfig (it clashes with the DOM lib the rest of the app needs), so the global
// scope is described locally — the same shape Complex Dynamics' `juliaMetrics.worker.ts` uses.
import type { AlphabetSpec } from "./alphabet.js";
import { prepareSweep, sweepPrepared } from "./sweep.js";
import type { SweepContext, SweepStats } from "./sweep.js";

/** One chunk of work. `jobId` lets the main thread discard replies from a superseded request. */
export interface RootsRequest {
  readonly jobId: number;
  readonly chunkId: number;
  readonly spec: AlphabetSpec;
  readonly degree: number;
  readonly lo: number;
  readonly hi: number;
  readonly circleDelta: number;
  readonly hueDigits: number;
}

/** One chunk's answer, or the reason there is none. */
export interface RootsResponse {
  readonly jobId: number;
  readonly chunkId: number;
  readonly degree: number;
  readonly points?: Float32Array;
  readonly hues?: Float32Array;
  readonly representatives?: number;
  readonly stats?: SweepStats;
  readonly error?: string;
}

interface WorkerScope {
  onmessage: ((e: MessageEvent<RootsRequest>) => void) | null;
  postMessage: (message: RootsResponse, transfer?: Transferable[]) => void;
}

const ctx = self as unknown as WorkerScope;

// Kept between chunks: compiling an alphabet and allocating the per-degree scratch on every chunk would
// dominate a small chunk's cost.
let cached: { key: string; context: SweepContext } | null = null;

function contextFor(spec: AlphabetSpec, degree: number): SweepContext | { error: string } {
  const key = `${JSON.stringify(spec)}#${degree}`;
  if (cached !== null && cached.key === key) return cached.context;
  const built = prepareSweep(spec, degree);
  if ("error" in built) return built;
  cached = { key, context: built };
  return built;
}

ctx.onmessage = (e): void => {
  const req = e.data;
  try {
    const context = contextFor(req.spec, req.degree);
    if ("error" in context) {
      ctx.postMessage({ jobId: req.jobId, chunkId: req.chunkId, degree: req.degree, error: context.error });
      return;
    }
    const result = sweepPrepared(context.alphabet, context.space, req, context.scratch);
    ctx.postMessage(
      {
        jobId: req.jobId,
        chunkId: req.chunkId,
        degree: result.degree,
        points: result.points,
        ...(result.hues !== undefined ? { hues: result.hues } : {}),
        representatives: result.representatives,
        stats: result.stats,
      },
      result.hues !== undefined ? [result.points.buffer, result.hues.buffer] : [result.points.buffer],
    );
  } catch (err) {
    ctx.postMessage({
      jobId: req.jobId,
      chunkId: req.chunkId,
      degree: req.degree,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
