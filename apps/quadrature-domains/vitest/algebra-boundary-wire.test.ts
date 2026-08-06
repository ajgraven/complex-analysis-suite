// @vitest-environment node
//
// X1 boundary wire — the two helpers that drive the boundary certificate from the RUR channel:
// `barredSubstFromRUR` (the correctness-critical reim↔barred variable mapping — coords['z_j__re/__im'] →
// z̄_j = re − i·im) and `boundaryCertifiedAtRoot` (rebuild the RUR from r.rur, build the sub, run the
// augmented count; count===0 ⇒ boundary simple at every true root). A wrong mapping here is a false `=`, so
// this pins the mapping END-TO-END: a synthetic RUR whose coordinate maps are the known constants for φ=z
// and φ=z+z² must reproduce those maps' KNOWN boundary counts (0 and 2) through the real
// `boundaryDoublePointCountParametric`. The synthetic RURs stand in for a real solve so the wire is testable
// without one; the actual solve feeds the identical shape (verified by the RUR-channel round-trip test).
import { describe, it, expect, beforeAll } from "vitest";

let QD: any, QC: any, S: any, PP: any;
beforeAll(async () => {
  QD = (await import("../app/solvers/solver.mjs")).default;
  await import("../app/sym/sym-core.mjs");
  await import("../app/qd/qd-equations.mjs");
  await import("../app/qd/qd-constraints.mjs");
  PP = await import("../app/algebra/prove-plan.mjs");
  QC = QD.QDConstraints;
  S = QD.Sym;
});

const deps = () => ({ QD, QC });
const hDisk = { poles: [{ a: { re: 0, im: 0 }, principal: [{ re: 1.96, im: 0 }] }] };            // φ = z
const hQuad = { poles: [{ a: { re: 0, im: 0 }, principal: [{ re: 0, im: 0 }, { re: 0, im: 0 }] }] }; // φ = z + z²
const c = (re: number, im = 0) => S.mpolyConst(S.gauss(S.rat(re, 1), S.rat(im, 1)));
const T = () => S.mpolyVar("t");
// Synthetic RURs whose coordinate maps are CONSTANTS (a rational QD, minPoly = t): the reim parts of the
// unbarred pole data. barredSubstFromRUR must rebuild exactly poleSubst's {z̄_j, Ā_{j,k}} from them.
const rurDisk = () => ({ minPoly: T(), tName: "t", coords: { z1__re: c(0), z1__im: c(0), A1_1__re: c(1), A1_1__im: c(0) } });
const rurQuad = () => ({ minPoly: T(), tName: "t", coords: { z1__re: c(0), z1__im: c(0), A1_1__re: c(1), A1_1__im: c(0), A1_2__re: c(1), A1_2__im: c(0) } });
const serialize = (rur: any) => ({ minPoly: rur.minPoly.termList(), tName: rur.tName,
  coords: Object.fromEntries(Object.entries(rur.coords).map(([k, v]: any) => [k, v.termList()])) });

describe("barredSubstFromRUR — the reim↔barred mapping from the RUR coordinate maps", () => {
  it("rebuilds the φ=z+z² barred sub, which yields the KNOWN boundary count (2)", () => {
    const sub = PP.barredSubstFromRUR(rurQuad(), hQuad, deps());
    expect(sub).toBeTruthy();
    expect(Object.keys(sub).sort()).toEqual(["Ab1_1", "Ab1_2", "zb1"]);
    const bc = QC.boundaryDoublePointCountParametric(hQuad, sub, T(), "t");
    expect(bc.ok).toBe(true);
    expect(bc.count).toBe(2);                                       // the reconstructed sub IS φ=z+z²
  });

  it("takes the CONJUGATE (z̄ = re − i·im), not the raw coordinate", () => {
    // z1 = 3 + 5i ⇒ z̄1 must be 3 − 5i; a mapping that forgot to conjugate is a wrong φ′, i.e. a false =.
    const rur = { minPoly: T(), tName: "t", coords: { z1__re: c(3), z1__im: c(5), A1_1__re: c(1), A1_1__im: c(0) } };
    const sub = PP.barredSubstFromRUR(rur, hDisk, deps());
    expect(sub.zb1.sub(c(3, -5)).isZero()).toBe(true);
    expect(sub.zb1.sub(c(3, 5)).isZero()).toBe(false);             // NOT the un-conjugated value
  });

  it("returns null when a needed coordinate map is missing (⇒ caller keeps the rationalized path)", () => {
    expect(PP.barredSubstFromRUR({ minPoly: T(), tName: "t", coords: { z1__re: c(0) } }, hDisk, deps())).toBe(null);
    expect(PP.barredSubstFromRUR(null, hDisk, deps())).toBe(null);
  });
});

describe("boundaryCertifiedAtRoot — the batch count===0 boundary certificate over the whole solve", () => {
  it("certifies a simple boundary (disk φ=z → count 0)", () => {
    const res = PP.boundaryCertifiedAtRoot({ certified: true, rur: serialize(rurDisk()) }, hDisk, deps());
    expect(res.ok).toBe(true);
    expect(res.certified).toBe(true);
    expect(res.count).toBe(0);
  });

  it("does NOT certify a self-crossing boundary (φ=z+z² → count 2)", () => {
    const res = PP.boundaryCertifiedAtRoot({ certified: true, rur: serialize(rurQuad()) }, hQuad, deps());
    expect(res.ok).toBe(true);
    expect(res.certified).toBe(false);                             // count 2 ≠ 0 ⇒ refuse
    expect(res.count).toBe(2);
  });

  it("refuses (not certified) when there is no RUR — the numeric-solve fallback path", () => {
    expect(PP.boundaryCertifiedAtRoot({ certified: true }, hDisk, deps()).certified).toBe(false);
    expect(PP.boundaryCertifiedAtRoot({}, hDisk, deps()).certified).toBe(false);
  });
});
