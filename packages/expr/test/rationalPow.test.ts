/**
 * High-degree exponents in `fToRational`.
 *
 * `pPow` used to multiply by the base k times, so `z^40000` performed 40 000 multiplies against a
 * steadily growing dense array — Σ 2(i+1) ≈ 1.6e9 complex multiply-adds and ~8e8 coefficient
 * allocations. Measured cost grew cleanly quadratically (k=8000 → 17.9 s), extrapolating to about
 * 7.4 minutes at k=40 000. That froze the Complex-Dynamics tab, because `escapeIsMeaningless` is a
 * VIEW-level advisory that calls fToRational on every view change and then reads nothing but the two
 * polynomial degrees.
 *
 * Two things fixed it, both general rather than special-cased:
 *   • `pMul` skips zero coefficients, so a sparse polynomial (z^k has ONE non-zero coefficient out
 *     of k+1) costs O(1) multiply-adds per product instead of O(k²);
 *   • `pPow` uses binary exponentiation, ~2·log₂k products instead of k.
 *
 * These tests pin the behaviour AND the tractability. They deliberately do not assert wall-clock
 * thresholds tight enough to flake on a loaded CI box — the pre-fix cost was minutes, so even a very
 * loose bound separates the two regimes by three orders of magnitude.
 */
import { describe, expect, it } from "vitest";
import { parse } from "../src/parser";
import { fToRational } from "../src/rational";
import type { Complex } from "../src/complex";

const O: Complex = [0, 0];
const nonZero = (p: Complex[]): number[] =>
  p.map((c, i) => (c[0] !== 0 || c[1] !== 0 ? i : -1)).filter((i) => i >= 0);

describe("fToRational with a large integer exponent", () => {
  it("handles z^40000 + c — the case that used to take minutes", () => {
    const t0 = performance.now();
    const r = fToRational(parse("z^40000+c"), [0.25, 0], O);
    const ms = performance.now() - t0;

    expect(r).not.toBeNull();
    if (!r) return;
    // Exactly the right polynomial: z^40000 + 0.25, denominator 1.
    expect(r.num.length).toBe(40001);
    expect(nonZero(r.num)).toEqual([0, 40000]);
    expect(r.num[40000]).toEqual([1, 0]);
    expect(r.num[0]).toEqual([0.25, 0]);
    expect(nonZero(r.den)).toEqual([0]);

    // Three orders of magnitude of headroom over the ~14 ms measured locally, and five under the
    // pre-fix ~7.4 minutes. This separates the regimes without being flake-prone.
    expect(ms).toBeLessThan(10_000);
  });

  it("a monomial power is EXACT — binary exponentiation changes no bits here", () => {
    // 1 * z^k involves no cancellation, so the reassociation is invisible for monomials.
    for (const k of [3, 7, 64, 1000]) {
      const r = fToRational(parse(`z^${k}`), O, O);
      expect(r).not.toBeNull();
      expect(r!.num.length).toBe(k + 1);
      expect(nonZero(r!.num)).toEqual([k]);
      expect(r!.num[k]).toEqual([1, 0]); // exactly 1, not 1±ulp
    }
  });

  it("a DENSE base still expands correctly (binomial coefficients of (z+1)^12)", () => {
    // (z+1)^12 has known integer coefficients; each is exactly representable, so despite the changed
    // multiply tree these must land exactly.
    const r = fToRational(parse("(z+1)^12"), O, O);
    expect(r).not.toBeNull();
    const binom = [1, 12, 66, 220, 495, 792, 924, 792, 495, 220, 66, 12, 1];
    expect(r!.num.length).toBe(13);
    r!.num.forEach((c, i) => {
      expect(c[0]).toBeCloseTo(binom[i], 6);
      expect(c[1]).toBeCloseTo(0, 9);
    });
  });

  it("keeps a genuinely rational map rational, and reads the degrees escapeIsMeaningless needs", () => {
    // The consumer that caused the freeze only wants deg(num) and deg(den).
    const r = fToRational(parse("z^5000+1/z"), [0, 0], O);
    expect(r).not.toBeNull();
    // (z^5000 · z + 1) / z  ⇒  num degree 5001, den degree 1.
    expect(r!.num.length - 1).toBe(5001);
    expect(r!.den.length - 1).toBe(1);
  });

  it("refuses an absurd exponent by returning null, rather than exhausting memory", () => {
    // z^1e9 would be ~1e9 boxed coefficients (tens of GB). null means "not a rational function of
    // z", which every consumer already handles — a fast, graceful refusal, not a freeze.
    const t0 = performance.now();
    expect(fToRational(parse("z^1000000000"), O, O)).toBeNull();
    expect(performance.now() - t0).toBeLessThan(2_000); // refused without trying to build it
  });

  it("still returns null for the non-rational cases (no regression in the contract)", () => {
    expect(fToRational(parse("sin(z)+c"), O, O)).toBeNull();
    expect(fToRational(parse("conjugate(z)"), O, O)).toBeNull();
    expect(fToRational(parse("z^c"), [0.5, 0], O)).toBeNull(); // non-integer / z-dependent exponent
  });

  it("negative exponents still invert (z^-3 = 1/z^3)", () => {
    const r = fToRational(parse("z^-3"), O, O);
    expect(r).not.toBeNull();
    expect(nonZero(r!.num)).toEqual([0]);
    expect(nonZero(r!.den)).toEqual([3]);
  });
});
