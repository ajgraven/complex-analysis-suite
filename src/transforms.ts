/**
 * Canvas <-> plot coordinate transforms (the JavaScript-side single source of
 * truth). The CindyScript side defines matching `PltToCanv*` / `CanvToPlt*`
 * functions in {@link ./cindyscript/init.ts}; the two MUST agree. The inverse
 * property between these functions is covered by `test/transforms.test.ts`.
 *
 * The canvas uses the fixed visible rectangle `[0,2] x [0,2]`, so the centre of
 * the plot maps to canvas coordinate `(1, 1)` and one plot unit spans `zoom`
 * canvas units.
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

/** The visible plot rectangle as `[xmin, xmax, ymin, ymax]`. */
export function plotRange(center: Vec2, zoom: number): [number, number, number, number] {
  return [center[0] - 1 / zoom, center[0] + 1 / zoom, center[1] - 1 / zoom, center[1] + 1 / zoom];
}
