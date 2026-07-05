/**
 * Tests for the Brjuno / continued-fraction utilities (`src/render/brjuno.ts`). Oracles:
 * the golden mean has the all-ones CF with Fibonacci convergent denominators; √2−1 is all
 * twos (Pell denominators); both are bounded type ⇒ a Siegel disc. A low-order rational
 * terminates (parabolic, no disc); a huge partial quotient ⇒ near-Cremer (no disc).
 */
import { describe, it, expect } from "vitest";
import {
  continuedFraction,
  fromContinuedFraction,
  brjunoSum,
  classifyRotationNumber,
} from "../src/render/brjuno";

const GOLDEN = (Math.sqrt(5) - 1) / 2; // [0;1,1,1,…], the canonical bounded-type number
const SILVER = Math.SQRT2 - 1; // [0;2,2,2,…]

describe("continuedFraction", () => {
  it("expands the golden mean as all ones with Fibonacci denominators", () => {
    const cf = continuedFraction(GOLDEN);
    expect(cf.terms.slice(0, 10)).toEqual([0, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(cf.denominators.slice(0, 8)).toEqual([1, 1, 2, 3, 5, 8, 13, 21]); // Fibonacci
    expect(cf.terminated).toBe(false);
  });

  it("expands √2−1 as all twos with Pell denominators", () => {
    const cf = continuedFraction(SILVER);
    expect(cf.terms.slice(0, 6)).toEqual([0, 2, 2, 2, 2, 2]);
    expect(cf.denominators.slice(0, 5)).toEqual([1, 2, 5, 12, 29]); // Pell
  });

  it("terminates on a low-order rational", () => {
    const third = continuedFraction(1 / 3);
    expect(third.terminated).toBe(true);
    expect(third.terms).toEqual([0, 3]);
    expect(third.denominators).toEqual([1, 3]);

    const half = continuedFraction(0.5);
    expect(half.terminated).toBe(true);
    expect(half.denominators[half.denominators.length - 1]).toBe(2);
  });
});

describe("fromContinuedFraction", () => {
  it("inverts continuedFraction (round-trip)", () => {
    expect(fromContinuedFraction([0, 2])).toBeCloseTo(0.5, 12);
    expect(fromContinuedFraction([3, 7, 16])).toBeCloseTo(355 / 113, 12);
    // A finite CF is rational, so re-expanding recovers the exact terms.
    expect(continuedFraction(fromContinuedFraction([0, 2, 3, 4, 5])).terms.slice(0, 5)).toEqual([
      0, 2, 3, 4, 5,
    ]);
  });
});

describe("brjunoSum", () => {
  it("is finite and positive for the golden mean (bounded type)", () => {
    const b = brjunoSum(continuedFraction(GOLDEN));
    expect(b).toBeGreaterThan(0);
    expect(b).toBeLessThan(5); // converges to ~2.5
    expect(Number.isFinite(b)).toBe(true);
  });
});

describe("classifyRotationNumber", () => {
  it("golden mean ⇒ bounded type with a positive conformal radius", () => {
    const c = classifyRotationNumber(GOLDEN);
    expect(c.kind).toBe("bounded");
    expect(c.maxTerm).toBe(1);
    expect(c.conformalRadius).toBeGreaterThan(0);
    expect(c.conformalRadius).toBeLessThan(1);
    expect(c.conformalRadius).toBeCloseTo(Math.exp(-c.brjunoSum), 12);
  });

  it("√2−1 ⇒ bounded type", () => {
    expect(classifyRotationNumber(SILVER).kind).toBe("bounded");
  });

  it("reduces θ to its fractional part (integer part irrelevant)", () => {
    expect(classifyRotationNumber(GOLDEN + 3).kind).toBe("bounded");
  });

  it("a low-order rational ⇒ rational, no disc", () => {
    const c = classifyRotationNumber(1 / 3);
    expect(c.kind).toBe("rational");
    expect(c.conformalRadius).toBe(0);
  });

  it("a moderate partial quotient ⇒ brjuno (Siegel) but not bounded", () => {
    const c = classifyRotationNumber(fromContinuedFraction([0, 1, 1, 1, 100]));
    expect(c.kind).toBe("brjuno");
    expect(c.maxTerm).toBeGreaterThan(25);
    expect(c.conformalRadius).toBeGreaterThan(0);
  });

  it("a huge early partial quotient ⇒ near-Cremer, disc ≈ 0", () => {
    const c = classifyRotationNumber(fromContinuedFraction([0, 1, 1e12]));
    expect(c.kind).toBe("cremer");
    expect(c.brjunoSum).toBeGreaterThan(25);
    expect(c.conformalRadius).toBe(0);
  });
});
