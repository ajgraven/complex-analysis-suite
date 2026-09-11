import { describe, expect, it } from "vitest";
import { Frac, Gauss, QiPoly, SqrtExt } from "@cas/exact";
import { parse } from "@cas/expr";
import { evalSqrt, exactPolesOf, splitRoots, weightedSum } from "../src/kernel/algebraic.js";
import { toExactRational } from "../src/kernel/exactRational.js";
import { rootsOfQiPoly } from "./helpers/rootsOfQiPoly.js";

const g = (re: number, im = 0): Gauss => new Gauss(Frac.of(BigInt(re)), Frac.of(BigInt(im)));
const poly = (...coeffs: number[]): QiPoly => QiPoly.fromCoeffs(coeffs.map((c) => g(c)));
const exact = (src: string) => {
  const r = toExactRational(parse(src));
  if (!r.ok) throw new Error(r.reason);
  return r.value;
};
const near = (x: SqrtExt, re: number, im: number, tol = 1e-12): boolean => {
  const [a, b] = x.toTuple();
  return Math.hypot(a - re, b - im) < tol;
};

describe("splitRoots", () => {
  const rootsSatisfy = (F: QiPoly, roots: readonly SqrtExt[]): void => {
    expect(roots).toHaveLength(F.degree());
    // The only check that matters: each root is exactly a root, in exact arithmetic.
    for (const r of roots) expect(evalSqrt(F, r).isZero()).toBe(true);
  };

  it("solves linear and quadratic factors", () => {
    const linear = splitRoots(poly(-3, 1));
    expect(linear?.[0].asGauss()?.equals(g(3))).toBe(true);

    const quad = splitRoots(poly(1, 0, 1)); // z² + 1
    expect(quad).not.toBeNull();
    if (quad) {
      rootsSatisfy(poly(1, 0, 1), quad);
      expect(quad.every((r) => r.isRational())).toBe(true); // ±i are in ℚ(i)
    }
  });

  it("reaches an irrational quadratic: z² − 2 gives ±√2", () => {
    const F = poly(-2, 0, 1);
    const roots = splitRoots(F);
    expect(roots).not.toBeNull();
    if (!roots) return;
    rootsSatisfy(F, roots);
    expect(roots[0].d).toBe(2n);
    expect(near(roots[0], Math.SQRT2, 0) || near(roots[1], Math.SQRT2, 0)).toBe(true);
  });

  it("splits z⁴ + 1 into its four eighth-roots of −1 — the M2 gate's polynomial", () => {
    // z⁴ + 1 = (z² − i)(z² + i) because √(−1) = i lands in ℚ(i); each half is then a quadratic,
    // and the roots (±1±i)/√2 live in ℚ(i)(√2).
    const F = poly(1, 0, 0, 0, 1);
    const roots = splitRoots(F);
    expect(roots).not.toBeNull();
    if (!roots) return;
    rootsSatisfy(F, roots);
    expect(roots.every((r) => r.d === 2n)).toBe(true);
    for (const k of [1, 3, 5, 7]) {
      const th = (k * Math.PI) / 4;
      expect(roots.some((r) => near(r, Math.cos(th), Math.sin(th), 1e-12))).toBe(true);
    }
  });

  it("splits z⁸ − 1 by recursing on the binomial", () => {
    const F = QiPoly.monomial(8).sub(QiPoly.int(1));
    const roots = splitRoots(F);
    expect(roots).not.toBeNull();
    if (roots) rootsSatisfy(F, roots);
  });

  it("declines a general cubic rather than inventing a form for it", () => {
    expect(splitRoots(poly(-1, -1, 0, 1))).toBeNull(); // z³ − z − 1, the plastic number
    expect(splitRoots(poly(1, 1, 1, 1, 1))).toBeNull();
  });
});

describe("exactPolesOf", () => {
  const report = (src: string) => {
    const { num, den } = exact(src);
    return exactPolesOf(num, den, rootsOfQiPoly);
  };

  it("still handles everything the ℚ(i) path did", () => {
    for (const [src, count] of [
      ["1/z", 1],
      ["1/(1+z^2)", 2],
      ["1/(z-1)^2", 1],
      ["z/(z^2+2*z+2)", 2],
    ] as const) {
      const r = report(src);
      expect(r.complete).toBe(true);
      expect(r.poles).toHaveLength(count);
    }
  });

  it("pins 1/(1+z⁴) — four algebraic poles in ℚ(i)(√2)", () => {
    const r = report("1/(1+z^4)");
    expect(r.complete).toBe(true);
    expect(r.poles).toHaveLength(4);
    expect(r.radicand).toBe(2n);
    // Res(1/(1+z⁴), α) = 1/(4α³) = −α/4, since α⁴ = −1.
    for (const p of r.poles) {
      expect(p.residue.equals(p.at.div(SqrtExt.fromGauss(g(-4))))).toBe(true);
    }
  });

  it("gives Σ over the upper half-plane = −i√2/4 — whence ∮ = π√2/2", () => {
    const r = report("1/(1+z^4)");
    const sum = weightedSum(r.poles, (at) => (at.toTuple()[1] > 0 ? 1 : 0));
    // −i√2/4 as an element of ℚ(i)(√2): a = 0, b = −i/4, d = 2.
    expect(sum.d).toBe(2n);
    expect(sum.a.isZero()).toBe(true);
    expect(sum.b.equals(new Gauss(Frac.ZERO, Frac.of(-1n, 4n)))).toBe(true);
    // 2πi · (−i√2/4) = π√2/2.
    const [, im] = sum.toTuple();
    expect(-2 * Math.PI * im).toBeCloseTo(Math.PI / Math.SQRT2, 12);
  });

  it("handles z³ − 1: one rational root and a quadratic in ℚ(i)(√3)", () => {
    const r = report("1/(z^3-1)");
    expect(r.complete).toBe(true);
    expect(r.poles).toHaveLength(3);
    expect(r.radicand).toBe(3n);
    // Total residue is zero: deg den − deg num = 3 ≥ 2.
    const total = weightedSum(r.poles, () => 1);
    expect(total.isZero()).toBe(true);
  });

  it("declines when the poles would need ℚ(√2, √3)", () => {
    // The right outcome, though not by the route the name suggests: (z²−2)(z²−3) arrives as ONE
    // squarefree factor of degree 4, which is neither a quadratic nor an even binomial, so
    // `splitRoots` declines it before any question of mixing extensions arises. (Deleting the
    // `sameExtension` check at the end of `exactPolesOf` leaves this test green, which is how that
    // was found — see the comment there.)
    const r = report("1/((z^2-2)*(z^2-3))");
    expect(r.complete).toBe(false);
    expect(r.poles).toEqual([]);
    expect(splitRoots(exact("1/((z^2-2)*(z^2-3))").den)).toBeNull();
  });

  it("declines a repeated ALGEBRAIC pole, which needs series over the extension", () => {
    const r = report("1/(z^2-2)^2");
    expect(r.complete).toBe(false);
  });

  it("declines a general quintic", () => {
    expect(report("1/(z^5-z-1)").complete).toBe(false);
  });

  it("cancels removable singularities before doing any of this", () => {
    const r = report("(z^2-2)/((z^2-2)*(z-5))");
    expect(r.complete).toBe(true);
    expect(r.poles).toHaveLength(1);
    expect(r.removableDegree).toBe(2);
  });
});
