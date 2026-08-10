import { describe, expect, it } from "vitest";
import { fitSmoothConformalMap } from "../src/solve/lightning.js";
import type { C } from "../src/solve/vandermondeArnoldi.js";

function sampleBoundary(m: number, gamma: (t: number) => C): C[] {
  return Array.from({ length: m }, (_, j) => gamma((2 * Math.PI * j) / m));
}

describe("smooth-domain Riemann map (P3a lightning core)", () => {
  it("recovers the closed form for a centred circle of radius R: f(z) = z/R", () => {
    const R = 2;
    const bdry = sampleBoundary(400, (t) => [R * Math.cos(t), R * Math.sin(t)]);
    const map = fitSmoothConformalMap(bdry, 16);
    expect(map.boundaryResidual).toBeLessThan(1e-8);
    // f(z) = z/R everywhere.
    const f1 = map.eval([1, 0]);
    expect(f1[0]).toBeCloseTo(0.5, 6);
    expect(f1[1]).toBeCloseTo(0, 6);
    const f2 = map.eval([0.6, 0.8]); // → (0.3, 0.4), |·| = 0.5
    expect(f2[0]).toBeCloseTo(0.3, 6);
    expect(f2[1]).toBeCloseTo(0.4, 6);
    // Boundary maps to the unit circle; centre maps to the centre.
    expect(Math.hypot(...map.eval([R, 0]))).toBeCloseTo(1, 6);
    expect(Math.hypot(...map.eval([0, 0]))).toBeCloseTo(0, 12);
  });

  it("achieves a small boundary residual for a smooth ellipse and keeps the interior inside 𝔻", () => {
    const bdry = sampleBoundary(600, (t) => [1.5 * Math.cos(t), 0.7 * Math.sin(t)]);
    const map = fitSmoothConformalMap(bdry, 60);
    expect(map.boundaryResidual).toBeLessThan(1e-4);
    expect(Math.hypot(...map.eval([0, 0]))).toBeCloseTo(0, 12); // f(0) = 0
    for (const p of [[0.5, 0], [0, 0.3], [-0.8, 0.2]] as C[]) {
      expect(Math.hypot(...map.eval(p))).toBeLessThan(1); // interior points stay inside the disk
    }
  });

  it("handles an off-centre circle (0 inside, boundary not centred): |f| = 1 on ∂Ω", () => {
    const bdry = sampleBoundary(500, (t) => [0.4 + Math.cos(t), Math.sin(t)]);
    const map = fitSmoothConformalMap(bdry, 40);
    expect(map.boundaryResidual).toBeLessThan(1e-6);
    expect(Math.hypot(...map.eval([0, 0]))).toBeCloseTo(0, 12);
  });
});
