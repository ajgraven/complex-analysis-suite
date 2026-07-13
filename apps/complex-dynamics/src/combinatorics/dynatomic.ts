/**
 * dynatomic.ts — exact period-n polynomial data for the quadratic family f_c(z) = z² + c (roadmap #17),
 * on the shared exact-arithmetic kernel @cas/exact.
 *
 * This module currently provides the GLEASON polynomials G_n(c), whose roots are the centers of the
 * period-n hyperbolic components of the Mandelbrot set — the c for which the critical point 0 is periodic
 * of *exact* period n under f_c. They are built from the critical orbit and Möbius inversion:
 *
 *   • critical orbit   p_0(c) = 0,  p_{k+1}(c) = p_k(c)² + c    (p_k = f_cᵏ(0), a monic polynomial in c
 *                      of degree 2^{k-1}; p_n = 0 ⟺ 0 has period dividing n).
 *   • Gleason          G_n(c) = ∏_{d | n} p_d(c)^{μ(n/d)}       (Möbius inversion strips the lower periods;
 *                      the division is exact because each p_d is monic in c — no field inversion needed).
 *
 * Everything is exact in ℚ (⊂ ℚ(i)); the numeric centers are the roots of the exact G_n, found with
 * @cas/core's Durand–Kerner. Oracles (primary-source Gleason polynomials): G_1 = c, G_2 = c+1,
 * G_3 = c³+2c²+c+1, G_4 = c⁶+3c⁵+3c⁴+3c³+2c²+1 (degrees 1,1,3,6,15,27 for n = 1..6).
 *
 * Dynatomic Φ_n(z,c) (exact period-n POINTS) and the multiplier polynomials follow in later steps; they
 * need the bivariate (z over ℚ[c]) layer. Pure module — no DOM / GL.
 */
import { makeDurandKerner, tupleAlgebra, type ComplexTuple } from "@cas/core";
import { Gauss, QiPoly, renderQiPolyText } from "@cas/exact";

const A = tupleAlgebra;

/** The Möbius function μ(n) for n ≥ 1 (0 if n is not squarefree, ±1 by the parity of its prime count). */
export function mobius(n: number): number {
  if (n === 1) return 1;
  let m = n;
  let primes = 0;
  for (let p = 2; p * p <= m; p++) {
    if (m % p === 0) {
      m /= p;
      primes++;
      if (m % p === 0) return 0; // p² | n → not squarefree
    }
  }
  if (m > 1) primes++; // a remaining prime factor
  return primes % 2 === 0 ? 1 : -1;
}

/** The divisors of n in increasing order. */
export function divisors(n: number): number[] {
  const out: number[] = [];
  for (let d = 1; d <= n; d++) if (n % d === 0) out.push(d);
  return out;
}

/**
 * The critical orbit p_k(c) = f_cᵏ(0) as exact polynomials in c, for k = 0..N (p[0] = 0). Each p_k is monic
 * in c of degree 2^{k-1} (p_0 = 0, p_1 = c). The variable of the returned QiPolys is c.
 */
export function criticalOrbit(N: number): QiPoly[] {
  const c = QiPoly.variable();
  const p: QiPoly[] = [QiPoly.zero()];
  let cur = QiPoly.zero();
  for (let k = 1; k <= N; k++) {
    cur = cur.mul(cur).add(c); // p_{k+1} = p_k² + c
    p.push(cur);
  }
  return p;
}

/**
 * The Gleason polynomial G_n(c) — the exact period-n center condition (roots = centers of period-n
 * hyperbolic components of the Mandelbrot set). G_n = ∏_{d|n} p_d^{μ(n/d)}, computed by exact (monic)
 * division. Requires n ≥ 1.
 */
export function gleasonPolynomial(n: number): QiPoly {
  if (n < 1 || !Number.isInteger(n)) throw new Error("gleasonPolynomial: n must be a positive integer");
  const p = criticalOrbit(n);
  let num = QiPoly.constant(Gauss.ONE);
  let den = QiPoly.constant(Gauss.ONE);
  for (const d of divisors(n)) {
    const mu = mobius(n / d);
    const pd = p[d] ?? QiPoly.zero();
    if (mu === 1) num = num.mul(pd);
    else if (mu === -1) den = den.mul(pd);
  }
  const { q, r } = num.divmod(den);
  if (!r.isZero()) throw new Error("gleasonPolynomial: non-exact Möbius division (internal invariant violated)");
  return q;
}

/** The number of period-n centers (= deg G_n). */
export function gleasonDegree(n: number): number {
  return gleasonPolynomial(n).degree();
}

/** G_n(c) as a readable string, e.g. "c^3 + 2 c^2 + c + 1". */
export function gleasonText(n: number): string {
  return renderQiPolyText(gleasonPolynomial(n), "c");
}

/**
 * The numeric period-n centers — roots of the exact Gleason polynomial G_n, via @cas/core's Durand–Kerner
 * (G_n is monic, so it is solved directly). Returns [] for the degenerate empty case.
 */
export function mandelbrotCenters(n: number): ComplexTuple[] {
  const g = gleasonPolynomial(n);
  const deg = g.degree();
  if (deg < 1) return [];
  const coeffs = g.coeffs.map((c) => c.toTuple());
  const lead = coeffs[deg] ?? [1, 0];
  if (deg === 1) {
    // −coeffs[0]/coeffs[1]
    const c0 = coeffs[0] ?? [0, 0];
    return [A.neg(A.div(c0, lead))];
  }
  // Make monic for a clean DK eval (G_n is already monic, but normalize defensively).
  const monic = coeffs.map((c) => A.div(c, lead));
  const evalMonic = (z: ComplexTuple): ComplexTuple => {
    let acc: ComplexTuple = monic[deg] ?? [1, 0];
    for (let k = deg - 1; k >= 0; k--) acc = A.add(A.mul(acc, z), monic[k] ?? [0, 0]);
    return acc;
  };
  // Cauchy bound → seed circle (all Mandelbrot centers lie in |c| ≤ 2, but bound defensively).
  let bound = 1;
  for (let k = 0; k < deg; k++) bound = Math.max(bound, 1 + A.abs(monic[k] ?? [0, 0]));
  const seeds: ComplexTuple[] = [];
  for (let k = 0; k < deg; k++) {
    const t = (2 * Math.PI * (k + 0.5)) / deg;
    seeds.push([bound * Math.cos(t), bound * Math.sin(t)]);
  }
  const res = makeDurandKerner(A)(evalMonic, seeds, { tol: 1e-13, maxIter: 400 });
  return res ? res.roots : [];
}
