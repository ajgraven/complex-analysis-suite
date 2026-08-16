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

  it("deltoid is φ = z + a/(2z²) — a 3-cusped domain at a → 1", () => {
    const map = phiPresetById("deltoid").build(0.9);
    expect(map.c).toBe(1);
    expect(map.laurent.map((c) => c.re)).toEqual([0, 0, 0.45]);
  });

  it("5-cusped star is φ = z + a/(4z⁴)", () => {
    const map = phiPresetById("star5").build(0.8);
    expect(map.c).toBe(1);
    expect(map.laurent.map((c) => c.re)).toEqual([0, 0, 0, 0, 0.2]);
  });

  it("every preset has a positive capacity and a univalent-respecting shape control", () => {
    for (const p of PHI_PRESETS) {
      const map = p.build(p.shape ? p.shape.default : 0);
      expect(map.c).toBeGreaterThan(0);
      expect(p.kHalf).toBeGreaterThan(0);
      if (p.shape) {
        // The single-term area bound Σ n|aₙ| ≤ 1 must hold across the whole clamped shape range:
        // at the max shape value, the dominant Laurent term's n·|cₙ| stays ≤ 1 (strictly, univalent).
        const maxMap = p.build(p.shape.max);
        let areaSum = 0;
        maxMap.laurent.forEach((c, n) => {
          areaSum += n * Math.hypot(c.re, c.im);
        });
        expect(areaSum).toBeLessThan(1);
        expect(p.shape.min).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("unknown id falls back to the interval preset", () => {
    expect(phiPresetById("nope").id).toBe("interval");
  });
});
