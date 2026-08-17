// Review LOW (finding 07): houseQR's "singular" gate compares |diag[k]| to a FIXED 1e-13 absolute
// tolerance — an absolute-pivot test, not a scale-invariant rcond / numerical-rank gate. The solver's
// doc comment now says so explicitly; this pins the behavior it describes, so a future "make it rcond"
// change is a conscious one. Concretely: a perfectly well-conditioned system, scaled uniformly small,
// is spuriously read as singular — identical conditioning, opposite verdict, purely from absolute scale.
import { describe, it, expect, beforeAll } from "vitest";

let QD: any;
beforeAll(async () => {
  ({ default: QD } = await import("../app/solvers/solver.mjs"));
});

describe("houseQR / solveLinearSystem — the singular gate is ABSOLUTE (1e-13 pivot), not rcond", () => {
  const M = [
    [2, 1],
    [1, 3],
  ]; // cond ≈ 3.7 — thoroughly well-conditioned
  const b = [5, 10];

  it("solves the O(1)-scaled well-conditioned system and reports a small condEst", () => {
    const x = QD.solveLinearSystem(M, b); // 2a+b=5, a+3b=10 → a=1, b=3
    expect(x[0]).toBeCloseTo(1, 10);
    expect(x[1]).toBeCloseTo(3, 10);
    const qr = QD.houseQR(M);
    expect(qr.rank).toBe(2);
    expect(qr.condEst).toBeLessThan(100); // genuinely well-conditioned
  });

  it("spuriously throws 'singular' for the SAME system scaled uniformly to ~1e-14 (absolute-pivot artifact)", () => {
    const s = 1e-14;
    const Ms = M.map((row) => row.map((v) => v * s)); // identical condition number, |diag| ~ 1e-14 < 1e-13
    expect(() => QD.solveLinearSystem(Ms, b.map((v) => v * s))).toThrow(/singular/);
    // The QR of the scaled matrix reads rank-deficient purely because the pivots fell below the fixed tol.
    const qr = QD.houseQR(Ms);
    expect(qr.rank).toBeLessThan(2);
  });
});
