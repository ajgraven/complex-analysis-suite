import { describe, it, expect } from "vitest";
import { buildGradient, DEFAULT_GRADIENT, type GradientStop } from "../src/palettes";

describe("buildGradient", () => {
  it("produces a width×1 RGBA ramp with opaque alpha", () => {
    const g = buildGradient(DEFAULT_GRADIENT, 256);
    expect(g.length).toBe(256 * 4);
    for (let i = 3; i < g.length; i += 4) expect(g[i]).toBe(255);
  });

  it("matches stop colours at the endpoints", () => {
    const stops: GradientStop[] = [
      { t: 0, color: [10, 20, 30] },
      { t: 1, color: [200, 100, 50] },
    ];
    const g = buildGradient(stops, 256);
    expect([g[0], g[1], g[2]]).toEqual([10, 20, 30]);
    expect([g[255 * 4], g[255 * 4 + 1], g[255 * 4 + 2]]).toEqual([200, 100, 50]);
  });

  it("interpolates linearly at the midpoint", () => {
    const stops: GradientStop[] = [
      { t: 0, color: [0, 0, 0] },
      { t: 1, color: [100, 200, 50] },
    ];
    const g = buildGradient(stops, 3); // indices 0,1,2 → t = 0, 0.5, 1
    expect([g[4], g[5], g[6]]).toEqual([50, 100, 25]);
  });

  it("clamps samples outside the stop range to the end colours", () => {
    const stops: GradientStop[] = [
      { t: 0.25, color: [40, 50, 60] },
      { t: 0.75, color: [200, 210, 220] },
    ];
    const g = buildGradient(stops, 256);
    expect([g[0], g[1], g[2]]).toEqual([40, 50, 60]); // t=0 < first stop
    expect([g[255 * 4], g[255 * 4 + 1], g[255 * 4 + 2]]).toEqual([200, 210, 220]); // t=1 > last
  });
});
