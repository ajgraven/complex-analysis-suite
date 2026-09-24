// How hard each root is to move — the numbers behind "why did that root jump?" (DESIGN §4.1 step 5).
//
// κ(rᵢ) = Σ|aₖ||rᵢ|ᵏ / |p′(rᵢ)| is the relative condition number of a simple root under relative
// perturbations of the coefficients; the gain row |∂rᵢ/∂aₖ| = |rᵢᵏ / p′(rᵢ)| is how far rᵢ moves per
// unit of aₖ. Both are floats and both are `≈`: they explain the picture, they certify nothing.
import { evalAt, type Cx, type Polynomial } from "../polynomial.js";

export interface Conditioning {
  /** κ(rᵢ); `Infinity` where p′(rᵢ) = 0 in floating point (a multiple root). */
  readonly kappa: number;
  /** |rᵢᵏ / p′(rᵢ)| for k = 0 … n−1 (aₙ is not dragged). */
  readonly gains: readonly number[];
}

export function derivative(coeffs: readonly Cx[]): Cx[] {
  return coeffs.slice(1).map(([re, im], k) => [re * (k + 1), im * (k + 1)] as Cx);
}

export function conditioning(p: Polynomial): Conditioning[] {
  const dp = derivative(p.coeffs);
  return p.roots.map((r) => {
    const d = Math.hypot(...evalAt(dp, r));
    const mod = Math.hypot(r[0], r[1]);
    let weighted = 0;
    const gains: number[] = [];
    for (let k = 0; k <= p.degree; k++) {
      const rk = mod ** k;
      weighted += Math.hypot(...p.coeffs[k]) * rk;
      if (k < p.degree) gains.push(d === 0 ? Infinity : rk / d);
    }
    return { kappa: d === 0 ? Infinity : weighted / d, gains };
  });
}
