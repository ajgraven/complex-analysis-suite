// weighted.ts — corner-suppressing weighted Faber polynomials Q_{n,m} (Faber M3).
//
// Ordinary Faber polynomials F_n overshoot near the corners of K: |φ^{-n}F_n| → λ_k > 1 at a corner z_k
// (Miña-Díaz–Rubin–Wennman 2025, arXiv:2509.22588, eq. 1.7), while → 1 on the smooth arcs. The WEIGHTED
// Faber polynomial Q_{n,m} (their eq. 1.9) is the polynomial part of G_m(z)·φ(z)^n, where
//
//     G_m(z) = ∏_k (1 − φ(z_k)/φ(z))^{1/m},   G_m analytic in Ω, G_m(∞) = 1,
//
// which suppresses that overshoot (limsup ‖Q_{n,m}‖ → 1 as m → ∞) while keeping degree n and leading
// coefficient cap^{-n} — so it is still a valid trial polynomial (W_n ≤ ‖Q_{n,m}‖). `m` is a small-integer
// suppression-strength knob; m = 1 over-corrects (exponent 1 is too aggressive), so the useful range is
// m ≥ 2 (convex) up to m ≈ 8 on reentrant corners (M3.0 spike, faber-polygonal-sc-plan.md §5).
//
// KEY SIMPLIFICATION (no new numerics). Writing G_m = Σ_j g_j·φ(z)^{-j}, the polynomial part splits
// term-by-term, because the polynomial part of φ^{n-j} is exactly F_{n-j}:
//
//     Q_{n,m}(ζ) = Σ_{j=0}^{n} g_j · F_{n-j}(ζ)        (F_j = 0 for j < 0, F_0 = 1).
//
// So Q_{n,m} is a finite linear combination of the F_n the engine already builds. The corner images
// w_k = φ(z_k) are the exterior Schwarz–Christoffel prevertices' reciprocals (w_k = 1/u_k, |w_k| = 1);
// the app passes them in, so @cas/faber stays blind to how they were obtained (same one-struct discipline
// as ExteriorMap). Convention-neutral (ADR-0006); stands only on @cas/core + the F_n recurrence.
import { makePoly, makeSeries, objAlgebra } from "@cas/core";
import type { Cx } from "@cas/core";
import { faberPolynomials } from "./recurrence.js";
import type { ExteriorMap } from "./types.js";

const A = objAlgebra;
const S = makeSeries(A);
const P = makePoly(A);

/** The ascending series of (1 − w·s)^{1/m} to order N, via the generalized binomial (1+x)^p = Σ C(p,j)x^j. */
function binomialFactor(w: Cx, m: number, N: number): Cx[] {
  const p = 1 / m;
  const negW = A.make(-w.re, -w.im); // x = −w·s
  const out: Cx[] = [A.make(1, 0)];
  let binom = 1; // C(p, j)
  let pw: Cx = A.make(1, 0); // (−w)^j
  for (let j = 1; j <= N; j++) {
    binom = (binom * (p - j + 1)) / j;
    pw = A.mul(pw, negW);
    out.push(A.make(binom * A.re(pw), binom * A.im(pw)));
  }
  return out;
}

/**
 * The weight series g₀…g_N: the ascending coefficients of G_m(z) = ∏_k (1 − w_k·s)^{1/m} as a power series
 * in s = 1/φ(z), where `cornerImages` are the corner images w_k = φ(z_k) (|w_k| = 1). g₀ = 1 always
 * (G_m(∞) = 1). Pure. Feed to {@link weightedFaberPolynomial}; with no corners it is the unit series (⇒ Q = F).
 */
export function weightSeries(cornerImages: readonly Cx[], m: number, N: number): Cx[] {
  if (!(Number.isFinite(m) && m >= 1)) throw new Error(`weightSeries: suppression strength m must be ≥ 1, got ${m}`);
  const order = Math.max(0, Math.floor(N));
  let g: Cx[] = S.unit(order); // [1, 0, 0, …]
  for (const w of cornerImages) g = S.mul(g, binomialFactor(w, m, order), order);
  return g;
}

/**
 * The corner-suppressing weighted Faber polynomial Q_{n,m}(ζ) = Σ_{j=0}^{n} g_j·F_{n-j}(ζ), returned as an
 * ascending-power coefficient array (degree ≤ n, leading coefficient cap^{-n} preserved). `cornerImages`
 * are the exterior-SC corner images w_k = 1/u_k. For a smooth (corner-free) domain pass `cornerImages = []`
 * to recover F_n exactly. `≈`-labeled at the app edge: it rides the truncated exterior map like every
 * polygonal-domain quantity — an approximation-QUALITY improvement, not a new exactness claim.
 */
export function weightedFaberPolynomial(map: ExteriorMap, cornerImages: readonly Cx[], n: number, m: number): Cx[] {
  return weightedFaberPolynomials(map, cornerImages, n, m).coeffs[n];
}

/** Result of {@link weightedFaberPolynomials}: Q_{0,m}…Q_{N,m} as ascending-power coefficient arrays. */
export interface WeightedFaberPolynomials {
  /** `coeffs[n]` is Q_{n,m} as an ascending-power `Cx[]` (index i = coefficient of ζ^i). */
  coeffs: Cx[][];
}

/**
 * Build Q_{0,m}…Q_{N,m} in one pass, reusing the shared F_n and weight series g_j (efficient for a sweep or
 * for the weighted transform Σ b_n Q_{n,m}). Each Q_{n,m} = Σ_{j=0}^{n} g_j·F_{n-j}.
 */
export function weightedFaberPolynomials(
  map: ExteriorMap,
  cornerImages: readonly Cx[],
  N: number,
  m: number,
): WeightedFaberPolynomials {
  const order = Math.max(0, Math.floor(N || 0));
  const { coeffs: F } = faberPolynomials(map, order);
  const g = weightSeries(cornerImages, m, order);
  const coeffs: Cx[][] = [];
  for (let n = 0; n <= order; n++) {
    let acc = P.zero();
    for (let j = 0; j <= n; j++) acc = P.add(acc, P.scale(F[n - j], g[j]));
    coeffs[n] = acc;
  }
  return { coeffs };
}
