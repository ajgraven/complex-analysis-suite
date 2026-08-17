import { describe, expect, it } from "vitest";
import {
  evalPolyHorner,
  trimPoly,
  rootsMonic,
  rootsMonicClosure,
  type ComplexTuple,
} from "../src/index.js";

// Golden corpus for the app-facing monic-root plumbing consolidated from Complex-Dynamics'
// render/critical.ts and Argument-Principle's singularities.ts (ADR-0007, 2026-08 review finding 10).
// Pins the Horner eval, the trailing-zero trim, and the spiral-seeded Durand–Kerner (with the residual
// filter that AP's polyRoots applied). The apps' own golden suites pin that behaviour is unchanged.

const sortC = (a: readonly ComplexTuple[]): ComplexTuple[] =>
  [...a].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
const near = (a: ComplexTuple, b: ComplexTuple, tol = 1e-8): boolean =>
  Math.hypot(a[0] - b[0], a[1] - b[1]) < tol;
function rootsMatch(got: readonly ComplexTuple[], want: readonly ComplexTuple[]): boolean {
  if (got.length !== want.length) return false;
  const g = sortC(got);
  const w = sortC(want);
  return g.every((p, i) => near(p, w[i]));
}

describe("rootsMonic (app-facing Durand–Kerner plumbing)", () => {
  it("evalPolyHorner evaluates an ascending-coefficient polynomial", () => {
    // 1 + 2z + 3z² at z = 2 → 1 + 4 + 12 = 17
    expect(evalPolyHorner([[1, 0], [2, 0], [3, 0]], [2, 0])).toEqual([17, 0]);
    // (1 + i) + 2z at z = i → (1 + i) + 2i = 1 + 3i
    expect(evalPolyHorner([[1, 1], [2, 0]], [0, 1])).toEqual([1, 3]);
  });

  it("trimPoly drops trailing near-zero coefficients but keeps at least one", () => {
    expect(trimPoly([[1, 0], [2, 0], [0, 0], [1e-15, 0]])).toEqual([[1, 0], [2, 0]]);
    expect(trimPoly([[0, 0]])).toEqual([[0, 0]]); // degenerate: never trims below length 1
  });

  it("finds the roots of a real cubic (z−1)(z−2)(z−3)", () => {
    const roots = rootsMonic([[-6, 0], [11, 0], [-6, 0], [1, 0]]);
    expect(rootsMatch(roots, [[1, 0], [2, 0], [3, 0]])).toBe(true);
  });

  it("finds complex roots of z²+1 and divides out a non-monic lead", () => {
    expect(rootsMatch(rootsMonic([[1, 0], [0, 0], [1, 0]]), [[0, -1], [0, 1]])).toBe(true);
    // 2z² − 2 → the monic z² − 1's roots ±1 (the leading 2 is divided out)
    expect(rootsMatch(rootsMonic([[-2, 0], [0, 0], [2, 0]]), [[-1, 0], [1, 0]])).toBe(true);
  });

  it("returns [] for a degree < 1 polynomial", () => {
    expect(rootsMonic([[5, 0]])).toEqual([]);
    expect(rootsMonic([[0, 0]])).toEqual([]);
  });

  it("rootsMonicClosure returns the raw iterates (caller certifies), or null on divergence", () => {
    // Monic z² − 1 via a closure; the two iterates land near ±1.
    const pMonic = (z: ComplexTuple): ComplexTuple => [z[0] * z[0] - z[1] * z[1] - 1, 2 * z[0] * z[1]];
    const roots = rootsMonicClosure(pMonic, 2);
    expect(roots).not.toBeNull();
    expect(rootsMatch(roots ?? [], [[-1, 0], [1, 0]])).toBe(true);
    // A pMonic that is always non-finite ⇒ bailOnNonFinite ⇒ null (not a certified garbage root).
    expect(rootsMonicClosure(() => [Infinity, 0], 2)).toBeNull();
  });
});
