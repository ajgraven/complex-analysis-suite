// Roadmap #19 (n-variate factorizer) Phase 3 — factorMultivariate, the assembled ℚ(i) multivariate
// factorizer (content-strip + squarefree + main-var choice + the P2 Hensel lift). Goldens: bivariate
// CONSISTENCY with factorBivariate (a differential check — two independent algorithms), trivariate+
// recovery, content handling, round-trip, and the honest `complete` flag. See docs/NVARIATE_FACTORING.md.
import { describe, it, expect } from "vitest";
import _QD from "../app/solver.mjs";
import "../app/sym-core.mjs";

const S: any = (_QD as any).Sym;
const { MPoly, Gaussian, Rational, factorBivariate, factorMultivariate, factor } = S;

const x = MPoly.variable("x");
const y = MPoly.variable("y");
const z = MPoly.variable("z");
const w = MPoly.variable("w");
const I = (k: number) => MPoly.fromInt(k);
const iC = MPoly.constant(new Gaussian(Rational.fromInt(0), Rational.fromInt(1)));

// Factorizations are defined only up to ℚ(i) units, and factorMultivariate canonicalizes each factor
// monic in its (internally-chosen) main variable — so compare up to associates (p | q and q | p).
const assoc = (p: any, q: any): boolean => {
  try { const r = S.mpolyExactDiv(q, p); return r.vars().size === 0 && !r.isZero(); } catch (e) { return false; }
};
const sameSet = (a: any[], b: any[]): boolean => {
  if (a.length !== b.length) return false;
  const used = new Array(a.length).fill(false);
  for (const e of b) {
    let hit = -1;
    for (let i = 0; i < a.length; i++) if (!used[i] && assoc(a[i], e)) { hit = i; break; }
    if (hit < 0) return false;
    used[hit] = true;
  }
  return true;
};
const productEq = (factors: any[], f: any): boolean => {
  let p = MPoly.fromInt(1);
  for (const fac of factors) p = p.mul(fac);
  return assoc(p, f);                          // ∏ factors = f up to a unit
};

describe("factorMultivariate — bivariate consistency with factorBivariate (differential check)", () => {
  const cases = [
    x.pow(2).sub(y.pow(2)), x.pow(2).add(y.pow(2)), x.pow(4).sub(y.pow(4)),
    x.sub(y).mul(x.add(y)).mul(x.add(I(2).mul(y))),
    x.pow(2).sub(I(2).mul(y.pow(2))),            // ℚ(i)-irreducible
    x.pow(2).add(y.pow(2)).sub(I(1)),            // irreducible conic
  ];
  for (const f of cases) {
    it(`matches on a ${f.termList().length}-term curve`, () => {
      const a = factorBivariate(f, "x", "y");
      const b = factorMultivariate(f);
      expect(b.ok).toBe(true);
      expect(sameSet(a.factors, b.factors)).toBe(true);
    });
  }
});

describe("factorMultivariate — trivariate & 4-variate recovery", () => {
  it("(x+y+z)(x−y+z) → the two planes", () => {
    const f = x.add(y).add(z).mul(x.sub(y).add(z));
    const r = factorMultivariate(f);
    expect(r.complete).toBe(true);
    expect(sameSet(r.factors, [x.add(y).add(z), x.sub(y).add(z)])).toBe(true);
  });
  it("(x−y)(x+y)(x+z) → 3 factors", () => {
    const f = x.sub(y).mul(x.add(y)).mul(x.add(z));
    const r = factorMultivariate(f);
    expect(sameSet(r.factors, [x.sub(y), x.add(y), x.add(z)])).toBe(true);
  });
  it("over-splitting: (x²−yz)(x−y) → { x²−yz, x−y }", () => {
    const f = x.pow(2).sub(y.mul(z)).mul(x.sub(y));
    const r = factorMultivariate(f);
    expect(r.complete).toBe(true);
    expect(sameSet(r.factors, [x.pow(2).sub(y.mul(z)), x.sub(y)])).toBe(true);
  });
  it("irreducible quadric x²+y²−z² → itself", () => {
    const f = x.pow(2).add(y.pow(2)).sub(z.pow(2));
    const r = factorMultivariate(f);
    expect(r.factors).toHaveLength(1);
    expect(assoc(r.factors[0], f)).toBe(true);
  });
  it("4-variate (x+y+z+w)(x−y+z−w) → 2 factors", () => {
    const a = x.add(y).add(z).add(w), b = x.sub(y).add(z).sub(w);
    const r = factorMultivariate(a.mul(b));
    expect(sameSet(r.factors, [a, b])).toBe(true);
    expect(productEq(r.factors, a.mul(b))).toBe(true);
  });
});

describe("factorMultivariate — content stripping (a pure-lower-arity factor)", () => {
  it("(y+1)·(x²−yz) → { y+1, x²−yz } (the content y+1 is factored too)", () => {
    const f = y.add(I(1)).mul(x.pow(2).sub(y.mul(z)));
    const r = factorMultivariate(f);
    expect(r.complete).toBe(true);
    expect(sameSet(r.factors, [y.add(I(1)), x.pow(2).sub(y.mul(z))])).toBe(true);
  });
});

describe("factorMultivariate — round-trip (multiply distinct irreducibles, recover)", () => {
  it("(x−y+2z)(x+iy−z)(x+y+z−1) → recover all three", () => {
    const a = x.sub(y).add(I(2).mul(z));
    const b = x.add(iC.mul(y)).sub(z);
    const c = x.add(y).add(z).sub(I(1));
    const f = a.mul(b).mul(c);
    const r = factorMultivariate(f);
    expect(r.complete).toBe(true);
    expect(sameSet(r.factors, [a, b, c])).toBe(true);
    expect(productEq(r.factors, f)).toBe(true);
  });
});

describe("factorMultivariate — honest `complete` flag (non-monic scope)", () => {
  it("xy + yz + zx is non-monic in every variable → returned whole, complete:false", () => {
    const f = x.mul(y).add(y.mul(z)).add(z.mul(x));
    const r = factorMultivariate(f);
    expect(r.ok).toBe(true);
    expect(r.complete).toBe(false);              // Wang leading-coefficient distribution out of scope
    expect(r.factors).toHaveLength(1);
    expect(assoc(r.factors[0], f)).toBe(true);
  });
});

// P4: the public factor() now routes a genuine ≥3-variable (entangled) remainder through
// factorMultivariate, keeping the monomial / separable / univariate / bivariate methods before it.
describe("factor() integration — ≥3-variable routing (roadmap #19 n-variate P4)", () => {
  it("factor((x+y+z)(x−y+z)) → the two planes", () => {
    const r = factor(x.add(y).add(z).mul(x.sub(y).add(z)));
    expect(r.ok).toBe(true);
    expect(sameSet(r.factors, [x.add(y).add(z), x.sub(y).add(z)])).toBe(true);
  });
  it("factor((x²−yz)(x−y)) → { x²−yz, x−y }", () => {
    const r = factor(x.pow(2).sub(y.mul(z)).mul(x.sub(y)));
    expect(r.ok).toBe(true);
    expect(sameSet(r.factors, [x.pow(2).sub(y.mul(z)), x.sub(y)])).toBe(true);
  });
  it("factor(y·(x²−yz)) → { y, x²−yz } (monomial peel THEN a whole ≥3 irreducible)", () => {
    const r = factor(y.mul(x.pow(2).sub(y.mul(z))));
    expect(r.ok).toBe(true);
    expect(sameSet(r.factors, [y, x.pow(2).sub(y.mul(z))])).toBe(true);
  });
  it("an irreducible ≥3-variable poly stays whole (ok:false): x²−yz, x²+y²−z²", () => {
    expect(factor(x.pow(2).sub(y.mul(z))).ok).toBe(false);
    expect(factor(x.pow(2).add(y.pow(2)).sub(z.pow(2))).ok).toBe(false);
  });
});
