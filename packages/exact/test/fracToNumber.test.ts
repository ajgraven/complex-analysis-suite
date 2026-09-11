import { describe, expect, it } from "vitest";
import { Frac } from "../src/gaussian.js";

/**
 * `Frac.toNumber` is the single crossing from the exact engine into the numeric plane, so every
 * rendered decimal of an exact result passes through it. These cases are the ones where the naive
 * `Number(n)/Number(d)` saturates and the BigInt path takes over.
 */
describe("Frac.toNumber at the extremes", () => {
  it("round-trips a double through its exact dyadic representation", () => {
    // How a double arrives as a Frac: x = m·2^-k with m a 53-bit integer, so the denominator is
    // enormous while the numerator is small. Shifting BOTH sides by the denominator's size — which
    // is what the previous implementation did — discards almost all of the numerator.
    for (const x of [1e-300, 5e-324, 1e-200, Math.PI * 1e-250, -1e-300]) {
      let scaled = x;
      let k = 0n;
      while (!Number.isInteger(scaled) && k < 1100n) {
        scaled *= 2;
        k++;
      }
      expect(Frac.of(BigInt(scaled), 1n << k).toNumber()).toBe(x);
    }
  });

  it("handles a huge numerator over a small denominator", () => {
    // 10^400 / 3 is genuinely past the double range, so Infinity is the right answer — the failure
    // to avoid is returning 0 or NaN from an overflowed intermediate.
    expect(Frac.of(10n ** 400n, 3n).toNumber()).toBe(Infinity);
    expect(Frac.of(-(10n ** 400n), 3n).toNumber()).toBe(-Infinity);
    // In range once the denominator catches up.
    expect(Frac.of(2n ** 2000n, 2n ** 1999n).toNumber()).toBe(2);
    expect(Frac.of(10n ** 400n, 10n ** 320n).toNumber()).toBeCloseTo(1e80, -75);
  });

  it("handles both sides huge — the case the old code was written for", () => {
    // 10^400 / (3·10^400 + 1) ≈ 1/3 with 401 digits on each side.
    const v = Frac.of(10n ** 400n, 3n * 10n ** 400n + 1n).toNumber();
    expect(v).toBeCloseTo(1 / 3, 15);
  });

  it("is exact on powers of two, where any precision loss would be visible", () => {
    for (const e of [100n, 500n, 1000n, 1060n]) {
      expect(Frac.of(1n, 1n << e).toNumber()).toBe(Math.pow(2, -Number(e)));
      expect(Frac.of(1n << e).toNumber()).toBe(Math.pow(2, Number(e)));
    }
  });

  it("keeps the sign, and maps a true underflow to zero rather than to noise", () => {
    expect(Frac.of(-1n, 1n << 100n).toNumber()).toBe(-Math.pow(2, -100));
    expect(Frac.of(1n, 1n << 5000n).toNumber()).toBe(0);
    expect(Frac.ZERO.toNumber()).toBe(0);
  });
});
