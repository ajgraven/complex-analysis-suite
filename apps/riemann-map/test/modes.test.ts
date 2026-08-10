import { describe, expect, it } from "vitest";
import { RENDER_MODES, COLORMAPS, modeCode, colormapCode, modeUsesDeriv } from "../src/render/modes.js";

describe("render modes registry (C1–C6)", () => {
  it("mode codes are unique and resolve by id (with a phase-portrait fallback)", () => {
    expect(new Set(RENDER_MODES.map((m) => m.code)).size).toBe(RENDER_MODES.length);
    expect(modeCode("phase")).toBe(0);
    expect(modeCode("arg-deriv")).toBe(6);
    expect(modeCode("nonsense")).toBe(0);
  });

  it("marks exactly the derivative-field modes as usesDeriv", () => {
    expect(modeUsesDeriv("abs-deriv")).toBe(true);
    expect(modeUsesDeriv("log-deriv")).toBe(true);
    expect(modeUsesDeriv("arg-deriv")).toBe(true);
    expect(modeUsesDeriv("phase")).toBe(false);
    expect(modeUsesDeriv("conformal")).toBe(false);
  });

  it("colormap codes resolve by id with a viridis fallback", () => {
    expect(COLORMAPS.length).toBeGreaterThanOrEqual(2);
    expect(colormapCode("viridis")).toBe(0);
    expect(colormapCode("grayscale")).toBe(1);
    expect(colormapCode("nope")).toBe(0);
  });
});
