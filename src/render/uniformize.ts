/**
 * Exterior Riemann maps of the z^d + c family — the Laurent coefficients of the inverse
 * Böttcher map ψ that uniformizes the complement of the filled Julia set K_c, and of the
 * exterior map Ψ of the multibrot connectedness locus M_d (the z^d + c parameter-space
 * fractal; M_2 = the Mandelbrot set). Both share `evalExterior` and the series toolkit.
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
 * The multibrot map has no such functional equation (c is both the parameter and the point
 * Φ is evaluated at), so its coefficients come from the Böttcher product along the
 * critical-value orbit, Φ(c) = c·Π_{k≥0} (1 + c·Z_k^{-d})^{1/d^{k+1}} with Z_0 = c and
 * Z_{k+1} = Z_k^d + c, expanded as a series in 1/c (only finitely many factors reach a given
 * order) and then reverted. For d = 2 these are the classical rationals −½, ⅛, −¼, 15/128, …
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

/** A length-(n+1) all-zero series. */
function zeros(n: number): Series {
  return Array.from({ length: n + 1 }, () => [0, 0] as Complex);
}

/** Multiplicative inverse 1/a of a power series with a[0] ≠ 0, truncated to order `n`. */
function seriesInverse(a: Series, n: number): Series {
  const b = zeros(n);
  const a0 = a[0];
  b[0] = C.div([1, 0], a0);
  for (let k = 1; k <= n; k++) {
    let s: Complex = [0, 0];
    for (let i = 1; i <= k; i++) s = C.add(s, C.mul(a[i] ?? ZERO, b[k - i]));
    b[k] = C.neg(C.div(s, a0));
  }
  return b;
}

/**
 * Compositional inverse of a series with a[0] = 0, a[1] ≠ 0 (so a(b(x)) = x), via Lagrange
 * inversion b_m = (1/m)·[x^{m-1}] (x/a(x))^m. Truncated to order `n`.
 */
function seriesReverse(a: Series, n: number): Series {
  const aOverX = zeros(n); // a(x)/x
  for (let i = 0; i <= n; i++) aOverX[i] = a[i + 1] ?? ZERO;
  const h = seriesInverse(aOverX, n); // x / a(x)
  const b = zeros(n);
  let hPow = unitSeries(n); // (x/a(x))^0
  for (let m = 1; m <= n; m++) {
    hPow = seriesMul(hPow, h, n); // (x/a(x))^m
    b[m] = C.div(hPow[m - 1], [m, 0]);
  }
  return b;
}

/** (1 + x)^alpha for a series x with x[0] = 0 (binomial series), truncated to order `n`. */
function seriesBinomPow(x: Series, alpha: number, n: number): Series {
  const res = unitSeries(n);
  let coef: Complex = [1, 0]; // C(alpha, j), real (alpha is real)
  let xPow = unitSeries(n); // x^0
  for (let j = 1; j <= n; j++) {
    const f = (alpha - (j - 1)) / j; // C(alpha, j) = C(alpha, j-1)·(alpha-(j-1))/j
    coef = [coef[0] * f, coef[1] * f];
    xPow = seriesMul(xPow, x, n); // x^j — lowest order ≥ j, so it empties past order n
    if (xPow.every((z) => z[0] === 0 && z[1] === 0)) break;
    for (let i = 0; i <= n; i++) res[i] = C.add(res[i], C.mul(coef, xPow[i]));
  }
  return res;
}

/** Shift a series up by `s` orders (multiply by uˢ), truncated to order `n`. */
function shiftUp(a: Series, s: number, n: number): Series {
  const b = zeros(n);
  for (let i = s; i <= n; i++) b[i] = a[i - s];
  return b;
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
 * Laurent coefficients of the inverse Böttcher map ψ(w) = γ₁·w + Σ_{k≥0} b_k·w^{-k} of the filled
 * Julia set of an ARBITRARY polynomial f(z) = Σ_{j=0}^d a_j z^j of degree d ≥ 2 (`coeffs[j]` = a_j),
 * generalising {@link juliaExteriorCoeffs} (the monic z^d + c special case). The leading coefficient
 * γ₁ = a_d^{-1/(d-1)} is the capacity; the d−1 roots are the rotational symmetry (the principal root
 * is taken — the reconstructed boundary is the same for any choice). From the conjugacy
 * f(ψ(w)) = ψ(w^d), substituting ψ(w) = γ₁·w·g(1/w) gives the power-series identity in u = 1/w
 *
 *     g(u^d) = g(u)^d + Σ_{j=0}^{d-1} β_j · u^{d-j} · g(u)^j,    β_j = a_j · γ₁^{j-1}
 *
 * (the j = d term is a_d·γ₁^{d-1}·g^d = g^d, since γ₁^{d-1} = 1/a_d). Matching u^m gives d·g_m + [known]
 * on the right, so each g_m follows from the lower ones — a triangular recursion, no boundary
 * sampling. Returned as { lead: γ₁, b: [γ₁·g_1, …, γ₁·g_{n+1}] }, ready for {@link evalExterior}(b, w,
 * lead). For monic z^d + c it reproduces {@link juliaExteriorCoeffs} with lead = 1. Returns null on
 * invalid input (need an integer n ≥ 0, degree d ≥ 2, and a non-zero leading coefficient).
 */
export function polynomialJuliaExteriorCoeffs(
  coeffs: Complex[],
  n: number,
): { lead: Complex; b: Complex[] } | null {
  const d = coeffs.length - 1;
  if (!Number.isInteger(n) || n < 0 || d < 2) return null;
  const ad = coeffs[d];
  if (ad[0] === 0 && ad[1] === 0) return null;
  const lead = C.pow(ad, [-1 / (d - 1), 0]); // γ₁ = a_d^{-1/(d-1)} (capacity), principal root
  if (!Number.isFinite(lead[0]) || !Number.isFinite(lead[1])) return null;
  const beta: Complex[] = []; // β_j = a_j · γ₁^{j-1}, j = 0 … d−1
  for (let j = 0; j < d; j++) beta.push(C.mul(coeffs[j], C.intPow(lead, j - 1)));

  const N = n + 1; // need g_1 … g_{n+1}; b_k = γ₁·g_{k+1}
  const g: Series = Array.from({ length: N + 1 }, () => [0, 0] as Complex);
  g[0] = [1, 0];
  for (let m = 1; m <= N; m++) {
    // g^0 … g^d truncated to order m, with g_m still 0 — so gp[d][m] = P_m, the part of [g^d]_m not
    // multiplying g_m (g_0 = 1 ⇒ [g^d]_m = d·g_m + P_m).
    const gp: Series[] = [unitSeries(m)];
    for (let j = 1; j <= d; j++) gp.push(seriesMul(gp[j - 1], g, m));
    const lhs: Complex = m % d === 0 ? g[m / d] : ZERO; // [g(u^d)]_m
    let rhsKnown: Complex = gp[d][m]; // P_m
    for (let j = 0; j < d; j++) {
      const idx = m - d + j; // g^j enters u^m through the u^{d-j} factor
      if (idx >= 0) rhsKnown = C.add(rhsKnown, C.mul(beta[j], gp[j][idx]));
    }
    const num = C.sub(lhs, rhsKnown); // d·g_m = lhs − P_m − Σ β_j·[g^j]_{m-d+j}
    g[m] = [num[0] / d, num[1] / d];
  }
  const b = g.slice(1, N + 1).map((gk) => C.mul(lead, gk));
  return { lead, b };
}

/**
 * Laurent coefficients [a_0, a_1, …, a_n] of the exterior map Ψ_{M_d}(w) = w + Σ a_m w^{-m} of
 * the multibrot connectedness locus M_d for z^d + c (M_2 = the Mandelbrot set). Built from the
 * Böttcher product Φ(c) = c·Π_k (1 + c·Z_k^{-d})^{1/d^{k+1}} along the critical-value orbit
 * Z_0 = c, Z_{k+1} = Z_k^d + c — normalised to a power series in v = 1/c via Y_k = Z_k·v^{d^k}
 * (so Y_0 = 1, Y_{k+1} = Y_k^d + v^{d^{k+1}-1} and X_k = c·Z_k^{-d} = v^{d^{k+1}-1}·Y_k^{-d}) —
 * then reverted: with u = 1/w, w = Φ ⇒ u = v/Q̃(v), so Ψ(w) = 1/v(u). Capacity-1 (leading w).
 * For d = 2 these are the classical rationals −1/2, 1/8, −1/4, 15/128, …  Returns [] for
 * invalid input (d an integer ≥ 2, n ≥ 0).
 */
export function mandelbrotExteriorCoeffs(d: number, n: number): Complex[] {
  if (!Number.isInteger(d) || d < 2 || n < 0) return [];
  const M = n + 4; // work a few orders high — the reversion / inversions shed the top order or two
  let qtilde = unitSeries(M); // Q̃(v) = Φ(c)/c, a series in v = 1/c
  let y = unitSeries(M); // Y_0 = 1
  for (let k = 0; d ** (k + 1) - 1 <= M; k++) {
    const dk1 = d ** (k + 1);
    const e = dk1 - 1; // X_k = v^e · Y_k^{-d} starts at order e
    const yd = seriesPow(y, d, M); // Y_k^d
    const x = shiftUp(seriesInverse(yd, M), e, M); // X_k
    qtilde = seriesMul(qtilde, seriesBinomPow(x, 1 / dk1, M), M); // ·(1 + X_k)^{1/d^{k+1}}
    y = yd; // Y_{k+1} = Y_k^d + v^e
    y[e] = C.add(y[e], [1, 0]);
  }
  const s = shiftUp(seriesInverse(qtilde, M), 1, M); // u = v / Q̃(v)
  const v = seriesReverse(s, M); // v(u)
  const w = zeros(M); // V/u = 1 + …
  for (let i = 0; i <= M; i++) w[i] = v[i + 1] ?? ZERO;
  const iw = seriesInverse(w, M); // 1/(V/u); Ψ(w) = (1/u)·iw = w + iw_1 + iw_2/w + …
  return iw.slice(1, n + 2); // a_0 … a_n
}

/**
 * Evaluate an exterior map ψ(w) = lead·w + Σ_{k≥0} coeffs[k] · w^{-k} at a point w. `lead` is the
 * leading coefficient — 1 (default) for the capacity-1 / monic normalization (the multibrot map and
 * the monic z^d + c Julia map), or the capacity γ₁ for a general polynomial's Julia map (see
 * {@link polynomialJuliaExteriorCoeffs}). Shared by the readouts and the boundary-reconstruction overlay.
 */
export function evalExterior(coeffs: Complex[], w: Complex, lead: Complex = [1, 0]): Complex {
  let sum: Complex = C.mul(lead, w);
  const wInv = C.div([1, 0], w);
  let wPow: Complex = [1, 0]; // w^{-k}, starting at w^0
  for (let k = 0; k < coeffs.length; k++) {
    sum = C.add(sum, C.mul(coeffs[k], wPow));
    wPow = C.mul(wPow, wInv);
  }
  return sum;
}

/**
 * Whether the filled Julia set K_c of z^d + c is connected — i.e. the critical orbit (z = 0)
 * stays bounded, the condition under which {@link juliaExteriorCoeffs} is valid. A quick
 * numeric escape test with radius max(2, |c|), which bounds the z^d + c orbit for d ≥ 2.
 */
export function juliaConnected(d: number, c: Complex, maxIter = 256): boolean {
  if (!Number.isInteger(d) || d < 2) return false;
  const r = Math.max(2, Math.hypot(c[0], c[1]));
  const r2 = r * r;
  let z: Complex = [0, 0];
  for (let k = 0; k < maxIter; k++) {
    z = C.add(C.intPow(z, d), c); // z ← z^d + c
    if (!Number.isFinite(z[0]) || !Number.isFinite(z[1])) return false;
    if (z[0] * z[0] + z[1] * z[1] > r2) return false;
  }
  return true;
}

/**
 * The reconstructed boundary ψ(r·e^{2πiθ}) sampled at `samples` equally-spaced angles, as an
 * open list of points (the caller closes the loop). r = 1 is the boundary itself; r slightly
 * above 1 is a smooth equipotential just outside it — used by the overlay to stay clear of the
 * r → 1 limit, where the series only reaches the boundary for locally-connected sets.
 */
export function reconstructBoundary(
  coeffs: Complex[],
  r: number,
  samples: number,
  lead: Complex = [1, 0],
): Complex[] {
  const pts: Complex[] = [];
  for (let k = 0; k < samples; k++) {
    const t = (2 * Math.PI * k) / samples;
    pts.push(evalExterior(coeffs, [r * Math.cos(t), r * Math.sin(t)], lead));
  }
  return pts;
}
