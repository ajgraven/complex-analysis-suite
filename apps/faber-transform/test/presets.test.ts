// φ preset sanity: the Laurent contract each preset hands to @cas/faber, and univalent shape bounds.
import { describe, expect, it } from "vitest";
import { PHI_PRESETS, phiPresetById } from "../src/presets.js";

describe("φ presets", () => {
  it("interval is the Joukowski map φ = z + 1/z (c=1, laurent [0, 1])", () => {
    const map = phiPresetById("interval").build(0);
    expect(map.c).toBe(1);
    expect(map.laurent.map((c) => c.re)).toEqual([0, 1]);
    expect(map.laurent.map((c) => c.im)).toEqual([0, 0]);
  });

  it("ellipse is φ = z + m/z with the shape value in the Laurent", () => {
    const map = phiPresetById("ellipse").build(0.4);
    expect(map.c).toBe(1);
    expect(map.laurent[1].re).toBeCloseTo(0.4, 12);
  });

  it("every preset has a positive capacity and a shape control within a univalent range", () => {
    for (const p of PHI_PRESETS) {
      const map = p.build(p.shape ? p.shape.default : 0);
      expect(map.c).toBeGreaterThan(0);
      if (p.shape) {
        // z + m/z is univalent for |m| < 1 — the clamped range must respect that.
        expect(p.shape.max).toBeLessThan(1);
        expect(p.shape.min).toBeGreaterThanOrEqual(0);
        expect(p.kHalf).toBeGreaterThan(0);
      }
    }
  });

  it("unknown id falls back to the interval preset", () => {
    expect(phiPresetById("nope").id).toBe("interval");
  });
});
