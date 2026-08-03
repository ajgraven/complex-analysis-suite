// @vitest-environment node
//
// X1 boundary slice B1 — the CERTIFIED boundary-injectivity count at an irrational algebraic root
// (`QC.boundaryDoublePointCountParametric`). The `=` badge asks only "is φ(∂𝔻) SIMPLE?" (count===0), and
// this answers it soundly at the true root without number-field arithmetic: substitute the RUR coordinate
// maps g_v(t) for the barred pole values, adjoin minPoly(t)=0, and count real solutions over ℚ(i). The real
// roots of minPoly are exactly the real QD solutions, so the count is the TOTAL boundary double points over
// all of them; by Hermite's theorem the trace-form signature is the number of DISTINCT real points (≥ 0), so
// count===0 ⇒ every real solution's boundary is simple — including the true root. A false "simple" would be a
// false `=`, so this pins: (1) it reproduces the trusted exact `boundaryDoublePointCount` on a single root;
// (2) it SUMS over all real roots of an IRRATIONAL minPoly (t²−2 → two √2 solutions), the non-negativity the
// certificate rests on; (3) a genuinely t-dependent barred coordinate substitutes correctly; (4) over the
// Hermite cap it REFUSES (ok:false) rather than guessing.
import { describe, it, expect, beforeAll } from "vitest";

let QC: any, S: any;
beforeAll(async () => {
  const QD = (await import("../app/solvers/solver.mjs")).default;
  await import("../app/sym/sym-core.mjs");       // QD.Sym
  await import("../app/qd/qd-equations.mjs");
  await import("../app/qd/qd-constraints.mjs"); // QD.QDConstraints
  QC = QD.QDConstraints;
  S = QD.Sym;
});

// The exact fixtures from qd-constraints.test.js: hDisk (φ=z, boundary simple ⇒ 0) and hQuad (φ=z+z², 2
// ordered self-crossings). The barred subs {zb1, Ab1_k} reduce the ansatz to the stated polynomial.
const hDisk = { poles: [{ a: { re: 0, im: 0 }, principal: [{ re: 1.96, im: 0 }] }] };
const hQuad = { poles: [{ a: { re: 0, im: 0 }, principal: [{ re: 0, im: 0 }, { re: 0, im: 0 }] }] };
const c = (re: number, im = 0) => S.mpolyConst(S.gauss(S.rat(re, 1), S.rat(im, 1)));   // ℚ(i) constant as an MPoly
const T = () => S.mpolyVar("t");
const diskSub = () => ({ zb1: c(0), Ab1_1: c(1) });                     // φ = z
const quadSub = () => ({ zb1: c(0), Ab1_1: c(1), Ab1_2: c(1) });       // φ = z + z²

describe("boundaryDoublePointCountParametric — the count===0 boundary certificate", () => {
  it("reproduces exact boundaryDoublePointCount on a single (linear-minPoly) root", () => {
    const exact = QC.boundaryDoublePointCount(hQuad, quadSub());
    expect(exact.ok).toBe(true);
    expect(exact.count).toBe(2);                                        // the trusted oracle
    // minPoly = t − 5 (one real root); constant subs ⇒ 1 real root × 2 double points.
    const par = QC.boundaryDoublePointCountParametric(hQuad, quadSub(), T().sub(c(5)), "t");
    expect(par.ok).toBe(true);
    expect(par.count).toBe(2);
  });

  it("certifies a SIMPLE boundary as count 0 (disk, single root)", () => {
    const par = QC.boundaryDoublePointCountParametric(hDisk, diskSub(), T().sub(c(3)), "t");
    expect(par.ok).toBe(true);
    expect(par.count).toBe(0);                                          // certified simple
  });

  it("SUMS over all real roots of an IRRATIONAL minPoly — the non-negativity certificate", () => {
    // minPoly = t² − 2 (roots ±√2, irrational) with the φ=z+z² subs: 2 real roots × 2 double points = 4.
    // count > 0 ⇒ the certificate REFUSES to call the batch simple (a real sibling self-intersects).
    const par = QC.boundaryDoublePointCountParametric(hQuad, quadSub(), T().mul(T()).sub(c(2)), "t");
    expect(par.ok).toBe(true);
    expect(par.count).toBe(4);
  });

  it("certifies simple over an IRRATIONAL minPoly when EVERY real root is simple (disk, t²−2 → 0)", () => {
    // 2 real roots × 0 double points = 0 ⇒ certified simple for BOTH the √2 and −√2 solutions at once.
    const par = QC.boundaryDoublePointCountParametric(hDisk, diskSub(), T().mul(T()).sub(c(2)), "t");
    expect(par.ok).toBe(true);
    expect(par.count).toBe(0);
  });

  it("substitutes a genuinely t-DEPENDENT barred coordinate (Ā_{1,2} = t, pinned to 1)", () => {
    // Ab1_2 → t and minPoly = t − 1: at the root t=1 this IS φ=z+z², so 2 double points. Exercises the
    // coordinate-map substitution (not just constants) that the real RUR path will feed in.
    const par = QC.boundaryDoublePointCountParametric(hQuad, { zb1: c(0), Ab1_1: c(1), Ab1_2: T() }, T().sub(c(1)), "t");
    expect(par.ok).toBe(true);
    expect(par.count).toBe(2);
  });

  it("REFUSES (ok:false) over the Hermite cap — numeric fallback, never a guess", () => {
    const par = QC.boundaryDoublePointCountParametric(hQuad, quadSub(), T().sub(c(5)), "t", { maxHermiteDim: 1 });
    expect(par.ok).toBe(false);
  });

  it("REFUSES a missing / zero minPoly rather than silently counting the un-pinned family", () => {
    expect(QC.boundaryDoublePointCountParametric(hQuad, quadSub(), null, "t").ok).toBe(false);
    expect(QC.boundaryDoublePointCountParametric(hQuad, quadSub(), c(0), "t").ok).toBe(false);
  });
});
