import { describe, it, expect } from "vitest";
import { schwarzColormapGradientCss } from "../src/render/schwarzLegend";
import { SCHWARZ_COLORMAPS, DEFAULT_SCHWARZ_COLORMAP } from "../src/render/schwarzColormaps";
import { SCHWARZ_FLAT_RGB } from "../src/render/schwarzView";

// The σ legend ramp (schwarzColormapGradientCss) must sample the SAME colormap tables the field uses, so
// the chip reads as the on-screen colours. The DOM renderer itself is exercised in the built app
// (Playwright) since the node gate has no DOM. The flat-colour pins guard the legend's swatches against
// drifting from the shader / CPU render literals.

describe("schwarzColormapGradientCss", () => {
  it("is a 90° linear-gradient with one stop per palette colour", () => {
    const css = schwarzColormapGradientCss("viridis");
    expect(css.startsWith("linear-gradient(90deg,")).toBe(true);
    const stops = css.match(/rgb\(/g) ?? [];
    expect(stops.length).toBe(SCHWARZ_COLORMAPS.viridis.length);
  });

  it("anchors the end stops on the palette endpoints (0% and 100%)", () => {
    const css = schwarzColormapGradientCss("viridis");
    expect(css).toContain("rgb(68, 1, 84) 0%"); // viridis[0]
    expect(css).toContain("rgb(253, 231, 37) 100%"); // viridis last
  });

  it("grayscale is achromatic end to end (black → white)", () => {
    const css = schwarzColormapGradientCss("grayscale");
    expect(css).toContain("rgb(0, 0, 0) 0%");
    expect(css).toContain("rgb(255, 255, 255) 100%");
    for (const [, r, g, b] of css.matchAll(/rgb\((\d+), (\d+), (\d+)\)/g)) {
      expect(r).toBe(g);
      expect(g).toBe(b);
    }
  });

  it("falls back to the default palette for an unknown name (never throws)", () => {
    expect(schwarzColormapGradientCss("does-not-exist")).toBe(
      schwarzColormapGradientCss(DEFAULT_SCHWARZ_COLORMAP),
    );
  });
});

describe("SCHWARZ_FLAT_RGB", () => {
  it("matches the flat classification literals the shader + CPU render paint", () => {
    expect(SCHWARZ_FLAT_RGB.escaped).toEqual([0, 0, 0]);
    expect(SCHWARZ_FLAT_RGB.interior).toEqual([18, 20, 46]);
    expect(SCHWARZ_FLAT_RGB.invalid).toEqual([80, 80, 80]);
  });
});
