// =============================================================================
// qd-node-location — the EXACT |z_j| < 1 admissibility gate (QDEquations.nodeInsideDisk).
//
// Maturity-review Slice 1 (finding D-1): the genuine-QD certificate must reject a candidate
// whose quadrature-node preimage z_j = φ⁻¹(a_j) lies ON or OUTSIDE 𝔻, because the reconstructed
// ansatz φ = w₀ + Σ conj(A_{j,k})ζᵏ/(1 − conj(z_j)ζ)ᵏ then has a pole at ζ = 1/conj(z_j) of modulus
// 1/|z_j| ≤ 1 (inside the closed disk) — not a bounded QD. clearDenominators drops the (1 − z̄_j z)
// factors, so the polynomial fold/boundary filters are blind to this stratum; nodeInsideDisk is the
// gate. It compares |z|² to 1 as an EXACT ℚ (BigInt) inequality on the ratApprox'd coordinate.
import { describe, it, expect } from "vitest";
import _QD from "../app/solver.mjs";
import "../app/sym-core.mjs";
import "../app/qd-equations.mjs";

const QE: any = (_QD as any).QDEquations;

describe("QDEquations.nodeInsideDisk — exact |z_j| < 1 admissibility predicate", () => {
  it("is exposed on the QDEquations barrel", () => {
    expect(typeof QE.nodeInsideDisk).toBe("function");
  });

  // ---- strictly inside 𝔻 ----
  it("z = 0 (disk center) is inside", () => {
    const t = QE.nodeInsideDisk(0, 0);
    expect(t.inside).toBe(true);
    expect(t.onCircle).toBe(false);
  });
  it("z = 0.5 is inside", () => {
    expect(QE.nodeInsideDisk(0.5, 0).inside).toBe(true);
  });
  it("z = -0.5 is inside (sign is squared away)", () => {
    expect(QE.nodeInsideDisk(-0.5, 0).inside).toBe(true);
  });
  it("z = 0.6 + 0.7i (|z|² = 0.85 < 1) is inside", () => {
    const t = QE.nodeInsideDisk(0.6, 0.7);
    expect(t.inside).toBe(true);
    expect(t.onCircle).toBe(false);
  });
  it("z = 0.9 is inside; z = 0.9i is inside", () => {
    expect(QE.nodeInsideDisk(0.9, 0).inside).toBe(true);
    expect(QE.nodeInsideDisk(0, 0.9).inside).toBe(true);
  });

  // ---- exactly ON ∂𝔻 (|z| = 1) — inadmissible (pole on the boundary) ----
  it("z = 1 is on the circle, not inside", () => {
    const t = QE.nodeInsideDisk(1, 0);
    expect(t.inside).toBe(false);
    expect(t.onCircle).toBe(true);
  });
  it("z = i is on the circle", () => {
    const t = QE.nodeInsideDisk(0, 1);
    expect(t.inside).toBe(false);
    expect(t.onCircle).toBe(true);
  });
  it("z = 0.6 + 0.8i (a 3-4-5 point, |z|² = 1 EXACTLY) is on the circle, not inside", () => {
    const t = QE.nodeInsideDisk(0.6, 0.8);
    expect(t.onCircle).toBe(true);
    expect(t.inside).toBe(false);
  });
  it("z = -1 is on the circle", () => {
    expect(QE.nodeInsideDisk(-1, 0).onCircle).toBe(true);
  });

  // ---- strictly OUTSIDE 𝔻 (|z| > 1) — the D-1 spurious stratum ----
  it("z = 2 (the D-1 repro: pole at 1/conj(2) = 0.5 INSIDE 𝔻) is outside, not on-circle", () => {
    const t = QE.nodeInsideDisk(2, 0);
    expect(t.inside).toBe(false);
    expect(t.onCircle).toBe(false);
  });
  it("z = 1.5 is outside", () => {
    expect(QE.nodeInsideDisk(1.5, 0).inside).toBe(false);
  });
  it("z = 0.8 + 0.8i (|z|² = 1.28 > 1) is outside", () => {
    const t = QE.nodeInsideDisk(0.8, 0.8);
    expect(t.inside).toBe(false);
    expect(t.onCircle).toBe(false);
  });
  it("z = 1.0001 is outside (just past the boundary, resolved exactly)", () => {
    expect(QE.nodeInsideDisk(1.0001, 0).inside).toBe(false);
  });

  // ---- the trichotomy is total: exactly one of {inside, onCircle, outside} ----
  it("returns a coherent trichotomy for a sweep", () => {
    for (const [re, im] of [[0, 0], [0.3, 0.4], [0.6, 0.8], [1, 0], [2, 0], [-0.7, 0.1]] as const) {
      const t = QE.nodeInsideDisk(re, im);
      // inside and onCircle are mutually exclusive; "outside" is the third state (both false)
      expect(t.inside && t.onCircle).toBe(false);
    }
  });
});
