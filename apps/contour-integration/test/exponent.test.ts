// Guards for the widened exponent: `β = (ℚ(i)(√d)) + (ℚ(i))·π + Σ(ℚ)·ln(p)`, with π an INDETERMINATE
// and `ln` a symbol.
//
// The quantities under test are the keyhole's own. D1's edge factor is `e^{2πi(α−1)}` and its residue
// carries `(−1)^{α−1} = e^{iπ(α−1)}`; at α = 3/10 those are `e^{−7iπ/5}` and `e^{−7iπ/10}`. They have
// to live in one basis and compare by EXPONENT, because that is what lets the sine recogniser see
// that `β/2` and `−β/2` differ by a sign rather than by 1e-16.
import { describe, expect, it } from "vitest";
import { Frac, Gauss, SqrtExt } from "@cas/exact";
import { Exponent, formatExponent, jordanExponent } from "../src/kernel/exponent.js";
import { ExpSum, formatExpSum } from "../src/kernel/expSum.js";
import { LogPart } from "../src/kernel/logPart.js";

const q = (n: number, d = 1): Frac => Frac.of(BigInt(n), BigInt(d));
const gi = (reN: number, reD: number, imN = 0, imD = 1): Gauss =>
  Gauss.rat(BigInt(reN), BigInt(reD), BigInt(imN), BigInt(imD));
const alg = (re: number, im = 0): SqrtExt => SqrtExt.fromGauss(Gauss.int(re, im));

describe("the algebraic case is untouched", () => {
  it("carries a SqrtExt with a zero π part", () => {
    const b = Exponent.fromSqrtExt(alg(-1));
    expect(b.pi.isZero()).toBe(true);
    expect(b.toTuple()).toEqual([-1, 0]);
    expect(b.isReal()).toBe(true);
  });

  it("leaves jordanExponent in the algebraic part, so tier B is unchanged", () => {
    // `i·a·z₀` at a = 1, z₀ = i is −1: real, and no π anywhere.
    const b = jordanExponent(q(1), alg(0, 1));
    expect(b.pi.isZero()).toBe(true);
    expect(b.toTuple()).toEqual([-1, 0]);
  });

  it("is ZERO when both components are", () => {
    expect(Exponent.ZERO.isZero()).toBe(true);
    expect(Exponent.fromSqrtExt(SqrtExt.ZERO).isZero()).toBe(true);
    expect(Exponent.piTimes(Gauss.ZERO).isZero()).toBe(true);
  });
});

describe("π is an indeterminate, not a number", () => {
  it("keeps the two components apart under addition", () => {
    const b = Exponent.piTimes(Gauss.ONE).add(Exponent.fromSqrtExt(alg(1)));
    expect(b.pi.equals(Gauss.ONE)).toBe(true);
    expect(b.algebraic.equals(alg(1))).toBe(true);
    // …and equals NEITHER of them, however close the decimals of some other combination might be.
    expect(b.equals(Exponent.piTimes(Gauss.ONE))).toBe(false);
    expect(b.equals(Exponent.fromSqrtExt(alg(1)))).toBe(false);
    expect(b.toTuple()[0]).toBeCloseTo(1 + Math.PI, 12);
  });

  it("decides equality componentwise, which is exact because π is transcendental", () => {
    expect(Exponent.piTimes(gi(3, 5)).equals(Exponent.piTimes(gi(6, 10)))).toBe(true);
    expect(Exponent.piTimes(gi(3, 5)).equals(Exponent.piTimes(gi(3, 4)))).toBe(false);
    // A rational within 1e-6 of π is a DIFFERENT exponent, and nothing here rounds them together.
    const nearlyPi = Exponent.fromSqrtExt(SqrtExt.fromGauss(gi(355, 113)));
    expect(nearlyPi.equals(Exponent.piTimes(Gauss.ONE))).toBe(false);
    expect(Math.abs(nearlyPi.toTuple()[0] - Math.PI)).toBeLessThan(1e-6);
  });

  it("adds, subtracts and negates both components", () => {
    const a = Exponent.of(alg(2), gi(1, 3));
    const b = Exponent.of(alg(5), gi(1, 6));
    expect(a.add(b).equals(Exponent.of(alg(7), gi(1, 2)))).toBe(true);
    expect(b.sub(b).isZero()).toBe(true);
    expect(a.add(a.neg()).isZero()).toBe(true);
  });

  it("scales both components by a Gaussian rational", () => {
    // `(α−1)·(iπ)` is how the residue's exponent is built, and it must not leave either field.
    const b = Exponent.piTimes(Gauss.I).scale(gi(-7, 10));
    expect(b.pi.equals(gi(0, 1, -7, 10))).toBe(true);
    expect(b.algebraic.isZero()).toBe(true);
  });

  it("scales an algebraic part that lives in a quadratic extension", () => {
    const root2 = SqrtExt.of(Gauss.ZERO, Gauss.ONE, 2n);
    const b = Exponent.fromSqrtExt(root2).scale(gi(1, 2));
    expect(b.toTuple()[0]).toBeCloseTo(Math.SQRT2 / 2, 12);
  });

  it("halves, and two halves make the whole — the sine recogniser's one operation", () => {
    for (const b of [
      Exponent.piTimes(gi(0, 1, 3, 5)),
      Exponent.of(alg(4), gi(-1, 3)),
      Exponent.ZERO,
    ]) {
      expect(b.half().add(b.half()).equals(b)).toBe(true);
    }
  });
});

describe("reality, which decides whether a real part distributes", () => {
  it("calls a real algebraic part with a real π coefficient real", () => {
    expect(Exponent.of(alg(-1), gi(2, 1)).isReal()).toBe(true);
  });

  it("calls an imaginary π coefficient NOT real — the common tier-D case", () => {
    // `e^{iπα}` is on the unit circle, so no real part distributes over it, which is exactly why the
    // keyhole's answer is extracted by the sine recogniser instead.
    const b = Exponent.piTimes(gi(0, 1, 3, 5));
    expect(b.isReal()).toBe(false);
    expect(b.isImaginary()).toBe(true);
  });

  it("calls a mixed exponent neither", () => {
    const b = Exponent.of(alg(-1), gi(0, 1, 1, 2));
    expect(b.isReal()).toBe(false);
    expect(b.isImaginary()).toBe(false);
  });

  it("reads the π coefficient as a rational only when it is real", () => {
    expect(Exponent.piTimes(gi(3, 5)).piAsFrac()?.equals(q(3, 5))).toBe(true);
    expect(Exponent.piTimes(gi(0, 1, 3, 5)).piAsFrac()).toBeNull();
  });
});

describe("formatting — what a reader would write", () => {
  it("writes the π part by hand", () => {
    expect(formatExponent(Exponent.piTimes(Gauss.ONE))).toBe("π");
    expect(formatExponent(Exponent.piTimes(Gauss.ONE.neg()))).toBe("−π");
    expect(formatExponent(Exponent.piTimes(Gauss.I))).toBe("iπ");
    expect(formatExponent(Exponent.piTimes(gi(3, 5)))).toBe("3π/5");
    expect(formatExponent(Exponent.piTimes(gi(0, 1, 1, 2)))).toBe("iπ/2");
    expect(formatExponent(Exponent.piTimes(gi(0, 1, -7, 10)))).toBe("−7iπ/10");
  });

  it("writes a mixed exponent as a sum", () => {
    expect(formatExponent(Exponent.of(alg(1), gi(0, 1, 1, 1)))).toBe("1 + iπ");
    expect(formatExponent(Exponent.of(alg(1), gi(-1, 2)))).toBe("1 − π/2");
  });

  it("falls back to the algebraic form when there is no π", () => {
    expect(formatExponent(Exponent.fromSqrtExt(alg(-2)))).toBe("−2");
  });
});

describe("ExpSum over the widened exponent", () => {
  it("combines terms whose π exponents agree, exactly", () => {
    const b = Exponent.piTimes(gi(0, 1, 3, 5));
    const s = ExpSum.of(alg(1), b).add(ExpSum.of(alg(2), Exponent.piTimes(gi(0, 1, 6, 10))));
    expect(s.terms).toHaveLength(1);
    expect(s.terms[0].coefficient.toTuple()[0]).toBe(3);
  });

  it("keeps terms whose π exponents differ apart", () => {
    const s = ExpSum.of(alg(1), Exponent.piTimes(gi(0, 1, 3, 5))).add(
      ExpSum.of(alg(1), Exponent.piTimes(gi(0, 1, 3, 4))),
    );
    expect(s.terms).toHaveLength(2);
  });

  it("does not confuse a π exponent with an algebraic one of similar size", () => {
    const s = ExpSum.of(alg(1), Exponent.piTimes(Gauss.ONE)).add(
      ExpSum.of(alg(1), Exponent.fromSqrtExt(SqrtExt.fromGauss(gi(355, 113)))),
    );
    expect(s.terms).toHaveLength(2);
  });

  it("evaluates e^{iπα} on the unit circle", () => {
    // α = 1/2: e^{iπ/2} = i, so 1·e^{iπ/2} is (0, 1).
    const [re, im] = ExpSum.of(alg(1), Exponent.piTimes(gi(0, 1, 1, 2))).toTuple();
    expect(re).toBeCloseTo(0, 12);
    expect(im).toBeCloseTo(1, 12);
  });

  it("evaluates the keyhole's own edge factor", () => {
    // `e^{2πiα}` at α = 3/10 is `e^{3iπ/5}`.
    const [re, im] = ExpSum.of(alg(1), Exponent.piTimes(gi(0, 1, 3, 5))).toTuple();
    expect(re).toBeCloseTo(Math.cos((3 * Math.PI) / 5), 12);
    expect(im).toBeCloseTo(Math.sin((3 * Math.PI) / 5), 12);
  });

  it("renders a π exponent in the general e^(…) form", () => {
    expect(formatExpSum(ExpSum.of(alg(1), Exponent.piTimes(gi(0, 1, 3, 5))))).toBe("e^(3iπ/5)");
    expect(formatExpSum(ExpSum.of(alg(2), Exponent.piTimes(Gauss.I)))).toBe("2·e^(iπ)");
  });

  it("still reduces to an algebraic value when no exponential survived", () => {
    expect(ExpSum.fromSqrtExt(alg(3)).asSqrtExt()?.toTuple()).toEqual([3, 0]);
    expect(ExpSum.of(alg(3), Exponent.piTimes(Gauss.I)).asSqrtExt()).toBeNull();
  });
});

describe("the logarithmic component — M4.5, and D2's poles off the unit circle", () => {
  const ln = (n: number, d = 1): LogPart => {
    const got = LogPart.ln(q(n, d));
    if (got === null) throw new Error("refused");
    return got;
  };

  it("carries ln r beside the argument, which is what a pole off the unit circle needs", () => {
    // `z₀ = −2 = 2·e^{iπ}`, so `z₀^{1/2} = e^{(1/2)(ln 2 + iπ)}`. Both halves in one exponent.
    const b = Exponent.of(SqrtExt.ZERO, gi(0, 1, 1, 2), ln(2).scale(q(1, 2)));
    expect(formatExponent(b)).toBe("iπ/2 + ln 2/2");
    const [re, im] = b.toTuple();
    expect(re).toBeCloseTo(Math.log(Math.SQRT2), 15);
    expect(im).toBeCloseTo(Math.PI / 2, 15);
  });

  it("keeps equality a decision across the three components", () => {
    const a = Exponent.of(alg(1), gi(1, 2), ln(4));
    const b = Exponent.of(alg(1), gi(1, 2), ln(2).scale(q(2)));
    expect(a.equals(b)).toBe(true);
    expect(a.sub(b).isZero()).toBe(true);
    expect(a.equals(Exponent.of(alg(1), gi(1, 2), ln(2)))).toBe(false);
  });

  it("is REAL — the imaginary part of a logarithm is the argument, decided elsewhere", () => {
    expect(Exponent.fromLog(ln(2)).isReal()).toBe(true);
    // …and it therefore takes `e^{β}` OFF the unit circle, which the sine recogniser must not be handed.
    expect(Exponent.fromLog(ln(2)).isImaginary()).toBe(false);
    expect(Exponent.piTimes(Gauss.I).isImaginary()).toBe(true);
  });

  it("refuses to be scaled by i — `2^i` is outside the declared basis", () => {
    expect(() => Exponent.fromLog(ln(2)).scale(Gauss.I)).toThrow(/outside this basis/);
    // A real scale is fine, and a purely algebraic exponent may still be scaled by i.
    expect(Exponent.fromLog(ln(2)).scale(gi(1, 2)).log.equals(ln(2).scale(q(1, 2)))).toBe(true);
    expect(Exponent.fromSqrtExt(alg(1)).scale(Gauss.I).toTuple()).toEqual([0, 1]);
  });

  it("folds a power that lands in ℚ or one quadratic extension, and carries the rest", () => {
    // `e^{ln 2}` is the number 2 — printing it as an exponential is the same disservice as printing
    // `e^{iπ}` instead of −1, which is what this method already did for the π half.
    expect(Exponent.fromLog(ln(2)).asAlgebraicFactor()?.toTuple()[0]).toBe(2);
    expect(Exponent.fromLog(ln(2).scale(q(1, 2))).asAlgebraicFactor()?.toTuple()[0]).toBeCloseTo(Math.SQRT2, 15);
    // `i·√2`: the sign fold and the radical fold combine in one SqrtExt.
    const both = Exponent.of(SqrtExt.ZERO, gi(0, 1, 1, 2), ln(2).scale(q(1, 2)));
    expect(both.asAlgebraicFactor()?.toTuple()).toEqual([0, Math.SQRT2]);
    // A third is carried.
    expect(Exponent.fromLog(ln(10).scale(q(1, 3))).asAlgebraicFactor()).toBeNull();
  });

  // **A FOLD COMBINES A RADICAL, IT NEVER INTRODUCES ONE (M5.4b).** `radicand` is the coefficient
  // the caller holds one for, and it decides both halves of that sentence.
  describe("splitAlgebraicFactor's radicand", () => {
    /** `e^{iπ·p/q}`. */
    const root = (p: number, r: number) => Exponent.piTimes(gi(0, 1, p, r));

    it("folds nothing needing a √ when the coefficient carries none", () => {
      // The default, and `asAlgebraicFactor`'s case: asked in the abstract, there is no coefficient
      // to match, so `e^{iπ/4}` and `e^{iπ/3}` are CARRIED. D7's residue-at-infinity row depends on
      // it — `17/4·e^{−iπ/4}` shows a magnitude of 4.25 that `17√2/8 − 17i√2/8` hides.
      for (const [p, r] of [[1, 4], [1, 3], [1, 6], [2, 3]] as const) {
        const split = root(p, r).splitAlgebraicFactor();
        expect(split.factor.equals(SqrtExt.ONE), `e^{iπ·${p}/${r}}`).toBe(true);
        expect(split.rest.equals(root(p, r))).toBe(true);
      }
    });

    it("folds ONLY into the radicand it was given", () => {
      // `e^{iπ/3}` is `(1 + i√3)/2`, so it folds against a √3 coefficient and is carried against a
      // √2 one. Getting this wrong is caught downstream by `tryMul` too, but the method's own
      // contract is the place it is decided — a `radicand` argument half-honoured is worse than none.
      expect(root(1, 3).splitAlgebraicFactor(3n).factor.toTuple()).toEqual([0.5, Math.sqrt(3) / 2]);
      expect(root(1, 3).splitAlgebraicFactor(2n).factor.equals(SqrtExt.ONE)).toBe(true);
      // …and symmetrically: `e^{iπ/4}` is `(1+i)/√2`, a √2 number.
      const quarter = root(1, 4).splitAlgebraicFactor(2n).factor.toTuple();
      expect(quarter[0]).toBeCloseTo(Math.SQRT1_2, 15);
      expect(quarter[1]).toBeCloseTo(Math.SQRT1_2, 15);
      expect(root(1, 4).splitAlgebraicFactor(3n).factor.equals(SqrtExt.ONE)).toBe(true);
    });

    it("still folds the ℚ(i) cases whatever the radicand — they introduce nothing", () => {
      // `e^{iπ}` and `e^{iπ/2}` are `−1` and `i`, already in every coefficient's field, so they are
      // not gated at all: the rule is about introducing a NEW irrationality.
      for (const d of [1n, 2n, 3n]) {
        expect(root(1, 1).splitAlgebraicFactor(d).factor.equals(SqrtExt.ONE.neg())).toBe(true);
        expect(root(1, 2).splitAlgebraicFactor(d).factor.toTuple()).toEqual([0, 1]);
      }
    });

    it("carries an order no quadratic extension holds, whatever the radicand", () => {
      // Fifths and sevenths: ℚ(ζ₁₀) has degree 4 over ℚ and ℚ(ζ₁₄) degree 6. F1 at `n = 5` and
      // `n = 7` is exactly this case, and its answer carries a sine because of it.
      for (const d of [1n, 2n, 3n, 5n]) {
        expect(root(1, 5).splitAlgebraicFactor(d).factor.equals(SqrtExt.ONE)).toBe(true);
        expect(root(1, 7).splitAlgebraicFactor(d).factor.equals(SqrtExt.ONE)).toBe(true);
      }
    });
  });

  it("prints a carried power as a power, not as an exponential", () => {
    const sum = ExpSum.of(SqrtExt.ONE, Exponent.fromLog(ln(10).scale(q(1, 3))));
    expect(formatExpSum(sum)).toBe("2^(1/3)·5^(1/3)");
  });
});
