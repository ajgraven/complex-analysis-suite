// `Σ qⱼ ln pⱼ` over primes — the last component of tier D's exponent.
//
// Every test here is about one property: because the atoms are PRIMES, equality is a decision. A
// representation keyed by the rational it came from would hold `ln 4 − 2ln 2` as a two-term sum that
// is not obviously zero, and the sine recogniser — which decides whether two exponents differ by a
// sign — would be comparing forms rather than numbers.
import { describe, expect, it } from "vitest";
import { Frac } from "@cas/exact";
import { LogPart, factorise, formatLogPart, formatLogPower } from "../src/kernel/logPart.js";
import { formatSqrtExt } from "../src/kernel/formatExact.js";

const f = (n: number, d = 1): Frac => Frac.of(BigInt(n), BigInt(d));
const ln = (n: number, d = 1): LogPart => {
  const got = LogPart.ln(f(n, d));
  if (got === null) throw new Error(`ln ${n}/${d} refused`);
  return got;
};

describe("factorise", () => {
  it("factors what the corpus actually contains", () => {
    expect([...(factorise(1n) ?? [])]).toEqual([]);
    expect([...(factorise(2n) ?? [])]).toEqual([[2n, 1n]]);
    expect([...(factorise(12n) ?? [])]).toEqual([
      [2n, 2n],
      [3n, 1n],
    ]);
    expect([...(factorise(40n) ?? [])]).toEqual([
      [2n, 3n],
      [5n, 1n],
    ]);
    expect([...(factorise(97n) ?? [])]).toEqual([[97n, 1n]]);
  });

  it("refuses what it cannot factor, rather than returning an uncertified atom", () => {
    // Zero and negatives have no factorisation into primes at all…
    expect(factorise(0n)).toBeNull();
    expect(factorise(-6n)).toBeNull();
    // …and a semiprime past the trial limit cannot be certified, so it is refused. An unfactored
    // atom would break canonicity SILENTLY: `ln(p·q)` and `ln p + ln q` would stop being equal.
    const big = 1000003n * 1000033n;
    expect(factorise(big)).toBeNull();
  });
});

describe("LogPart — canonical over primes, so equality is a decision", () => {
  it("decides ln 4 = 2 ln 2", () => {
    expect(ln(4).equals(ln(2).scale(f(2)))).toBe(true);
    expect(ln(4).sub(ln(2).scale(f(2))).isZero()).toBe(true);
  });

  it("decides ln 6 = ln 2 + ln 3, and ln(1/2) = −ln 2", () => {
    expect(ln(6).equals(ln(2).add(ln(3)))).toBe(true);
    expect(ln(1, 2).equals(ln(2).neg())).toBe(true);
    expect(formatLogPart(ln(6, 35))).toBe("ln 2 + ln 3 − ln 5 − ln 7");
  });

  it("is zero at 1, and only there", () => {
    expect(ln(1).isZero()).toBe(true);
    expect(ln(2).isZero()).toBe(false);
    // A weight of zero drops out rather than lingering as a term.
    expect(ln(2).scale(Frac.ZERO).isZero()).toBe(true);
  });

  it("refuses the logarithm of a non-positive rational", () => {
    expect(LogPart.ln(f(0))).toBeNull();
    expect(LogPart.ln(f(-2))).toBeNull();
  });

  it("adds, subtracts and scales termwise", () => {
    expect(formatLogPart(ln(2).add(ln(3)).scale(f(1, 2)))).toBe("ln 2/2 + ln 3/2");
    expect(ln(12).sub(ln(3)).equals(ln(4))).toBe(true);
    expect(formatLogPart(ln(8).scale(f(-1, 3)))).toBe("−ln 2");
  });

  it("evaluates only when asked", () => {
    expect(ln(2).toNumber()).toBeCloseTo(Math.LN2, 15);
    expect(ln(2).scale(f(1, 2)).toNumber()).toBeCloseTo(Math.log(Math.SQRT2), 15);
  });
});

describe("the radical-factor fold: e^{Σ q ln p} as an algebraic number", () => {
  const algebraic = (x: LogPart): string => {
    const got = x.asAlgebraic();
    return got === null ? "carried" : formatSqrtExt(got);
  };

  it("folds an integer weight into a rational — `e^{ln 2}` is the number 2", () => {
    expect(algebraic(ln(2))).toBe("2");
    expect(algebraic(ln(2).neg())).toBe("1/2");
    expect(algebraic(ln(4))).toBe("4");
    expect(algebraic(LogPart.ZERO)).toBe("1");
  });

  it("folds a half weight into a square root", () => {
    expect(algebraic(ln(2).scale(f(1, 2)))).toBe("√2");
    expect(algebraic(ln(4).scale(f(1, 2)))).toBe("2");
    expect(algebraic(ln(2).scale(f(3, 2)))).toBe("2√2");
    expect(algebraic(ln(2).scale(f(-1, 2)))).toBe("√2/2");
    expect(algebraic(ln(6).scale(f(1, 2)))).toBe("√6");
  });

  it("CARRIES a third or a quarter, which is the basis working", () => {
    // D7's `10^{1/3}` and `40^{3/4}` are not algebraic numbers one quadratic extension can hold, and
    // refusing to fold them is the decision ADR-0041 took: the FORM is the answer.
    expect(algebraic(ln(10).scale(f(1, 3)))).toBe("carried");
    expect(algebraic(ln(40).scale(f(3, 4)))).toBe("carried");
  });

  it("carries a product of two different square roots rather than forcing one extension", () => {
    // `√2·√3` is `√6` and folds; `√2 + √3` would not be one quadratic extension — but that is a SUM,
    // not a term. Within one term the radicands multiply, so the fold always succeeds at d = 2.
    expect(algebraic(ln(2).scale(f(1, 2)).add(ln(3).scale(f(1, 2))))).toBe("√6");
  });
});

describe("the carried form is written as a power, not as an exponential", () => {
  it("writes the product of prime powers", () => {
    expect(formatLogPower(ln(10).scale(f(1, 3)))).toBe("2^(1/3)·5^(1/3)");
    // D7's `40^{3/4}` — the same number, factored, which is what canonicity costs and buys.
    expect(formatLogPower(ln(40).scale(f(3, 4)))).toBe("2^(9/4)·5^(3/4)");
    expect(formatLogPower(ln(4))).toBe("2²");
    expect(formatLogPower(ln(1, 2))).toBe("2⁻¹");
  });
});
