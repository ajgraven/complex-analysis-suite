// ℚ(i)(π) as an exact field — the coefficient ring D4's system needs.
//
// Every test here is a DECISION, which is the whole reason the field exists: π is transcendental, so
// `4π² − 4π²` is zero because the polynomials cancel, not because a difference fell under 1e−12.
import { describe, expect, it } from "vitest";
import { Frac, Gauss, QiPoly } from "@cas/exact";
import { FRAC_FIELD, RAT_PI_FIELD, type Field } from "../src/families/field.js";
import { RatPi, formatRatPi } from "../src/kernel/ratPi.js";

const g = (re: number, im = 0): Gauss => Gauss.int(re, im);
const pi = (k: number, re = 1, im = 0): RatPi => RatPi.piPower(k, g(re, im));
/** `Σ cₖ π^k` from coefficients given lowest power first. */
const poly = (...coeffs: Gauss[]): QiPoly => QiPoly.fromCoeffs(coeffs);

describe("RatPi — the normal form is what makes equality a decision", () => {
  it("cancels a common factor and makes the denominator monic", () => {
    // (2π)/2 and π are the same element, and must be the same OBJECT for `equals` to be sound.
    const halved = RatPi.of(poly(g(0), g(2)), QiPoly.int(2));
    expect(halved.equals(pi(1))).toBe(true);
    expect(formatRatPi(halved)).toBe("π");
  });

  it("gives 1/(2π) and (1/2)/π the same representative", () => {
    const a = RatPi.of(QiPoly.constant(Gauss.ONE), poly(g(0), g(2)));
    const b = RatPi.of(QiPoly.constant(Gauss.rat(1n, 2n)), poly(g(0), g(1)));
    expect(a.equals(b)).toBe(true);
    expect(formatRatPi(a)).toBe("1/(2π)");
  });

  it("cancels a polynomial factor", () => {
    // (π² − 1)/(π − 1) = π + 1, exactly.
    const x = RatPi.of(poly(g(-1), g(0), g(1)), poly(g(-1), g(1)));
    expect(formatRatPi(x)).toBe("π + 1");
  });

  it("decides zero on the numerator, however the value arrived", () => {
    const zero = pi(2, 4).sub(pi(2, 4));
    expect(zero.isZero()).toBe(true);
    expect(zero.equals(RatPi.ZERO)).toBe(true);
    // And a genuine non-zero is not mistaken for one, however small it would be numerically.
    expect(RatPi.of(QiPoly.constant(Gauss.rat(1n, 10n ** 40n))).isZero()).toBe(false);
  });

  it("refuses a zero denominator and refuses to invert zero", () => {
    expect(() => RatPi.of(QiPoly.constant(Gauss.ONE), QiPoly.zero())).toThrow(/zero denominator/);
    expect(() => RatPi.ZERO.inv()).toThrow(/cannot invert zero/);
  });

  it("refuses a negative power rather than answering 0", () => {
    // `QiPoly.monomial` returns the ZERO polynomial for a negative power, so an unguarded
    // `piPower(−1)` would be 0 instead of 1/π — a wrong answer, not an error.
    expect(() => RatPi.piPower(-1)).toThrow(/negative power/);
  });
});

describe("RatPi — arithmetic", () => {
  it("inverts D4's leading coefficient exactly", () => {
    const fourPiSquared = pi(2, 4);
    expect(fourPiSquared.mul(fourPiSquared.inv()).equals(RatPi.ONE)).toBe(true);
    expect(formatRatPi(fourPiSquared.inv())).toBe("1/(4π²)");
  });

  it("multiplies out (π + 1)(π − 1) = π² − 1", () => {
    const sum = pi(1).add(RatPi.ONE);
    const difference = pi(1).sub(RatPi.ONE);
    expect(formatRatPi(sum.mul(difference))).toBe("π² − 1");
  });

  it("negates without renormalising", () => {
    expect(formatRatPi(pi(1, 0, -4))).toBe("−4iπ");
    expect(pi(1, 0, -4).neg().equals(pi(1, 0, 4))).toBe(true);
  });

  it("raises the π-degree by multiplication, which is why one exponent scaling cannot clear π", () => {
    // The concrete obstruction ADR-0041 records: T0 = π/2 and T2 = π³/8 live at different degrees.
    expect(pi(1).mul(pi(2)).asPiMonomial()?.power).toBe(3);
  });
});

describe("RatPi — Re and Im, which is where D4's rank 2 comes from", () => {
  it("splits a purely imaginary coefficient", () => {
    const minusFourPiI = pi(1, 0, -4);
    expect(minusFourPiI.re().isZero()).toBe(true);
    expect(formatRatPi(minusFourPiI.im())).toBe("−4π");
  });

  it("leaves a real coefficient alone", () => {
    expect(formatRatPi(pi(2, 4).re())).toBe("4π²");
    expect(pi(2, 4).im().isZero()).toBe(true);
  });

  it("goes through the conjugate for a complex denominator", () => {
    // 1/(iπ) = −i/π: the real part vanishes and the imaginary part is −1/π.
    const x = RatPi.of(QiPoly.constant(Gauss.ONE), poly(g(0), g(0, 1)));
    expect(x.re().isZero()).toBe(true);
    expect(formatRatPi(x.im())).toBe("−1/π");
  });

  it("keeps |x| = 1 exactly for a quotient of conjugates", () => {
    // x = (1 + iπ)/(1 − iπ) has modulus 1, so Re² + Im² = 1 — an identity the coefficientwise
    // shortcut `Re(num)/Re(den)` gets wrong, and the strongest available check on the conjugate
    // trick because it is decided in the field rather than compared as decimals.
    const x = RatPi.of(poly(g(1), g(0, 1)), poly(g(1), g(0, -1)));
    const re = x.re();
    const im = x.im();
    expect(re.mul(re).add(im.mul(im)).equals(RatPi.ONE)).toBe(true);
    expect(formatRatPi(re)).toBe("(−π² + 1)/(π² + 1)");
    expect(formatRatPi(im)).toBe("2π/(π² + 1)");
  });
});

describe("RatPi — the two exits into numbers, both labelled ≈ by construction", () => {
  it("reads a monomial back out", () => {
    expect(pi(3, 1, 0).asPiMonomial()).toEqual({ power: 3, coefficient: g(1) });
    expect(RatPi.fromGauss(g(0, 2)).asPiMonomial()).toEqual({ power: 0, coefficient: g(0, 2) });
    expect(RatPi.ZERO.asPiMonomial()).toEqual({ power: 0, coefficient: Gauss.ZERO });
    // Not a monomial: a sum, and a genuine quotient.
    expect(pi(1).add(RatPi.ONE).asPiMonomial()).toBeNull();
    expect(pi(1).inv().asPiMonomial()).toBeNull();
  });

  it("evaluates at π only when asked", () => {
    expect(pi(1).toNumber()[0]).toBeCloseTo(Math.PI, 12);
    expect(pi(1, 0, -4).toNumber()).toEqual([0, -4 * Math.PI]);
    expect(pi(1).inv().toNumber()[0]).toBeCloseTo(1 / Math.PI, 12);
    // A complex denominator: 1/(1 + iπ) = (1 − iπ)/(1 + π²).
    const x = RatPi.of(QiPoly.constant(Gauss.ONE), poly(g(1), g(0, 1)));
    const [re, im] = x.toNumber();
    expect(re).toBeCloseTo(1 / (1 + Math.PI ** 2), 12);
    expect(im).toBeCloseTo(-Math.PI / (1 + Math.PI ** 2), 12);
  });
});

describe("the Field instances obey the laws elimination actually uses", () => {
  const laws = <T>(field: Field<T>, samples: readonly T[]): void => {
    for (const a of samples) {
      expect(field.equals(field.add(a, field.zero), a)).toBe(true);
      expect(field.equals(field.mul(a, field.one), a)).toBe(true);
      expect(field.isZero(field.sub(a, a))).toBe(true);
      expect(field.isZero(field.add(a, field.neg(a)))).toBe(true);
      if (!field.isZero(a)) {
        expect(field.equals(field.mul(a, field.inv(a)), field.one)).toBe(true);
      }
      for (const b of samples) {
        // The one law `rref` leans on beyond the obvious: subtracting a scaled row is exact.
        expect(field.equals(field.sub(field.add(a, b), b), a)).toBe(true);
      }
    }
  };

  it("holds over ℚ", () => {
    laws(FRAC_FIELD, [Frac.ZERO, Frac.ONE, Frac.of(-3n, 7n), Frac.of(22n, 7n)]);
    expect(FRAC_FIELD.format(Frac.of(-1n, 2n))).toBe("−1/2");
  });

  it("holds over ℚ(i)(π)", () => {
    laws(RAT_PI_FIELD, [RatPi.ZERO, RatPi.ONE, pi(2, 4), pi(1, 0, -4), pi(1).inv()]);
    expect(RAT_PI_FIELD.format(pi(2, 4))).toBe("4π²");
  });
});
