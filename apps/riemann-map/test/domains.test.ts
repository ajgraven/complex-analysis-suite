import { describe, expect, it } from "vitest";
import { DOMAIN_PRESETS, domainById, sampleDomainBoundary, conformalSourceGrid, type C } from "../src/domains.js";
import { fitSmoothConformalMap } from "../src/solve/lightning.js";

/** Winding number of a closed polyline about the origin (÷2π); ≈1 ⇒ 0 is enclosed. */
function windingAboutOrigin(poly: readonly C[]): number {
  let total = 0;
  for (let i = 0; i + 1 < poly.length; i++) {
    const a = poly[i];
    const b = poly[i + 1];
    total += Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]);
  }
  return total / (2 * Math.PI);
}

describe("preset domains + conformal source grid (P3b)", () => {
  it("every preset is star-shaped about 0 (positive radius) and encloses the origin", () => {
    for (const d of DOMAIN_PRESETS) {
      for (let k = 0; k < 64; k++) {
        expect(d.radius((2 * Math.PI * k) / 64)).toBeGreaterThan(0);
      }
      const boundary = [...sampleDomainBoundary(d, 200), sampleDomainBoundary(d, 200)[0]];
      expect(windingAboutOrigin(boundary)).toBeCloseTo(1, 6);
    }
  });

  it("conformalSourceGrid returns the requested spokes/rings, all finite", () => {
    const blob = domainById("blob");
    expect(blob).toBeDefined();
    if (!blob) return;
    const g = conformalSourceGrid(blob, 12, 5, 80);
    expect(g.spokes.length).toBe(12);
    expect(g.rings.length).toBe(5);
    for (const line of [g.boundary, ...g.spokes, ...g.rings]) {
      for (const p of line) expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(true);
    }
  });

  it("the fitted map sends every preset boundary onto the unit circle to good accuracy", () => {
    for (const d of DOMAIN_PRESETS) {
      const bdry = sampleDomainBoundary(d, 500);
      const map = fitSmoothConformalMap(bdry, 50);
      // Sub-1% boundary residual on every preset — a valid numerical map (the wavy blob is the loosest).
      expect(map.boundaryResidual, `${d.id} residual`).toBeLessThan(1e-2);
      // A ring interior to Ω maps strictly inside the disk.
      const ring = conformalSourceGrid(d, 4, 3, 40).rings[0];
      for (const p of ring) expect(Math.hypot(...map.eval(p))).toBeLessThan(1);
    }
  });
});
