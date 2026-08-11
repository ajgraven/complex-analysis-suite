import { describe, expect, it } from "vitest";
import { COLORMAPS, colormapColors, colormapGradientCss } from "../src/render/colormaps.js";

describe("colormaps (A6)", () => {
  it("ships the perceptually-uniform set + grayscale, each ≥2 anchors in 0–255", () => {
    const ids = COLORMAPS.map((c) => c.id);
    for (const want of ["viridis", "magma", "inferno", "plasma", "turbo", "grayscale"]) {
      expect(ids).toContain(want);
    }
    for (const c of COLORMAPS) {
      expect(c.colors.length).toBeGreaterThanOrEqual(2);
      for (const rgb of c.colors) {
        for (const v of rgb) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(255);
        }
      }
    }
  });

  it("colormapColors falls back to viridis for an unknown id", () => {
    expect(colormapColors("nope")).toBe(colormapColors("viridis"));
  });

  it("colormapGradientCss builds a linear-gradient that differs per map", () => {
    expect(colormapGradientCss("viridis")).toContain("linear-gradient");
    expect(colormapGradientCss("inferno")).not.toBe(colormapGradientCss("viridis"));
  });
});
