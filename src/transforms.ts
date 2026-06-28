/**
 * Canvas <-> plot coordinate transforms. The canvas uses the fixed visible
 * rectangle `[0,2] x [0,2]`, so the centre of the plot maps to canvas coordinate
 * `(1, 1)` and one plot unit spans `zoom` canvas units. The inverse property
 * between these functions is covered by `test/transforms.test.ts`.
 *
 * The WebGL fragment shader does its own pixel→plot mapping (see
 * {@link ./render/shaderBuilder}); the overlay uses these helpers for plot↔pixel.
 */

import type { Vec2 } from "./arrays";

/** Map a canvas coordinate to its plot coordinate. */
export function canvToPlot([x, y]: Vec2, center: Vec2, zoom: number): Vec2 {
  return [(x - 1) / zoom + center[0], (y - 1) / zoom + center[1]];
}

/** Map a plot coordinate to its canvas coordinate. */
export function plotToCanv([x, y]: Vec2, center: Vec2, zoom: number): Vec2 {
  return [(x - center[0]) * zoom + 1, (y - center[1]) * zoom + 1];
}

/**
 * Plot-space pan delta for a drag from uv `from` to uv `to` (uv ∈ [0,1]², y down to match
 * the overlay). Computed WITHOUT the centre: the natural `uvToPlot(from) − uvToPlot(to)` is
 * `(centre + Δ) − (centre + Δ′)`, and once zoom·|centre| ≳ 1e13 each `centre + Δ` rounds Δ
 * away in a double, so the difference collapses to 0 and a deep-zoom drag freezes. Dropping the
 * centre keeps the (small) delta exact at any zoom; `GLPlot.shift` then folds it into the
 * double-double centre. (The wheel-zoom anchor is already centre-free for the same reason.)
 */
export function panDelta(from: Vec2, to: Vec2, zoom: number): Vec2 {
  return [((from[0] - to[0]) * 2) / zoom, ((to[1] - from[1]) * 2) / zoom];
}

/** The visible plot rectangle as `[xmin, xmax, ymin, ymax]`. */
export function plotRange(center: Vec2, zoom: number): [number, number, number, number] {
  return [center[0] - 1 / zoom, center[0] + 1 / zoom, center[1] - 1 / zoom, center[1] + 1 / zoom];
}
