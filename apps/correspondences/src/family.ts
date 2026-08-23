// The correspondence FAMILY — Milestone C (MIGRATION.md Phase 6 step 4). The deltoid φ(z)=z+1/(2z²) is
// ONE member of the 1-(complex-)parameter Laurent family
//   φ_a(z) = z + a/(2 z²)      (a ∈ ℂ;  a = 1 is the deltoid,  a → 0 the round disk),
// realized directly through makeUnboundedLaurentSchwarz(1, [[0,0],[0,0],[a/2,0]]) — no new engine.
//
// UNIVALENCE RANGE: φ_a is univalent on {|z|>1} exactly for **|a| ≤ 1**, straight from the derivative
//   φ_a'(z) = 1 − a/z³ = 0  ⟺  |z| = |a|^{1/3},
// so a critical point enters the exterior {|z|>1} as soon as |a| > 1 and φ_a is not even locally
// injective there. The deltoid (a = 1) sits exactly ON that boundary, with its critical points on
// |z| = 1 — which is what makes its cusps land on ∂Ω.
//
// ⚠ Do NOT restate the old "univalent for |a| ≤ √2" bound. It came from reading the area theorem
// (Σ n|bₙ|² = |a|²/2 ≤ 1 ⟺ |a| ≤ √2) backwards: the area theorem is a NECESSARY condition satisfied
// BY univalent functions, never a sufficient one. Concrete counterexample inside the old range —
// for a = 1.2 the distinct points z = 1.052307+0.208604i and w = 1.02−0.2i both lie outside the unit
// disk and satisfy φ_a(z) = φ_a(w) to 2e-16.
//
// MARKED ORBIT & MEMBERSHIP. φ_a has three critical points ζ_k = a^{1/3}·{1,ω,ω²} (φ_a'(z)=1−a/z³=0);
// their images m_k = φ_a(ζ_k) = 1.5·a^{1/3}·{1,ω,ω²} are the CUSPS — the critical values of the Schwarz
// reflection σ_a. Near ∞, σ_a(w) ≈ (a/2)·conj(w)²: an anti-holomorphic degree-2 map with a
// super-attracting fixed point at ∞ (the z̄²-model that connects this family to the TRICORN). So a
// parameter is classified exactly as z ↦ z̄²+c is for the Tricorn, by escape of the critical orbits:
//   in the connectedness locus  ⟺  NO critical-value orbit escapes to ∞ under σ_a.
//
// ⚠ EXPLORATORY. The classifier itself — the escape-time of an explicit σ_a-orbit — is exact and tested.
// That its locus COINCIDES with the LLMM connectedness locus, or STRAIGHTENS to the parabolic Tricorn,
// is a research-level statement this suite does NOT certify (see tricorn.ts, RISKS §3): interpret the
// parameter picture as ≈, never as a certified locus.
import { tupleAlgebra } from "@cas/core";
import {
  makeUnboundedLaurentSchwarz,
  type Complex,
  type UnboundedLaurentSchwarz,
} from "./deltoid.js";
import { makeUnboundedLaurentCorrespondence, type Correspondence } from "./correspondence.js";

const A = tupleAlgebra;

export interface FamilyMember {
  /** The parameter a. */
  a: Complex;
  /** φ_a(z) = z + a/(2 z²) as an unbounded-Laurent Schwarz engine. */
  schwarz: UnboundedLaurentSchwarz;
  /** The deleted correspondence of φ_a (2:2, since deg φ_a = 3). */
  correspondence: Correspondence;
}

/** Build the family member φ_a(z) = z + a/(2 z²). a = [1,0] is the deltoid; a = [0,0] the round disk. */
export function familyMember(a: Complex): FamilyMember {
  const F: Complex[] = [
    [0, 0],
    [0, 0],
    [a[0] / 2, a[1] / 2],
  ];
  const schwarz = makeUnboundedLaurentSchwarz(1, F);
  const correspondence = makeUnboundedLaurentCorrespondence(1, F, schwarz.evalPhi);
  return { a, schwarz, correspondence };
}

/** The three critical points ζ_k = a^{1/3}·{1,ω,ω²} of φ_a (roots of φ_a'(z) = 1 − a/z³). Empty at a=0
 *  (φ_0 = z is critical-point-free). */
export function criticalPoints(a: Complex): Complex[] {
  const r = Math.hypot(a[0], a[1]);
  if (r === 0) return [];
  const rc = Math.cbrt(r);
  const th = Math.atan2(a[1], a[0]) / 3;
  const pts: Complex[] = [];
  for (let k = 0; k < 3; k++) {
    const ang = th + (2 * Math.PI * k) / 3;
    pts.push([rc * Math.cos(ang), rc * Math.sin(ang)]);
  }
  return pts;
}

/** The critical VALUES m_k = φ_a(ζ_k): the cusps / σ_a critical values whose orbits mark the plane. */
export function criticalValues(member: FamilyMember): Complex[] {
  return criticalPoints(member.a).map((z) => member.schwarz.evalPhi(z));
}

export interface ParamEscapeOptions {
  maxIter?: number;
  /** |w| beyond which the σ_a-orbit is deemed to have escaped to ∞. */
  escapeR?: number;
}

export interface ParamEscapeResult {
  /** True if SOME critical-value orbit escaped to ∞ ⟹ a is OUTSIDE the connectedness locus. */
  escaped: boolean;
  /** Fewest σ_a-iterations for any critical orbit to exceed escapeR; maxIter if none escaped. */
  n: number;
}

// Library default for a bare criticalEscape() call. NOTE: the APP passes paramPlane's
// DEFAULT_PARAM_OPTIONS.maxIter = 48 (CPU classifyParamBand + GPU renderParamPlane), so 48 — not this 64 —
// is what a user sees; this 64 is exercised only by unit tests that omit opts (WP8 / A9, two-defaults note).
const DEFAULT_MAX_ITER = 64;
const DEFAULT_ESCAPE_R = 1e3; // σ_a ≈ (a/2)w̄² near ∞ squares each step, so this is reached in a few steps

/** Iterate σ_a from w0 until |w| > escapeR (escape to ∞) or maxIter; returns the escape step or maxIter.
 *  sigma() returning null means the orbit left Ω *inward* (into the tiling/hole) — that is NOT an escape
 *  to ∞, so it counts as bounded (maxIter). */
function escapeToInfinity(
  schwarz: UnboundedLaurentSchwarz,
  w0: Complex,
  maxIter: number,
  escapeR: number,
): number {
  let w = w0;
  for (let n = 1; n <= maxIter; n++) {
    const next = schwarz.sigma(w);
    if (!next) return maxIter;
    w = next;
    if (!A.isFinite(w) || A.abs(w) > escapeR) return n;
  }
  return maxIter;
}

/**
 * Classify a parameter a by the escape-to-∞ of φ_a's critical-value orbits under σ_a. All three
 * critical values are run and the FASTEST escape is reported (connectivity fails as soon as any critical
 * orbit escapes). a ≈ 0 is the round disk — trivially in the locus.
 */
export function criticalEscape(a: Complex, opts: ParamEscapeOptions = {}): ParamEscapeResult {
  const maxIter = opts.maxIter ?? DEFAULT_MAX_ITER;
  const escapeR = opts.escapeR ?? DEFAULT_ESCAPE_R;
  if (Math.hypot(a[0], a[1]) < 1e-9) return { escaped: false, n: maxIter };
  const member = familyMember(a);
  let best = maxIter;
  for (const m of criticalValues(member)) {
    const n = escapeToInfinity(member.schwarz, m, maxIter, escapeR);
    if (n < best) best = n;
  }
  return { escaped: best < maxIter, n: best };
}
