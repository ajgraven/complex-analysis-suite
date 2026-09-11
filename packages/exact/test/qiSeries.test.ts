import { describe, expect, it } from "vitest";
import { Frac, Gauss } from "../src/gaussian.js";
import { QiPoly, extendedGcd, invMod } from "../src/qiPoly.js";
import { seriesFromPoly, seriesInverse, seriesMul, splitOrder } from "../src/qiSeries.js";
import { multiplicityAt, yunSquarefree } from "../src/squarefree.js";

const g = (re: number, im = 0): Gauss => new Gauss(Frac.of(BigInt(re)), Frac.of(BigInt(im)));
const poly = (...coeffs: number[]): QiPoly => QiPoly.fromCoeffs(coeffs.map((c) => g(c)));
const I = g(0, 1);

describe("QiPoly.shift", () => {
  it("reproduces p(z + a) coefficient for coefficient", () => {
    // (z+1)² = z² + 2z + 1, so shifting z² by 1 gives exactly that.
    expect(poly(0, 0, 1).shift(g(1)).equals(poly(1, 2, 1))).toBe(true);
    // Shifting back is the inverse.
    const p = poly(3, -2, 0, 5);
    expect(p.shift(g(7)).shift(g(-7)).equals(p)).toBe(true);
  });

  it("shifts by a Gaussian integer, where a real-only implementation would be wrong", () => {
    // z² + 1 = (z − i)(z + i); shifting by i must produce a polynomial with a zero constant term.
    const shifted = poly(1, 0, 1).shift(I);
    expect(shifted.coeff(0).isZero()).toBe(true);
    expect(shifted.coeff(1).equals(I.mul(g(2)))).toBe(true);
  });

  it("agrees with evaluation: p(z+a) at 0 is p(a)", () => {
    const p = poly(1, -4, 0, 2, 7);
    for (const a of [g(0), g(3), g(-2), I, g(1, -5)]) {
      expect(p.shift(a).coeff(0).equals(p.eval(a))).toBe(true);
    }
  });
});

describe("extendedGcd / invMod", () => {
  it("returns cofactors satisfying s·a + t·b = g", () => {
    const a = poly(-1, 0, 1); // z² − 1
    const b = poly(1, 1); // z + 1
    const { g: gcd, s, t } = extendedGcd(a, b);
    expect(s.mul(a).add(t.mul(b)).equals(gcd)).toBe(true);
    expect(gcd.equals(b.monic())).toBe(true);
  });

  it("inverts a unit modulo an irreducible, so P/Q′ can be evaluated without naming the root", () => {
    // This is the residue computation in miniature: Q = z² + 1, Q′ = 2z, and (2z)⁻¹ mod Q exists
    // because Q is squarefree — so 1/Q′ makes sense in ℚ(i)[z]/⟨Q⟩ even though the roots are ±i.
    const Q = poly(1, 0, 1);
    const dQ = Q.derivative();
    const inv = invMod(dQ, Q);
    expect(inv).not.toBeNull();
    if (inv) expect(inv.mul(dQ).divmod(Q).r.equals(QiPoly.int(1))).toBe(true);
  });

  it("returns null exactly when the polynomial is NOT squarefree — a real answer, not a failure", () => {
    // Q = (z−1)² has Q′ sharing the factor (z−1), so the P/Q′ shortcut genuinely does not apply and
    // the caller must take the higher-order route.
    const Q = poly(1, -2, 1);
    expect(invMod(Q.derivative(), Q)).toBeNull();
  });
});

describe("series", () => {
  it("multiplies truncated series", () => {
    // (1 + z)(1 − z) = 1 − z², truncated to 3 terms.
    const a = [g(1), g(1), g(0)];
    const b = [g(1), g(-1), g(0)];
    const c = seriesMul(a, b, 3);
    expect(c[0].equals(g(1))).toBe(true);
    expect(c[1].isZero()).toBe(true);
    expect(c[2].equals(g(-1))).toBe(true);
  });

  it("inverts a series, verified by multiplying back to 1", () => {
    for (const p of [poly(1, 1), poly(2, -3, 5), poly(1, 0, 0, 7)]) {
      const n = 8;
      const c = seriesFromPoly(p, n);
      const d = seriesInverse(c, n);
      const product = seriesMul(c, d, n);
      expect(product[0].equals(g(1))).toBe(true);
      for (let k = 1; k < n; k++) expect(product[k].isZero()).toBe(true);
    }
  });

  it("gives the geometric series for 1/(1 − z)", () => {
    const d = seriesInverse(seriesFromPoly(poly(1, -1), 6), 6);
    for (let k = 0; k < 6; k++) expect(d[k].equals(g(1))).toBe(true);
  });

  it("refuses a series with no constant term, which is not invertible", () => {
    expect(() => seriesInverse([g(0), g(1)], 4)).toThrow();
  });

  it("splits the order of vanishing at the origin", () => {
    expect(splitOrder(poly(0, 0, 0, 5, 1)).order).toBe(3);
    expect(splitOrder(poly(7, 1)).order).toBe(0);
    expect(splitOrder(poly(0, 0, 4)).rest.equals(poly(4))).toBe(true);
  });
});

describe("yunSquarefree", () => {
  it("separates multiplicities: (z−1)²(z+2)³", () => {
    const a = poly(-1, 1).pow(2).mul(poly(2, 1).pow(3));
    const parts = yunSquarefree(a);
    const byMult = new Map(parts.map((p) => [p.multiplicity, p.factor]));
    expect(byMult.get(2)?.equals(poly(-1, 1))).toBe(true);
    expect(byMult.get(3)?.equals(poly(2, 1))).toBe(true);
    expect(byMult.has(1)).toBe(false);
  });

  it("reconstructs the input: p = c · Π aₘ^m", () => {
    for (const p of [
      poly(-1, 1).pow(2).mul(poly(2, 1).pow(3)),
      poly(1, 0, 1).mul(poly(0, 1).pow(4)),
      poly(1, 0, 0, 0, 1),
      poly(1, -2, 1),
    ]) {
      let rebuilt = QiPoly.int(1);
      for (const part of yunSquarefree(p)) rebuilt = rebuilt.mul(part.factor.pow(part.multiplicity));
      expect(rebuilt.equals(p.monic())).toBe(true);
    }
  });

  it("reports a squarefree polynomial as entirely multiplicity 1", () => {
    const parts = yunSquarefree(poly(1, 0, 1)); // z² + 1
    expect(parts).toHaveLength(1);
    expect(parts[0].multiplicity).toBe(1);
  });

  it("returns nothing for a constant", () => {
    expect(yunSquarefree(poly(5))).toEqual([]);
  });
});

describe("multiplicityAt", () => {
  it("counts a root's multiplicity exactly, including at a Gaussian point", () => {
    const p = poly(-1, 1).pow(3).mul(poly(1, 0, 1)); // (z−1)³(z²+1)
    expect(multiplicityAt(p, g(1))).toBe(3);
    expect(multiplicityAt(p, I)).toBe(1);
    expect(multiplicityAt(p, g(-1))).toBe(0);
  });

  it("distinguishes a genuine double root from two nearby distinct roots", () => {
    // The distinction a floating root-finder cannot make, and the reason M1's pole order carries
    // `orderCertain`. Here it is decided by exact division.
    const tiny = new Gauss(Frac.of(1n, 10n ** 12n), Frac.ZERO);
    const double = poly(0, 1).pow(2);
    const nearlyDouble = poly(0, 1).mul(QiPoly.fromCoeffs([tiny.neg(), Gauss.ONE]));
    expect(multiplicityAt(double, g(0))).toBe(2);
    expect(multiplicityAt(nearlyDouble, g(0))).toBe(1);
  });
});
