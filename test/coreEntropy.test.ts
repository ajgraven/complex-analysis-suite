import { describe, expect, it } from "vitest";
import { coreEntropy } from "../src/combinatorics/coreEntropy";

describe("coreEntropy (Thurston angle-pair algorithm)", () => {
  it("1/6 → λ = 1.521380 (root of λ³−λ−2)", () => {
    const r = coreEntropy(1, 6);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.lambda).toBeCloseTo(1.52138, 5);
    expect(r.entropy).toBeCloseTo(Math.log(1.52138), 5);
    expect(r.biaccessibility).toBeCloseTo(Math.log(1.52138) / Math.LN2, 5);
  });

  it("1/5 (period 4) → λ = 1.395337", () => {
    expect(coreEntropy(1, 5)?.lambda).toBeCloseTo(1.395337, 5);
  });

  it("3/15 reduces to 1/5 — same entropy", () => {
    expect(coreEntropy(3, 15)?.lambda).toBeCloseTo(1.395337, 5);
  });

  it("3/7 (airplane, primitive period 3) → golden ratio", () => {
    expect(coreEntropy(3, 7)?.lambda).toBeCloseTo(1.618034, 5);
  });

  it("1/7 (rabbit, satellite period 3) → λ = 1 (zero core entropy)", () => {
    const r = coreEntropy(1, 7);
    expect(r?.lambda).toBeCloseTo(1, 6);
    expect(r?.entropy).toBeCloseTo(0, 6);
  });

  it("λ stays within [1, 2]", () => {
    for (const [p, q] of [
      [1, 5],
      [1, 6],
      [3, 7],
      [2, 9],
      [5, 31],
    ]) {
      const r = coreEntropy(p, q);
      if (!r) continue;
      expect(r.lambda).toBeGreaterThanOrEqual(1 - 1e-9);
      expect(r.lambda).toBeLessThanOrEqual(2 + 1e-9);
    }
  });

  it("returns null for θ = 0 and for orbits reaching the β-fixed angle 0 (e.g. 1/4)", () => {
    expect(coreEntropy(0, 1)).toBeNull();
    expect(coreEntropy(1, 4)).toBeNull();
  });
});
