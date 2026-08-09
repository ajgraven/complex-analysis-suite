import { describe, expect, it } from "vitest";
import { COLORMAPS, bakeAtlas, bakeRow, hsvCyclic, oklchCyclic } from "../src/render/colormaps.js";

describe("phase colormaps", () => {
  it("bakes one atlas row per colormap, opaque RGBA8", () => {
    const atlas = bakeAtlas(256);
    expect(atlas.width).toBe(256);
    expect(atlas.height).toBe(COLORMAPS.length);
    expect(atlas.data.length).toBe(256 * COLORMAPS.length * 4);
    for (let i = 3; i < atlas.data.length; i += 4) expect(atlas.data[i]).toBe(255);
  });

  it("keeps every sample in sRGB gamut [0,1]", () => {
    for (const cm of COLORMAPS) {
      for (let k = 0; k < 24; k++) {
        for (const channel of cm.sample(k / 24)) {
          expect(channel).toBeGreaterThanOrEqual(0);
          expect(channel).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("HSV wheel: red at phase 0, cyan at phase 1/2", () => {
    expect(hsvCyclic.sample(0)).toEqual([1, 0, 0]);
    const [r, g, b] = hsvCyclic.sample(0.5);
    expect(r).toBeCloseTo(0, 6);
    expect(g).toBeCloseTo(1, 6);
    expect(b).toBeCloseTo(1, 6);
  });

  it("is cyclic — the two endpoints of the loop nearly meet", () => {
    for (const cm of COLORMAPS) {
      const a = cm.sample(0);
      const b = cm.sample(1 - 1e-6);
      for (let i = 0; i < 3; i++) expect(Math.abs(a[i] - b[i])).toBeLessThan(0.05);
    }
  });

  it("bakeRow is deterministic", () => {
    expect(bakeRow(oklchCyclic, 8)).toEqual(bakeRow(oklchCyclic, 8));
  });
});
