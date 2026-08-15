import { describe, expect, it } from "vitest";
import { gaussJacobi, gaussLegendre } from "../src/gaussJacobi.js";

describe("Gauss–Legendre quadrature", () => {
  it("matches the known 2-, 3-, 5-point nodes and weights", () => {
    const g2 = gaussLegendre(2);
    expect(g2.nodes[0]).toBeCloseTo(-0.5773502691896257, 12);
    expect(g2.nodes[1]).toBeCloseTo(0.5773502691896257, 12);
    expect(g2.weights[0]).toBeCloseTo(1, 12);
    expect(g2.weights[1]).toBeCloseTo(1, 12);

    const g3 = gaussLegendre(3);
    expect(g3.nodes[0]).toBeCloseTo(-0.7745966692414834, 12);
    expect(g3.nodes[1]).toBeCloseTo(0, 12);
    expect(g3.nodes[2]).toBeCloseTo(0.7745966692414834, 12);
    expect(g3.weights[0]).toBeCloseTo(5 / 9, 12);
    expect(g3.weights[1]).toBeCloseTo(8 / 9, 12);
    expect(g3.weights[2]).toBeCloseTo(5 / 9, 12);

    const g5 = gaussLegendre(5);
    expect(g5.nodes[2]).toBeCloseTo(0, 12);
    expect(g5.nodes[4]).toBeCloseTo(0.906179845938664, 12);
    expect(g5.weights[2]).toBeCloseTo(0.5688888888888889, 12);
    expect(g5.weights[4]).toBeCloseTo(0.23692688505618908, 12);
  });

  it("integrates polynomials up to degree 2n−1 exactly", () => {
    const g = gaussLegendre(3); // exact through degree 5
    const integ = (f: (t: number) => number) => g.nodes.reduce((s, t, i) => s + g.weights[i] * f(t), 0);
    expect(integ(() => 1)).toBeCloseTo(2, 12); // ∫₋₁¹ 1 = 2
    expect(integ((t) => t * t)).toBeCloseTo(2 / 3, 12); // ∫ t² = 2/3
    expect(integ((t) => t ** 4)).toBeCloseTo(2 / 5, 12); // ∫ t⁴ = 2/5
    expect(integ((t) => t ** 5)).toBeCloseTo(0, 12); // odd → 0
  });
});

describe("Gauss–Jacobi quadrature", () => {
  const weightSum = (n: number, a: number, b: number) => gaussJacobi(n, a, b).weights.reduce((s, w) => s + w, 0);
  const moment = (n: number, a: number, b: number, f: (t: number) => number) => {
    const g = gaussJacobi(n, a, b);
    return g.nodes.reduce((s, t, i) => s + g.weights[i] * f(t), 0);
  };

  it("weights sum to μ₀ = 2^{b+1}/(b+1) for a = 0", () => {
    for (const b of [-0.5, -2 / 3, -0.25, 0.5, 1]) {
      expect(weightSum(10, 0, b)).toBeCloseTo(Math.pow(2, b + 1) / (b + 1), 11);
    }
  });

  it("reproduces the first moment ∫₋₁¹ (1+t)^b · t dt", () => {
    for (const b of [-0.5, -2 / 3, 0.5]) {
      const exact = Math.pow(2, b + 2) / (b + 2) - Math.pow(2, b + 1) / (b + 1);
      expect(moment(12, 0, b, (t) => t)).toBeCloseTo(exact, 11);
    }
  });

  it("integrates (1+t)^{-1/2}·t² exactly", () => {
    // ∫₋₁¹ (1+t)^{-1/2} t² dt = (2/5)·2^{5/2} − (4/3)·2^{3/2} + 2·2^{1/2}
    const exact = (2 / 5) * 2 ** 2.5 - (4 / 3) * 2 ** 1.5 + 2 * 2 ** 0.5;
    expect(moment(4, 0, -0.5, (t) => t * t)).toBeCloseTo(exact, 11);
  });

  it("reduces to Gauss–Legendre when a = b = 0", () => {
    const gj = gaussJacobi(6, 0, 0);
    const gl = gaussLegendre(6);
    for (let i = 0; i < 6; i++) {
      expect(gj.nodes[i]).toBeCloseTo(gl.nodes[i], 13);
      expect(gj.weights[i]).toBeCloseTo(gl.weights[i], 13);
    }
  });

  it("rejects invalid parameters", () => {
    expect(() => gaussJacobi(0, 0, 0)).toThrow(/positive integer/);
    expect(() => gaussJacobi(4, 0, -1)).toThrow(/> −1/);
  });
});
