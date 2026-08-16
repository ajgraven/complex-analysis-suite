// Shared types for @cas/faber. The engine is parametrized by a plain Laurent-coefficient contract
// (NOT any app's conformal-map struct) so both Quadrature Domains (which adapts its solved φ via
// phiLaurentAtInfinity) and the Faber-transform app (which passes a preset's closed-form Laurent)
// feed the same shape. Convention-neutral (ADR-0006).
import type { Cx } from "@cas/core";

/**
 * An exterior conformal map φ: 𝔻* → Ω given by its Laurent expansion at ∞:
 *
 *     φ(z) = c·z + c₀ + c₁/z + c₂/z² + …
 *
 * where `c = φ'(∞) > 0` is the capacity and `laurent[k] = c_k` (k ≥ 0). K = ℂ∖Ω is the bounded
 * complement whose Faber polynomials this map generates. Missing `laurent` entries are treated as 0.
 */
export interface ExteriorMap {
  /** Capacity c = φ'(∞) > 0 (the leading Laurent coefficient). */
  c: number;
  /** Laurent tail coefficients c₀, c₁, c₂, … (index k is c_k). */
  laurent: readonly Cx[];
}

/** Result of {@link faberPolynomials}: F₀…F_N as ascending-power coefficient arrays. */
export interface FaberPolynomials {
  /** Capacity c echoed back. */
  c: number;
  /** The constant Laurent coefficient c₀. */
  c0: Cx;
  /** `coeffs[n]` is F_n as an ascending-power `Cx[]` (index i = coefficient of ζ^i). */
  coeffs: Cx[][];
}
