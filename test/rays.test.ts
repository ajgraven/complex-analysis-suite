import { describe, it, expect } from "vitest";
import {
  parameterRay,
  dynamicRay,
  parseAngle,
  rayDepthForZoom,
  bulbRayAngles,
} from "../src/render/rays";
import { bulbRoot } from "../src/render/farey";
import type { Vec2 } from "../src/arrays";

const last = (pts: Vec2[]): Vec2 => pts[pts.length - 1];
const dist = (a: Vec2, b: Vec2): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe("parameterRay (Mandelbrot)", () => {
  it("seeds the far field at R·e^{2πiθ}", () => {
    const p = parameterRay(0.125);
    expect(dist(p[0], [64 * Math.cos(Math.PI / 4), 64 * Math.sin(Math.PI / 4)])).toBeLessThan(1e-9);
  });

  it("angle 1/2 lands near the antenna tip c = -2", () => {
    expect(dist(last(parameterRay(0.5)), [-2, 0])).toBeLessThan(0.05);
  });

  it("angle 0 lands near the cardioid cusp c = 1/4", () => {
    expect(dist(last(parameterRay(0)), [0.25, 0])).toBeLessThan(0.05);
  });

  it("conjugate angles θ and 1−θ give conjugate landings", () => {
    const a = last(parameterRay(1 / 3));
    const b = last(parameterRay(2 / 3));
    expect(b[0]).toBeCloseTo(a[0], 4);
    expect(b[1]).toBeCloseTo(-a[1], 4);
    expect(a[1]).toBeGreaterThan(0); // 1/3 ray is in the upper half-plane
  });
});

describe("dynamicRay (filled Julia)", () => {
  it("for c=0 (unit disk) lands on the unit circle at e^{2πiθ}", () => {
    expect(dist(last(dynamicRay(0, [0, 0])), [1, 0])).toBeLessThan(1e-6);
    expect(dist(last(dynamicRay(0.25, [0, 0])), [0, 1])).toBeLessThan(1e-6);
    const t = (2 * Math.PI) / 3;
    expect(dist(last(dynamicRay(1 / 3, [0, 0])), [Math.cos(t), Math.sin(t)])).toBeLessThan(1e-6);
  });
});

describe("rayDepthForZoom", () => {
  it("holds at the default view and grows ~1 per zoom-doubling, clamped to [28, 50]", () => {
    expect(rayDepthForZoom(0.75)).toBe(28);
    expect(rayDepthForZoom(1)).toBe(28);
    expect(rayDepthForZoom(256)).toBe(36); // 28 + log2(256)=8
    expect(rayDepthForZoom(1e12)).toBe(50); // clamped
    expect(rayDepthForZoom(1e9)).toBeGreaterThan(rayDepthForZoom(1e3));
  });

  it("clamps exactly at the f64 budget and floors below zoom 1", () => {
    expect(rayDepthForZoom(2 ** 22)).toBe(50); // 28 + 22 = 50 (the knee)
    expect(rayDepthForZoom(2 ** 23)).toBe(50); // beyond → still clamped
    expect(rayDepthForZoom(0.01)).toBe(28); // zoom < 1 → floored at 28
  });
});

describe("parseAngle", () => {
  it("parses fractions and decimals", () => {
    expect(parseAngle("1/2")).toBe(0.5);
    expect(parseAngle("0.125")).toBe(0.125);
    expect(parseAngle("3/7")).toBeCloseTo(3 / 7, 12);
  });

  it("rejects garbage and divide-by-zero", () => {
    expect(parseAngle("1/0")).toBeNull();
    expect(parseAngle("abc")).toBeNull();
    expect(parseAngle("")).toBeNull();
  });

  it("handles negative fractions and whitespace, rejects multi-slash", () => {
    expect(parseAngle("-1/3")).toBeCloseTo(-1 / 3, 12);
    expect(parseAngle(" 1/2 ")).toBe(0.5);
    expect(parseAngle("1/2/3")).toBeNull();
  });
});

describe("bulbRayAngles", () => {
  it("returns the known landing pairs of the main-cardioid bulbs", () => {
    expect(bulbRayAngles(1, 2)).toEqual([1 / 3, 2 / 3]);
    expect(bulbRayAngles(1, 3)).toEqual([1 / 7, 2 / 7]);
    expect(bulbRayAngles(2, 3)).toEqual([5 / 7, 6 / 7]);
    expect(bulbRayAngles(1, 4)).toEqual([1 / 15, 2 / 15]);
    expect(bulbRayAngles(3, 4)).toEqual([13 / 15, 14 / 15]); // smallest gap is the wrap
  });

  it("rejects non-reduced or degenerate p/q", () => {
    expect(bulbRayAngles(2, 4)).toBeNull();
    expect(bulbRayAngles(0, 3)).toBeNull();
    expect(bulbRayAngles(3, 3)).toBeNull();
    expect(bulbRayAngles(1, 1)).toBeNull();
  });

  it("both rays land at the bulb root (cross-checked against bulbRoot)", () => {
    const cases: [number, number][] = [
      [1, 2],
      [1, 3],
      [2, 3],
      [1, 4],
      [2, 5],
    ];
    // Bulb roots are parabolic, so external rays approach them slowly (~1/depth, not
    // geometrically) — a depth-45 landing sits within ~0.1 of the root. That is far
    // tighter than the inter-bulb spacing (> 0.3), so it still pins each pair to the
    // correct bulb; this checks the angle↔bulb correspondence, not ray precision.
    for (const [p, q] of cases) {
      const angles = bulbRayAngles(p, q);
      expect(angles).not.toBeNull();
      const root = bulbRoot(p, q).c;
      for (const ang of angles ?? []) {
        expect(dist(last(parameterRay(ang, { depth: 45 })), root)).toBeLessThan(0.12);
      }
    }
  });
});
