// Roadmap #17 — exact Gleason polynomials G_n(c) (Mandelbrot period-n centers) on @cas/exact. Locks the
// Möbius-inversion build against primary-source goldens, and checks the numeric centers are genuine roots.
import { describe, expect, it } from "vitest";
import { BiPoly, Gauss, QiPoly } from "@cas/exact";
import {
  criticalOrbit,
  divisors,
  dynatomicDegreeInZ,
  dynatomicPolynomial,
  dynatomicText,
  gleasonDegree,
  gleasonPolynomial,
  gleasonText,
  iteratedMap,
  mandelbrotCenters,
  mobius,
  multiplierMap,
  multiplierSpecializationPoly,
  multiplierSpecializationRoots,
  periodDoublingPoly,
  rootPointPoly,
} from "../src/combinatorics/dynatomic";

// Is a target complex value among the numeric roots?
const hasRoot = (roots: [number, number][], re: number, im = 0): boolean =>
  roots.some((r) => Math.hypot(r[0] - re, r[1] - im) < 1e-8);

const c = QiPoly.variable();
const int = (n: number) => QiPoly.int(n);

// |value of the monic float polynomial (little-endian tuple coeffs) at z|, for the "is a root" check.
const evalAbs = (coeffs: [number, number][], z: [number, number]): number => {
  let re = coeffs[coeffs.length - 1]?.[0] ?? 0;
  let im = coeffs[coeffs.length - 1]?.[1] ?? 0;
  for (let k = coeffs.length - 2; k >= 0; k--) {
    const nr = re * z[0] - im * z[1] + (coeffs[k]?.[0] ?? 0);
    const ni = re * z[1] + im * z[0] + (coeffs[k]?.[1] ?? 0);
    re = nr;
    im = ni;
  }
  return Math.hypot(re, im);
};

describe("number theory helpers", () => {
  it("mobius", () => {
    expect([1, 2, 3, 4, 5, 6, 12].map(mobius)).toEqual([1, -1, -1, 0, -1, 1, 0]);
  });
  it("divisors", () => {
    expect(divisors(12)).toEqual([1, 2, 3, 4, 6, 12]);
  });
});

describe("Gleason polynomials G_n(c) — Mandelbrot period-n centers", () => {
  it("critical orbit p_k = f_cᵏ(0) is monic of degree 2^{k-1}", () => {
    const p = criticalOrbit(4);
    expect(p[0].isZero()).toBe(true);
    expect(p[1].equals(c)).toBe(true); // p_1 = c
    expect(p[2].equals(c.pow(2).add(c))).toBe(true); // p_2 = c²+c
    expect(p[3].degree()).toBe(4);
    expect(p[4].degree()).toBe(8);
  });

  it("matches the primary-source goldens G_1..G_4", () => {
    expect(gleasonPolynomial(1).equals(c)).toBe(true); // c
    expect(gleasonPolynomial(2).equals(c.add(int(1)))).toBe(true); // c + 1
    // c³ + 2c² + c + 1
    expect(gleasonPolynomial(3).equals(c.pow(3).add(c.pow(2).scale(Gauss.int(2))).add(c).add(int(1)))).toBe(true);
    // c⁶ + 3c⁵ + 3c⁴ + 3c³ + 2c² + 1
    const g4 = c
      .pow(6)
      .add(c.pow(5).scale(Gauss.int(3)))
      .add(c.pow(4).scale(Gauss.int(3)))
      .add(c.pow(3).scale(Gauss.int(3)))
      .add(c.pow(2).scale(Gauss.int(2)))
      .add(int(1));
    expect(gleasonPolynomial(4).equals(g4)).toBe(true);
  });

  it("has the known component counts (deg G_n) for n = 1..6", () => {
    expect([1, 2, 3, 4, 5, 6].map(gleasonDegree)).toEqual([1, 1, 3, 6, 15, 27]);
  });

  it("renders readably", () => {
    expect(gleasonText(3)).toBe("c^3 + 2 c^2 + c + 1");
  });

  it("numeric centers: period 1 → 0, period 2 → −1, and every center is a root of G_n", () => {
    expect(mandelbrotCenters(1)).toHaveLength(1);
    expect(mandelbrotCenters(1)[0][0]).toBeCloseTo(0, 9);
    expect(mandelbrotCenters(2)[0][0]).toBeCloseTo(-1, 9);
    for (const n of [3, 4, 5]) {
      const g = gleasonPolynomial(n);
      const coeffs = g.coeffs.map((k) => k.toTuple());
      const centers = mandelbrotCenters(n);
      expect(centers).toHaveLength(g.degree());
      for (const ctr of centers) expect(evalAbs(coeffs, ctr)).toBeLessThan(1e-7);
    }
  });
});

describe("Dynatomic polynomials Φ_n(z,c) — exact period-n points", () => {
  const z = BiPoly.variable();
  const cc = BiPoly.constant(QiPoly.variable()); // c, constant in z

  it("iterates f_c: f²(z) = z⁴ + 2c·z² + (c²+c)", () => {
    const f2 = iteratedMap(2);
    expect(f2.degree()).toBe(4);
    expect(f2.coeff(4).equals(QiPoly.constant(Gauss.ONE))).toBe(true);
    expect(f2.coeff(2).equals(c.scale(Gauss.int(2)))).toBe(true); // 2c
    expect(f2.coeff(0).equals(c.pow(2).add(c))).toBe(true); // c²+c
  });

  it("matches the goldens Φ_1 = z²−z+c and Φ_2 = z²+z+c+1", () => {
    expect(dynatomicPolynomial(1).equals(z.pow(2).sub(z).add(cc))).toBe(true);
    expect(dynatomicPolynomial(2).equals(z.pow(2).add(z).add(BiPoly.constant(QiPoly.variable().add(QiPoly.int(1)))))).toBe(true);
    expect(dynatomicText(1)).toBe("z^2 - z + c");
    expect(dynatomicText(2)).toBe("z^2 + z + c + 1");
  });

  it("has the known period-point counts deg_z Φ_n = 2,2,6,12 for n = 1..4", () => {
    expect([1, 2, 3, 4].map(dynatomicDegreeInZ)).toEqual([2, 2, 6, 12]);
  });

  it("Φ_3 divides f³(z) − z exactly (its roots are period-3 points)", () => {
    const f3MinusZ = iteratedMap(3).sub(z);
    // Φ_1 · Φ_3 = f³(z) − z  (the period-3 points are those of exact period 1 or 3)
    const prod = dynatomicPolynomial(1).mul(dynatomicPolynomial(3));
    expect(prod.equals(f3MinusZ)).toBe(true);
  });
});

describe("Multiplier-specialization polynomials", () => {
  const z = BiPoly.variable();

  it("multiplier maps: (f)′ = 2z, (f²)′ = 4z³ + 4c·z", () => {
    expect(multiplierMap(1).equals(z.scaleInner(QiPoly.int(2)))).toBe(true);
    const m2 = z.pow(3).scaleInner(QiPoly.int(4)).add(z.scaleInner(c.scale(Gauss.int(4))));
    expect(multiplierMap(2).equals(m2)).toBe(true);
  });

  it("period-1: centers ∝ G_1, root point 4c−1 (c = 1/4 cardioid cusp), doubling 4c+3 (c = −3/4)", () => {
    expect(multiplierSpecializationPoly(1, Gauss.ZERO).equals(c)).toBe(true); // λ=0 → c (= G_1)
    expect(rootPointPoly(1).equals(c.scale(Gauss.int(4)).sub(QiPoly.int(1)))).toBe(true); // 4c − 1
    expect(periodDoublingPoly(1).equals(c.scale(Gauss.int(4)).add(QiPoly.int(3)))).toBe(true); // 4c + 3
    expect(hasRoot(multiplierSpecializationRoots(1, Gauss.ONE), 0.25)).toBe(true); // cardioid cusp
    expect(hasRoot(multiplierSpecializationRoots(1, Gauss.int(-1)), -0.75)).toBe(true); // period-1→2 bifurcation
  });

  it("period-2: a single root point c = −3/4 (bulb meets the cardioid), doubling c = −5/4", () => {
    // squarefree ⇒ each distinct parabolic parameter appears once (not the n-fold resultant multiplicity).
    const rp = multiplierSpecializationRoots(2, Gauss.ONE);
    expect(rp).toHaveLength(1);
    expect(hasRoot(rp, -0.75)).toBe(true);
    const pd = multiplierSpecializationRoots(2, Gauss.int(-1));
    expect(pd).toHaveLength(1);
    expect(hasRoot(pd, -1.25)).toBe(true);
  });

  it("period-3 has 3 distinct root points (one per period-3 component: airplane + rabbit pair)", () => {
    const rp = multiplierSpecializationRoots(3, Gauss.ONE);
    expect(rp).toHaveLength(3);
    // one real (the airplane) and a complex-conjugate pair (rabbit / corabbit).
    expect(rp.filter((r) => Math.abs(r[1]) < 1e-6)).toHaveLength(1);
  });
});
