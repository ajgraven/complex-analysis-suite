// exterior.ts — conformal invariants of a filled Julia set's exterior (catalog items E2/E3/E6).
//
// For a polynomial / rational map f of degree D ≥ 2 at ∞, the exterior Riemann map ψ: ext(𝔻) → ext(K)
// is ψ(w) = γ₁·w + Σ b_k w^{-k}. Its leading coefficient γ₁ IS the logarithmic capacity of the filled
// Julia set K (transfinite diameter = conformal radius of the exterior); |γ₁| = 1 exactly for a monic
// map (a theorem). The b_k are the exterior's "shape spectrum". All from the shared inverse-Böttcher
// kernel (@cas/dynamics, ADR-0011). Pure → node-tested.
import { parse } from "@cas/expr/parser";
import { fToRational } from "@cas/expr/rational";
import { rationalExteriorCoeffs, reconstructBoundary } from "@cas/dynamics";

export interface ExteriorAnalysis {
  /** Logarithmic capacity cap(K) = |γ₁| (exact — a closed form of the leading coefficient). */
  readonly capacity: number;
  /** Robin constant γ = −log cap(K). */
  readonly robin: number;
  /** True when cap(K) = 1 (monic map) — the honest "= exact 1" case. */
  readonly monic: boolean;
  /** The leading coefficient γ₁ (complex). */
  readonly lead: readonly [number, number];
  /** Laurent coefficients b₀, b₁, … of ψ (estimates from the series recursion). */
  readonly coeffs: ReadonlyArray<readonly [number, number]>;
}

/**
 * Analyze the exterior Riemann map of the filled Julia set of `expr` (a polynomial/rational f). Returns
 * null when f is not rational, or has degree < 2 at ∞ (no superattracting fixed point at ∞, so no
 * Böttcher uniformization of the exterior). `nCoeffs` is how many b_k to compute.
 */
export function analyzeExterior(expr: string, nCoeffs = 6): ExteriorAnalysis | null {
  let ast;
  try {
    ast = parse(expr);
  } catch {
    return null;
  }
  const rat = fToRational(ast, [0, 0], [0, 0]);
  if (!rat) return null;
  const res = rationalExteriorCoeffs(rat.num, rat.den, nCoeffs);
  if (!res) return null;
  const capacity = Math.hypot(res.lead[0], res.lead[1]);
  if (!Number.isFinite(capacity) || capacity <= 0) return null;
  return {
    capacity,
    robin: -Math.log(capacity),
    monic: Math.abs(capacity - 1) < 1e-9,
    lead: res.lead,
    coeffs: res.b,
  };
}

/** Reconstructed boundary of K: ψ(r·e^{2πiθ}) for r slightly above 1, as a closed polyline (P2b overlay).
 *  Uses the shared @cas/dynamics evaluator (no re-implementation). Valid where K is connected. */
export function reconstructedBoundary(a: ExteriorAnalysis, r = 1.02, samples = 512): [number, number][] {
  const coeffs = a.coeffs.map((c) => [c[0], c[1]] as [number, number]);
  const lead: [number, number] = [a.lead[0], a.lead[1]];
  const pts = reconstructBoundary(coeffs, r, samples, lead); // open list — close the loop for the overlay
  return pts.length ? [...pts, pts[0]] : pts;
}
