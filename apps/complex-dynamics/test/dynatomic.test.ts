// Roadmap #17 — exact Gleason polynomials G_n(c) (Mandelbrot period-n centers) on @cas/exact. Locks the
// Möbius-inversion build against primary-source goldens, and checks the numeric centers are genuine roots.
import { describe, expect, it } from "vitest";
import { Gauss, QiPoly } from "@cas/exact";
import {
  criticalOrbit,
  divisors,
  gleasonDegree,
  gleasonPolynomial,
  gleasonText,
  mandelbrotCenters,
  mobius,
} from "../src/combinatorics/dynatomic";

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
