import { describe, expect, it } from "vitest";
import {
  EXPORT_MIN,
  clampLongEdge,
  exportDims,
  ensurePngName,
} from "../src/render/exportImage.js";

// Phase 6 / 6A (K1): the pure size + naming algebra behind the hi-res PNG export. Pinned here so the GL
// render check only has to prove that painting at these dimensions produces a correct larger image.

describe("clampLongEdge", () => {
  it("passes a valid request through unclamped", () => {
    expect(clampLongEdge(2000, 8192)).toEqual({ size: 2000, clamped: false });
  });

  it("clamps above the device max texture size", () => {
    expect(clampLongEdge(10000, 8192)).toEqual({ size: 8192, clamped: true });
  });

  it("clamps below the export floor", () => {
    expect(clampLongEdge(100, 8192)).toEqual({ size: EXPORT_MIN, clamped: true });
  });

  it("rounds a fractional request without reporting a clamp", () => {
    expect(clampLongEdge(2000.4, 8192)).toEqual({ size: 2000, clamped: false });
  });

  it("survives a degenerate max (0 / NaN) by falling back to the floor", () => {
    expect(clampLongEdge(2000, 0)).toEqual({ size: EXPORT_MIN, clamped: true });
    expect(clampLongEdge(2000, Number.NaN).size).toBe(EXPORT_MIN);
  });
});

describe("exportDims", () => {
  it("pins the long edge to width in landscape, height in portrait", () => {
    expect(exportDims(1.6, 2000)).toEqual({ w: 2000, h: 1250 });
    expect(exportDims(0.625, 2000)).toEqual({ w: 1250, h: 2000 });
    expect(exportDims(1, 2000)).toEqual({ w: 2000, h: 2000 });
  });

  it("keeps the long edge exactly at the requested size for any aspect", () => {
    for (const a of [0.4, 0.8, 1, 1.3, 2.5]) {
      const { w, h } = exportDims(a, 3000);
      expect(Math.max(w, h)).toBe(3000);
      expect(Math.abs(w / h - a)).toBeLessThan(0.01); // aspect preserved (to rounding)
    }
  });

  it("guards a non-finite or non-positive aspect as square", () => {
    expect(exportDims(Number.NaN, 2000)).toEqual({ w: 2000, h: 2000 });
    expect(exportDims(0, 2000)).toEqual({ w: 2000, h: 2000 });
    expect(exportDims(-1.5, 2000)).toEqual({ w: 2000, h: 2000 });
  });
});

describe("ensurePngName", () => {
  it("sanitises and suffixes a messy name", () => {
    expect(ensurePngName("My Plot!")).toBe("My-Plot.png");
    expect(ensurePngName("z^2 / (z-1)")).toBe("z2-z-1.png");
  });

  it("does not double an existing .png extension (case-insensitive)", () => {
    expect(ensurePngName("figure.png")).toBe("figure.png");
    expect(ensurePngName("Figure.PNG")).toBe("Figure.png");
  });

  it("falls back to 'plot.png' when nothing usable remains", () => {
    expect(ensurePngName("   ")).toBe("plot.png");
    expect(ensurePngName("...")).toBe("plot.png");
    expect(ensurePngName("ζ(z)")).toBe("z.png"); // non-ASCII dropped, parens dropped
  });
});
