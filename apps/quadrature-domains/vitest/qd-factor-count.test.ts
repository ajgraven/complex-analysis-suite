// Roadmap #19 (multivariate factorizer) Phase 2 — Gao's ABSOLUTE bivariate factor count over ℚ(i):
// the dimension of the Ruppert closedness-PDE solution space = # absolutely-irreducible factors.
// See docs/MULTIVARIATE_FACTORING.md §5. Pure engine; the goldens are the Phase-0 spike battery, so
// this test is also the in-tree record of what that (transient) scratch spike validated exactly.
import { describe, it, expect } from "vitest";
import _QD from "../app/solver.mjs";
import "../app/sym-core.mjs";

const S: any = (_QD as any).Sym;
const { MPoly, bivariateAbsFactorCount, isAbsolutelyIrreducible } = S;

const x = MPoly.variable("x");
const y = MPoly.variable("y");
const z = MPoly.variable("z");
const I = (k: number) => MPoly.fromInt(k);

// The battery, with its known count of factors over ℂ.
const x2my2 = x.pow(2).sub(y.pow(2)); //            (x−y)(x+y)                     → 2
const x2py2 = x.pow(2).add(y.pow(2)); //            (x−iy)(x+iy)  [splits over ℚ(i)] → 2
const x4my4 = x.pow(4).sub(y.pow(4)); //            (x−y)(x+y)(x−iy)(x+iy)          → 4
const threeLines = x.sub(y).mul(x.add(y)).mul(x.add(I(2).mul(y))); // (x−y)(x+y)(x+2y) → 3
const conic = x.pow(2).add(y.pow(2)).sub(I(1)); //  x²+y²−1  irreducible            → 1
const cubic = y.pow(2).sub(x.pow(3)).sub(x); //     y²−x³−x  irreducible            → 1
const x2m2y2 = x.pow(2).sub(I(2).mul(y.pow(2))); // x²−2y²  abs-reducible, ℚ(i)-IRRED → 2

describe("bivariateAbsFactorCount — Gao's Ruppert-nullspace absolute (over-ℂ) count", () => {
  it("x² − y² → 2", () => { expect(bivariateAbsFactorCount(x2my2, "x", "y")).toBe(2); });
  it("x² + y² → 2 (splits over ℚ(i))", () => { expect(bivariateAbsFactorCount(x2py2, "x", "y")).toBe(2); });
  it("x⁴ − y⁴ → 4", () => { expect(bivariateAbsFactorCount(x4my4, "x", "y")).toBe(4); });
  it("(x−y)(x+y)(x+2y) → 3", () => { expect(bivariateAbsFactorCount(threeLines, "x", "y")).toBe(3); });
  it("x² + y² − 1 → 1 (irreducible conic)", () => { expect(bivariateAbsFactorCount(conic, "x", "y")).toBe(1); });
  it("y² − x³ − x → 1 (irreducible cubic)", () => { expect(bivariateAbsFactorCount(cubic, "x", "y")).toBe(1); });

  // The honest-labelling case: ABSOLUTE count is 2, but the factors (x ± √2·y) live over ℚ(√2), NOT
  // ℚ(i) — so this curve is IRREDUCIBLE over ℚ(i). The count function reports the over-ℂ number; the
  // ℚ(i)-rational split is Phase 3.
  it("x² − 2y² → 2 (absolute), while remaining ℚ(i)-irreducible", () => {
    expect(bivariateAbsFactorCount(x2m2y2, "x", "y")).toBe(2);
  });

  it("is symmetric in the choice of main variable (swap x↔y roles) → still 3", () => {
    expect(bivariateAbsFactorCount(threeLines, "y", "x")).toBe(3);
  });

  it("strips pure-y content: y·(x²+y²−1) → 1 (the extra y factor is not counted)", () => {
    const withContent = y.mul(conic);
    expect(bivariateAbsFactorCount(withContent, "x", "y")).toBe(1);
  });
});

describe("isAbsolutelyIrreducible — count === 1", () => {
  it("true for the irreducible conic and cubic", () => {
    expect(isAbsolutelyIrreducible(conic, "x", "y")).toBe(true);
    expect(isAbsolutelyIrreducible(cubic, "x", "y")).toBe(true);
  });
  it("false for reducible curves", () => {
    expect(isAbsolutelyIrreducible(x2my2, "x", "y")).toBe(false);
    expect(isAbsolutelyIrreducible(x4my4, "x", "y")).toBe(false);
  });
  // Absolute irreducibility is STRONGER than ℚ(i)-irreducibility: x²−2y² is ℚ(i)-irreducible but NOT
  // absolutely irreducible, so this correctly returns false (it is not "one factor over ℂ").
  it("false for x²−2y² (ℚ(i)-irreducible but splits over ℂ)", () => {
    expect(isAbsolutelyIrreducible(x2m2y2, "x", "y")).toBe(false);
  });
});

describe("preconditions are thrown, not silently coerced", () => {
  it("rejects the zero polynomial", () => {
    expect(() => bivariateAbsFactorCount(MPoly.zero(), "x", "y")).toThrow(/zero/);
  });
  it("rejects a non-bivariate input (a third variable present)", () => {
    const trivar = x.pow(2).add(y.pow(2)).add(z.pow(2));
    expect(() => bivariateAbsFactorCount(trivar, "x", "y")).toThrow(/bivariate/);
  });
  it("rejects a non-squarefree curve ((x−y)² has a repeated factor)", () => {
    expect(() => bivariateAbsFactorCount(x.sub(y).pow(2), "x", "y")).toThrow(/squarefree/);
  });
  it("rejects a single-variable input (x²−1, no y after content strip)", () => {
    expect(() => bivariateAbsFactorCount(x.pow(2).sub(I(1)), "x", "y")).toThrow(/positive degree/);
  });
  it("rejects xVar === yVar", () => {
    expect(() => bivariateAbsFactorCount(x2my2, "x", "x")).toThrow(/must differ/);
  });
});
