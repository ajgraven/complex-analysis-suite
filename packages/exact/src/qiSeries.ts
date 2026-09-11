// Truncated formal power series over ℚ(i).
//
// `@cas/core`'s `makeSeries` is representation-generic in principle but exports only `mul`, and its
// zero-skip is a float test (`abs(z) === 0` on a numeric algebra), so it cannot be instantiated at
// `Gauss` safely. Rather than widen that contract speculatively, the exact series live here, next to
// the field they are over — which is also where every consumer of them is.
//
// Why they exist: the Laurent expansion of `f = P/Q` about a pole of order `m` is a *series
// quotient* once the pole is shifted to the origin. Write `Q(z + a) = z^m · G(z)` with `G(0) ≠ 0`;
// then `f(z + a) = P(z + a) · G(z)^{-1} / z^m`, and the residue is the coefficient of `z^{m-1}` in
// `P(z + a)·G(z)^{-1}`. One shift, one series inverse, one convolution — and the *whole principal
// part* falls out of the same coefficients, free.
//
// The alternative, the order-m derivative formula, differentiates a quotient m−1 times and is
// symbolically explosive; research 03 §0.2 recommends the series route from m ≥ 3 and this makes it
// available at every m.
import { Gauss } from "./gaussian.js";
import { QiPoly } from "./qiPoly.js";

/** Coefficients `c₀ … c_{n−1}` of a series truncated to `n` terms. */
export type QiSeries = Gauss[];

/** The first `n` coefficients of a polynomial, zero-padded. */
export function seriesFromPoly(p: QiPoly, n: number): QiSeries {
  const out: QiSeries = new Array<Gauss>(Math.max(0, n));
  for (let k = 0; k < n; k++) out[k] = p.coeff(k);
  return out;
}

/** Truncated product, to `n` terms. */
export function seriesMul(a: QiSeries, b: QiSeries, n: number): QiSeries {
  const out: QiSeries = new Array<Gauss>(n).fill(Gauss.ZERO);
  for (let i = 0; i < Math.min(a.length, n); i++) {
    if (a[i].isZero()) continue; // exact, not a tolerance — the whole point of being over a field
    for (let j = 0; j + i < n && j < b.length; j++) {
      if (b[j].isZero()) continue;
      out[i + j] = out[i + j].add(a[i].mul(b[j]));
    }
  }
  return out;
}

/**
 * The reciprocal series, to `n` terms. Throws when `c₀ = 0`, which is not a series at all.
 *
 * `d₀ = 1/c₀`, then `dₖ = −(1/c₀)·Σ_{j=1..k} cⱼ·d_{k−j}` — the recurrence you get by requiring
 * `c·d = 1`. Exact over ℚ(i), so the only failure mode is the one that is genuinely undefined.
 */
export function seriesInverse(c: QiSeries, n: number): QiSeries {
  if (c.length === 0 || c[0].isZero()) {
    throw new Error("seriesInverse: the constant term is zero, so the series is not invertible");
  }
  const inv0 = c[0].inv();
  const d: QiSeries = new Array<Gauss>(n).fill(Gauss.ZERO);
  if (n > 0) d[0] = inv0;
  for (let k = 1; k < n; k++) {
    let acc = Gauss.ZERO;
    for (let j = 1; j <= k && j < c.length; j++) {
      if (c[j].isZero() || d[k - j].isZero()) continue;
      acc = acc.add(c[j].mul(d[k - j]));
    }
    d[k] = acc.mul(inv0).neg();
  }
  return d;
}

/**
 * Split `p` as `varᵐ · g` with `g(0) ≠ 0`, returning the order `m` of the zero at the origin.
 *
 * After a Taylor shift this is exactly "what order is the pole", computed rather than inferred —
 * which is the difference between M2's `=` and M1's `≈` on a pole's multiplicity.
 */
export function splitOrder(p: QiPoly): { order: number; rest: QiPoly } {
  if (p.isZero()) throw new Error("splitOrder: the zero polynomial has no order");
  let order = 0;
  let rest = p;
  while (rest.coeff(0).isZero()) {
    rest = rest.divideByVar();
    order++;
  }
  return { order, rest };
}
