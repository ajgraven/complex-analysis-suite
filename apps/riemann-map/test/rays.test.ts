import { describe, expect, it } from "vitest";
import { quadraticJuliaC, juliaExternalRays, DEFAULT_RAY_ANGLES } from "../src/analysis/rays.js";

describe("Julia external rays (D5, on @cas/dynamics)", () => {
  it("recognises a monic z²+c map and reads off c, rejecting the rest", () => {
    const c = quadraticJuliaC("z*z - 1"); // basilica
    expect(c).not.toBeNull();
    if (c) {
      expect(c[0]).toBeCloseTo(-1, 12);
      expect(c[1]).toBeCloseTo(0, 12);
    }
    expect(quadraticJuliaC("z*z + 0.5*z")).toBeNull(); // has a linear term
    expect(quadraticJuliaC("2*z*z")).toBeNull(); // not monic
    expect(quadraticJuliaC("z*z*z - 1")).toBeNull(); // degree 3
    expect(quadraticJuliaC("exp(z)")).toBeNull(); // transcendental
  });

  it("traces a fan of rays for a z²+c map; the 0-ray of the unit disk lands at (1,0)", () => {
    const rays = juliaExternalRays("z*z", DEFAULT_RAY_ANGLES); // c = 0 → unit disk
    expect(rays).not.toBeNull();
    if (!rays) return;
    expect(rays.length).toBe(DEFAULT_RAY_ANGLES.length);
    const r0 = rays.find((r) => r.angle === 0);
    expect(r0).toBeDefined();
    if (!r0) return;
    const land = r0.pts[r0.pts.length - 1];
    expect(Math.hypot(land[0] - 1, land[1])).toBeLessThan(1e-6);
  });

  it("returns null for a non-quadratic map", () => {
    expect(juliaExternalRays("z*z*z + 0.1", DEFAULT_RAY_ANGLES)).toBeNull();
  });
});
