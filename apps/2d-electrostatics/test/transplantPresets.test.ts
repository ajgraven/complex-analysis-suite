import { describe, it, expect } from "vitest";
import { POLYGON_PRESETS, DEFAULT_PRESET } from "../src/transplantPresets.js";
import { fitPolygonFlow } from "../src/polygonMap.js";

/** Signed area (shoelace); positive ⇒ counter-clockwise. */
function signedArea(pts: readonly (readonly [number, number])[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

describe("polygon presets", () => {
  it("every preset is counter-clockwise (the exterior SC solver's required orientation)", () => {
    for (const p of POLYGON_PRESETS) {
      expect(p.corners.length).toBeGreaterThanOrEqual(3);
      expect(signedArea(p.corners)).toBeGreaterThan(0);
    }
  });

  it("the default preset exists", () => {
    expect(POLYGON_PRESETS.some((p) => p.id === DEFAULT_PRESET)).toBe(true);
  });

  it("every preset fits and converges (a live guard on the preset geometry)", () => {
    for (const p of POLYGON_PRESETS) {
      const m = fitPolygonFlow(p.corners);
      expect(m.converged, `${p.id} should converge`).toBe(true);
      expect(m.capacity).toBeGreaterThan(0);
      expect(m.cornerImages.length).toBe(p.corners.length);
    }
  });
});
