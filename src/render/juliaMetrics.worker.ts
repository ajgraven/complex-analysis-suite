/**
 * Web Worker that runs the heavy Tier-2 Julia image metrics off the main thread (driven by
 * {@link ./juliaMetricsClient}). It re-parses the f/escape source (kept self-contained and small)
 * and calls the pure {@link computeJuliaImageMetrics}; the very same function runs synchronously on
 * the main thread when Web Workers are unavailable, so the result is identical either way.
 *
 * The worker global is typed via a minimal local interface rather than the `webworker` lib, which
 * would clash with the project's DOM lib (both declare `self`, and `Window.postMessage` has a
 * different signature than a worker's).
 */
import { parse } from "../expr/parser";
import { computeJuliaImageMetrics, type JuliaImageMetrics } from "./juliaProperties";

/** Request payload posted by the client. */
export interface JuliaMetricsMessage {
  reqId: number;
  fSource: string;
  escSource: string;
  a: [number, number];
  c: [number, number];
  centerX: number;
  centerY: number;
  zoom: number;
  boundingRadius: number | null;
  escapes: boolean;
  rigorousConnectivity: boolean;
  size: number;
}

/** Response payload posted back to the client. */
export interface JuliaMetricsResponse {
  reqId: number;
  metrics?: JuliaImageMetrics;
  error?: string;
}

interface WorkerScope {
  onmessage: ((e: MessageEvent<JuliaMetricsMessage>) => void) | null;
  postMessage: (message: JuliaMetricsResponse) => void;
}
const ctx = self as unknown as WorkerScope;

ctx.onmessage = (e: MessageEvent<JuliaMetricsMessage>): void => {
  const r = e.data;
  try {
    const metrics = computeJuliaImageMetrics({
      fAst: parse(r.fSource),
      escAst: parse(r.escSource),
      a: r.a,
      c: r.c,
      centerX: r.centerX,
      centerY: r.centerY,
      zoom: r.zoom,
      boundingRadius: r.boundingRadius,
      escapes: r.escapes,
      rigorousConnectivity: r.rigorousConnectivity,
      size: r.size,
    });
    ctx.postMessage({ reqId: r.reqId, metrics });
  } catch (err) {
    ctx.postMessage({ reqId: r.reqId, error: err instanceof Error ? err.message : String(err) });
  }
};
