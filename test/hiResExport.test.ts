import { describe, expect, it } from "vitest";
import { clampExportSize, ensurePngName } from "../src/hiResExport";

describe("clampExportSize", () => {
  it("passes an in-range size through unchanged", () => {
    expect(clampExportSize(2000, 8192)).toEqual({ size: 2000, clamped: false });
  });

  it("clamps a size above the GPU maximum", () => {
    expect(clampExportSize(8000, 4096)).toEqual({ size: 4096, clamped: true });
  });

  it("clamps a size below the minimum", () => {
    expect(clampExportSize(100, 8192)).toEqual({ size: 256, clamped: true });
  });

  it("floors a non-integer request", () => {
    expect(clampExportSize(2000.9, 8192).size).toBe(2000);
  });
});

describe("ensurePngName", () => {
  it("leaves an existing .png name (case-insensitive)", () => {
    expect(ensurePngName("ParamSpace.png")).toBe("ParamSpace.png");
    expect(ensurePngName("Foo.PNG")).toBe("Foo.PNG");
  });

  it("appends .png when missing", () => {
    expect(ensurePngName("foo")).toBe("foo.png");
  });

  it("strips characters illegal in filenames", () => {
    expect(ensurePngName("a/b:c*?.png")).toBe("a_b_c__.png");
  });

  it("falls back to plot.png for empty/whitespace input", () => {
    expect(ensurePngName("   ")).toBe("plot.png");
  });
});
