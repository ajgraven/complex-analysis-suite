import { describe, it, expect } from "vitest";
import { bulbRoot, fareyLabels } from "../src/render/farey";

describe("bulbRoot", () => {
  it("1/2 bulb attaches at the period-2 neck c = -3/4", () => {
    const { c } = bulbRoot(1, 2);
    expect(c[0]).toBeCloseTo(-0.75, 10);
    expect(c[1]).toBeCloseTo(0, 10);
  });

  it("1/3 and 2/3 bulbs are complex conjugates", () => {
    const a = bulbRoot(1, 3).c;
    const b = bulbRoot(2, 3).c;
    expect(b[0]).toBeCloseTo(a[0], 10);
    expect(b[1]).toBeCloseTo(-a[1], 10);
    expect(a[1]).toBeGreaterThan(0); // 1/3 is the upper bulb
  });

  it("1/3 attachment matches μ/2 − μ²/4 at μ = e^{2πi/3}", () => {
    const { c } = bulbRoot(1, 3);
    expect(c[0]).toBeCloseTo(-0.125, 10);
    expect(c[1]).toBeCloseTo((3 * Math.sqrt(3)) / 8, 10);
  });
});

describe("fareyLabels", () => {
  it("includes 1/2, 1/3, 2/3 for the whole-cardioid view and culls off-screen bulbs", () => {
    const labels = fareyLabels([-0.5, 0], 0.75, 6);
    const texts = labels.map((l) => l.text);
    expect(texts).toContain("1/2");
    expect(texts).toContain("1/3");
    expect(texts).toContain("2/3");
  });

  it("view-culls: a tiny window around the 1/2 neck excludes the 1/3 bulb", () => {
    const labels = fareyLabels([-0.75, 0], 200, 8);
    const texts = labels.map((l) => l.text);
    expect(texts).toContain("1/2");
    expect(texts).not.toContain("1/3");
  });
});
