// The accumulation: ∫γ f dz built up one term at a time, as a head-to-tail vector sum.
//
// This panel is the app's answer to a genuinely open question. Hanke (2024, ZDM) interviewed three
// research mathematicians about what `∮ f dz` *means* and reconstructed nine interpretations under
// eight frames, with **not one recurring across experts**. One tried the area picture, drew it, and
// abandoned it — "the values are complex". So the app is supplying a missing referent rather than
// decorating a settled one, and two constraints follow (research 02, P0):
//
//  1. **Never an area.** It is the one picture experts tried and rejected.
//  2. **A head-to-tail sum of `f(zₖ)·Δzₖ` in its own plane**, because that is the chop–multiply–add
//     structure the integral actually has, and because students reliably collapse under the
//     coordination load and revert to summing something simpler.
//
// Which is why the three things they revert to are computed here too, as *contrasts* rather than as
// mistakes to be hidden. `Σ Δz` closing visibly to zero on a closed contour is free, immediate, and
// makes the point that what is being summed is a product, not a displacement.
import { arcLength, pointAt, type Cx, type Resolved } from "../../kernel/geom.js";
import { valueRefusal, type LedgerResult } from "../ledger.js";
import type { ContourIntegral, PathFn } from "./integrate.js";
import type { CutSide } from "./model.js";

export interface AccumulationStep {
  /** Where on the contour this term came from. */
  readonly z: Cx;
  /** The step Δz along the contour. */
  readonly dz: Cx;
  readonly fz: Cx;
  /** f(zₖ)·Δzₖ — the term itself. */
  readonly term: Cx;
  /** The running total after this term: the partial integral. */
  readonly running: Cx;
  /** Index of the piece this step belongs to, for colour-linking the trail to the piece list. */
  readonly piece: number;
  /** Fraction of total arclength traversed, for the scrubber. */
  readonly s: number;
}

export interface Accumulation {
  readonly steps: readonly AccumulationStep[];
  /** The final partial sum — a coarse estimate of ∫γ f dz, NOT the quadrature result. */
  readonly total: Cx;
  /** The three sums students revert to, offered as contrasts. `sumDz` is ~0 on a closed contour. */
  readonly contrasts: {
    readonly sumZ: readonly Cx[];
    readonly sumFz: readonly Cx[];
    readonly sumDz: readonly Cx[];
  };
}

const cmul = (a: Cx, b: Cx): Cx => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];

/**
 * Sample the contour into `steps` terms, proportioned by arclength so the trail's step sizes mean
 * something geometric.
 *
 * This is a **midpoint Riemann sum**, not the quadrature: it exists to be *watched*, so its terms
 * have to correspond one-to-one with visible steps along the contour. The accurate value comes from
 * `integrateContour`, and the two are shown as what they are — the panel says "partial sum", the
 * result card says `∮`.
 */
export function accumulate(
  f: PathFn,
  pieces: readonly Resolved[],
  steps = 240,
  sides?: readonly (CutSide | undefined)[],
): Accumulation {
  const lengths = pieces.map(arcLength);
  const total = lengths.reduce((a, b) => a + b, 0);
  if (total === 0 || pieces.length === 0) {
    return { steps: [], total: [0, 0], contrasts: { sumZ: [], sumFz: [], sumDz: [] } };
  }

  const out: AccumulationStep[] = [];
  const sumZ: Cx[] = [];
  const sumFz: Cx[] = [];
  const sumDz: Cx[] = [];

  let run: Cx = [0, 0];
  let accZ: Cx = [0, 0];
  let accFz: Cx = [0, 0];
  let accDz: Cx = [0, 0];
  let travelled = 0;

  for (let p = 0; p < pieces.length; p++) {
    const g = pieces[p];
    // Proportional to arclength, but never fewer than two steps: a short piece still has to appear.
    const n = Math.max(2, Math.round((steps * lengths[p]) / total));
    for (let k = 0; k < n; k++) {
      const t0 = k / n;
      const t1 = (k + 1) / n;
      const tm = (t0 + t1) / 2;

      const a = pointAt(g, t0);
      const b = pointAt(g, t1);
      const dz: Cx = [b[0] - a[0], b[1] - a[1]];
      const zm = pointAt(g, tm);
      // **A NON-FINITE TERM POISONS EVERY PARTIAL SUM AFTER IT, AND NOTHING SAYS SO.** Known gap,
      // found while re-fitting the panel's frame. `removable-one-minus-cos` integrates
      // `(1 − cos z)/z²` along `[−4, 4]`; these samples are MIDPOINTS, so an even step count puts
      // one exactly on `z = 0`, where the compiled expression evaluates `0/0` and returns `NaN` —
      // even though the singularity is removable and the integral is correct (Gauss–Legendre's
      // nodes are at irrational positions inside each panel and never land there, so
      // `integrateContour` returns 6.7e-12 as it should). From that step on `running` is `NaN`, the
      // readout prints `NaN`, and the trail stops being drawn.
      //
      // NaN propagation is arguably the RIGHT arithmetic — an undefined term does make the total
      // undefined — so this is not a sign error to patch quietly. What is missing is the app's own
      // posture: `integrateContour` REFUSES a contour through a singularity and names the reason,
      // and `accumulateForIntegral` below withholds the whole picture rather than showing a
      // meaningless partial sum beside a refusal. This deserves the same treatment — steps up to the
      // bad term plus a refusal naming it — which is a change to `Accumulation`'s contract and is
      // left as its own slice rather than smuggled into a layout fix. `ui/accumulator.ts`'s frame
      // skips non-finite points so that the FIT is still well defined meanwhile.
      const fz = f(zm, sides?.[p]);
      const term = cmul(fz, dz);

      run = [run[0] + term[0], run[1] + term[1]];
      accZ = [accZ[0] + zm[0], accZ[1] + zm[1]];
      accFz = [accFz[0] + fz[0], accFz[1] + fz[1]];
      accDz = [accDz[0] + dz[0], accDz[1] + dz[1]];

      travelled += Math.hypot(dz[0], dz[1]);
      out.push({ z: zm, dz, fz, term, running: run, piece: p, s: Math.min(1, travelled / total) });
      sumZ.push(accZ);
      sumFz.push(accFz);
      sumDz.push(accDz);
    }
  }

  return { steps: out, total: run, contrasts: { sumZ, sumFz, sumDz } };
}

/**
 * The accumulation, but **only when the integral was permitted**.
 *
 * The partial sum through a singularity is not a rough answer, it is a meaningless one: its value
 * depends entirely on where the sample points happen to fall relative to the pole, so a contour
 * through a double pole cheerfully reports −376.98i. Refusing the integral while still showing a
 * partial sum beside it would hand the reader the very number the refusal exists to withhold.
 *
 * **And `integral.value === undefined` was only half of that rule** (2026-09-20 review). A LEGALITY
 * refusal leaves the quadrature perfectly happy — a circle crossing a branch cut with no side
 * declared integrates to `6.283005874i` and the result card prints `⚠ Refused` — so the trail went
 * on being drawn, and its readout ended at the number the card had just withheld. The ledger is
 * asked here, through {@link valueRefusal}, so the picture and the value are refused together.
 *
 * Living here rather than in the view is the point: the rule is then covered by the engine's tests
 * instead of resting on every future panel remembering to ask.
 */
export function accumulateForIntegral(
  f: PathFn,
  pieces: readonly Resolved[],
  integral: ContourIntegral,
  /**
   * The ledger, or `null` where the caller has none.
   *
   * `null` is not "no objection": it is the older, narrower rule, kept for a caller that genuinely
   * has not run the ledger. Every caller in the app passes one.
   */
  ledger: LedgerResult | null,
  steps?: number,
  /**
   * Each piece's declared `side`, parallel to `pieces`.
   *
   * The accumulator draws the same head-to-tail sum the quadrature integrates, so it has to be in
   * the same determination — otherwise a keyhole's two lips would draw as retracing each other
   * while the value beside them says they do not cancel, and the picture would contradict the
   * number. Omitted for a single-valued integrand, which is every record in tiers A–C.
   */
  sides?: readonly (CutSide | undefined)[],
): Accumulation | null {
  if (integral.value === undefined) return null;
  if (valueRefusal(integral, ledger, "contour") !== null) return null;
  return accumulate(f, pieces, steps, sides);
}
