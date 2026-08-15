import { describe, expect, it } from "vitest";
import {
  sampleCircle,
  pointInCircle,
  pointInPolygon,
  contourSamples,
  insideContour,
  contourBBox,
  pathStats,
  signedArea,
  orientCCW,
  type Vec2,
  type ContourShape,
} from "../src/contour.js";

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

describe("unified contour (circle | path)", () => {
  const circle: ContourShape = { kind: "circle", centerRe: 0, centerIm: 0, radius: 1 };
  const square: Vec2[] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  const path: ContourShape = { kind: "path", centerRe: 0, centerIm: 0, radius: 1, points: square };

  it("contourSamples: circle honors resolution; path returns its own vertices", () => {
    expect(contourSamples(circle, 40)).toHaveLength(40);
    expect(contourSamples(path, 40)).toHaveLength(4);
  });

  it("insideContour: routes to disk (circle) or polygon (path)", () => {
    expect(insideContour([0, 0], circle)).toBe(true);
    expect(insideContour([0.9, 0.9], circle)).toBe(false); // outside the unit disk
    expect(insideContour([0.9, 0.9], path)).toBe(true); // inside the square
    expect(insideContour([2, 0], path)).toBe(false);
  });

  it("a path with fewer than 3 points falls back to the circle", () => {
    const degenerate: ContourShape = { kind: "path", centerRe: 0, centerIm: 0, radius: 1, points: [[0, 0]] };
    expect(contourSamples(degenerate, 12)).toHaveLength(12); // circle fallback
  });

  it("contourBBox spans the circle / the path", () => {
    const bc = contourBBox(circle);
    expect(bc.minX).toBeCloseTo(-1, 12);
    expect(bc.maxY).toBeCloseTo(1, 12);
    const bp = contourBBox(path);
    expect([bp.minX, bp.maxX, bp.minY, bp.maxY]).toEqual([-1, 1, -1, 1]);
  });

  it("pathStats returns the centroid + mean radius", () => {
    const s = pathStats(square);
    expect(s.centerRe).toBeCloseTo(0, 12);
    expect(s.centerIm).toBeCloseTo(0, 12);
    expect(s.radius).toBeCloseTo(Math.SQRT2, 12); // each corner is √2 from the centroid
  });

  it("orientCCW normalizes a clockwise loop (so winding = N − P holds for any drawn direction)", () => {
    const cw: Vec2[] = [
      [-1, -1],
      [-1, 1],
      [1, 1],
      [1, -1],
    ];
    expect(signedArea(cw)).toBeLessThan(0); // clockwise
    expect(signedArea(orientCCW(cw))).toBeGreaterThan(0); // reversed to CCW
    expect(orientCCW(square)).toEqual(square); // an already-CCW loop is unchanged
  });
});
