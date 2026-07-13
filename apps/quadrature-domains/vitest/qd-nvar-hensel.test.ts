// Roadmap #19 (n-variate factorizer) Phase 2 — the multivariate Hensel-lift engine (mvHenselLift):
// reduce to univariate, factor, lift each variable back (recursive diophantine), recombine. This is the
// risk phase (docs/NVARIATE_FACTORING.md); the goldens assert (a) it reproduces factorBivariate on 2
// variables, (b) it recovers trivariate factor SETS, incl. the over-splitting case where an irreducible
// factor's univariate specialization splits and recombination must merge it, and (c) ∏ factors = f.
import { describe, it, expect } from "vitest";
import _QD from "../app/solver.mjs";
import "../app/sym-core.mjs";

const S: any = (_QD as any).Sym;
const { MPoly, Gaussian, Rational, factorBivariate, mvHenselLift } = S;

const x = MPoly.variable("x");
const y = MPoly.variable("y");
const z = MPoly.variable("z");
const I = (k: number) => MPoly.fromInt(k);
const iC = MPoly.constant(new Gaussian(Rational.fromInt(0), Rational.fromInt(1)));

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
// product of the returned factors equals f up to a nonzero constant (they are monic-in-x, so exactly f
// when f is monic-in-x; the battery is).
const productEq = (factors: any[], f: any): boolean => {
  let p = MPoly.fromInt(1);
  for (const fac of factors) p = p.mul(fac);
  return p.sub(f).isZero();
};

describe("mvHenselLift — reproduces factorBivariate on two variables (free cross-check)", () => {
  for (const f of [x.pow(2).sub(y.pow(2)), x.pow(2).add(y.pow(2)), x.pow(4).sub(y.pow(4)),
    x.sub(y).mul(x.add(y)).mul(x.add(I(2).mul(y)))]) {
    it(`agrees on ${JSON.stringify(f.termList().length)} terms`, () => {
      const a = factorBivariate(f, "x", "y");
      const b = mvHenselLift(f, "x");
      expect(b.ok).toBe(true);
      expect(sameSet(a.factors, b.factors)).toBe(true);
    });
  }
});

describe("mvHenselLift — trivariate factor recovery", () => {
  it("(x+y+z)(x−y+z) → { x+y+z, x−y+z }", () => {
    const f = x.add(y).add(z).mul(x.sub(y).add(z));
    const r = mvHenselLift(f, "x");
    expect(r.ok).toBe(true);
    expect(sameSet(r.factors, [x.add(y).add(z), x.sub(y).add(z)])).toBe(true);
    expect(productEq(r.factors, f)).toBe(true);
  });

  it("(x+y+z)(x+2y+3z) → the two planes", () => {
    const f = x.add(y).add(z).mul(x.add(I(2).mul(y)).add(I(3).mul(z)));
    const r = mvHenselLift(f, "x");
    expect(sameSet(r.factors, [x.add(y).add(z), x.add(I(2).mul(y)).add(I(3).mul(z))])).toBe(true);
    expect(productEq(r.factors, f)).toBe(true);
  });

  it("(x−y)(x+y)(x+z) → 3 factors", () => {
    const f = x.sub(y).mul(x.add(y)).mul(x.add(z));
    const r = mvHenselLift(f, "x");
    expect(sameSet(r.factors, [x.sub(y), x.add(y), x.add(z)])).toBe(true);
    expect(productEq(r.factors, f)).toBe(true);
  });

  it("(x−iy+z)(x+iy−z) → two ℚ(i) factors", () => {
    const a = x.sub(iC.mul(y)).add(z), b = x.add(iC.mul(y)).sub(z);
    const r = mvHenselLift(a.mul(b), "x");
    expect(sameSet(r.factors, [a, b])).toBe(true);
    expect(productEq(r.factors, a.mul(b))).toBe(true);
  });
});

describe("mvHenselLift — over-splitting (univariate specialization splits an irreducible factor)", () => {
  it("x² − y·z is irreducible → recombination merges the split base back to one factor", () => {
    const f = x.pow(2).sub(y.mul(z));   // at y=z=1 the base is x²−1 = (x−1)(x+1) — a 2-way over-split
    const r = mvHenselLift(f, "x");
    expect(r.ok).toBe(true);
    expect(r.factors).toHaveLength(1);
    expect(r.factors[0].sub(f).isZero()).toBe(true);
  });

  it("(x²−y·z)(x−y) → { x²−yz, x−y } (merge the quadric's branches, keep the line)", () => {
    const f = x.pow(2).sub(y.mul(z)).mul(x.sub(y));
    const r = mvHenselLift(f, "x");
    expect(r.ok).toBe(true);
    expect(sameSet(r.factors, [x.pow(2).sub(y.mul(z)), x.sub(y)])).toBe(true);
    expect(productEq(r.factors, f)).toBe(true);
  });
});

describe("mvHenselLift — irreducible + preconditions", () => {
  it("x² + y² − z² (irreducible quadric) → itself", () => {
    const f = x.pow(2).add(y.pow(2)).sub(z.pow(2));
    const r = mvHenselLift(f, "x");
    expect(r.ok).toBe(true);
    expect(r.factors).toHaveLength(1);
    expect(r.factors[0].sub(f).isZero()).toBe(true);
  });
  it("non-monic in the main variable → ok:false", () => {
    const r = mvHenselLift(y.mul(x.pow(2)).add(z), "x"); // leading x-coeff is y
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/non-monic/);
  });
});

// The second-reduction differential (roadmap #19 n-variate P5): factoring the SAME polynomial with a
// DIFFERENT main variable takes a different univariate base, a different evaluation point, and a different
// lift order — so a reduction-dependent bug in the lift or recombination would make the two disagree. The
// factor set must match up to ℚ(i) units. Uses polynomials monic in several variables.
describe("mvHenselLift — second-reduction differential (different main variable ⇒ same factor set)", () => {
  const iC2 = MPoly.constant(new Gaussian(Rational.fromInt(0), Rational.fromInt(1)));
  const w = MPoly.variable("w");
  const assoc = (p: any, q: any): boolean => {
    try { const r = S.mpolyExactDiv(q, p); return r.vars().size === 0 && !r.isZero(); } catch (e) { return false; }
  };
  const sameSetAssoc = (a: any[], b: any[]): boolean => {
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
  const cases: Array<[any, string, string]> = [
    [x.add(y).add(z).mul(x.sub(y).add(z)), "x", "z"],                                   // (x+y+z)(x−y+z)
    [x.sub(y).add(I(2).mul(z)).mul(x.add(iC2.mul(y)).sub(z)).mul(x.add(y).add(z).sub(I(1))), "x", "y"], // 3-factor ℚ(i)
    [x.add(y).add(z).add(w).mul(x.sub(y).add(z).sub(w)), "x", "w"],                     // 4-variate
  ];
  for (const [f, v1, v2] of cases) {
    it(`same set factoring in ${v1} vs ${v2}`, () => {
      const a = mvHenselLift(f, v1), b = mvHenselLift(f, v2);
      expect(a.ok).toBe(true);
      expect(b.ok).toBe(true);
      expect(sameSetAssoc(a.factors, b.factors)).toBe(true);
    });
  }
});
