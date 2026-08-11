import { describe, expect, it } from "vitest";
import { legendModel } from "../src/ui/legend.js";

describe("legend model (A4)", () => {
  it("the disk-image view is keyed by arg φ′ (a hue wheel)", () => {
    const m = legendModel("disk-image");
    expect(m.barCss).toContain("hsl(");
    expect(m.title).toContain("arg φ′");
    expect(m.low).toBe("−π");
    expect(m.high).toBe("+π");
  });

  it("the numeric-map mode has no colour bar (it's a grid)", () => {
    expect(legendModel("domain-map").barCss).toBeNull();
  });
});
