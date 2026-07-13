// @cas/exact unit tests — the exact-arithmetic primitives in isolation (the domain goldens that exercise
// them end-to-end live with their consumers: the correspondence curve in apps/correspondences, the
// dynatomic/Gleason polynomials in apps/complex-dynamics).
import { describe, it, expect } from "vitest";
import { Frac, Gauss, QiPoly, renderGaussMag, renderQiPolyText } from "../src/index.js";

describe("Frac (ℚ over BigInt)", () => {
  it("normalizes to lowest terms with a positive denominator", () => {
    expect(Frac.of(2n, 4n).n).toBe(1n);
    expect(Frac.of(2n, 4n).d).toBe(2n);
    expect(Frac.of(1n, -2n).n).toBe(-1n);
    expect(Frac.of(1n, -2n).d).toBe(2n);
  });
  it("arithmetic", () => {
    expect(Frac.of(1n, 2n).add(Frac.of(1n, 3n)).equals(Frac.of(5n, 6n))).toBe(true);
    expect(Frac.of(2n, 3n).mul(Frac.of(3n, 4n)).equals(Frac.of(1n, 2n))).toBe(true);
    expect(Frac.of(1n).div(Frac.of(3n)).equals(Frac.of(1n, 3n))).toBe(true);
  });
});

describe("Gauss (ℚ(i)) is a field", () => {
  it("multiplies and conjugates", () => {
    // (1+i)(1−i) = 2
    expect(Gauss.int(1, 1).mul(Gauss.int(1, -1)).equals(Gauss.int(2))).toBe(true);
    expect(Gauss.int(3, 4).conj().equals(Gauss.int(3, -4))).toBe(true);
    expect(Gauss.int(3, 4).norm2().equals(Frac.of(25n))).toBe(true);
  });
  it("every nonzero element is invertible (z · z⁻¹ = 1)", () => {
    for (const z of [Gauss.int(2), Gauss.I, Gauss.int(1, 1), Gauss.rat(3n, 5n, -7n, 4n)]) {
      expect(z.mul(z.inv()).equals(Gauss.ONE)).toBe(true);
    }
    expect(() => Gauss.ZERO.inv()).toThrow();
  });
});

describe("QiPoly (exact univariate over ℚ(i))", () => {
  const x = QiPoly.variable();
  const c = (n: number) => QiPoly.int(n);

  it("builds, trims, and reports degree", () => {
    expect(QiPoly.fromCoeffs([Gauss.int(1), Gauss.ZERO, Gauss.ZERO]).degree()).toBe(0);
    expect(QiPoly.zero().isZero()).toBe(true);
    expect(x.degree()).toBe(1);
    expect(QiPoly.monomial(3, Gauss.int(2)).equals(x.pow(3).scale(Gauss.int(2)))).toBe(true);
  });

  it("multiplies: (x+1)(x−1) = x²−1", () => {
    const got = x.add(c(1)).mul(x.sub(c(1)));
    expect(got.equals(x.pow(2).sub(c(1)))).toBe(true);
  });

  it("divmod over the field, and exact division", () => {
    // (x²−1) = (x−1)(x+1) exactly
    const { q, r } = x.pow(2).sub(c(1)).divmod(x.sub(c(1)));
    expect(r.isZero()).toBe(true);
    expect(q.equals(x.add(c(1)))).toBe(true);
    // x²+1 divided by x−1 leaves remainder 2
    const dm = x.pow(2).add(c(1)).divmod(x.sub(c(1)));
    expect(dm.q.equals(x.add(c(1)))).toBe(true);
    expect(dm.r.equals(c(2))).toBe(true);
    expect(() => x.pow(2).add(c(1)).divExact(x.sub(c(1)))).toThrow();
  });

  it("divideByVar peels a factor of the variable exactly", () => {
    // (2x³ − x²) / x = 2x² − x
    expect(x.pow(3).scale(Gauss.int(2)).sub(x.pow(2)).divideByVar().equals(x.pow(2).scale(Gauss.int(2)).sub(x))).toBe(true);
    expect(() => x.add(c(1)).divideByVar()).toThrow(); // nonzero constant term
  });

  it("Horner evaluation", () => {
    // (x²+1) at i = 0
    expect(x.pow(2).add(c(1)).eval(Gauss.I).isZero()).toBe(true);
  });
});

describe("QiPoly derivative / gcd / squarefree", () => {
  const x = QiPoly.variable();
  const c = (n: number) => QiPoly.int(n);

  it("derivative: d/dx(x³ + 2x) = 3x² + 2", () => {
    expect(x.pow(3).add(x.scale(Gauss.int(2))).derivative().equals(x.pow(2).scale(Gauss.int(3)).add(c(2)))).toBe(true);
  });

  it("monic GCD: gcd((x−1)(x−2), (x−1)(x−3)) = x−1", () => {
    const a = x.sub(c(1)).mul(x.sub(c(2)));
    const b = x.sub(c(1)).mul(x.sub(c(3)));
    expect(a.gcd(b).equals(x.sub(c(1)))).toBe(true);
  });

  it("squarefreePart collapses (x−1)²(x−2) to (x−1)(x−2)", () => {
    const p = x.sub(c(1)).pow(2).mul(x.sub(c(2)));
    expect(p.squarefreePart().equals(x.sub(c(1)).mul(x.sub(c(2))))).toBe(true);
    // an already-squarefree polynomial is returned unchanged (up to being monic here).
    expect(x.sub(c(1)).mul(x.sub(c(2))).squarefreePart().equals(x.sub(c(1)).mul(x.sub(c(2))))).toBe(true);
  });
});

describe("rendering", () => {
  it("renderQiPolyText formats a polynomial in a named variable", () => {
    const c = QiPoly.variable();
    const poly = c.pow(3).add(c.pow(2).scale(Gauss.int(2))).add(c).add(QiPoly.int(1)); // c³+2c²+c+1
    expect(renderQiPolyText(poly, "c")).toBe("c^3 + 2 c^2 + c + 1");
  });
  it("renderGaussMag splits sign and magnitude", () => {
    expect(renderGaussMag(Gauss.int(-3))).toEqual({ sign: -1, mag: "3", isUnit: false });
    expect(renderGaussMag(Gauss.int(1))).toEqual({ sign: 1, mag: "1", isUnit: true });
    expect(renderGaussMag(Gauss.I)).toEqual({ sign: 1, mag: "i", isUnit: false });
  });
});
