// Roadmap #19 (multivariate factorizer) Phase 5 — the INDEPENDENT Zassenhaus–Hensel oracle and the
// DIFFERENTIAL cross-check against factorBivariate. henselFactorBivariate uses a completely different
// algorithm (evaluate y → y₀, factor univariately over ℚ(i), Hensel-lift, recombine) so an algorithm-level
// bug in either path fails to survive comparing the two factor SETS. See docs/MULTIVARIATE_FACTORING.md §6.
import { describe, it, expect } from "vitest";
import _QD from "../app/solver.mjs";
import "../app/sym-core.mjs";

const S: any = (_QD as any).Sym;
const { MPoly, Gaussian, Rational, factorBivariate, henselFactorBivariate } = S;

const x = MPoly.variable("x");
const y = MPoly.variable("y");
const I = (k: number) => MPoly.fromInt(k);
const iC = MPoly.constant(new Gaussian(Rational.fromInt(0), Rational.fromInt(1)));
const iy = iC.mul(y);

const sameSet = (a: any[], b: any[]): boolean => {
  if (a.length !== b.length) return false;
  const used = new Array(a.length).fill(false);
  for (const e of b) {
    let hit = -1;
    for (let i = 0; i < a.length; i++) if (!used[i] && a[i].sub(e).isZero()) { hit = i; break; }
    if (hit < 0) return false;
    used[hit] = true;
  }
  return true;
};

describe("henselFactorBivariate — correct factor sets (independent of factorBivariate)", () => {
  it("x² − y² → { x−y, x+y }", () => {
    const r = henselFactorBivariate(x.pow(2).sub(y.pow(2)), "x", "y");
    expect(r.ok).toBe(true);
    expect(sameSet(r.factors, [x.sub(y), x.add(y)])).toBe(true);
  });
  it("x² + y² → { x−iy, x+iy } (splits over ℚ(i))", () => {
    const r = henselFactorBivariate(x.pow(2).add(y.pow(2)), "x", "y");
    expect(sameSet(r.factors, [x.sub(iy), x.add(iy)])).toBe(true);
  });
  it("x⁴ − y⁴ → 4 factors", () => {
    const r = henselFactorBivariate(x.pow(4).sub(y.pow(4)), "x", "y");
    expect(sameSet(r.factors, [x.sub(y), x.add(y), x.sub(iy), x.add(iy)])).toBe(true);
  });
  it("(x−y)(x+y)(x+2y) → 3 linear factors", () => {
    const r = henselFactorBivariate(x.sub(y).mul(x.add(y)).mul(x.add(I(2).mul(y))), "x", "y");
    expect(sameSet(r.factors, [x.sub(y), x.add(y), x.add(I(2).mul(y))])).toBe(true);
  });
  it("x² + y² − 1 (irreducible, but SPLITS at y₀=0) → stays whole", () => {
    const f = x.pow(2).add(y.pow(2)).sub(I(1));
    const r = henselFactorBivariate(f, "x", "y");
    expect(r.factors).toHaveLength(1);
    expect(r.factors[0].sub(f).isZero()).toBe(true);
  });
  it("x² − 2y² (ℚ(i)-irreducible, univariate specialization irreducible too) → whole", () => {
    const f = x.pow(2).sub(I(2).mul(y.pow(2)));
    const r = henselFactorBivariate(f, "x", "y");
    expect(r.factors).toHaveLength(1);
    expect(r.factors[0].sub(f).isZero()).toBe(true);
  });
  it("degenerate: a curve free of y (x²−1) → univariate path { x−1, x+1 }", () => {
    const r = henselFactorBivariate(x.pow(2).sub(I(1)), "x", "y");
    expect(sameSet(r.factors, [x.sub(I(1)), x.add(I(1))])).toBe(true);
  });
  it("reports non-monic-in-x as unsupported (out of the oracle's scope)", () => {
    // y·x² + 1 has leading x-coeff y (depends on y)
    const r = henselFactorBivariate(y.mul(x.pow(2)).add(I(1)), "x", "y");
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/non-monic/);
  });
});

// The differential cross-check: a deterministic corpus of monic-in-x products of distinct ℚ(i)
// irreducibles. For each, the Gao factorizer and the Hensel oracle must return the SAME factor set.
describe("differential: factorBivariate ≡ henselFactorBivariate on a monic-in-x corpus", () => {
  const L = [
    x.sub(y),                       // x − y
    x.add(y),                       // x + y
    x.sub(iy),                      // x − iy
    x.add(iy),                      // x + iy
    x.add(I(2).mul(y)).sub(I(1)),   // x + 2y − 1
    x.sub(iC.mul(y)).add(I(3)),     // x − iy + 3
  ];
  const Q = [
    x.pow(2).sub(I(2).mul(y.pow(2))),         // x² − 2y²   (ℚ(i)-irreducible)
    x.pow(2).add(y.pow(2)).sub(I(1)),         // x² + y² − 1 (irreducible conic)
  ];
  // products: singletons, pairs, a few triples — all monic in x, squarefree (distinct factors)
  const corpus: any[] = [];
  for (const q of Q) corpus.push(q);
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) corpus.push(L[i].mul(L[j]));
  corpus.push(L[0].mul(L[1]).mul(L[4]));        // (x−y)(x+y)(x+2y−1)
  corpus.push(L[2].mul(L[3]).mul(L[5]));        // (x−iy)(x+iy)(x−iy+3)
  corpus.push(L[0].mul(Q[0]));                  // (x−y)(x²−2y²)
  corpus.push(L[4].mul(Q[1]));                  // (x+2y−1)(x²+y²−1)

  it(`agrees on all ${corpus.length} corpus polynomials`, () => {
    for (const f of corpus) {
      const a = factorBivariate(f, "x", "y");
      const b = henselFactorBivariate(f, "x", "y");
      expect(a.ok).toBe(true);
      expect(b.ok).toBe(true);
      expect(
        sameSet(a.factors, b.factors),
        "factor-set mismatch on " + JSON.stringify(f.termList?.() ?? f),
      ).toBe(true);
    }
  });
});
