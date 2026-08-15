import { describe, expect, it } from "vitest";
import { sampleCircle, pointInCircle, pointInPolygon, type Vec2 } from "../src/contour.js";

describe("contour sampling & enclosure", () => {
  const circle = { centerRe: 0.3, centerIm: -0.2, radius: 1.25 };

  it("sampleCircle returns n points, each on the circle", () => {
    const pts = sampleCircle(circle, 32);
    expect(pts).toHaveLength(32);
    for (const [x, y] of pts) {
      const r = Math.hypot(x - circle.centerRe, y - circle.centerIm);
      expect(r).toBeCloseTo(circle.radius, 10);
    }
  });

  it("sampleCircle enforces a minimum of 3 points", () => {
    expect(sampleCircle(circle, 1)).toHaveLength(3);
  });

  it("pointInCircle: strictly inside is true, outside/boundary is false", () => {
    expect(pointInCircle([circle.centerRe, circle.centerIm], circle)).toBe(true);
    expect(pointInCircle([10, 10], circle)).toBe(false);
    expect(pointInCircle([circle.centerRe + circle.radius, circle.centerIm], circle)).toBe(false);
  });

  it("pointInPolygon: even–odd rule on a unit square", () => {
    const square: Vec2[] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    expect(pointInPolygon([0.5, 0.5], square)).toBe(true);
    expect(pointInPolygon([1.5, 0.5], square)).toBe(false);
    expect(pointInPolygon([-0.5, 0.5], square)).toBe(false);
  });
});
