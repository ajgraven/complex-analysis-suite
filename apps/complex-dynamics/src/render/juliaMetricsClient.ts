/**
 * Client for the Tier-2 Julia image metrics. Posts a request to {@link ./juliaMetrics.worker} and
 * delivers the result via a callback, ignoring stale responses (only the latest request paints). If
 * Web Workers are unavailable — or the worker fails to load/run — it falls back to a synchronous
 * main-thread compute, so the metrics are always produced (just without the off-thread win). This is
 * what keeps behaviour identical in headless/test environments where module workers may not run.
 */
import { parse } from "../expr/parser";
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
  private worker: Worker | null = null;
  private reqId = 0;
  private cb: ((m: JuliaImageMetrics) => void) | null = null;
  private last: JuliaMetricsRequest | null = null;

  constructor() {
    try {
      if (typeof Worker !== "undefined") {
        this.worker = new Worker(new URL("./juliaMetrics.worker.ts", import.meta.url), {
          type: "module",
        });
        this.worker.onmessage = (e: MessageEvent<JuliaMetricsResponse>): void => {
          // Only the latest request paints; stale or errored responses are dropped.
          if (e.data.reqId !== this.reqId || !e.data.metrics || !this.cb) return;
          this.cb(e.data.metrics);
        };
        this.worker.onerror = (): void => this.disableWorker(); // load/runtime failure → fall back
      }
    } catch {
      this.worker = null; // construction unsupported → synchronous fallback
    }
  }

  /** Compute metrics for `req`; `cb` fires with the latest result (worker async, or sync fallback). */
  request(req: JuliaMetricsRequest, cb: (m: JuliaImageMetrics) => void): void {
    const id = ++this.reqId;
    this.cb = cb;
    this.last = req;
    if (this.worker) this.worker.postMessage({ reqId: id, ...req } satisfies JuliaMetricsMessage);
    else cb(runSync(req));
  }

  /** Drop the worker and re-run the in-flight request on the main thread (worker became unusable). */
  private disableWorker(): void {
    this.worker = null;
    if (this.last && this.cb) this.cb(runSync(this.last));
  }
}
