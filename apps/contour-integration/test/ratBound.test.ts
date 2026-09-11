import { describe, expect, it } from "vitest";
import { Frac } from "@cas/exact";
import { bigISqrt, fracCmp, sqrtDown, sqrtUp } from "../src/kernel/bounds/ratBound.js";

const q = (n: bigint, d: bigint = 1n) => Frac.of(n, d);
const sq = (x: Frac) => x.mul(x);

describe("fracCmp", () => {
  it("orders rationals with unlike denominators", () => {
    expect(fracCmp(q(1n, 3n), q(1n, 2n))).toBe(-1);
    expect(fracCmp(q(1n, 2n), q(1n, 3n))).toBe(1);
    expect(fracCmp(q(2n, 4n), q(1n, 2n))).toBe(0);
    expect(fracCmp(q(-1n, 2n), q(1n, 1000000n))).toBe(-1);
  });
});

describe("bigISqrt", () => {
  it("returns the exact floor of the square root", () => {
    for (const n of [0n, 1n, 2n, 3n, 4n, 8n, 9n, 10n, 99n, 100n, 101n]) {
      const s = bigISqrt(n);
      expect(s * s <= n).toBe(true);
      expect((s + 1n) * (s + 1n) > n).toBe(true);
    }
  });

  it("stays exact far beyond the double range, where Math.sqrt could not", () => {
    // 2^53 is where a double stops representing consecutive integers; this is ~10^40.
    const big = 10n ** 40n + 7n;
    const s = bigISqrt(big);
    expect(s * s <= big).toBe(true);
    expect((s + 1n) * (s + 1n) > big).toBe(true);
  });

  it("rejects a negative input rather than returning a nonsense root", () => {
    expect(() => bigISqrt(-1n)).toThrow();
  });
});

// The corpus deliberately mixes: perfect squares (where the answer must be exact), non-squares,
// values far below and far above 1 (the seed uses ⌊√n⌋ and ⌊√d⌋, so both ends matter), and inputs
// past 2^53 in numerator and in denominator.
const CORPUS: Frac[] = [
  q(0n),
  q(1n),
  q(2n),
  q(3n),
  q(4n),
  q(9n, 4n),
  q(1n, 4n),
  q(1n, 3n),
  q(5n, 7n),
  q(1000000n),
  q(1n, 1000000n),
  q(123456789n, 987654321n),
  q(10n ** 30n + 1n, 7n),
  q(7n, 10n ** 30n + 1n),
];

describe("sqrtUp / sqrtDown", () => {
  // This is the whole contract, and checking it in ℚ is a proof rather than a sample: there is no
  // rounding anywhere in the statement, so a passing corpus entry cannot be passing by luck.
  it("bracket the true square root exactly: sqrtDown² ≤ c ≤ sqrtUp²", () => {
    for (const c of CORPUS) {
      expect(fracCmp(sq(sqrtDown(c)), c)).toBeLessThanOrEqual(0);
      expect(fracCmp(c, sq(sqrtUp(c)))).toBeLessThanOrEqual(0);
    }
  });

  it("are exact on rational squares", () => {
    for (const [n, d] of [
      [4n, 1n],
      [9n, 4n],
      [1n, 4n],
      [10n ** 30n, 49n],
    ] as const) {
      const c = Frac.of(n, d);
      const r = Frac.of(bigISqrt(n), bigISqrt(d));
      expect(sqrtUp(c).equals(r)).toBe(true);
      expect(sqrtDown(c).equals(r)).toBe(true);
      expect(sq(sqrtUp(c)).equals(c)).toBe(true);
    }
  });

  it("stay sound at zero refinement steps — stopping early costs accuracy, never soundness", () => {
    for (const c of CORPUS) {
      expect(fracCmp(sq(sqrtDown(c, 0)), c)).toBeLessThanOrEqual(0);
      expect(fracCmp(c, sq(sqrtUp(c, 0)))).toBeLessThanOrEqual(0);
    }
  });

  it("converge tightly enough for display: the default bracket is within 1e-12 relative", () => {
    for (const c of CORPUS) {
      if (c.isZero()) continue;
      const lo = sqrtDown(c).toNumber();
      const hi = sqrtUp(c).toNumber();
      expect(hi - lo).toBeLessThanOrEqual(1e-12 * hi);
    }
  });

  it("keep the representation small — Newton on exact rationals otherwise squares the denominator", () => {
    // Without the round-up-to-precision step, six iterations from a 50-digit seed leave a fraction
    // thousands of digits wide that carries only ~30 useful ones. The cap is what makes this module
    // usable inside the ML bound, where it is called once per polynomial coefficient.
    for (const c of CORPUS) {
      for (const x of [sqrtUp(c), sqrtDown(c)]) {
        expect(x.d.toString(2).length).toBeLessThan(400);
        expect(x.n.toString(2).length).toBeLessThan(400);
      }
    }
  });

  it("reject negative inputs rather than returning a bound that is not one", () => {
    expect(() => sqrtUp(q(-1n))).toThrow();
    expect(() => sqrtDown(q(-1n))).toThrow();
  });
});
