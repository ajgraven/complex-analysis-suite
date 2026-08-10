import { describe, expect, it } from "vitest";
import { lstsqHouseholder } from "../src/solve/lstsq.js";

describe("Householder least squares (P3a)", () => {
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
});
