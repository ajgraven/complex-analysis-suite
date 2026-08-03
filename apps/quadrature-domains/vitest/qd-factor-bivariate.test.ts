// Roadmap #19 (multivariate factorizer) Phase 3 — Gao's ℚ(i)-RATIONAL bivariate factorization via the
// resultant-eigenvalue extraction. See docs/MULTIVARIATE_FACTORING.md §5. Pure engine. These goldens are
// the in-tree record of the extraction the Phase-0 spike's identities (C)/(D2) underwrite: the factor SET
// must be exact (`=`), the product must reconstruct the curve, and the field of definition must be right
// (x²+y² splits over ℚ(i); x²−2y² does NOT — it stays ℚ(i)-irreducible).
import { describe, it, expect } from "vitest";
import _QD from "../app/solvers/solver.mjs";
import "../app/sym/sym-core.mjs";

const S: any = (_QD as any).Sym;
const { MPoly, Gaussian, Rational, factorBivariate, factor } = S;

const x = MPoly.variable("x");
const y = MPoly.variable("y");
const z = MPoly.variable("z");
const I = (k: number) => MPoly.fromInt(k);
const iC = MPoly.constant(new Gaussian(Rational.fromInt(0), Rational.fromInt(1))); // the constant polynomial i
const iy = iC.mul(y); // i·y

// Set equality up to nothing (factorBivariate canonicalizes each factor to monic-in-x), so exact .equals.
const sameSet = (actual: any[], expected: any[]): boolean => {
  if (actual.length !== expected.length) return false;
  const used = new Array(actual.length).fill(false);
  for (const e of expected) {
    let hit = -1;
    for (let i = 0; i < actual.length; i++) if (!used[i] && actual[i].sub(e).isZero()) { hit = i; break; }
    if (hit < 0) return false;
    used[hit] = true;
  }
  return true;
};
const hasImag = (p: any): boolean => !p.imagPart().isZero(); // p has a genuinely non-real coefficient

describe("factorBivariate — ℚ(i)-rational factorization (resultant-eigenvalue extraction)", () => {
  it("x² − y² → { x−y, x+y } (real factors)", () => {
    const res = factorBivariate(x.pow(2).sub(y.pow(2)), "x", "y");
    expect(res.ok).toBe(true);
    expect(res.complete).toBe(true);
    expect(res.absoluteCount).toBe(2);
    expect(sameSet(res.factors, [x.sub(y), x.add(y)])).toBe(true);
    expect(res.factors.every(hasImag)).toBe(false); // both real
  });

  it("x² + y² → { x−iy, x+iy } (splits over ℚ(i))", () => {
    const res = factorBivariate(x.pow(2).add(y.pow(2)), "x", "y");
    expect(res.ok).toBe(true);
    expect(res.complete).toBe(true);
    expect(res.absoluteCount).toBe(2);
    expect(sameSet(res.factors, [x.sub(iy), x.add(iy)])).toBe(true);
    // both factors are genuinely over ℚ(i) (non-real) — the field-of-definition proof
    expect(res.factors.every(hasImag)).toBe(true);
  });

  it("x² − 2y² → itself: absoluteCount 2 but ONE ℚ(i)-irreducible factor (lives over ℚ(√2), not ℚ(i))", () => {
    const f = x.pow(2).sub(I(2).mul(y.pow(2)));
    const res = factorBivariate(f, "x", "y");
    expect(res.ok).toBe(true);
    expect(res.complete).toBe(true);
    expect(res.absoluteCount).toBe(2);
    expect(res.factors).toHaveLength(1);
    expect(res.factors[0].sub(f).isZero()).toBe(true); // the factor is f itself (monic-in-x, unchanged)
  });

  it("x⁴ − y⁴ → { x−y, x+y, x−iy, x+iy } (2 real + 2 over ℚ(i))", () => {
    const res = factorBivariate(x.pow(4).sub(y.pow(4)), "x", "y");
    expect(res.ok).toBe(true);
    expect(res.complete).toBe(true);
    expect(res.absoluteCount).toBe(4);
    expect(sameSet(res.factors, [x.sub(y), x.add(y), x.sub(iy), x.add(iy)])).toBe(true);
    expect(res.factors.filter(hasImag)).toHaveLength(2);
  });

  it("(x−y)(x+y)(x+2y) → 3 real linear factors", () => {
    const f = x.sub(y).mul(x.add(y)).mul(x.add(I(2).mul(y)));
    const res = factorBivariate(f, "x", "y");
    expect(res.ok).toBe(true);
    expect(res.complete).toBe(true);
    expect(res.absoluteCount).toBe(3);
    expect(sameSet(res.factors, [x.sub(y), x.add(y), x.add(I(2).mul(y))])).toBe(true);
  });

  it("x² + y² − 1 → itself (irreducible conic)", () => {
    const f = x.pow(2).add(y.pow(2)).sub(I(1));
    const res = factorBivariate(f, "x", "y");
    expect(res.ok).toBe(true);
    expect(res.complete).toBe(true);
    expect(res.absoluteCount).toBe(1);
    expect(res.factors).toHaveLength(1);
    expect(res.factors[0].sub(f).isZero()).toBe(true);
  });

  it("y² − x³ − x → itself (irreducible cubic, r = 1)", () => {
    const f = y.pow(2).sub(x.pow(3)).sub(x);
    const res = factorBivariate(f, "x", "y");
    expect(res.ok).toBe(true);
    expect(res.complete).toBe(true);
    expect(res.absoluteCount).toBe(1);
    // lc_x(f) = −1, so the factor is the monic-in-x associate x³ + x − y² (= −f), which is correct.
    expect(sameSet(res.factors, [x.pow(3).add(x).sub(y.pow(2))])).toBe(true);
  });
});

describe("factorBivariate — round-trip (multiply distinct irreducibles, recover the set)", () => {
  it("real: (x − 2y + 3)(x + y − 1) → recover both", () => {
    const a = x.sub(I(2).mul(y)).add(I(3));
    const b = x.add(y).sub(I(1));
    const res = factorBivariate(a.mul(b), "x", "y");
    expect(res.complete).toBe(true);
    expect(sameSet(res.factors, [a, b])).toBe(true);
  });

  it("ℚ(i): (x − iy)(x + iy + 1) → recover both distinct ℚ(i) factors", () => {
    const a = x.sub(iy);
    const b = x.add(iy).add(I(1));
    const res = factorBivariate(a.mul(b), "x", "y");
    expect(res.complete).toBe(true);
    expect(res.absoluteCount).toBe(2);
    expect(sameSet(res.factors, [a, b])).toBe(true);
  });
});

describe("factorBivariate — content, and preconditions", () => {
  it("strips pure-y content: y·(x²+y²−1) → factor {x²+y²−1}, content y", () => {
    const conic = x.pow(2).add(y.pow(2)).sub(I(1));
    const res = factorBivariate(y.mul(conic), "x", "y");
    expect(res.ok).toBe(true);
    expect(res.complete).toBe(true);
    expect(res.factors).toHaveLength(1);
    expect(res.factors[0].sub(conic).isZero()).toBe(true);
    expect(res.content.sub(y).isZero()).toBe(true);
  });

  it("throws on the same preconditions as the count (zero / non-bivariate / non-squarefree / single-var / x=y)", () => {
    expect(() => factorBivariate(MPoly.zero(), "x", "y")).toThrow(/zero/);
    expect(() => factorBivariate(x.pow(2).add(y.pow(2)).add(z.pow(2)), "x", "y")).toThrow(/bivariate/);
    expect(() => factorBivariate(x.sub(y).pow(2), "x", "y")).toThrow(/squarefree/);
    expect(() => factorBivariate(x.pow(2).sub(I(1)), "x", "y")).toThrow(/positive degree/);
    expect(() => factorBivariate(x.pow(2).sub(y.pow(2)), "x", "x")).toThrow(/must differ/);
  });
});

// Phase 4: the public factor() now routes genuine bivariate polynomials through factorBivariate (keeping
// the monomial / separable / univariate fast-paths). factor() returns the DISTINCT (radical) factors.
describe("factor() integration — genuine bivariate routing (roadmap #19 P4)", () => {
  it("factor(x²−y²) → { x−y, x+y }", () => {
    const r = factor(x.pow(2).sub(y.pow(2)));
    expect(r.ok).toBe(true);
    expect(sameSet(r.factors, [x.sub(y), x.add(y)])).toBe(true);
  });
  it("factor(x²+y²) → { x−iy, x+iy } (over ℚ(i))", () => {
    const r = factor(x.pow(2).add(y.pow(2)));
    expect(r.ok).toBe(true);
    expect(sameSet(r.factors, [x.sub(iy), x.add(iy)])).toBe(true);
  });
  it("factor(x⁴−y⁴) → 4 factors", () => {
    const r = factor(x.pow(4).sub(y.pow(4)));
    expect(r.ok).toBe(true);
    expect(sameSet(r.factors, [x.sub(y), x.add(y), x.sub(iy), x.add(iy)])).toBe(true);
  });
  it("factor(y·(x²−y²)) → { y, x−y, x+y } (monomial peel THEN bivariate split)", () => {
    const r = factor(y.mul(x.pow(2).sub(y.pow(2))));
    expect(r.ok).toBe(true);
    expect(sameSet(r.factors, [y, x.sub(y), x.add(y)])).toBe(true);
  });
  it("an irreducible bivariate stays whole (ok:false): x²+y²−1, and ℚ(i)-irreducible x²−2y²", () => {
    expect(factor(x.pow(2).add(y.pow(2)).sub(I(1))).ok).toBe(false);
    expect(factor(x.pow(2).sub(I(2).mul(y.pow(2)))).ok).toBe(false);
  });
});
