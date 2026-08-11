import { describe, expect, it } from "vitest";
import { legendModel } from "../src/ui/legend.js";

describe("legend model (A4)", () => {
  it("phase modes use the same hue wheel regardless of colormap", () => {
    const a = legendModel("phase", "viridis").barCss;
    const b = legendModel("arg-deriv", "magma").barCss;
    expect(a).toContain("hsl(");
    expect(b).toBe(a); // hue wheel is colormap-independent
  });

  it("ramp modes track the selected colormap (the bar differs per map)", () => {
    const vir = legendModel("abs-deriv", "viridis").barCss;
    const inf = legendModel("abs-deriv", "inferno").barCss;
    expect(vir).toContain("linear-gradient");
    expect(vir).not.toContain("hsl(");
    expect(inf).not.toBe(vir); // a different colormap → a different bar
  });

  it("the Julia-exterior legend ramps and carries an interior-set (K) swatch", () => {
    const m = legendModel("julia", "viridis");
    expect(m.barCss).toContain("linear-gradient");
    expect(m.interior?.label).toBe("K");
    expect(m.title).toContain("G(z)");
  });

  it("the numeric-map mode has no colour bar (it's a grid)", () => {
    expect(legendModel("domain-map", "viridis").barCss).toBeNull();
  });
});
