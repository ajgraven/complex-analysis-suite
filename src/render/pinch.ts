/**
 * Pure pinch-gesture → view-transform math, factored out of {@link PlotView} so it
 * can be unit-tested without a DOM or WebGL context. A two-finger pinch is
 * decomposed into a translation (the midpoint moving — i.e. two-finger pan) and a
 * scale (the finger distance changing — i.e. zoom about the midpoint).
 *
 * Both outputs are expressed as {@link GLPlot.shift} vectors (plot-space
 * translations, which are zoom-independent) plus the new zoom, so the caller can
 * apply them through the double-double `shift()` path and keep sub-double precision
 * at deep zoom — exactly as the mouse-wheel handler does.
 *
 * Coordinates are "uv": the pointer position within the plot, in `[0,1]²`, y-down
 * (the same space {@link PlotView.uvOf} produces). The uv→plot convention is
 * `plot = center + (u*2-1)/zoom` in x and `center + ((1-v)*2-1)/zoom` in y.
 */

import type { Vec2 } from "../arrays";

/** A snapshot of a two-pointer gesture in uv space. */
export interface PinchState {
  /** Distance between the two pointers (uv units). */
  dist: number;
  /** Midpoint of the two pointers (uv). */
  mid: Vec2;
}

/** Reduce the active pointers' uv positions to a {@link PinchState}, or null if fewer than two. */
export function pinchStateOf(points: Vec2[]): PinchState | null {
  const a = points[0];
  const b = points[1];
  if (!a || !b) return null;
  return {
    dist: Math.hypot(a[0] - b[0], a[1] - b[1]),
    mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
  };
}

/**
 * Given the previous and current pinch snapshots and the current zoom, return the
 * new zoom plus the two {@link GLPlot.shift} vectors to apply (pan, then zoom-anchor).
 *
 * - `panShift` moves the plot point under the *previous* midpoint to the *current*
 *   midpoint (two-finger pan). The view centre cancels in the uv→plot difference,
 *   so this depends only on the midpoint delta and the (old) zoom.
 * - `zoomShift` keeps the plot point under the *current* midpoint fixed while the
 *   zoom changes by the finger-distance ratio — the same anchored-zoom math as the
 *   wheel handler (`k = 1/oldZoom - 1/newZoom`).
 *
 * The two shifts and the zoom assignment commute (shift is zoom-independent), so
 * the caller may apply them in any order.
 */
export function pinchShift(
  prev: PinchState,
  cur: PinchState,
  zoom: number,
): { newZoom: number; panShift: Vec2; zoomShift: Vec2 } {
  const panShift: Vec2 = [
    ((prev.mid[0] - cur.mid[0]) * 2) / zoom,
    ((cur.mid[1] - prev.mid[1]) * 2) / zoom,
  ];
  const factor = prev.dist > 0 && cur.dist > 0 ? cur.dist / prev.dist : 1;
  const newZoom = zoom * factor;
  const k = 1 / zoom - 1 / newZoom;
  const zoomShift: Vec2 = [(cur.mid[0] * 2 - 1) * k, ((1 - cur.mid[1]) * 2 - 1) * k];
  return { newZoom, panShift, zoomShift };
}
