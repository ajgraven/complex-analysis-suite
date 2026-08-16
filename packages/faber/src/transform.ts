// The forward exterior Faber transform Φφ: 𝒜(𝔻) → 𝒜(K). NEW code (neither app had it): the Quadrature
// Domains app only ever built the Faber polynomials F_n themselves, never the transform of an arbitrary
// input. See docs/design/faber-transform-plan.md §1, §3.
import { makePoly, objAlgebra } from "@cas/core";
import type { Cx } from "@cas/core";
import { faberPolynomials } from "./recurrence.js";
import type { ExteriorMap } from "./types.js";

const P = makePoly(objAlgebra);

/**
 * The forward exterior Faber transform of a function f ∈ 𝒜(𝔻) given by its Taylor coefficients on the
 * unit disk, f(z) = Σ_{n≥0} b_n z^n:
 *
 *     Φφ(f)(w) = Σ_{n=0}^{N} b_n F_n(w),          N = taylor.length − 1.
 *
 * Returns the ascending-power coefficient array of the resulting polynomial in w (degree ≤ N). For a
 * polynomial input this is EXACT (=); for a truncated series it is the order-N approximation (≈) — the
 * series converges inside the equipotential set by f's radius of convergence (plan §1). Evaluate the
 * result with any Horner routine (e.g. `@cas/core`'s `makePoly(objAlgebra).eval`).
 */
export function faberTransform(map: ExteriorMap, taylor: readonly Cx[]): Cx[] {
  const N = taylor.length - 1;
  if (N < 0) return [{ re: 0, im: 0 }];
  const { coeffs } = faberPolynomials(map, N);
  let acc = P.zero();
  for (let n = 0; n <= N; n++) {
    acc = P.add(acc, P.scale(coeffs[n], taylor[n]));
  }
  return acc;
}
