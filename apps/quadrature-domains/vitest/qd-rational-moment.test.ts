// C2-1 — rationalMomentSystem: the multi-node (rational-φ) moment-match builder, the rational analog of
// pointFunctionalSystem (docs/algebra-review/RATIONAL_MOMENT_C2.md). Guarded against the two hand-derived
// + numerically-validated ground-truth families: the emitted system must be EXACTLY satisfied by the known
// map coefficients (validates the node/weight↔coefficient derivation — the crux), and be zero-dimensional.
import { describe, it, expect } from "vitest";
import _QD from "../app/solver.mjs";
import "../app/sym-core.mjs";
import "../app/faber-analysis.mjs";     // Durand–Kerner (solveZeroDim / realSolutionCount)
import "../app/qd-equations.mjs";

const QD: any = _QD;
const QE: any = QD.QDEquations;
const Sym: any = QD.Sym;

// exact ℚ constant MPoly from a rational p/q
const cst = (p: number, q = 1) => Sym.mpolyConst(Sym.gauss(Sym.rat(p, q), Sym.rat(0, 1)));
// substitute {w0,R,d,t} (as rationals) and test the poly vanishes EXACTLY over ℚ
const vanishesAt = (poly: any, sub: Record<string, [number, number]>) => {
  const s: any = {};
  for (const k of Object.keys(sub)) s[k] = cst(sub[k][0], sub[k][1]);
  return poly.subst(s).isZero();
};

describe("rationalMomentSystem (C2-1) — degree-2 multi-node builder", () => {
  // ASYMMETRIC ground truth: φ=(z+dz²)/(1−cz²), c=¼(t=½), d=¼ ⇒ a₊=3/5, a₋=−7/15, b₊=28/25, b₋=52/225.
  const asym = { nodes: [{ re: 3 / 5, im: 0 }, { re: -7 / 15, im: 0 }], weights: [{ re: 28 / 25, im: 0 }, { re: 52 / 225, im: 0 }] };
  // SYMMETRIC ground truth: φ=Rz/(1−cz²), R=1, c=¼ ⇒ nodes ±8/15, equal weight 136/225, d=0.
  const sym = { nodes: [{ re: 8 / 15, im: 0 }, { re: -8 / 15, im: 0 }], weights: [{ re: 136 / 225, im: 0 }, { re: 136 / 225, im: 0 }] };

  it("emits the reduced degree-2 shape system: 2 polys in [t, d]", () => {
    const sysm = QE.rationalMomentSystem(asym, { degree: 2 });
    expect(sysm.vars).toEqual(["t", "d"]);
    expect(sysm.polys.length).toBe(2);
  });

  it("ASYMMETRIC: the known shape (t=½, d=¼) EXACTLY satisfies both equations", () => {
    const sysm = QE.rationalMomentSystem(asym, { degree: 2 });
    for (const p of sysm.polys) expect(vanishesAt(p, { t: [1, 2], d: [1, 4] })).toBe(true);
  });

  it("SYMMETRIC: the known shape (t=½, d=0) EXACTLY satisfies both equations", () => {
    const sysm = QE.rationalMomentSystem(sym, { degree: 2 });
    for (const p of sysm.polys) expect(vanishesAt(p, { t: [1, 2], d: [0, 1] })).toBe(true);
  });

  it("a WRONG shape does NOT satisfy the system (the oracle has teeth)", () => {
    const sysm = QE.rationalMomentSystem(asym, { degree: 2 });
    // perturb d: ¼ → ⅓ — at least one equation must be non-zero
    expect(sysm.polys.some((p: any) => !vanishesAt(p, { t: [1, 2], d: [1, 3] }))).toBe(true);
  });

  it("the emitted system is ZERO-DIMENSIONAL, and recovers the truth as a gauge-canonical root", () => {
    const sysm = QE.rationalMomentSystem(asym, { degree: 2 });
    const rc = Sym.realSolutionCount(sysm.polys, null, sysm.vars, {});
    expect(rc && rc.ok).toBe(true);
    expect(Number.isFinite(rc.realCount)).toBe(true);
    expect(rc.realCount).toBeGreaterThanOrEqual(1);
    // solveZeroDim recovers (t=½, d=¼) among its real roots (t∈(0,1) is the disk-pole gauge)
    const sz = Sym.solveZeroDim(sysm.polys, sysm.vars, {});
    expect(sz && sz.solutions && sz.solutions.length).toBeGreaterThan(0);
    const hit = sz.solutions.some((s: any) => s.t && s.d && Math.abs(s.t.im) < 1e-6 && Math.abs(s.d.im) < 1e-6
      && Math.abs(s.t.re - 0.5) < 1e-6 && Math.abs(s.d.re - 0.25) < 1e-6);
    expect(hit).toBe(true);
  });

  it("rejects complex (off-axis) data and a wrong node count", () => {
    expect(() => QE.rationalMomentSystem({ nodes: [{ re: 0, im: 1 }, { re: 0, im: -1 }], weights: [{ re: 1, im: 0 }, { re: 1, im: 0 }] }, { degree: 2 })).toThrow(/off-axis|complex/i);
    expect(() => QE.rationalMomentSystem({ nodes: [{ re: 1, im: 0 }], weights: [{ re: 1, im: 0 }] }, { degree: 2 })).toThrow(/2 nodes/);
    expect(() => QE.rationalMomentSystem(asym, { degree: 3 })).toThrow(/degree 2/);
  });
});

describe("triangleMomentSystem (C3-1) — equilateral (3-fold symmetric) degree-3 builder", () => {
  const W = 0.8660254037844386;   // √3/2
  // GROUND TRUTH: φ=Rz/(1−cz³) with R=63/32, s=½ (c=⅛) ⇒ nodes at the cube roots of unity (magnitude 1),
  // equal weight b = 11/8 (both rational — the derivation oracle).
  const cubeRoots = [{ re: 1, im: 0 }, { re: -0.5, im: W }, { re: -0.5, im: -W }];
  const tri = { nodes: cubeRoots, weights: [{ re: 11 / 8, im: 0 }, { re: 11 / 8, im: 0 }, { re: 11 / 8, im: 0 }] };

  it("emits the reduced degree-3 symmetric system: 2 polys in [R, s]", () => {
    const sysm = QE.triangleMomentSystem(tri);
    expect(sysm.vars).toEqual(["R", "s"]);
    expect(sysm.polys.length).toBe(2);
  });

  it("the known map (R=63/32, s=½) EXACTLY satisfies both equations", () => {
    const sysm = QE.triangleMomentSystem(tri);
    for (const p of sysm.polys) expect(vanishesAt(p, { R: [63, 32], s: [1, 2] })).toBe(true);
  });

  it("a wrong shape does NOT satisfy the system (the oracle has teeth)", () => {
    const sysm = QE.triangleMomentSystem(tri);
    expect(sysm.polys.some((p: any) => !vanishesAt(p, { R: [63, 32], s: [1, 3] }))).toBe(true);
  });

  it("is ZERO-DIMENSIONAL with a finite real solution set", () => {
    const sysm = QE.triangleMomentSystem(tri);
    const rc = Sym.realSolutionCount(sysm.polys, null, sysm.vars, {});
    expect(rc && rc.ok).toBe(true);
    expect(Number.isFinite(rc.realCount)).toBe(true);
    expect(rc.realCount).toBeGreaterThanOrEqual(1);
  });

  it("rejects non-equilateral, off-centre, unequal-weight, and wrong-count data", () => {
    // unequal magnitudes (not 3-fold symmetric)
    expect(() => QE.triangleMomentSystem({ nodes: [{ re: 2, im: 0 }, { re: -0.5, im: W }, { re: -0.5, im: -W }], weights: tri.weights })).toThrow(/equidistant|symmetric/i);
    // off-centre (centroid ≠ 0)
    expect(() => QE.triangleMomentSystem({ nodes: [{ re: 1.5, im: 0 }, { re: 0, im: W }, { re: 0, im: -W }], weights: tri.weights })).toThrow(/centred|centre|symmetric|equidistant/i);
    // unequal weights
    expect(() => QE.triangleMomentSystem({ nodes: cubeRoots, weights: [{ re: 1, im: 0 }, { re: 2, im: 0 }, { re: 1, im: 0 }] })).toThrow(/equal|symmetric/i);
    // wrong node count
    expect(() => QE.triangleMomentSystem({ nodes: [{ re: 1, im: 0 }, { re: -1, im: 0 }], weights: [{ re: 1, im: 0 }, { re: 1, im: 0 }] })).toThrow(/3 nodes/);
  });
});
