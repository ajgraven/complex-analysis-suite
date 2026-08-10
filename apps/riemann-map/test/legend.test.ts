import { describe, expect, it } from "vitest";
import { legendModel } from "../src/ui/legend.js";

describe("legend model (A4)", () => {
  it("phase modes use the hue wheel", () => {
    expect(legendModel("phase", "viridis").bar).toBe("hue");
    expect(legendModel("arg-deriv", "viridis").bar).toBe("hue");
  });

  it("ramp modes track the selected colormap", () => {
    expect(legendModel("abs-deriv", "viridis").bar).toBe("viridis");
    expect(legendModel("abs-deriv", "grayscale").bar).toBe("grayscale");
    expect(legendModel("log-deriv", "grayscale").bar).toBe("grayscale");
  });

  it("the Julia-exterior legend ramps and carries an interior-set (K) swatch", () => {
    const m = legendModel("julia", "viridis");
    expect(m.bar).toBe("viridis");
    expect(m.interior?.label).toBe("K");
    expect(m.title).toContain("G(z)");
  });

  it("the numeric-map mode has no colour bar (it's a grid)", () => {
    expect(legendModel("domain-map", "viridis").bar).toBeNull();
  });
});
