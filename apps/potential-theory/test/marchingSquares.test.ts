import { describe, it, expect } from "vitest";
import { sampleField, contourSegments } from "../src/render/marchingSquares.js";
import type { Pt } from "@cas/flow";

describe("marching squares", () => {
  it("contours |z| = r as a circle of radius r", () => {
    const field = sampleField((z: Pt) => Math.hypot(z[0], z[1]), { minx: -2, maxx: 2, miny: -2, maxy: 2 }, 201, 201);
    const segs = contourSegments(field, 1.3);
    expect(segs.length).toBeGreaterThan(50);
    for (const [a, b] of segs) {
      expect(Math.hypot(a[0], a[1])).toBeCloseTo(1.3, 1); // endpoints lie on the circle
      expect(Math.hypot(b[0], b[1])).toBeCloseTo(1.3, 1);
    }
  });

  it("returns no segments when the level is outside the field range", () => {
    const field = sampleField((z: Pt) => z[0], { minx: 0, maxx: 1, miny: 0, maxy: 1 }, 20, 20);
    expect(contourSegments(field, 5).length).toBe(0);
  });
});
