import { describe, it, expect } from "vitest";
import { computeReferenceOrbit } from "../src/render/perturbation";

/** Independent plain-double z²+c escape-count oracle. */
function mandelEscape(cx: number, cy: number, maxIter: number): number {
  let x = 0;
  let y = 0;
  for (let n = 0; n < maxIter; n++) {
    if (x * x + y * y > 4) return n;
    const xt = x * x - y * y + cx;
    y = 2 * x * y + cy;
    x = xt;
  }
  return maxIter;
}

describe("perturbation reference orbit (z²+c)", () => {
  it("escape iteration matches a plain-double Mandelbrot oracle", () => {
    const maxIter = 500;
    const points: [number, number][] = [
      [0, 0], // interior (fixed point)
      [-1, 0], // interior (period 2)
      [0.3, 0.5], // exterior, escapes quickly
      [-0.75, 0.1], // near the boundary
      [0.35, 0.35], // exterior
      [-0.123, 0.745], // near a tendril
    ];
    for (const [cx, cy] of points) {
      const orbit = computeReferenceOrbit(cx, cy, maxIter);
      const oracle = mandelEscape(cx, cy, maxIter);
      if (oracle >= maxIter) {
        expect(orbit.escaped).toBe(orbit.length); // bounded → never escaped
      } else {
        expect(orbit.escaped).toBe(oracle);
      }
    }
  });

  it("stores orbit samples that track the double-precision orbit", () => {
    const orbit = computeReferenceOrbit(-0.5, 0.5, 200);
    let x = 0;
    let y = 0;
    for (let n = 0; n < Math.min(orbit.length, 20); n++) {
      expect(orbit.xy[2 * n]).toBeCloseTo(x, 4);
      expect(orbit.xy[2 * n + 1]).toBeCloseTo(y, 4);
      const xt = x * x - y * y - 0.5;
      y = 2 * x * y + 0.5;
      x = xt;
    }
  });

  it("never stores more than maxIter+1 samples", () => {
    const orbit = computeReferenceOrbit(0, 0, 100);
    expect(orbit.length).toBeLessThanOrEqual(101);
    expect(orbit.xy.length).toBe(202);
  });
});
