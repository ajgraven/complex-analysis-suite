import { describe, expect, it } from "vitest";
import { lstsqHouseholder } from "../src/lstsq.js";

describe("Householder least squares (@cas/core)", () => {
  it("recovers the exact solution of a consistent overdetermined line fit y = 2x + 1", () => {
    // 3 collinear points on y = 2x+1; columns [x, 1].
    const A = [
      [0, 1],
      [1, 1],
      [2, 1],
    ];
    const b = [1, 3, 5];
    const x = lstsqHouseholder(A, b);
    expect(x[0]).toBeCloseTo(2, 10);
    expect(x[1]).toBeCloseTo(1, 10);
  });

  it("minimises the residual for an inconsistent system (best-fit slope/intercept)", () => {
    // y = [1, 2, 2] at x = [0,1,2]: least-squares line has slope 0.5, intercept 7/6.
    const A = [
      [0, 1],
      [1, 1],
      [2, 1],
    ];
    const b = [1, 2, 2];
    const x = lstsqHouseholder(A, b);
    expect(x[0]).toBeCloseTo(0.5, 10);
    expect(x[1]).toBeCloseTo(7 / 6, 10);
  });

  it("solves a square full-rank system exactly", () => {
    const A = [
      [2, 1],
      [1, 3],
    ];
    const b = [5, 10];
    const x = lstsqHouseholder(A, b); // 2a+b=5, a+3b=10 → a=1, b=3
    expect(x[0]).toBeCloseTo(1, 10);
    expect(x[1]).toBeCloseTo(3, 10);
  });

  it("returns 0 for a rank-deficient column rather than NaN", () => {
    // Column 1 is all-zero (rank-deficient); the stable choice sets x[1] = 0 and fits the rest.
    const A = [
      [1, 0],
      [2, 0],
      [3, 0],
    ];
    const b = [2, 4, 6]; // b = 2·col0
    const x = lstsqHouseholder(A, b);
    expect(x[0]).toBeCloseTo(2, 10);
    expect(x[1]).toBe(0);
    expect(Number.isNaN(x[1])).toBe(false);
  });

  it("throws on an underdetermined system (m < n)", () => {
    expect(() => lstsqHouseholder([[1, 2, 3]], [1])).toThrow(/underdetermined/);
  });

  it("throws when b's length does not match the row count", () => {
    // A has 3 rows; b has 2 entries.
    expect(() =>
      lstsqHouseholder(
        [
          [1, 0],
          [0, 1],
          [1, 1],
        ],
        [1, 2],
      ),
    ).toThrow(/b length/);
  });

  it("amplifies (does NOT zero-fill or regularize) a numerically near-dependent column", () => {
    // The `|pivot| < 1e-300` guard is an EXACT-zero test, not an ill-conditioning gate. col1 ≈ col0,
    // differing only by ε in row 1 — a *numerically* rank-deficient basis. The exact fit of b needs huge
    // opposing coefficients (x ≈ [−1/ε, +1/ε]); un-pivoted Householder QR returns exactly that — finite,
    // non-zero, amplified — rather than the 0 the exact-zero case yields. This pins the documented contract.
    const eps = 1e-12;
    const A = [
      [1, 1],
      [1, 1 + eps],
      [1, 1],
    ];
    const b = [0, 1, 0];
    const x = lstsqHouseholder(A, b);
    expect(Number.isFinite(x[0])).toBe(true);
    expect(Number.isFinite(x[1])).toBe(true);
    expect(x[1]).not.toBe(0); // NOT zero-filled — the contrast with the exact-zero column above
    expect(Math.abs(x[1])).toBeGreaterThan(1e9); // amplified ~1/ε, no regularization
    expect(Math.abs(x[0])).toBeGreaterThan(1e9);
    // Despite the blow-up in the coefficients, the residual is ~0: it fits, just not stably.
    const resid = [
      A[0][0] * x[0] + A[0][1] * x[1] - b[0],
      A[1][0] * x[0] + A[1][1] * x[1] - b[1],
      A[2][0] * x[0] + A[2][1] * x[1] - b[2],
    ];
    const rNorm = Math.hypot(resid[0], resid[1], resid[2]);
    expect(rNorm).toBeLessThan(1e-6);
  });

  it("recovers a mildly ill-conditioned but full-rank Vandermonde fit with a bounded residual", () => {
    // Overdetermined (4 nodes, 3 coeffs) exact quadratic y = 1 + 2x + 3x² sampled at x = 1..4.
    // Columns [1, x, x²] form a Vandermonde (mildly ill-conditioned); a stable solve recovers [1,2,3].
    const nodes = [1, 2, 3, 4];
    const A = nodes.map((x) => [1, x, x * x]);
    const b = nodes.map((x) => 1 + 2 * x + 3 * x * x);
    const c = lstsqHouseholder(A, b);
    expect(c[0]).toBeCloseTo(1, 6);
    expect(c[1]).toBeCloseTo(2, 6);
    expect(c[2]).toBeCloseTo(3, 6);
    const rNorm = Math.hypot(...nodes.map((x, i) => c[0] + c[1] * x + c[2] * x * x - b[i]));
    expect(rNorm).toBeLessThan(1e-9);
  });
});
