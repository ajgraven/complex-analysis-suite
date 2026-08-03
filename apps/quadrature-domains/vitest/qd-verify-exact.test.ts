// =============================================================================
// qd-verify-exact — EXACT ℚ(i) verification of a reconstructed solution (finding PF-1 / E1).
//
// The genuine-QD certificate ran the exact Schur–Cohn / boundary tests at a ratApprox'd FLOAT point, not
// the true algebraic root — so a certified "=" overstated for irrational solutions. verifySolutionExact
// snaps each coordinate to a nearby simple ℚ(i) rational and checks the snapped point solves EVERY generated
// equation EXACTLY over ℚ(i): if it does, the solution IS that exact rational point (proven by the exact-zero
// residual) and the univalence tests at it are unconditional; if not, it is irrational and the per-solution
// certificate is only ≈. Unit disk h=1/w has the exact rational solution φ=identity: w0=0, z1=0, A_{1,1}=1.
import { describe, it, expect } from "vitest";
import _QD from "../app/solvers/solver.mjs";
import "../app/sym/sym-core.mjs";
import "../app/qd/qd-equations.mjs";

const QE: any = (_QD as any).QDEquations;
const diskH = { poles: [{ a: { re: 0, im: 0 }, principal: [{ re: 1, im: 0 }] }] };
const w0 = { re: 0, im: 0 };
const phi = (zRe: number, aRe: number) => ({ w0, branches: [{ z: { re: zRe, im: 0 }, A: [{ re: aRe, im: 0 }] }] });

describe("QDEquations.verifySolutionExact (PF-1/E1)", () => {
  it("is exposed on the barrel", () => {
    expect(typeof QE.verifySolutionExact).toBe("function");
  });

  it("the exact rational disk solution verifies (exact:true) + returns the barred substitution", () => {
    const r = QE.verifySolutionExact(phi(0, 1), diskH, { w0 });
    expect(r.exact).toBe(true);
    expect(r.barSub).toBeTruthy();
    expect(r.barSub["zb1"]).toBeTruthy();       // z̄1 present — byte-compatible with poleSubst
    expect(r.barSub["Ab1_1"]).toBeTruthy();     // Ā_{1,1} present
  });

  it("snaps a near-miss float to the exact rational (z1=1e-9, A=1+1e-9 ⇒ exact)", () => {
    expect(QE.verifySolutionExact(phi(1e-9, 1 + 1e-9), diskH, { w0 }).exact).toBe(true);
  });

  it("does NOT verify a rational-but-wrong point (A = 3/2 ≠ the solution)", () => {
    const r = QE.verifySolutionExact(phi(0, 1.5), diskH, { w0 });
    expect(r.exact).toBe(false);
  });

  it("does NOT verify an irrational coordinate (A = √2 snaps to no solving rational)", () => {
    expect(QE.verifySolutionExact(phi(0, Math.SQRT2), diskH, { w0 }).exact).toBe(false);
  });
});
