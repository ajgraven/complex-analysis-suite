// Naming the quotient: `c·coth(πr)` and `c·csch(πr)`, and everything that is neither.
//
// The claims worth separating: that the NAME is right (checked against `Math.tanh`/`Math.sinh`
// computed from the record's own parameter, which shares no arithmetic with the exact `ExpRatio`),
// and that the SHAPE is bounded (each refusal names what it saw). The second matters more than it
// looks: a recogniser that quietly accepted a near-miss would print a `coth` beside a number that is
// not one, and the decimal would not give it away.
import { describe, expect, it } from "vitest";
import { Frac, Gauss, SqrtExt } from "@cas/exact";
import { parse } from "@cas/expr";
import { asSummationKernel } from "../src/kernel/summationKernel.js";
import { cofactorResidues, ratioToTuple, type ExpRatio } from "../src/kernel/kernelResidue.js";
import { asHyperbolicForm } from "../src/kernel/cothForm.js";
import { denominatorOf, formatSineForm, sineFormToNumber } from "../src/kernel/sineForm.js";
import { ExpSum } from "../src/kernel/expSum.js";
import { Exponent } from "../src/kernel/exponent.js";

const q = (n: bigint, d: bigint): Frac => Frac.of(n, d);
const ext = (n: bigint, d = 1n): SqrtExt => SqrtExt.fromGauss(Gauss.rat(n, d));
/** `e^{π·t}` with a real `t` — the only exponent shape this recogniser reads. */
const piExp = (t: Frac): Exponent => Exponent.piTimes(new Gauss(t, Frac.ZERO));
const term = (c: SqrtExt, t: Frac): ExpSum => ExpSum.of(c, piExp(t));

/** `T/π = −ρ` at weight 1 — what the solve hands the recogniser. */
function sumOf(src: string): ExpRatio {
  const kernel = asSummationKernel(parse(src));
  if (kernel === null) throw new Error(`no kernel in ${src}`);
  const r = cofactorResidues(kernel);
  if (!r.ok) throw new Error(r.reason);
  return { num: r.total.num.neg(), den: r.total.den };
}

const named = (src: string) => {
  const r = asHyperbolicForm(sumOf(src));
  if (!r.ok) throw new Error(r.reason);
  return r;
};

const refusal = (ratio: ExpRatio): string => {
  const r = asHyperbolicForm(ratio);
  if (r.ok) throw new Error(`expected a refusal, got ${formatSineForm(r.form)}`);
  return r.reason;
};

describe("the π cot kernel names a coth, in the record's own parameter", () => {
  // G2's four fixtures. `want` is computed from `a` through `Math.tanh` — a route that shares no
  // arithmetic at all with the exact ratio of `ExpSum`s the recogniser reads.
  it.each([
    ["3/4", 0.75, "(4π/3)·coth(3π/4)"],
    ["1", 1, "π·coth(π)"],
    ["23/10", 2.3, "(10π/23)·coth(23π/10)"],
    ["1/5", 0.2, "5π·coth(π/5)"],
  ])("a = %s", (exprA, a, text) => {
    const r = named(`pi*cot(pi*z)/(z^2+(${exprA})^2)`);
    expect(formatSineForm(r.form)).toBe(text);
    expect(sineFormToNumber(r.form, "re")).toBeCloseTo(Math.PI / a / Math.tanh(Math.PI * a), 12);
    // `r` is `a` ITSELF, not a multiple of it: the denominator's exponent is `2πa` and the halving
    // is what makes the printed argument the parameter the record declared.
    expect(denominatorOf(r.form)?.kind).toBe("coth");
    expect(denominatorOf(r.form)?.r.toNumber()).toBeCloseTo(a, 15);
  });

  it("the π csc kernel names a csch on the SAME cofactor", () => {
    for (const [exprA, a] of [["1", 1] as const, ["3/4", 0.75] as const]) {
      const r = named(`pi*csc(pi*z)/(z^2+(${exprA})^2)`);
      expect(denominatorOf(r.form)?.kind).toBe("csch");
      expect(sineFormToNumber(r.form, "re")).toBeCloseTo(Math.PI / a / Math.sinh(Math.PI * a), 12);
    }
  });

  it("which of the two is decided by an EXPONENT, not by which kernel was passed in", () => {
    // The recogniser never sees the kernel. `cot` puts `δ = γ` and `csc` puts `δ = γ/2`, and that
    // difference is the whole of the decision — so the same denominator with a halved numerator
    // exponent flips the name.
    const gamma = q(3n, 2n);
    const den = term(ext(-1n), gamma).add(term(ext(2n), Frac.ZERO)).add(term(ext(-1n), gamma.neg()));
    const half = gamma.div(Frac.of(2n));
    const kindOf = (num: ExpSum): string | undefined => {
      const r = asHyperbolicForm({ num, den });
      return r.ok ? denominatorOf(r.form)?.kind : undefined;
    };
    expect(kindOf(term(ext(-4n, 3n), gamma).add(term(ext(4n, 3n), gamma.neg())))).toBe("coth");
    expect(kindOf(term(ext(-4n, 3n), half).add(term(ext(4n, 3n), half.neg())))).toBe("csch");
  });

  it("the exact value survives the naming — the decimal is the ratio's own", () => {
    for (const src of ["pi*cot(pi*z)/(z^2+(3/4)^2)", "pi*csc(pi*z)/(z^2+(3/4)^2)"]) {
      const ratio = sumOf(src);
      const r = named(src);
      expect(sineFormToNumber(r.form, "re")).toBeCloseTo(Math.PI * ratioToTuple(ratio)[0], 12);
    }
  });
});

describe("a hyperbolic form MULTIPLIES, where a sine divides", () => {
  it("prints as a product, which is how the record writes it", () => {
    expect(formatSineForm(named("pi*cot(pi*z)/(z^2+(3/4)^2)").form)).toContain("·coth(");
    expect(formatSineForm(named("pi*cot(pi*z)/(z^2+(3/4)^2)").form)).not.toContain("/coth(");
  });

  it("and the NUMBER divides by tanh, not by coth — the one place the two could disagree", () => {
    // `c·coth(x) = c/tanh(x)`. A number computed as `c/Math.tanh` beside a text reading `·coth` is
    // the same claim; a number computed as `c/Math.cosh` would not be, and nothing in the text
    // would show it. E2's bug was exactly this shape, so both halves are pinned here.
    const r = named("pi*cot(pi*z)/(z^2+1)");
    expect(sineFormToNumber(r.form, "re")).toBeCloseTo(Math.PI / Math.tanh(Math.PI), 12);
    expect(sineFormToNumber(r.form, "re")).not.toBeCloseTo(Math.PI / Math.cosh(Math.PI), 3);
  });

  it("at most one factor slot is ever set", () => {
    const r = named("pi*cot(pi*z)/(z^2+1)");
    const slots = [r.form.sine, r.form.cosh, r.form.hyperbolic].filter((x) => x !== undefined);
    expect(slots.length).toBe(1);
    expect(denominatorOf(r.form)).toEqual(r.form.hyperbolic);
  });

  it("an unnamed form still reads its own number", () => {
    expect(sineFormToNumber({ sum: ExpSum.fromSqrtExt(ext(3n)) }, "re")).toBeCloseTo(3 * Math.PI, 12);
    expect(denominatorOf({ sum: ExpSum.ZERO })).toBeNull();
  });
});

describe("the shape is bounded, and each refusal names what it saw", () => {
  const gamma = q(3n, 2n);
  const den = term(ext(-1n), gamma).add(term(ext(2n), Frac.ZERO)).add(term(ext(-1n), gamma.neg()));
  const num = term(ext(-4n, 3n), gamma).add(term(ext(4n, 3n), gamma.neg()));

  it("refuses a denominator that is not −e^{γ} + 2 − e^{−γ}", () => {
    // The constant must be exactly 2 — it is what makes the denominator a perfect square.
    const wrong = term(ext(-1n), gamma).add(term(ext(3n), Frac.ZERO)).add(term(ext(-1n), gamma.neg()));
    expect(refusal({ num, den: wrong })).toMatch(/denominator is not/);
    // …and the wings must be −1, not +1: `e^{γ} + 2 + e^{−γ}` is `4cosh²(γ/2)`, a different function.
    const plus = term(ext(1n), gamma).add(term(ext(2n), Frac.ZERO)).add(term(ext(1n), gamma.neg()));
    expect(refusal({ num, den: plus })).toMatch(/denominator is not/);
    // …and there must be three terms.
    expect(refusal({ num, den: term(ext(-1n), gamma).add(term(ext(2n), Frac.ZERO)) })).toMatch(/denominator is not/);
  });

  it("refuses a numerator that is not c·e^{δ} − c·e^{−δ}", () => {
    // Equal coefficients make `2c·cosh(δ)`, not a sinh — and the quotient is then not hyperbolic at
    // all in this basis.
    const even = term(ext(1n), gamma).add(term(ext(1n), gamma.neg()));
    expect(refusal({ num: even, den })).toMatch(/numerator is not/);
    expect(refusal({ num: term(ext(1n), gamma), den })).toMatch(/numerator is not/);
  });

  it("refuses exponents that are not real multiples of π", () => {
    // These come from `e^{2πiz₀}` at a purely imaginary `z₀`. A pole off the imaginary axis gives a
    // complex exponent, where `sinh` of it is not what the identity above is about.
    const iPi = Exponent.piTimes(new Gauss(Frac.ZERO, Frac.ONE));
    const complexNum = ExpSum.of(ext(1n), iPi).add(ExpSum.of(ext(-1n), iPi.neg()));
    expect(refusal({ num: complexNum, den })).toMatch(/numerator is not/);
  });

  it("refuses a numerator exponent that is neither γ nor γ/2, naming both", () => {
    const third = term(ext(-1n), gamma.div(Frac.of(3n))).add(term(ext(1n), gamma.div(Frac.of(3n)).neg()));
    expect(refusal({ num: third, den })).toMatch(/half-exponent is π·1\/2 and the denominator's is π·3\/4/);
  });

  it("refuses a zero argument, where coth and csch both have a pole", () => {
    const flat = term(ext(-1n), Frac.ZERO).add(term(ext(2n), Frac.ZERO)).add(term(ext(-1n), Frac.ZERO));
    // A zero `γ` collapses the denominator's three terms into one, so it is refused one step earlier
    // — which is the honest place for it: there is no `γ` to halve.
    expect(refusal({ num, den: flat })).toMatch(/denominator is not/);
  });
});
