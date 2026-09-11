import { describe, expect, it } from "vitest";
import { Frac, Gauss, SqrtExt } from "@cas/exact";
import { ExpSum, formatExpSum, formatTwoPiIExpSum, jordanExponent } from "../src/kernel/expSum.js";

const g = (re: number, im = 0): SqrtExt => SqrtExt.fromGauss(Gauss.int(re, im));
const rat = (n: number, d: number): SqrtExt =>
  SqrtExt.fromGauss(Gauss.rat(BigInt(n), BigInt(d)));

describe("ExpSum — the algebraic case must be unchanged", () => {
  it("comes straight back out as a SqrtExt when no exponential survived", () => {
    // A new basis must not change what the old one printed: 1/(1+z⁴)'s residue sum is −i√2/4, and
    // it must still be recognisable as an element of ℚ(i)(√2).
    const algebraic = SqrtExt.of(Gauss.ZERO, Gauss.rat(-1n, 4n, 0n, 1n).mul(Gauss.I), 2n);
    const sum = ExpSum.fromSqrtExt(algebraic);
    expect(sum.asSqrtExt()?.equals(algebraic)).toBe(true);
    expect(sum.toTuple()[0]).toBeCloseTo(algebraic.toTuple()[0], 15);
    expect(sum.toTuple()[1]).toBeCloseTo(algebraic.toTuple()[1], 15);
  });

  it("reports ZERO as algebraic zero, not as 'not algebraic'", () => {
    expect(ExpSum.ZERO.asSqrtExt()?.isZero()).toBe(true);
  });

  it("is not algebraic once a non-zero exponent is present", () => {
    expect(ExpSum.of(g(1), g(-1)).asSqrtExt()).toBeNull();
  });
});

describe("ExpSum — arithmetic", () => {
  it("combines terms with the same exponent and drops the ones that cancel", () => {
    const a = ExpSum.of(g(3), g(-1));
    const b = ExpSum.of(g(-3), g(-1));
    expect(a.add(b).isZero()).toBe(true);
    expect(a.add(a).terms).toHaveLength(1);
    expect(a.add(a).terms[0].coefficient.toTuple()[0]).toBe(6);
  });

  it("keeps terms with different exponents apart", () => {
    const s = ExpSum.of(g(1), g(-1)).add(ExpSum.of(g(1), g(-2)));
    expect(s.terms).toHaveLength(2);
    expect(s.toTuple()[0]).toBeCloseTo(Math.exp(-1) + Math.exp(-2), 14);
  });

  it("scales every coefficient, which is how 2πi·Σ is formed", () => {
    const s = ExpSum.of(g(1), g(-1)).add(ExpSum.of(g(2), g(-2)));
    const scaled = s.scale(g(0, 1));
    expect(scaled.terms.map((t) => t.coefficient.toTuple())).toEqual([
      [0, 1],
      [0, 2],
    ]);
  });

  it("does not throw when two terms live in different quadratic extensions", () => {
    // SqrtExt refuses to pretend √2 and √3 share one extension. For a SUM that is not an error —
    // the terms simply stay separate — and the value must still be right.
    const root2 = SqrtExt.of(Gauss.ZERO, Gauss.ONE, 2n);
    const root3 = SqrtExt.of(Gauss.ZERO, Gauss.ONE, 3n);
    const s = ExpSum.of(root2, g(0)).add(ExpSum.of(root3, g(0)));
    expect(s.terms).toHaveLength(2);
    expect(s.toTuple()[0]).toBeCloseTo(Math.SQRT2 + Math.sqrt(3), 14);
  });
});

describe("ExpSum — the numeric crossing", () => {
  it("evaluates e^{β} for a complex exponent", () => {
    // e^{iπ/2}-ish: use β = i, so e^i = cos 1 + i sin 1.
    const [re, im] = ExpSum.of(g(1), g(0, 1)).toTuple();
    expect(re).toBeCloseTo(Math.cos(1), 14);
    expect(im).toBeCloseTo(Math.sin(1), 14);
  });

  it("gets B1's residue right: Res = e^{−ab}/(2ib) at a = b = 1", () => {
    // Res(g, ib) = 1/(2ib) = −i/2; the exponential factor is e^{ia(ib)} = e^{−1}.
    const residue = ExpSum.of(rat(-1, 2).mul(g(0, 1)), g(-1));
    const [re, im] = residue.toTuple();
    expect(re).toBeCloseTo(0, 15);
    expect(im).toBeCloseTo(-Math.exp(-1) / 2, 15);
    // The record's own numeric check: −0.183939720585721 i.
    expect(im).toBeCloseTo(-0.183939720585721, 14);
  });
});

describe("jordanExponent", () => {
  it("is i·a·z₀ — the factor e^{iaz₀} a Jordan residue carries", () => {
    // a = 1, z₀ = i  ⇒  β = i·1·i = −1, so e^{β} = 1/e.
    const beta = jordanExponent(Frac.of(1n), g(0, 1));
    expect(beta.toTuple()).toEqual([-1, 0]);

    // a = 2, z₀ = 3i ⇒ β = −6.
    expect(jordanExponent(Frac.of(2n), g(0, 3)).toTuple()).toEqual([-6, 0]);

    // A pole off the imaginary axis keeps an oscillatory part: a = 1, z₀ = 1 + i ⇒ β = −1 + i.
    expect(jordanExponent(Frac.of(1n), g(1, 1)).toTuple()).toEqual([-1, 1]);
  });
});

describe("rendering", () => {
  it("names e and 1/e rather than printing e^(1) and e^(−1)", () => {
    expect(formatExpSum(ExpSum.of(g(1), g(-1)))).toBe("1/e");
    expect(formatExpSum(ExpSum.of(g(1), g(1)))).toBe("e");
    expect(formatExpSum(ExpSum.of(g(3), g(-1)))).toBe("3/e");
    expect(formatExpSum(ExpSum.of(g(1), g(-2)))).toBe("e^(−2)");
  });

  it("folds 2πi into the coefficient, so B1 reads π/e", () => {
    // Res = −i/2 · e^{−1}; 2πi·(−i/2) = π.
    const residue = ExpSum.of(rat(-1, 2).mul(g(0, 1)), g(-1));
    expect(formatTwoPiIExpSum(residue)).toBe("π/e");
  });

  it("joins several terms with explicit signs", () => {
    const s = ExpSum.of(g(1), g(-1)).add(ExpSum.of(g(-2), g(-2)));
    expect(formatExpSum(s)).toBe("1/e − 2·e^(−2)");
  });

  it("prints zero as zero", () => {
    expect(formatExpSum(ExpSum.ZERO)).toBe("0");
    expect(formatTwoPiIExpSum(ExpSum.ZERO)).toBe("0");
  });
});

describe("a compound coefficient is bracketed before the exponential multiplies it", () => {
  it("does not print (A − B)·e^β as A − B·e^β", () => {
    // B3's shape. Without brackets only the last term reads as multiplied, which is a different
    // formula — right value, wrong statement, and no numeric check can see it.
    const compound = SqrtExt.of(Gauss.int(1), Gauss.int(0, -1), 2n); // 1 − i√2
    const s = ExpSum.of(compound, g(-1, 1));
    const text = formatExpSum(s);
    expect(text.startsWith("(")).toBe(true);
    expect(text).toBe("(1 − i√2)·e^(−1 + i)");
  });

  it("leaves a single-term coefficient unbracketed", () => {
    expect(formatExpSum(ExpSum.of(g(3), g(-2)))).toBe("3·e^(−2)");
  });
});
