/**
 * Client for the Tier-2 Julia image metrics — a thin adapter over @cas/ui's `createComputeClient`
 * (ADR-0028, U1). Posts a request to {@link ./juliaMetrics.worker} and delivers the result via a
 * callback, coalescing to only the latest in-flight request, dropping stale responses, and — when
 * Workers are unavailable or the worker dies mid-flight — falling back to a synchronous main-thread
 * compute so metrics are always produced.
 *
 * The generic behavior that used to live inline here now lives in the shared shell primitive: the
 * send-side coalescing (single-in-flight lane), the response-side stale drop, and the worker-death
 * recovery that re-runs the in-flight request on the main thread (cd-metricsworker-01, which the
 * primitive gained when it was proven against this client). This file is now just the metrics-specific
 * wiring: the sync compute and the worker message mapping. Behavior is unchanged — the send-side
 * coalescing test (test/juliaMetricsClient.test.ts) passes before and after.
 */
import { createComputeClient, type ComputeClient } from "@cas/ui";
import { parse } from "@cas/expr/parser";
import { computeJuliaImageMetrics, type JuliaImageMetrics } from "./juliaProperties";
import type { JuliaMetricsMessage, JuliaMetricsResponse } from "./juliaMetrics.worker";

/** Serializable inputs for one metrics computation (f/escape passed as source, re-parsed worker-side). */
export type JuliaMetricsRequest = Omit<JuliaMetricsMessage, "reqId">;

function runSync(req: JuliaMetricsRequest): JuliaImageMetrics {
  return computeJuliaImageMetrics({
    fAst: parse(req.fSource),
    escAst: parse(req.escSource),
    a: req.a,
    c: req.c,
    centerX: req.centerX,
    centerY: req.centerY,
    zoom: req.zoom,
    boundingRadius: req.boundingRadius,
    escapes: req.escapes,
    rigorousConnectivity: req.rigorousConnectivity,
    size: req.size,
  });
}

export class JuliaMetricsClient {
  private readonly client: ComputeClient<JuliaMetricsRequest, JuliaImageMetrics>;
  private errorCb: ((message: string) => void) | null = null;
  /** One-shot waiters registered by {@link settled}, released by the next result or error. */
  private waiters: (() => void)[] = [];

  /** Release every {@link settled} waiter — one delivery answers all of them. */
  private release(): void {
    const w = this.waiters;
    this.waiters = [];
    for (const done of w) done();
  }

  constructor() {
    this.client = createComputeClient<JuliaMetricsRequest, JuliaImageMetrics>({
      compute: runSync,
      // The sync fallback fires SYNCHRONOUSLY (headless / no-Worker), matching the previous inline client.
      deferSync: false,
      worker: () =>
        new Worker(new URL("./juliaMetrics.worker.ts", import.meta.url), { type: "module" }),
      toMessage: (req, reqId): JuliaMetricsMessage => ({ reqId, ...req }),
      fromMessage: (data): { reqId: number; result?: JuliaImageMetrics; error?: string } => {
        // The worker posts `{ reqId, error }` on a throw. Passing it through is what lets the panel
        // say so; before WP6 it was mapped to `result: undefined` and dropped by the client, and the
        // rows sat at "measuring…" for ever with nothing on screen explaining why.
        const r = data as JuliaMetricsResponse;
        return { reqId: r.reqId, result: r.metrics, error: r.error };
      },
      onError: (message) => {
        this.release();
        this.errorCb?.(message);
      },
    });
  }

  /** Compute metrics for `req`; `cb` fires with the latest result (worker async, or sync fallback). */
  request(req: JuliaMetricsRequest, cb: (m: JuliaImageMetrics) => void): void {
    this.client.request(req, (m) => {
      cb(m);
      this.release();
    });
  }

  /**
   * Resolves once a result has been PAINTED (or a failure reported), with a backstop timeout.
   *
   * Not "resolves when *my* request returns": the client coalesces, so a request can be superseded
   * and its own callback never fire, and a promise tied to one request id would hang for ever. What
   * a caller wanting to read the rows actually needs is "the panel has been refreshed since I
   * asked", and a superseding result is a FRESHER answer to the same question, so it counts.
   *
   * Register it BEFORE the request: with no Worker the compute runs synchronously inside
   * `request`, so a waiter added afterwards would have missed its own delivery. (WP7/S2.)
   */
  settled(timeoutMs = 5000): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== done);
        resolve();
      }, timeoutMs);
      const done = (): void => {
        clearTimeout(timer);
        resolve();
      };
      this.waiters.push(done);
    });
  }

  /**
   * Called when the worker reports a failure instead of a result, so the caller can stop waiting.
   * Without it the rows it feeds sit at "measuring…" for ever. (WP6, review 2026-09-16.)
   */
  onError(cb: (message: string) => void): void {
    this.errorCb = cb;
  }
}
