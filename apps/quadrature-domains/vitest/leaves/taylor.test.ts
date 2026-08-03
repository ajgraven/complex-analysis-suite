import { describe, expect, it } from "vitest";
import { Taylor } from "../../app/core/taylor.mjs";

// Golden + invariant tests for the ESM Taylor leaf. taylor.mjs imports complex.mjs, so this
// also exercises ESM intra-graph resolution.

type C = { re: number; im: number };
const R = (x: number): C => ({ re: x, im: 0 });
const cNear = (z: C, re: number, im: number, tol = 1e-10) =>
  Math.abs(z.re - re) < tol && Math.abs(z.im - im) < tol;
const seriesNear = (p: C[], expected: Array<[number, number]>, tol = 1e-10) =>
  expected.every(([re, im], i) => cNear(p[i], re, im, tol));

describe("Taylor (ESM leaf)", () => {
  it("mul: (1 + t)^2 = 1 + 2t + t^2", () => {
    const p = [R(1), R(1)];
    expect(seriesNear(Taylor.mul(p, p), [[1, 0], [2, 0], [1, 0]])).toBe(true);
  });

  it("reciprocal: 1/(1 + t) = 1 - t + t^2 - t^3", () => {
    const r = Taylor.reciprocal([R(1), R(1)], 3);
    expect(seriesNear(r, [[1, 0], [-1, 0], [1, 0], [-1, 0]])).toBe(true);
  });

  it("reciprocal round-trip: p · (1/p) = 1", () => {
    const p = [R(2), R(-1), R(0.5)];
    const prod = Taylor.mul(p, Taylor.reciprocal(p, 5), 5);
    expect(cNear(prod[0], 1, 0)).toBe(true);
    for (let i = 1; i <= 5; i++) expect(cNear(prod[i], 0, 0)).toBe(true);
  });

  it("exp(t) = Σ t^k / k!", () => {
    const r = Taylor.exp([R(0), R(1)], 4);
    expect(seriesNear(r, [[1, 0], [1, 0], [0.5, 0], [1 / 6, 0], [1 / 24, 0]])).toBe(true);
  });

  it("log ∘ exp ≈ identity", () => {
    const p = [R(0.3), R(0.5), R(-0.2), R(0.1)];
    const back = Taylor.log(Taylor.exp(p, 5), 5);
    expect(seriesNear(back, p.map((c) => [c.re, c.im] as [number, number]))).toBe(true);
  });

  it("compositional invert then compose ≈ identity", () => {
    const p = [R(0), R(1), R(0.5), R(-0.3), R(0.2)]; // p0 = 0, p1 = 1
    const q = Taylor.invert(p, 6);
    const id = Taylor.compose(p, q, 6); // p(q(t)) = t
    expect(cNear(id[0], 0, 0)).toBe(true);
    expect(cNear(id[1], 1, 0)).toBe(true);
    for (let i = 2; i <= 6; i++) expect(cNear(id[i], 0, 0)).toBe(true);
  });
});
