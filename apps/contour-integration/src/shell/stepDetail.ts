// The amplitwist detail: one term of the sum, drawn as the two arrows it is a product of.
//
// M8 step 3.3. The scrub is already a step index (`strip.ts`'s `stepIndex`, one formula read by the
// trail, the readout and the stage's marker); this turns the step it names into the picture
// Needham's word is for — **`f(z) dz` is `dz` AMPLIFIED by `|f(z)|` and TWISTED by `arg f(z)`** —
// and into the four numbers that say the same thing in digits.
//
// **The superposition is deliberate and it is a category error on purpose.** `Δz` is a displacement
// in the plane the contour lives in; `f(z)·Δz` is a value, and the plane it lives in is the
// accumulator strip's, not this one. Drawing both from `z_k` on the stage puts a length in value
// units beside a length in plot units, which no camera can make commensurable — so the arrows carry
// ONE magnification chosen for legibility, stated on screen, and what is true in the picture is not
// either length but the RATIO between them and the ANGLE between them. Those two are exactly
// `|f(z_k)|` and `arg f(z_k)`, and they are invariant under the magnification and under the camera.
//
// The same term also appears in the strip, as the trail's `k`-th segment — the second arrow drawn
// in its own plane, where it needs no magnification at all. That is why the strip emphasises that
// segment while these arrows are on the stage: one term, two pictures, and the reader is meant to
// see them as the same object.
import type { AccumulationStep } from "../engine/contour/accumulate.js";
import type { Cx } from "../kernel/geom.js";

/**
 * How long the longer arrow should be, in CSS pixels.
 *
 * The plan's number. It is a legibility constant rather than a measurement: long enough to carry a
 * head and an angle arc, short enough that two of them at one point of a 900 px stage do not read
 * as part of the contour.
 */
export const ARROW_PX = 60;

/**
 * The shorter arrow below this many pixels is not drawn.
 *
 * The ratio between the two arrows is exactly `|f(z_k)|`, so one of them vanishes whenever `|f|` is
 * far from 1 — and **measuring the corpus inverted the guess this constant was written on.** The
 * expectation was an amplifying term near a pole leaving `Δz` too short to see. What the gallery
 * actually does is the opposite: over 6,717 finite steps in 28 records, `|f| < 1` on **6,136 of
 * them (91.4 %)** and the maximum anywhere is 287, so it is nearly always the TERM's arrow that
 * goes — and that is not an awkward case, it is the argument. A vanishing-arc record has `|f| ≪ 1`
 * on the arc BY CONSTRUCTION, because that is what makes the arc vanish: `semicircle-order2` runs
 * `|f| ≈ 1/R⁴` out there and drops the term's arrow on 191 of its 240 steps, which is the KILL
 * lemma drawn rather than a defect in the drawing.
 *
 * **The exact value is not load-bearing and the measurement says so**, which is worth writing down
 * because a bare `2` reads as tuned: the share of steps that lose an arrow is 32.6 % at a 1 px
 * floor, 37.9 % at 2, 41.0 % at 3, 44.2 % at 4 and 51.6 % at 6. A 6× change in the floor moves it
 * by a fifth, because the distribution is dominated by terms orders of magnitude below any of
 * them. Two pixels is simply where a 2.25 px stroke stops being a mark and becomes a dot.
 *
 * Omitting is the honest move because the alternative — a floor on the short arrow's LENGTH —
 * would draw a ratio that is not `|f|`, and the ratio is the only thing the picture asserts. What
 * says how far off the scale it has gone is the panel's `|f(z_k)|`, in digits.
 */
export const MIN_ARROW_PX = 2;

/** One term of the sum, ready to draw: plot-space vectors, already magnified. */
export interface StepDetail {
  /** Where the arrows start — the sample point `z_k`, in plot coordinates. */
  readonly at: Cx;
  /** `scale · Δz_k`, in plot coordinates. `null` when it would be shorter than {@link MIN_ARROW_PX}. */
  readonly dz: Cx | null;
  /** `scale · f(z_k)·Δz_k`, in plot coordinates. `null` on the same rule. */
  readonly term: Cx | null;
  /** The magnification both arrows carry, which the readout states. */
  readonly scale: number;
  /** `|f(z_k)|` — the amplification, and the ratio of the two arrows' lengths. */
  readonly modulus: number;
  /** `arg f(z_k)` in radians — the twist, and the angle the arc between the arrows subtends. */
  readonly argument: number;
  /** The step's own index, so a caller cannot pair this with a different `k`. */
  readonly index: number;
}

/** `|z|`, written here because three lines below want it and `geom.ts` exports no helper. */
const abs = (z: Cx): number => Math.hypot(z[0], z[1]);

/**
 * The magnification: one factor, so the longer arrow lands on {@link ARROW_PX}.
 *
 * ONE factor for both is the whole point — scaling each to its own length would draw two arrows of
 * equal size and destroy the only thing the picture asserts. It is chosen against the LONGER of the
 * two so neither can overflow the stage, which means it is `|f|` that decides which one the
 * constant applies to: an amplifying term pins `f·Δz` at 60 px and a damping one pins `Δz` there.
 */
export function amplitwistScale(dz: Cx, term: Cx, pxPerUnit: number, targetPx: number = ARROW_PX): number {
  const longest = Math.max(abs(dz), abs(term));
  if (!(longest > 0) || !(pxPerUnit > 0) || !Number.isFinite(longest)) return 0;
  return targetPx / (longest * pxPerUnit);
}

/**
 * The detail for one step, or `null` when there is nothing honest to draw.
 *
 * Three refusals, and each is a case the corpus reaches. A non-finite term is
 * `removable-one-minus-cos`, whose midpoint lands exactly on the removable singularity of
 * `(1 − cos z)/z²` so `0/0` poisons the walk from there on — `readoutAt` already refuses to print
 * that as `0` and this refuses to draw it. A zero `Δz` has no direction, so there is no angle to
 * mark and no arrow to draw. And a zero-length camera (a stage with no size, which jsdom gives)
 * yields no scale.
 */
export function stepDetail(step: AccumulationStep | undefined, index: number, pxPerUnit: number): StepDetail | null {
  if (step === undefined) return null;
  const { z, dz, fz, term } = step;
  if (![z[0], z[1], dz[0], dz[1], fz[0], fz[1], term[0], term[1]].every(Number.isFinite)) return null;
  const scale = amplitwistScale(dz, term, pxPerUnit);
  if (!(scale > 0) || !Number.isFinite(scale)) return null;

  const keep = (v: Cx): Cx | null => (abs(v) * scale * pxPerUnit >= MIN_ARROW_PX ? [v[0] * scale, v[1] * scale] : null);
  return {
    at: z,
    dz: keep(dz),
    term: keep(term),
    scale,
    // Read off `fz` rather than divided out of `term / dz`: they are the same number in exact
    // arithmetic and not in float64, and `fz` is the one the panel's digits and the arc both name.
    modulus: abs(fz),
    argument: Math.atan2(fz[1], fz[0]),
    index,
  };
}

/**
 * The magnification as the readout says it — *arrows ×12*.
 *
 * A magnification is a thing a reader must be able to discount, so it is stated rather than implied,
 * and it is stated in the form that reads as a factor. Below 1 it is a REDUCTION and `×0.08` is the
 * honest word for that; the app does not write `÷12`, because the arrows really are multiplied.
 */
export function scaleLabel(scale: number): string {
  if (!(scale > 0) || !Number.isFinite(scale)) return "";
  if (scale >= 100) return `arrows ×${Math.round(scale)}`;
  if (scale >= 1) return `arrows ×${scale.toPrecision(3)}`;
  return `arrows ×${scale.toPrecision(2)}`;
}

/** `arg f` in degrees, for the panel. Radians are the arithmetic's unit and degrees are the eye's. */
export function degrees(radians: number): number {
  return (radians * 180) / Math.PI;
}
