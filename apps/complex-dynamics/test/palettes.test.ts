import { describe, it, expect } from "vitest";
import {
  buildGradient,
  DEFAULT_GRADIENT,
  paletteRGB,
  sampleGradient,
  type GradientStop,
} from "../src/palettes";

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

// The plot legend samples the palettes in JS to draw its swatch, so `paletteRGB` must be the exact
// twin of the shader's `palette(t)` (src/render/shaderBuilder.ts COLOR_GLSL). Closed-form palettes
// (grayscale, classic, cividis, custom) are checked exactly; the degree-6 viridis/magma fits at
// their well-known endpoints.
describe("paletteRGB", () => {
  it("grayscale is the identity ramp", () => {
    expect(paletteRGB("grayscale", 0)).toEqual([0, 0, 0]);
    expect(paletteRGB("grayscale", 0.5)).toEqual([128, 128, 128]);
    expect(paletteRGB("grayscale", 1)).toEqual([255, 255, 255]);
  });

  it("classic runs from deep blue to bright yellow", () => {
    expect(paletteRGB("classic", 0)).toEqual([0, 0, 179]); // s=0 → (0,0,0.7)·255
    expect(paletteRGB("classic", 1)).toEqual([255, 255, 0]); // s=1 → (4,1.3,0) clamped
  });

  it("cividis interpolates its matplotlib anchors (dark blue → yellow)", () => {
    expect(paletteRGB("cividis", 0)).toEqual([0, 34, 78]);
    expect(paletteRGB("cividis", 1)).toEqual([255, 234, 70]);
  });

  it("viridis starts dark purple and ends yellow", () => {
    const lo = paletteRGB("viridis", 0);
    expect(lo[0]).toBeCloseTo(71, -1); // ~[71, 1, 85]
    expect(lo[2]).toBeGreaterThan(lo[1]); // more blue than green at the start
    const hi = paletteRGB("viridis", 1);
    expect(hi[0]).toBeGreaterThan(220);
    expect(hi[1]).toBeGreaterThan(200);
    expect(hi[2]).toBeLessThan(90);
  });

  it("magma runs near-black to pale", () => {
    expect(Math.max(...paletteRGB("magma", 0))).toBeLessThan(20);
    expect(Math.min(...paletteRGB("magma", 1))).toBeGreaterThan(140); // pale [~252, 253, 191]
  });

  it("custom samples the supplied gradient stops", () => {
    expect(paletteRGB("custom", 0, DEFAULT_GRADIENT)).toEqual([8, 12, 80]);
    expect(paletteRGB("custom", 0.25, DEFAULT_GRADIENT)).toEqual([32, 140, 200]);
    expect(paletteRGB("custom", 1, DEFAULT_GRADIENT)).toEqual([120, 10, 40]);
  });

  it("clamps t to [0,1] so the legend shows the full ramp (no wrap at the ends)", () => {
    expect(paletteRGB("grayscale", 1.5)).toEqual([255, 255, 255]);
    expect(paletteRGB("grayscale", -0.25)).toEqual([0, 0, 0]);
  });

  it("always returns integer channels in 0..255", () => {
    for (const name of ["classic", "viridis", "magma", "cividis", "grayscale"] as const) {
      for (let t = 0; t <= 1.0001; t += 0.05) {
        for (const ch of paletteRGB(name, t)) {
          expect(Number.isInteger(ch)).toBe(true);
          expect(ch).toBeGreaterThanOrEqual(0);
          expect(ch).toBeLessThanOrEqual(255);
        }
      }
    }
  });
});

describe("sampleGradient", () => {
  it("clamps outside the stop range and lerps within", () => {
    expect(sampleGradient(DEFAULT_GRADIENT, -1)).toEqual([8, 12, 80]);
    expect(sampleGradient(DEFAULT_GRADIENT, 2)).toEqual([120, 10, 40]);
    expect(sampleGradient(DEFAULT_GRADIENT, 0.375)[0]).toBeCloseTo(136, 0); // halfway 32→240
  });
});
