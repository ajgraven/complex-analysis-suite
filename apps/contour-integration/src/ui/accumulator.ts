// The accumulator panel: the partial sum walking in its own plane.
//
// Two linked planes, never a 3-D surface (research 02, P0 #4) — the Stage shows where `z` is, this
// shows where the sum has got to. The trail is a head-to-tail vector walk of `f(zₖ)·Δzₖ`, so the
// *shape* of the walk is the answer taking form: a closed contour around a simple pole spirals out
// to `2πi` and stops there.
//
// The three contrast trails are the sums students revert to under coordination load. They are drawn
// faintly, on the same axes, and `Σ Δz` closing to the origin on a closed contour is the cheapest
// striking thing in the whole app.
import type { Cx } from "../kernel/geom.js";
import type { InkTheme } from "./inkTheme.js";
import type { Accumulation, AccumulationStep } from "../engine/contour/accumulate.js";
import { PIECE_COLOURS } from "./stage/ink.js";

export type ContrastMode = "none" | "sumZ" | "sumFz" | "sumDz";

export const CONTRAST_LABELS: Record<ContrastMode, string> = {
  none: "none",
  sumZ: "Σ z",
  sumFz: "Σ f(z)",
  sumDz: "Σ Δz",
};

export interface AccumulatorOptions {
  /** The palette — required, for the reason `InkOptions.theme` is (see `inkTheme.ts`). */
  readonly theme: InkTheme;
  readonly upTo: number;
  readonly contrast: ContrastMode;
  readonly pieceColours: readonly number[];
  /** The piece INDEX to emphasise, or `undefined` for none. Matches `AccumulationStep.piece`. */
  readonly highlight?: number;
}

export interface Frame {
  readonly toX: (re: number) => number;
  readonly toY: (im: number) => number;
  /** Pixels per unit. One number for both axes — see {@link accumulatorFrame}. */
  readonly scale: number;
}

const PAD = 18;

/** The trail's stroke, and the same under `AccumulatorOptions.highlight`. */
const TRAIL_WIDTH = 2;
const EMPHASIS_WIDTH = 3.2;

/**
 * How near the pointer has to be to a segment, in CSS pixels, before it names a step.
 *
 * Measured over the 28 loaded records in the panel's real 860 × 255 box: 6,524 segments whose
 * consecutive vertices are a **median of 1.11 px apart** (mean 3.38, max 121.6 — `mellin-keyhole`'s
 * outer circle against its lips). So the tolerance is never about resolving one step from its
 * neighbour, which no pointer could aim at; it is about how far OFF the trail still counts.
 *
 * The stroke is 2 px, so 8 is four half-widths — grabbable at mouse precision, and small enough that
 * it is not simply the whole panel: a uniform 40 × 12 grid of probes over every record lands within
 * 8 px of some drawn segment **3.5%** of the time (1.7% at 4, 9.7% at 12, 13.5% at 20), so a miss
 * stays the common case and `null` is a real answer rather than a rare one.
 */
const HIT_TOLERANCE = 8;

/**
 * Below this a span is numerical noise rather than a picture.
 *
 * `circle-linear-cos`' walk ends at `3.62749513 − 3.6e-17i`: that imaginary part is float dust from
 * summing 240 terms, and a fit that took it seriously would zoom until the dust filled the panel.
 * Flooring the span makes such an axis simply stop binding, and the other one decides.
 */
const SPAN_FLOOR = 1e-9;

/**
 * The frame the walk is drawn in: an ISOTROPIC fit of the data's own bounding box.
 *
 * **The scale is one number for both axes and must stay that way.** The trail is a head-to-tail sum
 * of `f(zₖ)·Δzₖ` in the complex plane, so the ANGLE between consecutive terms is content — a
 * quarter-turn between two terms means `f` rotated by a quarter-turn — and stretching one axis to
 * fill the panel would draw angles that the integrand does not have. Same reason the real trail and
 * the contrast trail share one frame: comparing two walks at different scales would be a lie by
 * presentation.
 *
 * **What this fixes is the OTHER half, and it was not the aspect ratio.** The previous fit took
 * `max = maxₖ max(|re|, |im|)` and scaled by `avail / (2·max)`, which frames `[−max, max]` on both
 * axes with the origin pinned to the canvas centre. That is only tight for a walk that reaches
 * equally far in all four directions, and almost no walk does: D1's keyhole runs from `0` to
 * `4.39 − 3.19i` and stays in one quadrant, so it occupied half the frame's width and 36% of its
 * height *before* the panel's shape cost it anything. Fitting the real box recovers that, and
 * centring the BOX rather than the origin puts the trail in the middle of the panel, so what empty
 * space remains reads as framing instead of as a picture that failed to load.
 *
 * The origin is seeded into the box unconditionally: the walk starts there, both axes are drawn
 * through it, and `Σ Δz` closing back to it on a closed contour is the point of the contrast. So
 * `toX(0)`/`toY(0)` are always inside the padded canvas and the axes can never be drawn off it.
 *
 * **NON-FINITE POINTS ARE SKIPPED, and a mutation sweep corrected why.** The case that brought this
 * up is `removable-one-minus-cos`: it integrates `(1 − cos z)/z²` along `[−4, 4]`, the accumulator
 * samples MIDPOINTS, so an even step count puts one sample exactly on `z = 0`, where the compiled
 * expression evaluates `0/0` and returns `NaN` — even though the singularity is removable and the
 * integral is correct (Gauss–Legendre's nodes sit at irrational positions inside each panel and
 * never land there, so the quadrature returns 6.7e-12). Every partial sum after that step is `NaN`.
 *
 * For `NaN` the guard is a NO-OP *in this formulation*, and the first draft of this comment said
 * otherwise. Every comparison against `NaN` is false, so `NaN` points never move `min`/`max` and are
 * already excluded — deleting the line changes no answer, which is exactly what the sweep reported.
 * What it actually catches is **±Infinity**, where the comparisons are true: one infinite sample
 * would set `maxRe = Infinity`, make the span infinite and the scale `0`, and collapse the whole
 * trail to a point. That is reachable — a pole sampled exactly returns an infinity, not a `NaN` —
 * and it is the case the test pins.
 *
 * The *previous* fit had no such luck: it accumulated `max = Math.max(max, |re|, |im|)`, and
 * `Math.max(x, NaN)` is `NaN`, so one bad sample made every coordinate `NaN` and the panel drew
 * **nothing at all** — losing the 119 good steps before it as well. Fitting from the finite points
 * is therefore a visible improvement on that record and not merely a tidier edge case.
 *
 * Either way this keeps the FIT well defined. It does not pretend the trail is whole, and the panel
 * still has nothing honest to say about the term it could not evaluate; see the note in
 * `engine/contour/accumulate.ts`.
 */
export function accumulatorFrame(points: readonly Cx[], w: number, h: number): Frame {
  let minRe = 0;
  let maxRe = 0;
  let minIm = 0;
  let maxIm = 0;
  for (const p of points) {
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
    if (p[0] < minRe) minRe = p[0];
    if (p[0] > maxRe) maxRe = p[0];
    if (p[1] < minIm) minIm = p[1];
    if (p[1] > maxIm) maxIm = p[1];
  }
  const spanRe = Math.max(SPAN_FLOOR, maxRe - minRe);
  const spanIm = Math.max(SPAN_FLOOR, maxIm - minIm);
  const scale = Math.min(
    Math.max(1, w - 2 * PAD) / spanRe,
    Math.max(1, h - 2 * PAD) / spanIm,
  );
  const midRe = (minRe + maxRe) / 2;
  const midIm = (minIm + maxIm) / 2;
  return {
    toX: (re) => w / 2 + (re - midRe) * scale,
    toY: (im) => h / 2 - (im - midIm) * scale,
    scale,
  };
}

/**
 * Precisely what is on screen for a given `upTo`/`contrast`: the slice of steps drawn, the contrast
 * walk drawn beside them, and the frame both are drawn in.
 *
 * `drawAccumulator` and `stepNear` both go through this rather than each deriving the mapping, so a
 * point over a segment and the segment under it cannot disagree about where that segment is. Two
 * mappings that usually agree is the defect this repo keeps finding.
 */
function walkOnScreen(
  acc: Accumulation,
  w: number,
  h: number,
  upTo: number,
  mode: ContrastMode,
): { shown: readonly AccumulationStep[]; contrast: readonly Cx[]; frame: Frame } {
  const count = Math.max(1, Math.round(upTo * acc.steps.length));
  const contrast = mode === "none" ? [] : acc.contrasts[mode].slice(0, count);
  // The frame fits EVERY step's running total, not just the shown prefix, so scrubbing `upTo` moves
  // the head along a fixed picture instead of rescaling it under the reader.
  const frame = accumulatorFrame([...acc.steps.map((s) => s.running), ...contrast], w, h);
  return { shown: acc.steps.slice(0, count), contrast, frame };
}

/** Distance from `(px, py)` to the segment `(ax, ay) → (bx, by)`, all in canvas pixels. */
function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  // A zero-length segment is a point, and the corpus has them: a step whose term is far below the
  // frame's scale rounds both ends to the same pixel.
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * The step index nearest to a point on the canvas, or `null` when the walk is empty or the point is
 * far from every segment.
 *
 * **It hits the real trail only** — `f·Δz`, the segments `drawAccumulator` strokes in piece colour —
 * and never a contrast walk, even though the contrast walks are the SAME steps and so would answer
 * the caller's question ("which piece is this part of the trail?") with the same index. Two reasons,
 * and the second is the one that decides it. A contrast is drawn as a single faint dashed polyline
 * with no per-piece colour precisely because it is a foil rather than one of the three linked
 * representations, so making it hoverable would link a curve that carries no piece identity. And
 * the two walks cross: `Σ Δz` returns to the origin on a closed contour and passes through the real
 * trail on the way, so a pointer in that neighbourhood would name whichever happened to be nearer —
 * a hover that flickers between two curves for reasons the reader cannot see. `contrast` is still an
 * input because it decides the FRAME: the fit spans both walks, so the same point is over a
 * different segment with the contrast shown and hidden.
 *
 * A segment the drawing did not draw is never returned: the slice is `upTo`'s, exactly as drawn, and
 * a step whose running total is non-finite yields a `NaN` distance that no comparison accepts —
 * which matches the canvas, where a `moveTo`/`lineTo` at `NaN` lays down nothing.
 */
export function stepNear(
  acc: Accumulation,
  width: number,
  height: number,
  x: number,
  y: number,
  opts: { readonly upTo: number; readonly contrast: ContrastMode; readonly tolerance?: number },
): number | null {
  if (acc.steps.length === 0) return null;
  const { shown, frame } = walkOnScreen(acc, width, height, opts.upTo, opts.contrast);
  const tol = opts.tolerance ?? HIT_TOLERANCE;

  let best: number | null = null;
  let bestDist = Infinity;
  let from: Cx = [0, 0];
  for (let k = 0; k < shown.length; k++) {
    const to = shown[k].running;
    const d = distanceToSegment(
      x,
      y,
      frame.toX(from[0]),
      frame.toY(from[1]),
      frame.toX(to[0]),
      frame.toY(to[1]),
    );
    from = to;
    // Ties go to the EARLIER step, which is what makes a point on a vertex belong to the segment
    // that arrives there rather than to the one leaving it.
    if (d <= tol && d < bestDist) {
      bestDist = d;
      best = k;
    }
  }
  return best;
}

function polyline(ctx: CanvasRenderingContext2D, pts: readonly Cx[], f: Frame): void {
  ctx.beginPath();
  ctx.moveTo(f.toX(0), f.toY(0));
  for (const p of pts) ctx.lineTo(f.toX(p[0]), f.toY(p[1]));
}

export function drawAccumulator(
  ctx: CanvasRenderingContext2D,
  acc: Accumulation,
  w: number,
  h: number,
  opts: AccumulatorOptions,
): void {
  const t = opts.theme.accumulator;
  ctx.clearRect(0, 0, w, h);
  if (acc.steps.length === 0) return;

  // One frame for everything on screen, so the contrast trail is drawn to the same scale as the
  // real one. Comparing two walks at different scales would be a lie by presentation.
  const { shown, contrast, frame } = walkOnScreen(acc, w, h, opts.upTo, opts.contrast);

  // Axes.
  ctx.strokeStyle = t.axes;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, frame.toY(0));
  ctx.lineTo(w, frame.toY(0));
  ctx.moveTo(frame.toX(0), 0);
  ctx.lineTo(frame.toX(0), h);
  ctx.stroke();

  if (contrast.length > 0) {
    polyline(ctx, contrast, frame);
    ctx.strokeStyle = t.trail;
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.25;
    ctx.stroke();
    ctx.setLineDash([]);

    const end = contrast[contrast.length - 1];
    ctx.beginPath();
    ctx.arc(frame.toX(end[0]), frame.toY(end[1]), 3, 0, 2 * Math.PI);
    ctx.fillStyle = t.dots;
    ctx.fill();
  }

  // The real trail, in per-piece colour so a segment of the walk can be traced back to the arc that
  // produced it — one of the three linked representations (arc ↔ term ↔ accumulator segment).
  //
  // `highlight` thickens the segments of one piece and leaves everything else alone, which is the
  // stage's own idiom for the same hover: `stage/ink.ts`'s `drawContour` strokes an emphasised piece
  // at 4 against 2.5. The RATIO is what carries over, not the numbers — a stage stroke is 2.5 px and
  // a trail segment is 2 — so 1.6× gives 3.2 here. With `highlight` undefined no `step.piece` can
  // equal it, so every iteration sets `lineWidth = 2` and the output is what it was before the
  // option existed.
  let from: Cx = [0, 0];
  for (const step of shown) {
    ctx.beginPath();
    ctx.moveTo(frame.toX(from[0]), frame.toY(from[1]));
    ctx.lineTo(frame.toX(step.running[0]), frame.toY(step.running[1]));
    ctx.strokeStyle = PIECE_COLOURS[(opts.pieceColours[step.piece] ?? step.piece) % PIECE_COLOURS.length];
    ctx.lineWidth = step.piece === opts.highlight ? EMPHASIS_WIDTH : TRAIL_WIDTH;
    ctx.stroke();
    from = step.running;
  }

  // Where the sum has got to.
  ctx.beginPath();
  ctx.arc(frame.toX(from[0]), frame.toY(from[1]), 4.5, 0, 2 * Math.PI);
  ctx.fillStyle = t.headFill;
  ctx.strokeStyle = t.headRing;
  ctx.lineWidth = 1.5;
  ctx.fill();
  ctx.stroke();
}
