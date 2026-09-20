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

import { pointAt, type Resolved } from "./geom.js";

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

/** How far the camera may zoom, and how far its centre may travel. See {@link clampView}. */
export const HALF_HEIGHT_MIN = 0.05;
export const HALF_HEIGHT_MAX = 200;
export const CENTER_MAX = 1e6;

/**
 * Put a camera back inside the plane.
 *
 * **It bounded the zoom and passed the CENTRE through**, which is not a clamp — it is half of one,
 * and the half that was missing is where the reader is. `zoomAt` folds a wheel's factor into the
 * centre as well as the half-height, so one `deltaY: 100000` left the camera 1e64 from the origin
 * at a perfectly ordinary half-height of 200: a sane magnification pointed at nothing. The test
 * firing that event is called *a flick cannot lose the plane* and asserted the half-height alone,
 * so it went unnoticed for three steps — and then leaked, because `syncHash` minted a permalink to
 * that camera and the next mount in the same document opened it.
 *
 * **Here rather than inside the controller, because the wheel is not the way in that matters.** The
 * codec checks the camera is three finite numbers with a positive height and says nothing about
 * magnitude — rightly, since a far-off camera is a link that CAN be honoured, just not one worth
 * honouring literally — so a `#vs=` carrying `1e64` lands a reader somewhere they did not navigate
 * to and cannot navigate back from. The shell's door clamps it; the codec keeps refusing only what
 * it cannot rebuild.
 *
 * `CENTER_MAX` is a guard against arithmetic rather than a product limit: at the widest view, 1e6
 * is five thousand screens from the origin, which is not navigation. A non-finite axis becomes 0,
 * because there is no nearest point to fall back to and the origin is where the plane is.
 */
export function clampView(v: View): View {
  const axis = (x: number): number =>
    Number.isFinite(x) ? Math.min(CENTER_MAX, Math.max(-CENTER_MAX, x)) : 0;
  return {
    center: [axis(v.center[0]), axis(v.center[1])],
    halfHeight: Number.isFinite(v.halfHeight)
      ? Math.min(HALF_HEIGHT_MAX, Math.max(HALF_HEIGHT_MIN, v.halfHeight))
      : DEFAULT_VIEW.halfHeight,
  };
}

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

/**
 * The view that frames a contour.
 *
 * Opening a record left its contour wherever the default view happened to be pointing, and the two
 * do not match: C1's semicircle runs to R = 4 and the indented-semicircle template to R = 8, against
 * a default half-height of 2 — so most of the argument on screen was off screen. Fits whichever axis
 * binds (x is derived from the aspect ratio, so a wide contour is limited by the width) with a
 * margin, from the piece geometry rather than from the template's parameters, which is what makes it
 * work for a hand-built contour too.
 *
 * A degenerate contour — one point, or an empty list — keeps the default half-height instead of
 * zooming to infinity.
 */
export function fitView(pieces: readonly Resolved[], vp: Viewport, pad = 1.2): View {
  let xmin = Infinity;
  let xmax = -Infinity;
  let ymin = Infinity;
  let ymax = -Infinity;
  // Sampled rather than solved: an arc's extremes are its endpoints plus whichever axis crossings it
  // sweeps through, and 64 points put the bound within 0.1% of the radius — far inside the margin
  // this then multiplies in. Exactness would buy nothing a `pad` of 1.2 does not already cover.
  const SAMPLES = 64;
  for (const piece of pieces) {
    for (let k = 0; k <= SAMPLES; k++) {
      const [x, y] = pointAt(piece, k / SAMPLES);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < xmin) xmin = x;
      if (x > xmax) xmax = x;
      if (y < ymin) ymin = y;
      if (y > ymax) ymax = y;
    }
  }
  if (!Number.isFinite(xmin) || !Number.isFinite(ymin)) return DEFAULT_VIEW;

  const aspect = Math.max(vp.width, 1) / Math.max(vp.height, 1);
  const halfHeight = Math.max(
    ((ymax - ymin) / 2) * pad,
    ((xmax - xmin) / 2 / aspect) * pad,
    DEFAULT_VIEW.halfHeight * 1e-6,
  );
  return { center: [(xmin + xmax) / 2, (ymin + ymax) / 2], halfHeight };
}
