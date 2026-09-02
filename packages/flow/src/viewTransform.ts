// viewTransform.ts — the pure pixel↔world view math behind Net2D's pan/zoom navigation. Net2D is a
// DOM-only line-art drawer (no test, by the flow-package decision), so the arithmetic that a keyboard /
// wheel / drag gesture turns into a new view lives here as pure functions over plain data, node-tested
// directly. Net2D delegates to these so there is ONE source of truth for the world↔pixel transform.
//
// The view is an isotropic window on the world plane: `cx, cy` is the world point at the canvas centre and
// `halfSpan` is the half-height of the visible world region (world units). The x extent follows from the
// canvas aspect, so a circle stays a circle. Screen y is DOWN, world y is UP.
import type { Pt } from "./transplant.js";

/** The view window: world centre (`cx, cy`) and half-height span (world units, > 0). */
export interface View {
  cx: number;
  cy: number;
  halfSpan: number;
}

/** The drawing buffer: device-pixel width/height (Net2D's `canvas.width/height`) and devicePixelRatio. */
export interface Viewport {
  width: number;
  height: number;
  dpr: number;
}

/** Zoom limits: `halfSpan` never shrinks below MIN (deep zoom) or grows past MAX (far zoom-out). */
export const MIN_HALF_SPAN = 1e-4;
export const MAX_HALF_SPAN = 1e6;

const clampSpan = (h: number): number => Math.min(MAX_HALF_SPAN, Math.max(MIN_HALF_SPAN, h));
const aspectOf = (vp: Viewport): number => (vp.height > 0 ? vp.width / vp.height : 1);

/**
 * A CSS-pixel coordinate relative to the canvas top-left (e.g. a pointer event's clientX/Y minus
 * `getBoundingClientRect()`) → world coordinates, under `view` + `vp`. The exact inverse of Net2D's
 * internal world→pixel transform (kept byte-identical so hit-testing matches what was drawn).
 */
export function pixelToWorld(view: View, vp: Viewport, cssX: number, cssY: number): Pt {
  const W = Math.max(1, vp.width);
  const H = Math.max(1, vp.height);
  const ndcx = ((cssX * vp.dpr) / W - 0.5) * 2;
  const ndcy = (0.5 - (cssY * vp.dpr) / H) * 2;
  return [view.cx + ndcx * view.halfSpan * aspectOf(vp), view.cy + ndcy * view.halfSpan];
}

/** World units per CSS pixel at the current view (isotropic — same in x and y). */
export function worldPerPixel(view: View, vp: Viewport): number {
  const H = Math.max(1, vp.height);
  return ((2 * view.halfSpan) / H) * vp.dpr;
}

/**
 * Pan the view by a CSS-pixel delta — the world point under the cursor follows the drag. `dxCss, dyCss` is
 * the pointer's screen movement (right / down positive); the view centre shifts the opposite way in x and
 * the same way in y (screen-down = world-up).
 */
export function panView(view: View, vp: Viewport, dxCss: number, dyCss: number): View {
  const wpp = worldPerPixel(view, vp);
  return { cx: view.cx - dxCss * wpp, cy: view.cy + dyCss * wpp, halfSpan: view.halfSpan };
}

/**
 * Zoom about a CSS-pixel focus by `factor` (> 1 zooms IN, shrinking the span), keeping the world point
 * under the focus fixed. `halfSpan` is clamped to [MIN, MAX]; when the clamp bites, the focus still stays
 * put (the centre is recomputed against the clamped span).
 */
export function zoomView(view: View, vp: Viewport, cssX: number, cssY: number, factor: number): View {
  const f = Number.isFinite(factor) && factor > 0 ? factor : 1;
  const before = pixelToWorld(view, vp, cssX, cssY);
  const zoomed: View = { cx: view.cx, cy: view.cy, halfSpan: clampSpan(view.halfSpan / f) };
  const after = pixelToWorld(zoomed, vp, cssX, cssY);
  return { cx: zoomed.cx + (before[0] - after[0]), cy: zoomed.cy + (before[1] - after[1]), halfSpan: zoomed.halfSpan };
}
