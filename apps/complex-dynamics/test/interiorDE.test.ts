import { describe, expect, it } from "vitest";
import type { Complex } from "../src/complex";
import { interiorDistanceEstimate } from "../src/render/interiorDE";

/** Attracting fixed point (1 − √(1 − 4c))/2 for real c < 1/4 — the period-1 cycle point. */
function fixedPoint(c: number): Complex {
  return [(1 - Math.sqrt(1 - 4 * c)) / 2, 0];
}

describe("interiorDistanceEstimate (Mandelbrot interior DEM)", () => {
  it("cardioid nucleus c=0 (period 1) → 0.5", () => {
    expect(interiorDistanceEstimate([0, 0], [0, 0], 1)).toBeCloseTo(0.5, 12);
  });

  it("period-2 nucleus c=−1 → 0.25 (the bulb's exact radius)", () => {
    // z₀ = 0 lies on the 2-cycle 0 → −1 → 0 of z²−1.
    expect(interiorDistanceEstimate([-1, 0], [0, 0], 2)).toBeCloseTo(0.25, 12);
  });

  it("is finite and positive strictly inside a component", () => {
    const de = interiorDistanceEstimate([-0.2, 0], fixedPoint(-0.2), 1);
    expect(de).toBeGreaterThan(0);
    expect(Number.isFinite(de)).toBe(true);
  });

  it("shrinks toward the boundary (off-centre < nucleus)", () => {
    const atNucleus = interiorDistanceEstimate([0, 0], [0, 0], 1);
    const nearEdge = interiorDistanceEstimate([-0.6, 0], fixedPoint(-0.6), 1);
    expect(nearEdge).toBeLessThan(atNucleus);
    expect(nearEdge).toBeGreaterThan(0);
  });

  it("returns 0 (not NaN/∞) at a parabolic root where dz → 1", () => {
    // c = 1/4 cusp: fixed point 1/2, multiplier 2·(1/2) = 1 (parabolic).
    const de = interiorDistanceEstimate([0.25, 0], [0.5, 0], 1);
    expect(de).toBe(0);
  });

  it("handles a complex interior parameter (period-2 bulb interior)", () => {
    // c slightly inside the period-2 disk centred at −1, radius 1/4.
    const c: Complex = [-1, 0.1];
    // z₀ on its 2-cycle: solve numerically by iterating from 0 a few hundred times.
    let z: Complex = [0, 0];
    for (let k = 0; k < 2000; k++) z = [z[0] * z[0] - z[1] * z[1] + c[0], 2 * z[0] * z[1] + c[1]];
    const de = interiorDistanceEstimate(c, z, 2);
    expect(de).toBeGreaterThan(0);
    expect(de).toBeLessThan(0.25); // off-centre ⇒ less than the nucleus value
  });
});
