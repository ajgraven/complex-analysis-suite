import { describe, expect, it } from "vitest";
import { Frac, Gauss } from "../src/gaussian.js";
import { SqrtExt, sqrtOfFrac, sqrtOfGauss, squarefreeSplit } from "../src/sqrtExt.js";

const g = (re: number, im = 0): Gauss => new Gauss(Frac.of(BigInt(re)), Frac.of(BigInt(im)));
const q = (n: number, d = 1): Frac => Frac.of(BigInt(n), BigInt(d));

describe("squarefreeSplit", () => {
  it("writes n as square²·free with free squarefree", () => {
    for (const [n, sq, free] of [
      [1n, 1n, 1n],
      [2n, 1n, 2n],
      [4n, 2n, 1n],
      [12n, 2n, 3n],
      [72n, 6n, 2n],
      [1_000_000n, 1000n, 1n],
      [999_983n, 1n, 999_983n], // prime
    ] as const) {
      const r = squarefreeSplit(n);
      expect(r).not.toBeNull();
      if (!r) continue;
      expect(r.square).toBe(sq);
      expect(r.free).toBe(free);
      expect(r.square * r.square * r.free).toBe(n);
    }
  });

  it("rejects a non-positive input rather than returning nonsense", () => {
    expect(() => squarefreeSplit(0n)).toThrow();
    expect(() => squarefreeSplit(-4n)).toThrow();
  });
});

describe("sqrtOfFrac", () => {
  it("splits a rational square root into a rational times a squarefree radical", () => {
    for (const [f, rat, rad] of [
      [q(4), q(2), 1n],
      [q(2), q(1), 2n],
      [q(1, 2), q(1, 2), 2n], // √(1/2) = √2/2
      [q(9, 4), q(3, 2), 1n],
      [q(8), q(2), 2n],
      [q(0), q(0), 1n],
    ] as const) {
      const r = sqrtOfFrac(f);
      expect(r).not.toBeNull();
      if (!r) continue;
      expect(r.rational.equals(rat)).toBe(true);
      expect(r.radicand).toBe(rad);
      // The defining property, checked exactly: (rational)²·radicand = f.
      expect(r.rational.mul(r.rational).mul(Frac.of(r.radicand)).equals(f)).toBe(true);
    }
  });
});

describe("SqrtExt arithmetic", () => {
  const root2 = SqrtExt.of(Gauss.ZERO, Gauss.ONE, 2n);

  it("squares √2 back to 2", () => {
    expect(root2.mul(root2).equals(SqrtExt.of(g(2)))).toBe(true);
  });

  it("normalises an element that is really in ℚ(i)", () => {
    expect(SqrtExt.of(g(3), Gauss.ZERO, 5n).isRational()).toBe(true);
    expect(SqrtExt.of(g(3), g(0), 5n).equals(SqrtExt.of(g(3)))).toBe(true);
    expect(SqrtExt.of(g(1), g(2), 1n).asGauss()?.equals(g(3))).toBe(true);
  });

  it("inverts, with the product coming back to exactly one", () => {
    for (const x of [
      SqrtExt.of(g(1), g(1), 2n),
      SqrtExt.of(g(0, 1), g(3), 3n),
      SqrtExt.of(g(5)),
      root2,
    ]) {
      expect(x.mul(x.inv()).equals(SqrtExt.ONE)).toBe(true);
    }
  });

  it("refuses to mix genuinely different extensions rather than computing nonsense", () => {
    const root3 = SqrtExt.of(Gauss.ZERO, Gauss.ONE, 3n);
    expect(() => root2.add(root3)).toThrow(/quadratic extension/);
    expect(() => root2.mul(root3)).toThrow(/quadratic extension/);
    // A rational element is compatible with anything, which is what makes the common case work.
    expect(() => root2.add(SqrtExt.of(g(7)))).not.toThrow();
  });

  it("agrees with floating arithmetic", () => {
    const x = SqrtExt.of(g(1, 2), g(3, -1), 5n);
    const [re, im] = x.toTuple();
    expect(re).toBeCloseTo(1 + 3 * Math.sqrt(5), 12);
    expect(im).toBeCloseTo(2 - Math.sqrt(5), 12);
  });
});

describe("sqrtOfGauss", () => {
  const check = (input: Gauss) => {
    const r = sqrtOfGauss(input);
    expect(r).not.toBeNull();
    if (!r) return null;
    // The defining property, exactly: (√g)² = g.
    expect(r.mul(r).equals(SqrtExt.of(input))).toBe(true);
    return r;
  };

  it("handles real inputs, positive and negative", () => {
    expect(check(g(4))?.equals(SqrtExt.of(g(2)))).toBe(true);
    expect(check(g(-1))?.equals(SqrtExt.of(g(0, 1)))).toBe(true);
    expect(check(g(2))?.equals(SqrtExt.of(Gauss.ZERO, Gauss.ONE, 2n))).toBe(true);
    check(g(-3)); // i√3
    check(g(0));
  });

  it("gives √i = (1+i)√2/2 — the root that makes 1/(1+z⁴) expressible at all", () => {
    const r = check(g(0, 1));
    expect(r?.d).toBe(2n);
    const half = Frac.of(1n, 2n);
    expect(r?.b.equals(new Gauss(half, half))).toBe(true);
    const [re, im] = r?.toTuple() ?? [0, 0];
    expect(re).toBeCloseTo(Math.SQRT1_2, 12);
    expect(im).toBeCloseTo(Math.SQRT1_2, 12);
  });

  it("handles a general Gaussian whose modulus is rational", () => {
    check(g(3, 4)); // |3+4i| = 5
    check(g(-3, 4));
    check(g(5, 12)); // |5+12i| = 13
  });

  it("declines when the modulus is irrational — a nested radical, not this field", () => {
    // |1+i| = √2 is irrational, so √(1+i) needs √(1 + √2)/… — a genuinely deeper extension.
    expect(sqrtOfGauss(g(1, 1))).toBeNull();
    expect(sqrtOfGauss(g(1, 2))).toBeNull();
  });
});
