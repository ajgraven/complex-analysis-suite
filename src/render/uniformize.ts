/**
 * Exterior Riemann maps of the z^d + c family — the Laurent coefficients of the inverse
 * Böttcher map ψ that uniformizes the complement of the filled Julia set K_c. (A later step
 * adds the multibrot connectedness locus M_d; both share `evalExterior` / the series toolkit.)
 *
 * For f(z) = z^d + c the Böttcher coordinate φ conjugates f to w ↦ w^d near ∞ with φ(z) ~ z,
 * so its inverse ψ = φ⁻¹ satisfies the functional equation
 *
 *     ψ(w^d) = ψ(w)^d + c,    ψ(w) = w + Σ_{k≥0} b_k · w^{-k}
 *
 * (a monic polynomial's filled Julia set has logarithmic capacity 1, so the leading
 * coefficient is exactly w). Writing ψ(w) = w · g(1/w) with g(u) = 1 + Σ_{j≥1} g_j u^j turns
 * the equation into a power-series identity in u = 1/w:
 *
 *     g(u^d) = g(u)^d + c · u^d.
 *
 * Matching the coefficient of u^m gives d·g_m + P_m(g_1…g_{m-1}) on the right and g_{m/d}
 * (or 0) on the left, so each g_m is fixed by the lower ones and c — a triangular recursion
 * that solves to any order with no boundary sampling. The returned b_k = g_{k+1}.
 *
 * Pure (no DOM/GL), so it is unit-tested. Valid only where K_c is connected (c ∈ M_d); the
 * caller gates on that. The series converges for |w| > ρ ≥ 1, reaching the boundary |w| = 1
 * only when K_c is locally connected — the boundary overlay draws at r = 1 + ε to stay clear
 * of that limit.
 */

import type { Complex } from "../complex";
import * as C from "../expr/complexJs";

/** A truncated power series in u: `s[k]` is the coefficient of u^k (length = order + 1). */
type Series = Complex[];

const ZERO: Complex = [0, 0];

/** The unit series 1 + 0·u + … truncated to order `n`. */
function unitSeries(n: number): Series {
  const s: Series = Array.from({ length: n + 1 }, () => [0, 0] as Complex);
  s[0] = [1, 0];
  return s;
}

/** Product a·b of two power series, truncated to order `n`. */
function seriesMul(a: Series, b: Series, n: number): Series {
  const out: Series = Array.from({ length: n + 1 }, () => [0, 0] as Complex);
  for (let i = 0; i <= n; i++) {
    if (a[i][0] === 0 && a[i][1] === 0) continue;
    for (let j = 0; i + j <= n; j++) {
      if (b[j][0] === 0 && b[j][1] === 0) continue;
      const k = i + j;
      out[k] = C.add(out[k], C.mul(a[i], b[j]));
    }
  }
  return out;
}

/** Integer power a^d, truncated to order `n`, via binary exponentiation. */
function seriesPow(a: Series, d: number, n: number): Series {
  let result = unitSeries(n);
  let base = a;
  let k = d;
  while (k > 0) {
    if (k & 1) result = seriesMul(result, base, n);
    k >>= 1;
    if (k > 0) base = seriesMul(base, base, n);
  }
  return result;
}

/**
 * Laurent coefficients [b_0, b_1, …, b_n] of the inverse Böttcher map ψ(w) = w + Σ b_k w^{-k}
 * of the filled Julia set K_c for z^d + c, solving g(u^d) = g(u)^d + c·u^d order by order.
 * Returns [] for invalid input (d must be an integer ≥ 2, n ≥ 0). Assumes K_c connected; the
 * recursion is O(n²) per order (one truncated power per coefficient), fine for the few-hundred
 * orders this is ever asked for on demand.
 */
export function juliaExteriorCoeffs(d: number, c: Complex, n: number): Complex[] {
  if (!Number.isInteger(d) || d < 2 || n < 0) return [];
  const N = n + 1; // need g_1 … g_{n+1}, since b_k = g_{k+1}
  const g: Series = Array.from({ length: N + 1 }, () => [0, 0] as Complex);
  g[0] = [1, 0];
  for (let m = 1; m <= N; m++) {
    // [g^d]_m with g_m still 0 equals P_m (the part of [g^d]_m not multiplying g_m), since
    // [g^d]_m = d·g_m + P_m (because g_0 = 1). Matching u^m in g(u^d) = g(u)^d + c·u^d:
    //   [g(u^d)]_m = g_{m/d} when d | m else 0,  and  c contributes only at m = d.
    const h = seriesPow(g, d, m);
    const lhs: Complex = m % d === 0 ? g[m / d] : ZERO;
    const extra: Complex = m === d ? c : ZERO;
    // d·g_m = lhs − extra − P_m  ⇒  g_m = (lhs − extra − h_m) / d.
    const num = C.sub(C.sub(lhs, extra), h[m]);
    g[m] = [num[0] / d, num[1] / d];
  }
  return g.slice(1, N + 1); // b_0 … b_n  (= g_1 … g_{n+1})
}

/**
 * Evaluate an exterior map ψ(w) = w + Σ_{k≥0} coeffs[k] · w^{-k} (leading coefficient 1, the
 * capacity-1 / monic normalization) at a point w. Shared by the Julia and multibrot maps and
 * by the boundary-reconstruction overlay.
 */
export function evalExterior(coeffs: Complex[], w: Complex): Complex {
  let sum: Complex = [w[0], w[1]];
  const wInv = C.div([1, 0], w);
  let wPow: Complex = [1, 0]; // w^{-k}, starting at w^0
  for (let k = 0; k < coeffs.length; k++) {
    sum = C.add(sum, C.mul(coeffs[k], wPow));
    wPow = C.mul(wPow, wInv);
  }
  return sum;
}
