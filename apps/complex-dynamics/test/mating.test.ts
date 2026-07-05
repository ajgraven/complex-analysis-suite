/**
 * Tests for the conjugate-limb mating oracle (`src/render/mating.ts`). Oracle: two
 * main-cardioid bulbs are mateable iff their limbs are not complex-conjugate, i.e.
 * p₁/q₁ + p₂/q₂ ≠ 1. The 1/2 bulb is self-conjugate (not self-mateable); every other bulb is.
 * The canonical failure is the 1/3 ⊔ 2/3 pair (the rabbit limb and its mirror).
 */
import { describe, it, expect } from "vitest";
import { reduceFraction, conjugateLimb, limbsConjugate, matingVerdict } from "../src/render/mating";

describe("reduceFraction", () => {
  it("reduces and normalises the sign to a positive denominator", () => {
    expect(reduceFraction(2, 6)).toEqual([1, 3]);
    expect(reduceFraction(3, 9)).toEqual([1, 3]);
    expect(reduceFraction(1, -3)).toEqual([-1, 3]);
  });
  it("rejects q = 0 and non-integers", () => {
    expect(reduceFraction(1, 0)).toBeNull();
    expect(reduceFraction(1.5, 3)).toBeNull();
  });
});

describe("conjugateLimb", () => {
  it("maps p/q to (q−p)/q (mirror across the real axis)", () => {
    expect(conjugateLimb(1, 3)).toEqual([2, 3]);
    expect(conjugateLimb(2, 3)).toEqual([1, 3]);
    expect(conjugateLimb(1, 4)).toEqual([3, 4]);
    expect(conjugateLimb(1, 2)).toEqual([1, 2]); // self-conjugate
  });
});

describe("limbsConjugate", () => {
  it("is true exactly when p₁/q₁ + p₂/q₂ = 1", () => {
    expect(limbsConjugate(1, 3, 2, 3)).toBe(true); // 1/3 + 2/3 = 1
    expect(limbsConjugate(1, 5, 4, 5)).toBe(true);
    expect(limbsConjugate(2, 6, 2, 3)).toBe(true); // 1/3 + 2/3 (unreduced input)
    expect(limbsConjugate(1, 2, 1, 2)).toBe(true); // 1/2 is self-conjugate
    expect(limbsConjugate(1, 3, 1, 3)).toBe(false);
    expect(limbsConjugate(1, 3, 1, 4)).toBe(false);
  });
});

describe("matingVerdict", () => {
  it("rabbit ⊔ its mirror (1/3 ⊔ 2/3): NOT mateable (conjugate limbs)", () => {
    const v = matingVerdict(1, 3, 2, 3);
    expect(v.valid).toBe(true);
    expect(v.mateable).toBe(false);
    expect(v.conjugate).toBe(true);
    expect(v.conjugateOfA).toEqual([2, 3]);
  });

  it("non-conjugate bulbs are mateable (1/3 ⊔ 1/4)", () => {
    expect(matingVerdict(1, 3, 1, 4).mateable).toBe(true);
  });

  it("self-mating: 1/3 ⊔ 1/3 OK, but 1/2 ⊔ 1/2 fails (1/2 is self-conjugate)", () => {
    expect(matingVerdict(1, 3, 1, 3).mateable).toBe(true);
    expect(matingVerdict(1, 2, 1, 2).mateable).toBe(false);
  });

  it("flags invalid input", () => {
    expect(matingVerdict(1, 0, 1, 3).valid).toBe(false);
  });
});
