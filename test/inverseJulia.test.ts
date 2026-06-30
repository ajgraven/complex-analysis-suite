import { describe, expect, it } from "vitest";
import type { Complex } from "../src/complex";
import { betaFixedPoint, inverseJuliaCloud } from "../src/render/inverseJulia";

const mod = (z: Complex): number => Math.hypot(z[0], z[1]);

describe("inverseJuliaCloud", () => {
  it("c = 0 → the unit circle (every point has |z| = 1)", () => {
    const pts = inverseJuliaCloud([0, 0], 2000);
    let maxErr = 0;
    for (const p of pts) maxErr = Math.max(maxErr, Math.abs(mod(p) - 1));
    expect(maxErr).toBeLessThan(1e-9);
    expect(pts.length).toBe(2000);
  });

  it("c = −1 (basilica) → bounded and spread (not a circle)", () => {
    const pts = inverseJuliaCloud([-1, 0], 3000);
    let maxMod = 0;
    let minMod = Infinity;
    for (const p of pts) {
      const m = mod(p);
      maxMod = Math.max(maxMod, m);
      minMod = Math.min(minMod, m);
    }
    expect(maxMod).toBeLessThan(2); // the basilica fits well inside |z| < 2
    expect(maxMod - minMod).toBeGreaterThan(0.3); // genuinely spread, not the unit circle
  });

  it("is deterministic for a fixed seed and varies with the seed", () => {
    const a = inverseJuliaCloud([-0.4, 0.6], 500, 30, 1);
    const b = inverseJuliaCloud([-0.4, 0.6], 500, 30, 1);
    const c = inverseJuliaCloud([-0.4, 0.6], 500, 30, 2);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("β fixed point solves z²+c = z and is repelling (|2z| ≥ 1)", () => {
    const c: Complex = [-0.123, 0.745];
    const b = betaFixedPoint(c);
    const fz: Complex = [b[0] * b[0] - b[1] * b[1] + c[0], 2 * b[0] * b[1] + c[1]];
    expect(fz[0]).toBeCloseTo(b[0], 9);
    expect(fz[1]).toBeCloseTo(b[1], 9);
    expect(2 * mod(b)).toBeGreaterThanOrEqual(1);
  });
});
