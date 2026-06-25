import { describe, it, expect } from "vitest";
import { halton } from "../src/render/glPlot";

// halton() drives the sub-pixel jitter for temporal anti-aliasing; it must produce the
// van der Corput / Halton low-discrepancy sequence.
describe("halton (van der Corput) sequence", () => {
  it("matches known base-2 values", () => {
    expect(halton(1, 2)).toBeCloseTo(0.5, 12);
    expect(halton(2, 2)).toBeCloseTo(0.25, 12);
    expect(halton(3, 2)).toBeCloseTo(0.75, 12);
    expect(halton(4, 2)).toBeCloseTo(0.125, 12);
    expect(halton(5, 2)).toBeCloseTo(0.625, 12);
  });

  it("matches known base-3 values", () => {
    expect(halton(1, 3)).toBeCloseTo(1 / 3, 12);
    expect(halton(2, 3)).toBeCloseTo(2 / 3, 12);
    expect(halton(3, 3)).toBeCloseTo(1 / 9, 12);
  });

  it("stays in [0, 1) and is deterministic", () => {
    for (let i = 0; i <= 16; i++) {
      const v = halton(i, 2);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(halton(i, 2)).toBe(v); // pure
    }
    expect(halton(0, 2)).toBe(0);
  });
});
