// =============================================================================
// series.ts -- truncated formal power-series arithmetic (representation-generic).
//
// A series is an array `s` of complex coefficients with `s[k]` the coefficient of x^k; its
// "order" is the highest power kept (so a length-(order+1) array). This is the shared home for
// the formal-series arithmetic both apps do — QD's `taylor.mjs` (LQD Taylor machinery) and CD's
// `uniformize.ts` (inverse-Böttcher recurrences).
//
// SCOPE (Phase 3, MIGRATION.md step 3.2): only the truncated MULTIPLY is extracted here. It is
// the workhorse both apps' higher-level series ops are built on, and — unlike those ops — the two
// apps' multiplies are bit-for-bit identical (same convolution, same accumulation order; a
// zero-coefficient skip is just a `+0` no-op), so sharing it changes no numerics in either app.
//
// The higher-level ops deliberately stay app-side for now, because the two apps implement them
// with DIFFERENT algorithms (e.g. power: naive repeated-multiply vs binary exponentiation;
// reciprocal: multiply-by-inverse vs divide; compositional inverse: direct recursion vs Lagrange
// inversion) — unifying those would shift one app's rounding. A complete generic series package
// is Phase-6 work, driven by the correspondence tool's Fatou-coordinate local charts (the third
// consumer). Both apps' `pow`/`inverse`/... keep their own loops, now calling this one multiply.
// =============================================================================

import type { ComplexAlgebra } from "./algebra.js";

/** A truncated power series: `s[k]` is the coefficient of x^k (length = order + 1). */
export type Series<C> = C[];

/** Series operations over a given complex algebra. Bind once, like `makeDurandKerner`. */
export function makeSeries<C>(alg: ComplexAlgebra<C>) {
  const isZero = (z: C): boolean => alg.re(z) === 0 && alg.im(z) === 0;

  /** All-zero series of length `order + 1`. */
  function zeros(order: number): Series<C> {
    const s = new Array<C>(order + 1);
    for (let i = 0; i <= order; i++) s[i] = alg.make(0, 0);
    return s;
  }

  /** The unit series 1 + 0·x + … truncated to `order`. */
  function unit(order: number): Series<C> {
    const s = zeros(order);
    s[0] = alg.make(1, 0);
    return s;
  }

  /**
   * Truncated product a·b to `order`. Inputs may be shorter or longer than order + 1 (missing /
   * excess coefficients are treated as absent). Zero coefficients are skipped — a pure `+0`
   * no-op, so the result is bit-identical to the dense convolution both apps previously ran.
   */
  function mul(a: readonly C[], b: readonly C[], order: number): Series<C> {
    const out = zeros(order);
    const iMax = Math.min(order, a.length - 1);
    for (let i = 0; i <= iMax; i++) {
      const ai = a[i];
      if (isZero(ai)) continue;
      const jMax = Math.min(order - i, b.length - 1);
      for (let j = 0; j <= jMax; j++) {
        const bj = b[j];
        if (isZero(bj)) continue;
        out[i + j] = alg.add(out[i + j], alg.mul(ai, bj));
      }
    }
    return out;
  }

  return { zeros, unit, mul };
}
