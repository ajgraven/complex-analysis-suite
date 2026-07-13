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
 * The DYNATOMIC polynomials Φ_n(z,c) — whose roots (in z, for fixed c) are the points of *exact* period n
 * of f_c — are also here, on @cas/exact's bivariate BiPoly (z over ℚ[c]):
 *
 *   Φ_n(z,c) = ∏_{d|n} (f_cᵈ(z) − z)^{μ(n/d)}     (again exact monic division: f_cᵈ(z) − z is monic in z)
 *
 * with deg_z Φ_n = Σ_{d|n} μ(n/d)·2ᵈ (2,2,6,12,… for n = 1,2,3,4). Oracles: Φ_1 = z²−z+c, Φ_2 = z²+z+c+1.
 * The multiplier polynomials follow (they eliminate z by a resultant). Pure module — no DOM / GL.
 */
import { makeDurandKerner, tupleAlgebra, type ComplexTuple } from "@cas/core";
import { BiPoly, Gauss, primitivePoly, QiPoly, renderBiPolyText, renderQiPolyText, resultant } from "@cas/exact";

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
 * Numeric roots of an exact ℚ(i)[c] polynomial, via @cas/core's Durand–Kerner (seeded on a Cauchy-bound
 * circle; the linear case is closed-form). Bridges the exact engine to the numeric plane — the c where an
 * exact component-data polynomial vanishes (centers, root points, period-doubling points).
 */
function rootsOfQiPoly(p: QiPoly): ComplexTuple[] {
  const deg = p.degree();
  if (deg < 1) return [];
  const coeffs = p.coeffs.map((c) => c.toTuple());
  const lead = coeffs[deg] ?? [1, 0];
  if (deg === 1) return [A.neg(A.div(coeffs[0] ?? [0, 0], lead))];
  const monic = coeffs.map((c) => A.div(c, lead));
  const evalMonic = (z: ComplexTuple): ComplexTuple => {
    let acc: ComplexTuple = monic[deg] ?? [1, 0];
    for (let k = deg - 1; k >= 0; k--) acc = A.add(A.mul(acc, z), monic[k] ?? [0, 0]);
    return acc;
  };
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

/** The numeric period-n centers — roots of the exact Gleason polynomial G_n. */
export function mandelbrotCenters(n: number): ComplexTuple[] {
  return rootsOfQiPoly(gleasonPolynomial(n));
}

// ── Dynatomic polynomials Φ_n(z,c) — exact period-n points ──────────────────────────────────────────

/** f_cⁿ(z) as an exact BiPoly (outer variable z, inner variable c): the n-fold composition of z ↦ z²+c. */
export function iteratedMap(n: number): BiPoly {
  if (n < 0 || !Number.isInteger(n)) throw new Error("iteratedMap: n must be a non-negative integer");
  const cAsConst = BiPoly.constant(QiPoly.variable()); // c, constant in z
  let z = BiPoly.variable(); // z⁰-orbit starts at z
  for (let k = 0; k < n; k++) z = z.mul(z).add(cAsConst); // z ↦ z² + c
  return z;
}

/**
 * The dynatomic polynomial Φ_n(z,c) — its roots in z (for a fixed c) are the points of *exact* period n of
 * f_c(z) = z²+c. Φ_n = ∏_{d|n} (f_cᵈ(z) − z)^{μ(n/d)}, by exact monic division (each f_cᵈ(z) − z is monic
 * in z). Returned as a BiPoly in z over ℚ[c]. Requires n ≥ 1.
 */
export function dynatomicPolynomial(n: number): BiPoly {
  if (n < 1 || !Number.isInteger(n)) throw new Error("dynatomicPolynomial: n must be a positive integer");
  const zVar = BiPoly.variable();
  let num = BiPoly.constant(QiPoly.constant(Gauss.ONE));
  let den = BiPoly.constant(QiPoly.constant(Gauss.ONE));
  for (const d of divisors(n)) {
    const mu = mobius(n / d);
    const g = iteratedMap(d).sub(zVar); // f_cᵈ(z) − z, monic in z
    if (mu === 1) num = num.mul(g);
    else if (mu === -1) den = den.mul(g);
  }
  return num.divExactMonic(den);
}

/** deg_z Φ_n — the number of points of exact period n (2, 2, 6, 12, … for n = 1, 2, 3, 4). */
export function dynatomicDegreeInZ(n: number): number {
  return dynatomicPolynomial(n).degree();
}

/** Φ_n(z,c) as a readable string, e.g. "z^2 - z + c". */
export function dynatomicText(n: number): string {
  return renderBiPolyText(dynatomicPolynomial(n), "z", "c");
}

// ── Multiplier polynomials (by specialization) ──────────────────────────────────────────────────────
//
// The multiplier of a period-n cycle is λ = (f_cⁿ)′ evaluated at any cycle point. The full multiplier
// surface δ_n(λ, c) needs elimination over ℚ[c, λ] (two parameters) — beyond this single-parameter engine —
// but its SPECIALIZATIONS to a fixed rational λ₀ are exactly computable by eliminating z between the
// dynatomic Φ_n(z,c) and (f_cⁿ)′(z) − λ₀, a resultant over ℚ[c] alone:
//
//   M_{n,λ₀}(c) = Res_z( Φ_n(z,c),  (f_cⁿ)′(z) − λ₀ ).
//
// Its roots in c are the parameters where a period-n cycle has multiplier exactly λ₀:
//   λ₀ = 0  → the CENTERS      (∝ the Gleason polynomial G_n — a cross-check);
//   λ₀ = 1  → the ROOT POINTS  (parabolic; the cusp where a period-n component meets its parent —
//             period 1 gives 4c − 1 ⇒ c = 1/4, the cusp of the main cardioid);
//   λ₀ = −1 → the PERIOD-DOUBLING points (period 1 gives 4c + 3 ⇒ c = −3/4, the cardioid→period-2 bifurcation).
//
// ⚠ Honest scope: the full δ_n(λ, c) surface is NOT built here, and the TRICORN's multiplier is
// anti-holomorphic — its odd-period components are governed by the critical-VALUE map, not this holomorphic
// multiplier (docs/ALGEBRA_EXTENSIONS.md; RISKS.md). These specializations are for the holomorphic z²+c.

/** (f_cⁿ)′(z) = ∏_{k=0}^{n-1} 2·f_cᵏ(z), as an exact BiPoly (z over ℚ[c]). */
export function multiplierMap(n: number): BiPoly {
  if (n < 1 || !Number.isInteger(n)) throw new Error("multiplierMap: n must be a positive integer");
  let prod = BiPoly.constant(QiPoly.constant(Gauss.ONE));
  const two = QiPoly.int(2);
  for (let k = 0; k < n; k++) prod = prod.mul(iteratedMap(k).scaleInner(two)); // 2·f_cᵏ(z)
  return prod;
}

/**
 * The multiplier-specialization polynomial M_{n,λ₀}(c) = Res_z(Φ_n, (f_cⁿ)′ − λ₀), content-cleared. Its
 * roots in c are the parameters where a period-n cycle has multiplier λ₀ (Gaussian-rational).
 */
export function multiplierSpecializationPoly(n: number, lambda0: Gauss): QiPoly {
  const phi = dynatomicPolynomial(n);
  const mMinus = multiplierMap(n).sub(BiPoly.constant(QiPoly.constant(lambda0)));
  return primitivePoly(resultant(phi.coeffs, mMinus.coeffs));
}

/** The exact root-point polynomial (period-n cycles with multiplier 1 — the parabolic cusps of the
 *  period-n components). */
export function rootPointPoly(n: number): QiPoly {
  return multiplierSpecializationPoly(n, Gauss.ONE);
}

/** The exact period-doubling polynomial (period-n cycles with multiplier −1). */
export function periodDoublingPoly(n: number): QiPoly {
  return multiplierSpecializationPoly(n, Gauss.int(-1));
}

/**
 * Numeric c-values where a period-n cycle has multiplier λ₀ — the DISTINCT parabolic parameters. The
 * specialization polynomial is Res_z(Φ_n, (f_cⁿ)′ − λ₀) = ∏_cycles(λ_cyc − λ₀)ⁿ, a perfect n-th power, so
 * we take its squarefree part first (otherwise each parameter appears n-fold and Durand–Kerner scatters
 * the repeated roots).
 */
export function multiplierSpecializationRoots(n: number, lambda0: Gauss): ComplexTuple[] {
  return rootsOfQiPoly(multiplierSpecializationPoly(n, lambda0).squarefreePart());
}
