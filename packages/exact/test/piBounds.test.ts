import { describe, expect, it } from "vitest";
import { Frac } from "../src/gaussian.js";
import { arctanBounds, piBounds, piLower, piUpper } from "../src/piBounds.js";

/** ≤ 0 when a ≤ b. Comparison in ℚ, because these brackets are narrower than a double's ulp. */
const leq = (a: Frac, b: Frac): boolean => b.sub(a).n >= 0n;

// π truncated to 50 decimals: strictly BELOW π, and +10⁻⁵⁰ is strictly above it. Independent of the
// implementation under test, and exact.
const PI_50 = 314159265358979323846264338327950288419716939937510n;
const SCALE_50 = 10n ** 50n;
const PI_BELOW = Frac.of(PI_50, SCALE_50);
const PI_ABOVE = Frac.of(PI_50 + 1n, SCALE_50);

describe("arctanBounds", () => {
  it("brackets, with lo ≤ hi in exact arithmetic", () => {
    for (const [n, d] of [
      [1n, 5n],
      [1n, 239n],
      [1n, 2n],
      [0n, 1n],
    ] as const) {
      const { lo, hi } = arctanBounds(Frac.of(n, d));
      expect(leq(lo, hi)).toBe(true);
    }
  });

  it("nests: each extra term tightens the bracket without ever leaving the previous one", () => {
    // The defining property of an alternating series with decreasing terms, and the entire
    // justification for the method. Checked exactly, at every truncation.
    const x = Frac.of(1n, 5n);
    for (let terms = 1; terms < 12; terms++) {
      const outer = arctanBounds(x, terms);
      const inner = arctanBounds(x, terms + 1);
      expect(leq(outer.lo, inner.lo)).toBe(true);
      expect(leq(inner.hi, outer.hi)).toBe(true);
    }
  });

  it("agrees with the platform arctan to within its own bracket width", () => {
    const x = Frac.of(1n, 5n);
    const { lo, hi } = arctanBounds(x, 6);
    const truth = Math.atan(0.2);
    expect(lo.toNumber()).toBeLessThanOrEqual(truth);
    expect(hi.toNumber()).toBeGreaterThanOrEqual(truth);
  });

  it("rejects a negative argument rather than returning a bracket that is not one", () => {
    expect(() => arctanBounds(Frac.of(-1n, 5n))).toThrow();
  });
});

describe("piBounds", () => {
  it("brackets π, checked in ℚ against an independent 50-digit value", () => {
    // NOT checked against Math.PI: the default bracket is ~1e-35 wide, far narrower than a double's
    // ulp at 3.14, so `hi.toNumber()` can round BELOW the double nearest π and a floating comparison
    // fails on a bound that is perfectly sound. Comparing in the wrong arithmetic is the bug there.
    const { lo, hi } = piBounds();
    expect(leq(lo, PI_BELOW)).toBe(true);
    expect(leq(PI_ABOVE, hi)).toBe(true);
  });

  it("is sound at every truncation, which is what makes it a certificate", () => {
    for (const terms of [2, 3, 5, 10, 30]) {
      const { lo, hi } = piBounds(terms);
      expect(leq(lo, PI_BELOW)).toBe(true);
      expect(leq(PI_ABOVE, hi)).toBe(true);
    }
  });

  it("is tight enough to be useful", () => {
    expect(piBounds().hi.sub(piBounds().lo).toNumber()).toBeLessThan(1e-30);
  });

  it("orders piLower ≤ π ≤ piUpper", () => {
    expect(leq(piLower(), PI_BELOW)).toBe(true);
    expect(leq(PI_ABOVE, piUpper())).toBe(true);
  });

  it("computes each term count once, handing back the very same Frac objects", () => {
    // A pure function of one integer, memoised: the exact-rational Machin sum is not cheap, and it
    // is paid inside every certified arc bound, once per side per recompute — measured at 2.48 ms
    // per `piUpper()` call against 7.1e-5 ms. Asserted by OBJECT IDENTITY rather than by timing, the
    // claim
    // that cannot be flaky; `Frac` is immutable, so no consumer can tell the difference.
    const a = piBounds(24);
    const b = piBounds(24);
    expect(b).toBe(a);
    expect(b.lo).toBe(a.lo);
    expect(b.hi).toBe(a.hi);
    expect(piUpper()).toBe(a.hi);
    expect(piLower()).toBe(a.lo);
    // A DIFFERENT term count is its own entry — the cache is keyed, not one slot from which a
    // second argument would silently be handed the first's answer.
    const coarse = piBounds(8);
    expect(coarse).not.toBe(a);
    expect(coarse.hi.equals(a.hi)).toBe(false);
    expect(piBounds(8)).toBe(coarse);
    expect(piBounds(24)).toBe(a);
  });

  it("never touches Math to produce the bound", () => {
    // A guard on the method rather than the value: a bound derived from a double is a bound on
    // nothing in particular.
    expect(piBounds.toString() + arctanBounds.toString()).not.toMatch(/Math\./);
  });
});
