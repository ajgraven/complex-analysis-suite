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
import type { Accumulation } from "../engine/contour/accumulate.js";
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
}

export interface Frame {
  readonly toX: (re: number) => number;
  readonly toY: (im: number) => number;
  /** Pixels per unit. One number for both axes — see {@link accumulatorFrame}. */
  readonly scale: number;
}

const PAD = 18;

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

  const count = Math.max(1, Math.round(opts.upTo * acc.steps.length));
  const shown = acc.steps.slice(0, count);
  const contrast =
    opts.contrast === "none" ? [] : acc.contrasts[opts.contrast].slice(0, count);

  // One frame for everything on screen, so the contrast trail is drawn to the same scale as the
  // real one. Comparing two walks at different scales would be a lie by presentation.
  const frame = accumulatorFrame([...acc.steps.map((s) => s.running), ...contrast], w, h);

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
  ctx.lineWidth = 2;
  let from: Cx = [0, 0];
  for (const step of shown) {
    ctx.beginPath();
    ctx.moveTo(frame.toX(from[0]), frame.toY(from[1]));
    ctx.lineTo(frame.toX(step.running[0]), frame.toY(step.running[1]));
    ctx.strokeStyle = PIECE_COLOURS[(opts.pieceColours[step.piece] ?? step.piece) % PIECE_COLOURS.length];
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
