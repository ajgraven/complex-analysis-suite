// What a branch choice IS.
//
// PLAN §4.3 fixes the class this app handles — `f(z) = R(z)·∏(z − b_k)^{α_k}·log(z − b_ℓ)^m` — and
// the point of the model is research 06's: **a cut is a CHOICE, not a property of the function.**
// The branch POINTS are forced by `f`; where the cuts run between them is free, and dragging one
// from ℝ₋ to ℝ₊ is legal and is the whole lesson. Only two things about a cut are not free: which
// branch points it joins, and what it crosses.
//
// EXPONENTS ARE EXACT. `alpha` is a `Frac`, not a number, because admissibility is the question
// "is `Σ α_k` an INTEGER" — a decision, not a measurement. Over `Frac` there is no "nearly an
// integer": the denominator is 1 or it is not. That is the same posture `families/linear.ts` takes
// about rank, and for the same reason.
import type { Frac } from "@cas/exact";
import type { Cx } from "../geom.js";

/**
 * The local order of a branch point.
 *
 * A `log` point has infinite-order monodromy — research 06 writes its exponent as "∞" — which is why
 * it can never sit on a bounded component of the cut system.
 */
export type BranchOrder =
  | { readonly kind: "power"; readonly alpha: Frac }
  | { readonly kind: "log" };

export interface BranchPoint {
  readonly id: string;
  readonly at: Cx;
  readonly order: BranchOrder;
  /** For the UI and for messages — `z^{α−1}`'s point at the origin, `(b−z)^ν`'s at `b`. */
  readonly label: string;
}

/**
 * The reserved endpoint id for the point at infinity.
 *
 * Infinity is always available as a cut endpoint and is never listed in `points`: it carries no
 * exponent that any rule reads. Admissibility (b) is a statement about components that do NOT touch
 * it, and (c) is a statement about components that must.
 */
export const INFINITY = "infinity";

/**
 * One arc of the cut system: a polyline from one branch point to another, or to infinity.
 *
 * `via` holds the interior vertices only; the endpoints come from `from`/`to`. When an endpoint is
 * {@link INFINITY} the arc continues from its last finite vertex along the direction of its last
 * edge, forever — {@link cutPolyline} is where that ray gets clipped for a geometric test, and it
 * takes the clipping radius from the caller rather than inventing one.
 */
export interface CutArc {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly via: readonly Cx[];
}

export interface BranchChoice {
  /**
   * The argument convention, displayed always and never implicit (research 06 §1.4).
   *
   * `principal` is C99/Kahan `arg ∈ (−π,π]`, which matches `@cas/expr`'s `complexJs.ts`, its GLSL
   * twin, and what a student's NumPy session prints. The keyhole gallery items *require*
   * `zeroToTwoPi`, and switching silently for them is the misconception research 02 warns about.
   */
  readonly convention: "principal" | "zeroToTwoPi" | "custom";
  /** The FINITE branch points. Infinity is implicit; see {@link INFINITY}. */
  readonly points: readonly BranchPoint[];
  readonly cuts: readonly CutArc[];
  /** Where the continuation starts. Research 06 §2.3's shadow-cut mode derives the cuts from it. */
  readonly basePoint: Cx;
  /** Which sheet the answer is reported on. For a closed contour in ℂ∖Γ only this integer matters. */
  readonly sheet: number;
}

/** No branch points and no cuts — what a rational integrand has. */
export const NO_BRANCH: BranchChoice = {
  convention: "principal",
  points: [],
  cuts: [],
  basePoint: [0, 0],
  sheet: 0,
};

const pointAt = (branch: BranchChoice, id: string): Cx | null =>
  branch.points.find((p) => p.id === id)?.at ?? null;

/**
 * A cut as a finite polyline, with any ray to infinity clipped at `radius` from the origin.
 *
 * The clipping radius is the caller's to choose and should enclose everything the test cares about —
 * the contour and every branch point — so that "does this piece cross the cut" gets the same answer
 * it would get against the true infinite ray. Returns null when an endpoint names a branch point
 * that does not exist, which is a malformed cut rather than an inadmissible one.
 */
export function cutPolyline(
  branch: BranchChoice,
  cut: CutArc,
  radius: number,
): readonly Cx[] | null {
  const start = cut.from === INFINITY ? null : pointAt(branch, cut.from);
  const end = cut.to === INFINITY ? null : pointAt(branch, cut.to);
  if (cut.from !== INFINITY && start === null) return null;
  if (cut.to !== INFINITY && end === null) return null;

  const middle = [...cut.via];
  const finite: Cx[] = [...(start === null ? [] : [start]), ...middle, ...(end === null ? [] : [end])];
  if (finite.length === 0) return null;

  // A ray needs a direction. Take it from the last edge; with only one finite vertex there is no
  // edge, so fall back to pointing away from the origin — which is the shadow-cut direction and the
  // one a reader expects for a cut from a single branch point out to infinity.
  const rayFrom = (pts: readonly Cx[], outward: boolean): Cx => {
    const tip = outward ? pts[pts.length - 1] : pts[0];
    const prev = pts.length > 1 ? (outward ? pts[pts.length - 2] : pts[1]) : ([0, 0] as Cx);
    let dx = tip[0] - prev[0];
    let dy = tip[1] - prev[1];
    if (dx === 0 && dy === 0) {
      dx = tip[0] === 0 && tip[1] === 0 ? 1 : tip[0];
      dy = tip[0] === 0 && tip[1] === 0 ? 0 : tip[1];
    }
    const len = Math.hypot(dx, dy) || 1;
    const reach = Math.max(radius, Math.hypot(tip[0], tip[1]) + radius);
    return [tip[0] + (dx / len) * reach, tip[1] + (dy / len) * reach];
  };

  const out: Cx[] = [...finite];
  if (cut.to === INFINITY) out.push(rayFrom(finite, true));
  if (cut.from === INFINITY) out.unshift(rayFrom(finite, false));
  return out;
}
