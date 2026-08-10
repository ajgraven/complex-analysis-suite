import { describe, it, expect } from "vitest";
import { parameterRay, dynamicRay, rayDepthForZoom, parseAngle } from "../src/rays.js";

type Vec2 = [number, number];
const last = (pts: Vec2[]): Vec2 => pts[pts.length - 1];
const dist = (a: Vec2, b: Vec2): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe("parameterRay (Mandelbrot external rays)", () => {
  it("the 1/2 ray lands at the tip c = −2", () => {
    expect(dist(last(parameterRay(0.5)), [-2, 0])).toBeLessThan(0.05);
  });
  it("the 0 ray lands at the cusp c = 1/4", () => {
    expect(dist(last(parameterRay(0)), [0.25, 0])).toBeLessThan(0.05);
  });
});

describe("dynamicRay (filled-Julia external rays)", () => {
  it("for c = 0 (unit disk) the θ ray lands at e^{2πiθ}", () => {
    expect(dist(last(dynamicRay(0, [0, 0])), [1, 0])).toBeLessThan(1e-6);
    expect(dist(last(dynamicRay(0.25, [0, 0])), [0, 1])).toBeLessThan(1e-6);
    const t = (2 * Math.PI) / 3;
    expect(dist(last(dynamicRay(1 / 3, [0, 0])), [Math.cos(t), Math.sin(t)])).toBeLessThan(1e-6);
  });
});

describe("rayDepthForZoom + parseAngle", () => {
  it("scales depth with zoom, clamped to the f64 budget", () => {
    expect(rayDepthForZoom(1)).toBe(28);
    expect(rayDepthForZoom(256)).toBe(36); // 28 + log2(256) = 36
    expect(rayDepthForZoom(1e12)).toBe(50); // clamped
  });
  it("parses fractions and decimals, rejecting junk", () => {
    expect(parseAngle("1/3")).toBeCloseTo(1 / 3, 12);
    expect(parseAngle("0.25")).toBe(0.25);
    expect(parseAngle("1/0")).toBeNull();
    expect(parseAngle("")).toBeNull();
  });
});
