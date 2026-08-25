import { describe, it, expect } from "vitest";
import { fitPolygonFlow } from "../src/polygonMap.js";
import type { Pt } from "../src/transplant.js";

// Ground-truth logarithmic capacities (plan §7): a square of side s has cap = s·0.295085…; a segment of
// length L has cap = L/4. The exterior SC fit + Laurent-at-∞ evaluator must reproduce these.
const square = (s: number): Pt[] => [
  [s / 2, -s / 2],
  [s / 2, s / 2],
  [-s / 2, s / 2],
  [-s / 2, -s / 2],
];

describe("exterior SC polygon flow map", () => {
  it("capacity of the side-2 square = 1.1803405990161", () => {
    const m = fitPolygonFlow(square(2));
    expect(m.converged).toBe(true);
    expect(m.capacity).toBeCloseTo(1.1803405990161, 6);
  });

  it("capacity scales linearly with size (unit square = 0.5901702995…)", () => {
    const m = fitPolygonFlow(square(1));
    expect(m.capacity).toBeCloseTo(0.5901702995080, 6);
  });

  it("interior angles are αₖ = ½ for every corner and sum to n − 2", () => {
    const m = fitPolygonFlow(square(2));
    for (const a of m.angles) expect(a).toBeCloseTo(0.5, 6);
    expect(m.angles.reduce((s, a) => s + a, 0)).toBeCloseTo(2, 6);
  });

  it("Ψ(ζ) ~ c·ζ at infinity (real-capacity Laurent frame)", () => {
    const m = fitPolygonFlow(square(2));
    const z = m.evalPsi([1000, 0]);
    expect(z[0]).toBeCloseTo(m.capacity * 1000, 2);
    expect(z[1]).toBeCloseTo(0, 2);
  });

  it("the boundary Ψ(∂𝔻) is a closed curve enclosing ~ the polygon area", () => {
    const m = fitPolygonFlow(square(2));
    const b = m.boundary(400);
    expect(b[0][0]).toBeCloseTo(b[b.length - 1][0], 9);
    expect(b[0][1]).toBeCloseTo(b[b.length - 1][1], 9);
    // Shoelace area of ∂K ≈ the side-2 square area (4), frame rotation preserves area.
    let area = 0;
    for (let i = 0; i < b.length - 1; i++) area += b[i][0] * b[i + 1][1] - b[i + 1][0] * b[i][1];
    expect(Math.abs(area) / 2).toBeCloseTo(4, 1);
  });

  it("flat-plate cross-check: a thinning rectangle → capacity of the segment (length/4 = 1)", () => {
    // A 4-long rectangle approximates the flat plate [−2, 2] (a degenerate 2-gon) as its thickness → 0;
    // its capacity must converge monotonically down toward cap([−2,2]) = 4/4 = 1.
    const plate = (t: number): Pt[] => [
      [2, -t],
      [2, t],
      [-2, t],
      [-2, -t],
    ];
    const thick = fitPolygonFlow(plate(0.2));
    const thin = fitPolygonFlow(plate(0.05));
    expect(thick.converged).toBe(true);
    expect(thin.converged).toBe(true);
    expect(thin.capacity).toBeGreaterThan(1); // still above the segment limit
    expect(thin.capacity).toBeLessThan(thick.capacity); // thinner ⇒ closer to the plate
    expect(thin.capacity).toBeLessThan(1.1); // within ~6% of cap([−2,2]) = 1 at 40:1 aspect
  });
});
