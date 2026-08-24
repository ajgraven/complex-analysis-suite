/**
 * Client for the Tier-2 Julia image metrics. Posts a request to {@link ./juliaMetrics.worker} and
 * delivers the result via a callback, ignoring stale responses (only the latest request paints). If
 * Web Workers are unavailable — or the worker fails to load/run — it falls back to a synchronous
 * main-thread compute, so the metrics are always produced (just without the off-thread win). This is
 * what keeps behaviour identical in headless/test environments where module workers may not run.
 */
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
  private worker: Worker | null = null;
  private reqId = 0;
  private cb: ((m: JuliaImageMetrics) => void) | null = null;
  private last: JuliaMetricsRequest | null = null;
  private inFlight = false; // a worker request is posted and awaiting its response
  private pending: JuliaMetricsRequest | null = null; // latest request that arrived mid-flight (coalesced)

  constructor() {
    try {
      if (typeof Worker !== "undefined") {
        this.worker = new Worker(new URL("./juliaMetrics.worker.ts", import.meta.url), {
          type: "module",
        });
        this.worker.onmessage = (e: MessageEvent<JuliaMetricsResponse>): void => {
          if (e.data.reqId !== this.reqId) return; // a superseded response (defensive; coalescing keeps one in flight)
          this.inFlight = false;
          // Only the latest request paints; an errored (metrics-less) response still frees the lane.
          if (e.data.metrics && this.cb) this.cb(e.data.metrics);
          this.flushPending(); // post the coalesced latest request that arrived while this one was in flight
        };
        this.worker.onerror = (): void => this.disableWorker(); // load/runtime failure → fall back
      }
    } catch {
      this.worker = null; // construction unsupported → synchronous fallback
    }
  }

  /** Compute metrics for `req`; `cb` fires with the latest result (worker async, or sync fallback). */
  request(req: JuliaMetricsRequest, cb: (m: JuliaImageMetrics) => void): void {
    this.cb = cb;
    this.last = req;
    if (!this.worker) {
      cb(runSync(req));
      return;
    }
    if (this.inFlight) {
      // A worker request is already out — don't flood its queue behind superseded work. Keep only the
      // LATEST and post it once the current response returns (send-side coalescing, matching the QD
      // live-solver's single-in-flight lane). The response-side stale-drop still guards anything queued.
      this.pending = req;
      return;
    }
    this.postToWorker(req);
  }

  /** Post one request to the worker and mark the lane busy. */
  private postToWorker(req: JuliaMetricsRequest): void {
    if (!this.worker) return;
    const id = ++this.reqId;
    this.inFlight = true;
    this.worker.postMessage({ reqId: id, ...req } satisfies JuliaMetricsMessage);
  }

  /** After a response frees the lane, send the coalesced latest request (if one arrived mid-flight). */
  private flushPending(): void {
    if (!this.worker || !this.pending) return;
    const p = this.pending;
    this.pending = null;
    this.postToWorker(p);
  }

  /**
   * Drop the worker and re-run the in-flight request on the main thread (worker became unusable).
   *
   * Terminating first is load-bearing twice over. Dropping the reference alone leaked the thread —
   * a Worker is kept alive by the agent, not by our variable, so an errored-but-running worker went
   * on holding its module graph and any allocation it was mid-way through for the life of the page.
   * And it left the message channel open: a response already queued for the request we are about to
   * recompute would still dispatch, calling `cb` a second time with a result from a worker we have
   * just declared unusable. Clearing the handlers makes that unambiguous either way.
   * (cd-metricsworker-01)
   */
  private disableWorker(): void {
    const w = this.worker;
    this.worker = null;
    this.inFlight = false;
    this.pending = null; // the sync fallback below re-runs `this.last`, which already supersedes any pending
    if (w) {
      w.onmessage = null;
      w.onerror = null;
      try {
        w.terminate();
      } catch {
        /* already dead / terminate unsupported — the reference is dropped regardless */
      }
    }
    if (this.last && this.cb) this.cb(runSync(this.last));
  }
}
