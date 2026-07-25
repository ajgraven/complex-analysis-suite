// @vitest-environment node
//
// X1 fold wire — the CERTIFIED interior-fold test (φ′≠0 in 𝔻) at the true algebraic root. `Sym.schurCohnAtBox`
// encloses φ′'s ζ-coefficients (given as polynomials in the RUR primitive t) at an isolating box and runs the
// interval Schur–Cohn; `PP.foldCertifiedAtRoot` drives it from a RUR — substitute the coordinate maps into
// φ′'s numerator, take its ζ-coefficients as t-polynomials, and certify. Unlike the boundary certificate this
// is PER-SOLUTION (each real root has its own box). A false `inside` is a false `=`, so this pins the known
// cases: φ=z (φ′=1) has NO fold; φ=z+z² (φ′=1+2z, rooted at −½ inside 𝔻) DOES. The synthetic RURs use
// constant coordinate maps (a rational QD, box = the exact root), so the enclosure collapses to a point and
// the interval test reduces to the exact schurCohn — the composition is what's under test.
import { describe, it, expect, beforeAll } from "vitest";

let QD: any, QC: any, S: any, PP: any;
beforeAll(async () => {
  QD = (await import("../app/solver.mjs")).default;
  await import("../app/sym-core.mjs");
  await import("../app/qd-equations.mjs");
  await import("../app/qd-constraints.mjs");
  PP = await import("../app/algebra/prove-plan.mjs");
  QC = QD.QDConstraints;
  S = QD.Sym;
});

const deps = () => ({ QD, QC });
const hDisk = { poles: [{ a: { re: 0, im: 0 }, principal: [{ re: 1.96, im: 0 }] }] };            // φ = z
const hQuad = { poles: [{ a: { re: 0, im: 0 }, principal: [{ re: 0, im: 0 }, { re: 0, im: 0 }] }] }; // φ = z + z²
const c = (re: number, im = 0) => S.mpolyConst(S.gauss(S.rat(re, 1), S.rat(im, 1)));
const T = () => S.mpolyVar("t");
const R0 = () => S.rat(0, 1);
const box0 = () => ({ lo: R0(), hi: R0() });   // the exact root t=0 for the constant-coeff synthetic RURs
const rurDisk = () => ({ minPoly: T(), tName: "t", coords: { z1__re: c(0), z1__im: c(0), A1_1__re: c(1), A1_1__im: c(0) } });
const rurQuad = () => ({ minPoly: T(), tName: "t", coords: { z1__re: c(0), z1__im: c(0), A1_1__re: c(1), A1_1__im: c(0), A1_2__re: c(1), A1_2__im: c(0) } });

describe("Sym.schurCohnAtBox — interval Schur–Cohn over coefficients given as polynomials in t", () => {
  it("1 + 2z (root −½ inside 𝔻) ⇒ inside 1, certified", () => {
    const r = S.schurCohnAtBox([c(1), c(2)], "t", R0(), R0());
    expect(r.certified).toBe(true);
    expect(r.inside).toBe(1);
  });
  it("a nonzero constant (no root) ⇒ inside 0, certified", () => {
    expect(S.schurCohnAtBox([c(1)], "t", R0(), R0())).toMatchObject({ certified: true, inside: 0 });
  });
  it("z − 2 (root outside 𝔻) ⇒ inside 0, certified", () => {
    expect(S.schurCohnAtBox([c(-2), c(1)], "t", R0(), R0())).toMatchObject({ certified: true, inside: 0 });
  });
});

describe("PP.foldCertifiedAtRoot — the per-solution certified interior fold", () => {
  it("φ = z is univalent: φ′ has NO zero in 𝔻 (certified, inside 0)", () => {
    const r = PP.foldCertifiedAtRoot(rurDisk(), box0(), hDisk, deps());
    expect(r.ok).toBe(true);
    expect(r.certified).toBe(true);
    expect(r.inside).toBe(0);
  });

  it("φ = z + z² FOLDS: φ′ = 1 + 2z vanishes at −½ ∈ 𝔻 (certified, inside 1)", () => {
    const r = PP.foldCertifiedAtRoot(rurQuad(), box0(), hQuad, deps());
    expect(r.ok).toBe(true);
    expect(r.certified).toBe(true);
    expect(r.inside).toBe(1);            // a genuine fold ⇒ NOT univalent (rejected by the filter)
  });

  it("refuses when the RUR / box / coord map is absent (⇒ caller keeps the rationalized fold)", () => {
    expect(PP.foldCertifiedAtRoot(null, box0(), hDisk, deps()).certified).toBe(false);
    expect(PP.foldCertifiedAtRoot(rurDisk(), null, hDisk, deps()).certified).toBe(false);
    const partial = { minPoly: T(), tName: "t", coords: { z1__re: c(0) } };
    expect(PP.foldCertifiedAtRoot(partial, box0(), hDisk, deps()).certified).toBe(false);
  });
});
