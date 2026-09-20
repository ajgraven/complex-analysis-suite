// The winding number n(γ, p), decided exactly.
//
// `∮γ f dz = 2πi Σ n(γ, aₖ) Res(f, aₖ)` — the winding number is a *coefficient* on each residue, so
// getting one wrong does not perturb the answer, it changes it by a whole residue. It is also the one
// quantity here that can honestly be `=` with no symbolic machinery, because it is an integer decided
// by signs rather than a value accumulated by arithmetic. Both facts argue for deciding it exactly.
//
// Curved pieces are handled by polygonising **below the clearance to the query point**, which is not
// an approximation: if every point of the arc lies within `s` of its chord and `p` is at distance
// `≥ 4s` from the arc, then the straight-line homotopy from arc to chord sweeps a region whose points
// are all within `2s` of the arc, so it never reaches `p`. Arc and chord are therefore homotopic in
// ℂ∖{p}, and their winding contributions are *equal*, not merely close.
import {
  distanceToPoint,
  endPoint,
  finestSagitta,
  polygonise,
  startPoint,
  type Cx,
  type Pt,
  type Resolved,
} from "./geom.js";
import { orient2d } from "./exactPredicates.js";

export interface WindingResult {
  /** The winding number. Meaningful only when `decided` is true. */
  readonly n: number;
  /** True when the answer is exact: the contour closes and the point is clear of it. */
  readonly decided: boolean;
  /** Shortest distance from the point to the contour. Zero, or near it, is why `decided` is false. */
  readonly clearance: number;
  readonly reason?: string;
}

/**
 * Below this clearance, relative to the contour's own size, the point is treated as lying *on* the
 * contour and no winding number is reported.
 *
 * The threshold is honest rather than tuned: the question "which side of the contour is this pole
 * on?" genuinely has no answer once the pole is closer to the contour than the contour's own
 * coordinates can resolve, and answering anyway is how a plausible wrong number gets printed.
 */
export const RELATIVE_CLEARANCE_FLOOR = 1e-12;

/** Shortest distance from `p` to the whole contour. */
export function clearance(pieces: readonly Resolved[], p: Cx): number {
  let best = Infinity;
  for (const g of pieces) best = Math.min(best, distanceToPoint(g, p));
  return best;
}

/** A characteristic size for the contour, used to scale the clearance floor. */
function contourScale(pieces: readonly Resolved[], p: Cx): number {
  let s = 0;
  for (const g of pieces) {
    for (const q of [startPoint(g), endPoint(g)]) {
      s = Math.max(s, Math.hypot(q[0] - p[0], q[1] - p[1]));
    }
  }
  return Math.max(s, 1);
}

/**
 * Build one closed polyline from the pieces, fine enough that its winding number about `p` equals
 * the contour's. Consecutive duplicate vertices are dropped so degenerate edges never reach the
 * orientation test.
 */
function toPolyline(pieces: readonly Resolved[], maxSagitta: number): Pt[] {
  const out: Pt[] = [];
  const push = (q: Pt): void => {
    const last = out[out.length - 1];
    if (last !== undefined && last[0] === q[0] && last[1] === q[1]) return;
    out.push(q);
  };
  for (const g of pieces) for (const q of polygonise(g, maxSagitta).points) push(q);
  return out;
}

/**
 * Winding number of a closed contour about `p`.
 *
 * The crossing-count formulation (Sunday's): a `≤ / >` split on `y` so that a vertex lying exactly on
 * the horizontal ray is counted once rather than twice or not at all — and with an *exact* `orient2d`
 * deciding each crossing's side, that degeneracy is handled rather than hoped past.
 */
export function windingNumber(pieces: readonly Resolved[], p: Cx): WindingResult {
  if (pieces.length === 0) {
    return { n: 0, decided: false, clearance: Infinity, reason: "the contour is empty" };
  }

  const cl = clearance(pieces, p);
  const floor = RELATIVE_CLEARANCE_FLOOR * contourScale(pieces, p);
  if (!(cl > floor)) {
    return {
      n: 0,
      decided: false,
      clearance: cl,
      reason:
        cl === 0
          ? "the point lies on the contour"
          : "the point lies within rounding distance of the contour",
    };
  }

  // s = clearance/4 makes the arc-to-chord homotopy provably miss p (see the file header).
  const wanted = cl / 4;

  // **The homotopy argument is the whole of the exactness claim, so a polygon that cannot carry it
  // is refused rather than used.** `polygonise` caps the chords it will lay down, and past that cap
  // it returns a coarser polyline than it was asked for — silently, until this asked. Measured on a
  // circle of radius 1e6, where the cap's sagitta is 4.93e-6: 24 of 36 points genuinely INSIDE the
  // circle, at clearances 2.1e-6 to 4.8e-6, came back `n: 0, decided: true`. Asked here and not
  // after the fact, because the answer is also what stops a million-vertex array being built for it.
  const finest = Math.max(0, ...pieces.map(finestSagitta));
  if (finest > wanted) {
    return {
      n: 0,
      decided: false,
      clearance: cl,
      reason:
        `the point is ${cl.toExponential(2)} from the contour, and its curved pieces cannot be ` +
        `resolved past ${finest.toExponential(2)} — too coarse to decide which side of them it is on`,
    };
  }

  const poly = toPolyline(pieces, wanted);

  // Closure is checked BEFORE degeneracy, so an open path is reported as open rather than as
  // "degenerate" — an open two-point path trips both, and only one of those is the useful diagnosis.
  const first = poly[0];
  const last = poly[poly.length - 1];
  if (poly.length < 2 || Math.hypot(first[0] - last[0], first[1] - last[1]) > cl / 4) {
    return {
      n: 0,
      decided: false,
      clearance: cl,
      reason: "the contour is not closed, so it has no winding number",
    };
  }
  if (poly.length < 3) {
    return { n: 0, decided: false, clearance: cl, reason: "the contour is degenerate" };
  }

  let n = 0;
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k];
    const b = poly[(k + 1) % poly.length];
    if (a[1] <= p[1]) {
      if (b[1] > p[1] && orient2d(a, b, p) > 0) n++;
    } else if (b[1] <= p[1] && orient2d(a, b, p) < 0) {
      n--;
    }
  }

  return { n, decided: true, clearance: cl };
}
