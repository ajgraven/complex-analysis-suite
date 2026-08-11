import { describe, expect, it } from "vitest";
import { RENDER_MODES, modeCode, modeUsesDeriv, modeUsesColormap, modeIsDomain, modeIsDiskImage } from "../src/render/modes.js";

describe("render modes registry (C1–C6)", () => {
  it("mode codes are unique and resolve by id (with a phase-portrait fallback)", () => {
    expect(new Set(RENDER_MODES.map((m) => m.code)).size).toBe(RENDER_MODES.length);
    expect(modeCode("phase")).toBe(0);
    expect(modeCode("arg-deriv")).toBe(6);
    expect(modeCode("nonsense")).toBe(0);
  });

  it("flags the numerical Riemann-map (domain) mode", () => {
    expect(modeIsDomain("domain-map")).toBe(true);
    expect(modeIsDomain("phase")).toBe(false);
    expect(modeCode("domain-map")).toBe(20);
  });

  it("flags the primary disk-image mode (code 30) and lists it first", () => {
    expect(modeIsDiskImage("disk-image")).toBe(true);
    expect(modeIsDiskImage("phase")).toBe(false);
    expect(modeIsDiskImage("domain-map")).toBe(false);
    expect(modeCode("disk-image")).toBe(30);
    expect(RENDER_MODES[0].id).toBe("disk-image"); // the default view leads the picker
  });

  it("marks exactly the derivative-field modes as usesDeriv", () => {
    expect(modeUsesDeriv("abs-deriv")).toBe(true);
    expect(modeUsesDeriv("log-deriv")).toBe(true);
    expect(modeUsesDeriv("arg-deriv")).toBe(true);
    expect(modeUsesDeriv("phase")).toBe(false);
    expect(modeUsesDeriv("conformal")).toBe(false);
  });

  it("marks exactly the colormap-ramp modes as usesColormap (shader modes 4, 5)", () => {
    expect(modeUsesColormap("abs-deriv")).toBe(true); // 4
    expect(modeUsesColormap("log-deriv")).toBe(true); // 5
    expect(modeUsesColormap("arg-deriv")).toBe(false); // hue, not ramp
    expect(modeUsesColormap("phase")).toBe(false);
    expect(modeUsesColormap("checker")).toBe(false);
    expect(modeUsesColormap("domain-map")).toBe(false);
    expect(modeUsesColormap("disk-image")).toBe(false); // hue by arg φ′, not a ramp
  });
});
