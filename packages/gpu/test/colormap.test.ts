import { describe, expect, it } from "vitest";
import {
  buildColormapLUT,
  buildGradientLUT,
  sampleStops,
  type ColorStop,
  type RGB,
} from "../src/colormap.js";

// Golden corpus for the colormap ramp builders (@cas/gpu's roadmapped colormaps slice). The values
// pin the two apps' existing arithmetic: even-spaced tables (QD schwarz-webgl buildColormapTexture)
// and positioned stops (CD palettes buildGradient/sampleGradient). Adoption must stay bit-identical.

describe("@cas/gpu colormap — even-spaced (buildColormapLUT)", () => {
  it("black→white 2-colour ramp: exact endpoints, ~mid midpoint", () => {
    const lut = buildColormapLUT([[0, 0, 0], [255, 255, 255]], 256);
    expect([lut[0], lut[1], lut[2], lut[3]]).toEqual([0, 0, 0, 255]);
    const last = 255 * 4;
    expect([lut[last], lut[last + 1], lut[last + 2], lut[last + 3]]).toEqual([255, 255, 255, 255]);
    const mid = 128 * 4;
    expect(lut[mid]).toBeGreaterThan(120);
    expect(lut[mid]).toBeLessThan(136);
  });

  it("t = 1 lands exactly on the final colour (last-segment clamp)", () => {
    const lut = buildColormapLUT([[10, 20, 30], [40, 50, 60], [70, 80, 90]], 256);
    expect([lut[0], lut[1], lut[2]]).toEqual([10, 20, 30]);
    const last = 255 * 4;
    expect([lut[last], lut[last + 1], lut[last + 2]]).toEqual([70, 80, 90]);
  });

  it("reproduces QD's viridis endpoints", () => {
    const viridis: RGB[] = [
      [68, 1, 84], [72, 40, 120], [62, 73, 137], [49, 104, 142], [38, 130, 142],
      [31, 158, 137], [53, 183, 121], [109, 205, 89], [180, 222, 44], [253, 231, 37],
    ];
    const lut = buildColormapLUT(viridis, 256);
    expect([lut[0], lut[1], lut[2]]).toEqual([68, 1, 84]);
    const last = 255 * 4;
    expect([lut[last], lut[last + 1], lut[last + 2]]).toEqual([253, 231, 37]);
  });

  it("degenerate single-colour palette → a solid ramp", () => {
    const lut = buildColormapLUT([[12, 34, 56]], 4);
    for (let i = 0; i < 4; i++) {
      expect([lut[i * 4], lut[i * 4 + 1], lut[i * 4 + 2]]).toEqual([12, 34, 56]);
    }
  });
});

describe("@cas/gpu colormap — positioned (buildGradientLUT / sampleStops)", () => {
  // CD's DEFAULT_GRADIENT — reuse its proven goldens (test/palettes.test.ts) to prove parity.
  const stops: ColorStop[] = [
    { t: 0.0, color: [8, 12, 80] },
    { t: 0.25, color: [32, 140, 200] },
    { t: 0.5, color: [240, 240, 150] },
    { t: 0.75, color: [220, 90, 30] },
    { t: 1.0, color: [120, 10, 40] },
  ];

  it("LUT endpoints match the end stops", () => {
    const lut = buildGradientLUT(stops, 256);
    expect([lut[0], lut[1], lut[2], lut[3]]).toEqual([8, 12, 80, 255]);
    const last = 255 * 4;
    expect([lut[last], lut[last + 1], lut[last + 2]]).toEqual([120, 10, 40]);
  });

  it("width = 3 samples at t = 0, 0.5, 1 (hits the middle stop exactly)", () => {
    const lut = buildGradientLUT(stops, 3);
    expect([lut[0], lut[1], lut[2]]).toEqual([8, 12, 80]);
    expect([lut[4], lut[5], lut[6]]).toEqual([240, 240, 150]);
    expect([lut[8], lut[9], lut[10]]).toEqual([120, 10, 40]);
  });

  it("sampleStops clamps outside [first,last] and lerps within", () => {
    expect(sampleStops(stops, -1)).toEqual([8, 12, 80]);
    expect(sampleStops(stops, 2)).toEqual([120, 10, 40]);
    expect(sampleStops(stops, 0.375)[0]).toBeCloseTo(136, 0); // halfway 32 → 240
  });
});
