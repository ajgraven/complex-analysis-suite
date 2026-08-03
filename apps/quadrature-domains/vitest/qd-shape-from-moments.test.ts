// QD.Sym shape-from-moments (roadmap #18): exact Prony–Hankel reconstruction. Given a complex moment
// sequence m_k = Σ_j a_j z_j^k, the ORDER (= #nodes = the QD-order) is the exact rank of the Hankel moment
// matrix, and the exact PRONY polynomial P(z) = Π(z − z_j) comes from the Hankel system over ℚ(i). The win
// over floating-point Prony: the rank drop is an exact integer, and P is exact. Locks both against goldens.
import { describe, it, expect } from "vitest";
import _QD from "../app/solvers/solver.mjs";
import "../app/sym/sym-core.mjs";

const S: any = (_QD as any).Sym;
const { hankelRank, pronyPolynomial, shapeFromMoments } = S;

const near = (a: any, b: { re: number; im: number }, tol = 1e-6): boolean => Math.hypot(a.re - b.re, a.im - b.im) < tol;
const matchSet = (got: any[], want: { re: number; im: number }[], tol = 1e-6): boolean =>
  got.length === want.length && want.every((w) => got.some((gg) => near(gg, w, tol)));

// ascending real coefficients of the (real-coefficient) Prony polynomial, for comparison.
const reCoeffs = (r: any): number[] => r.coeffs.map((g: any) => g.toComplex().re);
const imCoeffs = (r: any): number[] => r.coeffs.map((g: any) => g.toComplex().im);

describe("QD.Sym shape-from-moments (Prony–Hankel)", () => {
  // Nodes {1,2,3}, weights {1,1,1} ⇒ m_k = 1^k + 2^k + 3^k (power sums). Prony (z−1)(z−2)(z−3).
  const M6 = [3, 6, 14, 36, 98, 276]; // m_0..m_5

  it("recovers the exact QD-order (Hankel rank drop)", () => {
    const r = hankelRank(M6);
    expect(r.ok).toBe(true);
    expect(r.order).toBe(3);
    // 6 moments ⇒ max Hankel size 3, and rank = 3 = size ⇒ saturated (the order could be higher).
    expect(r.hankelSize).toBe(3);
    expect(r.saturated).toBe(true);
    // With more moments the rank stabilises below the Hankel size — order 3 confirmed, not saturated.
    const M8 = [...M6, 794, 2316]; // m_6 = 1+64+729, m_7 = 1+128+2187
    const r8 = hankelRank(M8);
    expect(r8.order).toBe(3);
    expect(r8.hankelSize).toBe(4);
    expect(r8.saturated).toBe(false);
  });

  it("recovers the exact Prony polynomial z³ − 6z² + 11z − 6", () => {
    const r = pronyPolynomial(M6);
    expect(r.ok).toBe(true);
    expect(r.order).toBe(3);
    expect(reCoeffs(r)).toEqual([-6, 11, -6, 1]); // ascending: −6 + 11z − 6z² + z³
    expect(imCoeffs(r)).toEqual([0, 0, 0, 0]);
  });

  it("handles genuinely complex nodes 1±i ⇒ Prony z² − 2z + 2", () => {
    // m_k = (1+i)^k + (1−i)^k: m_0=2, m_1=2, m_2=0, m_3=−4.
    const M = [
      { re: 2, im: 0 },
      { re: 2, im: 0 },
      { re: 0, im: 0 },
      { re: -4, im: 0 },
    ];
    const r = pronyPolynomial(M);
    expect(r.order).toBe(2);
    expect(reCoeffs(r)).toEqual([2, -2, 1]); // z² − 2z + 2
    expect(imCoeffs(r)).toEqual([0, 0, 0]);
  });

  it("exact node i, −i (purely imaginary) ⇒ Prony z² + 1", () => {
    const M = [2, 0, -2, 0]; // i^k + (−i)^k
    const r = pronyPolynomial(M);
    expect(r.order).toBe(2);
    expect(reCoeffs(r)).toEqual([1, 0, 1]); // z² + 1
  });

  it("recovers a rational node/weight case exactly (fractions, not floats)", () => {
    // one node z = 1/2, weight 3 ⇒ m_k = 3·(1/2)^k: m_0=3, m_1=3/2, m_2=3/4, m_3=3/8. Order 1, P = z − 1/2.
    const M = [{ re: 3, im: 0 }, { re: 1.5, im: 0 }, { re: 0.75, im: 0 }, { re: 0.375, im: 0 }];
    expect(hankelRank(M).order).toBe(1);
    const r = pronyPolynomial(M, { order: 1 });
    // P = z − 1/2 ⇒ ascending [−1/2, 1]
    expect(reCoeffs(r)).toEqual([-0.5, 1]);
  });

  it("full reconstruction: nodes {1,2,3}, weights {1,1,1}, tiny residual", () => {
    const r = shapeFromMoments(M6);
    expect(r.ok).toBe(true);
    expect(r.order).toBe(3);
    expect(matchSet(r.nodes, [{ re: 1, im: 0 }, { re: 2, im: 0 }, { re: 3, im: 0 }])).toBe(true);
    expect(r.weights.every((w: any) => near(w, { re: 1, im: 0 }))).toBe(true);
    // the residual max_k |m_k − Σ a_j z_j^k| certifies nodes AND weights jointly.
    expect(r.maxResidual).toBeLessThan(1e-6);
  });

  it("full reconstruction of complex nodes 1±i (weights 1)", () => {
    const M = [{ re: 2, im: 0 }, { re: 2, im: 0 }, { re: 0, im: 0 }, { re: -4, im: 0 }];
    const r = shapeFromMoments(M);
    expect(r.order).toBe(2);
    expect(matchSet(r.nodes, [{ re: 1, im: 1 }, { re: 1, im: -1 }])).toBe(true);
    expect(r.weights.every((w: any) => near(w, { re: 1, im: 0 }))).toBe(true);
    expect(r.maxResidual).toBeLessThan(1e-6);
  });

  it("full reconstruction with unequal weights (nodes {0,2}, weights {1,3})", () => {
    // m_k = 1·0^k + 3·2^k: m_0 = 4, m_1 = 6, m_2 = 12, m_3 = 24.
    const r = shapeFromMoments([4, 6, 12, 24]);
    expect(r.order).toBe(2);
    expect(matchSet(r.nodes, [{ re: 0, im: 0 }, { re: 2, im: 0 }])).toBe(true);
    // weight at node 0 is 1, at node 2 is 3.
    const w0 = r.weights[r.nodes.findIndex((z: any) => near(z, { re: 0, im: 0 }))];
    const w2 = r.weights[r.nodes.findIndex((z: any) => near(z, { re: 2, im: 0 }))];
    expect(near(w0, { re: 1, im: 0 })).toBe(true);
    expect(near(w2, { re: 3, im: 0 })).toBe(true);
    expect(r.maxResidual).toBeLessThan(1e-6);
  });

  it("honest failures: empty sequence, and an over-stated order (singular Hankel)", () => {
    expect(hankelRank([]).ok).toBe(false);
    // force order 3 with only enough moments but a rank-2 sequence ⇒ singular Hankel.
    const rankTwo = [2, 0, -2, 0, 2, 0]; // i,−i pattern (order 2) padded; order-3 Hankel is singular
    const r = pronyPolynomial(rankTwo, { order: 3 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/singular/i);
  });
});
