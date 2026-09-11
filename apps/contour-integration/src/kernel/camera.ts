// The plane camera: plot ↔ screen, panning, and anchored zoom.
//
// Deliberately app-local. Complex-Dynamics has `src/transforms.ts` and Correspondences has its own,
// and they use **different view conventions** (`center + zoom` against `{centerX, centerY, halfSpan}`),
// so neither is the second consumer of the other and extracting now would mean picking a winner for
// reasons unrelated to this app (research 08 §8). Revisit if a fourth app wants the same convention.
//
// The convention here is `centre + halfHeight`: `halfHeight` is half the visible extent in plot
// units along y, with x derived from the aspect ratio, so a resize changes what you can see without
// changing the scale.

export type Pt = readonly [x: number, y: number];

export interface View {
  readonly center: Pt;
  /** Half the visible plot-space height. Strictly positive. */
  readonly halfHeight: number;
}

export interface Viewport {
  /** CSS pixels, not device pixels — the caller applies devicePixelRatio when sizing the drawing buffer. */
  readonly width: number;
  readonly height: number;
}

export const DEFAULT_VIEW: View = { center: [0, 0], halfHeight: 2 };

/** Plot units per CSS pixel. */
export function scale(view: View, vp: Viewport): number {
  return (2 * view.halfHeight) / Math.max(vp.height, 1);
}

/** Screen (CSS px, y down from the top-left) → plot coordinates (y up). */
export function screenToPlot(px: number, py: number, view: View, vp: Viewport): Pt {
  const s = scale(view, vp);
  return [view.center[0] + (px - vp.width / 2) * s, view.center[1] - (py - vp.height / 2) * s];
}

/** Plot coordinates → screen (CSS px, y down). */
export function plotToScreen(x: number, y: number, view: View, vp: Viewport): Pt {
  const s = scale(view, vp);
  return [vp.width / 2 + (x - view.center[0]) / s, vp.height / 2 - (y - view.center[1]) / s];
}

/** The visible plot rectangle as `[xmin, xmax, ymin, ymax]`. */
export function plotRange(view: View, vp: Viewport): [number, number, number, number] {
  const halfWidth = (view.halfHeight * Math.max(vp.width, 1)) / Math.max(vp.height, 1);
  return [
    view.center[0] - halfWidth,
    view.center[0] + halfWidth,
    view.center[1] - view.halfHeight,
    view.center[1] + view.halfHeight,
  ];
}

/**
 * The plot-space displacement of a screen-space drag — **centre-free by construction**.
 *
 * It depends only on the scale, never on where the view happens to be. That matters because the
 * natural formulation `screenToPlot(from) − screenToPlot(to)` is `(centre + Δ) − (centre + Δ′)`, and
 * once the centre is large relative to the scale each sum rounds its Δ away in a double and the
 * difference collapses to exactly zero — a deep-zoom drag that silently freezes. CD's `panDelta`
 * carries the same note for the same reason.
 */
export function panDelta(dxPx: number, dyPx: number, view: View, vp: Viewport): Pt {
  const s = scale(view, vp);
  return [-dxPx * s, dyPx * s];
}

/**
 * Pan by a screen-space drag delta.
 *
 * Note the honest limit: {@link panDelta} keeps the displacement exact, but folding it into a
 * **float64** centre still saturates once the centre's ULP exceeds the delta — around
 * `|centre| / halfHeight ≳ 1e16`. Exactness there needs a double-double centre, which is what CD's
 * `GLPlot.shift` does and what `@cas/gpu`'s df64 layer exists for. Deep zoom is deferred past v1
 * (PLAN.md §7), so this deliberately stops at float64; the delta is already in the shape that a
 * later df64 centre would consume unchanged.
 */
export function panBy(view: View, dxPx: number, dyPx: number, vp: Viewport): View {
  const [dx, dy] = panDelta(dxPx, dyPx, view, vp);
  return { ...view, center: [view.center[0] + dx, view.center[1] + dy] };
}

/**
 * Zoom by `factor` (>1 zooms in), keeping the plot point currently under `(px, py)` fixed.
 *
 * Also centre-free: the anchor is applied as a correction proportional to the *offset* from the
 * viewport centre, so the arithmetic never forms `centre + offset` at full magnitude.
 */
export function zoomAt(view: View, factor: number, px: number, py: number, vp: Viewport): View {
  const s = scale(view, vp);
  const offX = (px - vp.width / 2) * s;
  const offY = -(py - vp.height / 2) * s;
  const k = 1 - 1 / factor;
  return {
    center: [view.center[0] + offX * k, view.center[1] + offY * k],
    halfHeight: view.halfHeight / factor,
  };
}
