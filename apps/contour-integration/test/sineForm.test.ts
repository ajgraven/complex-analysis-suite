// Guards for the sine recogniser — one rule, for one denominator shape.
//
// The cases are the gallery's own. D1 divides by `1 − e^{2πiα}` and must produce `π/sin(πα)`; D3
// divides by the same thing and must produce `(π/n)/sin(πa/n)`; and at integer `α` or `a` the sine
// vanishes and the app must REFUSE rather than print a number. The last is the hardest thing in
// tier D to get honest, because for D3 the closed form is still *correct by continuity* — the value
// survives, the derivation does not.
import { describe, expect, it } from "vitest";
import { Frac, Gauss, SqrtExt } from "@cas/exact";
import { ExpSum } from "../src/kernel/expSum.js";
import { Exponent } from "../src/kernel/exponent.js";
import {
  divideCarryingSine,
  formatSineForm,
  sineArgument,
  sineFormToNumber,
} from "../src/kernel/sineForm.js";

const q = (n: number, d = 1): Frac => Frac.of(BigInt(n), BigInt(d));
const alg = (n: number, d = 1): SqrtExt => SqrtExt.fromGauss(Gauss.rat(BigInt(n), BigInt(d)));
const algI = (n: number, d = 1): SqrtExt =>
  SqrtExt.fromGauss(Gauss.rat(0n, 1n, BigInt(n), BigInt(d)));
/** `i·c·π` as an exponent — every tier-D exponent has this shape. */
const iPi = (n: number, d = 1): Exponent => Exponent.piTimes(Gauss.rat(0n, 1n, BigInt(n), BigInt(d)));

/** `1 − e^{2πiα}`, the keyhole's coefficient on the unknown. */
const keyholeCoefficient = (alphaN: number, alphaD: number): ExpSum =>
  ExpSum.fromSqrtExt(alg(1)).sub(ExpSum.of(alg(1), iPi(2 * alphaN, alphaD)));

describe("the single-term denominator — the tier-A–C path, unchanged", () => {
  it("is plain division and produces no sine", () => {
    const r = divideCarryingSine(ExpSum.fromSqrtExt(alg(3)), ExpSum.fromSqrtExt(alg(2)));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.form.sine).toBeUndefined();
    expect(r.form.sum.asSqrtExt()?.equals(alg(3, 2))).toBe(true);
    expect(r.certificate.level).toBe("=");
  });

  it("shifts the numerator's exponents when the denominator carries one", () => {
    // Thirds and sixths, because halves and quarter-turns are not exponentials at all — `e^{iπ/2}`
    // is `i`, and the basis folds it into the coefficient rather than carrying it.
    const r = divideCarryingSine(ExpSum.of(alg(1), iPi(1, 3)), ExpSum.of(alg(1), iPi(1, 6)));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.form.sum.terms[0].exponent.equals(iPi(1, 6))).toBe(true);
  });

  it("folds an exponent that is secretly a sign, rather than carrying it", () => {
    // `e^{iπ} = −1` and `e^{iπ/2} = i`: signs, not exponentials. Carrying them printed D1's answer
    // as `−π·e^(−iπ)/sin(3π/10)` — the right number in a form the record does not state.
    const r = divideCarryingSine(ExpSum.of(alg(1), iPi(1, 1)), ExpSum.fromSqrtExt(alg(1)));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.form.sum.asSqrtExt()?.equals(alg(-1))).toBe(true);
  });

  it("refuses a zero coefficient as the degenerate case it is", () => {
    const r = divideCarryingSine(ExpSum.fromSqrtExt(alg(1)), ExpSum.ZERO);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.degenerate).toBe(true);
    expect(r.reason).toMatch(/carries no information/);
  });
});

describe("D1 — π/sin(πα) out of 1 − e^{2πiα}", () => {
  /** The whole solve: `(1 − e^{2πiα})·I = 2πi·e^{iπ(α−1)}`, in units of π. */
  const solve = (alphaN: number, alphaD: number) => {
    // `2πi·Res` in units of π is `2i·Res`, and `Res = e^{iπ(α−1)}`.
    const numerator = ExpSum.of(algI(2), iPi(alphaN - alphaD, alphaD));
    return divideCarryingSine(numerator, keyholeCoefficient(alphaN, alphaD));
  };

  it("produces exactly π/sin(3π/10) at α = 3/10 — the record's flagship fixture", () => {
    const r = solve(3, 10);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(formatSineForm(r.form)).toBe("π/sin(3π/10)");
    expect(r.form.sine?.equals(q(3, 10))).toBe(true);
    expect(sineFormToNumber(r.form, "re")).toBeCloseTo(3.8832220774509327, 12);
  });

  it("produces a bare π at α = 1/2, with no sine at all", () => {
    // The coefficient `1 − e^{iπ}` is exactly 2, so there is no two-term denominator to factor and
    // no sine to carry. The record agrees: its α = 0.5 fixture states the value as `pi`, not as
    // `pi/sin(pi/2)`. A sine that is identically 1 is not part of the answer.
    const r = solve(1, 2);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.form.sine).toBeUndefined();
    expect(formatSineForm(r.form)).toBe("π");
    expect(sineFormToNumber(r.form, "re")).toBeCloseTo(Math.PI, 12);
  });

  it("agrees with every one of the record's five fixtures", () => {
    const fixtures: [number, number, number][] = [
      [3, 10, 3.8832220774509327],
      [1, 2, 3.1415926535897931],
      [3, 4, 4.4428829381583661],
      [1, 10, 10.166407384630521],
      [9, 10, 10.166407384630517],
    ];
    for (const [n, d, want] of fixtures) {
      const r = solve(n, d);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(sineFormToNumber(r.form, "re")).toBeCloseTo(want, 10);
      // The FORM is exact: where a sine survives, its argument is πα on the nose rather than a
      // nearby float. α = 1/2 has none, because its coefficient collapsed to the rational 2.
      if (n * 2 === d) expect(r.form.sine).toBeUndefined();
      else expect(r.form.sine?.equals(q(n, d))).toBe(true);
    }
  });

  it("carries the sine — the exponent is exact, and nothing evaluated it", () => {
    const r = solve(3, 10);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(sineArgument(r.form)?.pi.equals(Gauss.rat(3n, 10n))).toBe(true);
    expect(r.certificate.level).toBe("=");
    expect(r.certificate.method).toMatch(/2i·sin/);
  });
});

describe("D3 — (π/n)/sin(πa/n), and the integer-a collapse", () => {
  /** `(1 − e^{2πia})·I = 2πi·Σ(−e^{iπa(2k+1)/n}/n)` — here only the shape matters. */
  const coefficient = (aN: number, aD: number): ExpSum => keyholeCoefficient(aN, aD);

  it("brackets a compound numerator, as the record writes it", () => {
    // `(π/4)/sin(3π/8)` — the numerator `1/4` must not end up as `π/4/sin(…)`.
    const r = divideCarryingSine(ExpSum.of(algI(1, 2), iPi(3, 8)), coefficient(3, 8));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // The sign here is an artefact of the synthetic numerator; what is under test is that a
    // numerator carrying a division is BRACKETED before the sine divides it again.
    expect(formatSineForm(r.form)).toMatch(/^\(−?π\/[0-9]+\)\/sin\(/);
  });

  it("REFUSES at integer a, naming the vanished denominator rather than printing 0", () => {
    // a = 3: `1 − e^{6πi} = 0`. D3's own note: the value (π/7)/sin(3π/7) is right and the keyhole
    // derivation is dead. A correct value from a collapsed argument is not a proof.
    const r = divideCarryingSine(ExpSum.fromSqrtExt(alg(1)), coefficient(3, 1));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.degenerate).toBe(true);
    expect(r.reason).toMatch(/the same phase, so they cancel/);
    expect(r.certificate.level).toBe("⚠");
    const trail = r.certificate.provenance.map((s) => s.text).join(" ");
    expect(trail).toMatch(/edges cancel/);
    expect(trail).toMatch(/not a value of zero/);
  });

  it("refuses at every integer a, not only at the one the fixture uses", () => {
    for (const a of [1, 2, 3, 5, -1]) {
      const r = divideCarryingSine(ExpSum.fromSqrtExt(alg(1)), coefficient(a, 1));
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(r.degenerate).toBe(true);
    }
  });

  it("but succeeds a hair either side of an integer, so the refusal is about the exponent", () => {
    for (const [n, d] of [
      [999, 1000],
      [1001, 1000],
      [2999, 1000],
    ]) {
      expect(divideCarryingSine(ExpSum.fromSqrtExt(alg(1)), coefficient(n, d)).ok).toBe(true);
    }
  });
});

describe("sin is odd and π-antiperiodic, so the printed form is the record's", () => {
  it("factors a conjugate pair through SUPPLEMENTARY sines, which are the same number", () => {
    // `1 − e^{3iπ/5}` and `1 − e^{−3iπ/5}` are conjugates, and the canonical phase sends them to
    // `sin(3π/10)` and `sin(7π/10)`. Supplementary, hence equal — the forms differ because the two
    // denominators genuinely differ, and neither is being rounded onto the other.
    const rs = [3, -3].map((alpha) => {
      const r = divideCarryingSine(ExpSum.fromSqrtExt(alg(1)), keyholeCoefficient(alpha, 10));
      expect(r.ok).toBe(true);
      return r.ok ? r.form.sine : undefined;
    });
    expect(rs[0]?.equals(q(3, 10))).toBe(true);
    expect(rs[1]?.equals(q(7, 10))).toBe(true);
    expect(rs[0]?.add(rs[1] ?? q(0)).equals(q(1))).toBe(true);
  });

  it("drops a sine that is identically 1", () => {
    // `sin(π/2) = 1` is not part of an answer, and D1's α = 1/2 fixture states its value as `pi`.
    const r = divideCarryingSine(ExpSum.fromSqrtExt(alg(1)), keyholeCoefficient(1, 2));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.form.sine).toBeUndefined();
  });

  it("reduces r into (0,1) by antiperiodicity when oddness is not enough", () => {
    // α = 7/5 gives γ = 7iπ/5. Positive, so oddness does nothing; antiperiodicity takes one π off
    // and flips the sign, landing on sin(2π/5). The printed sine must never be sin(7π/5).
    const r = divideCarryingSine(ExpSum.fromSqrtExt(alg(1)), keyholeCoefficient(7, 5));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.form.sine?.equals(q(2, 5))).toBe(true);
  });

  it("keeps the NUMBER right through that reduction", () => {
    // Whatever the printed form, the decimal must match a direct evaluation of numerator/denominator.
    for (const [n, d] of [
      [3, 10],
      [7, 5],
      [7, 4],
      [-3, 10],
      [23, 50],
    ]) {
      const numerator = ExpSum.of(algI(2), iPi(n - d, d));
      const coefficient = keyholeCoefficient(n, d);
      const r = divideCarryingSine(numerator, coefficient);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      const [nr, ni] = numerator.toTuple();
      const [dr, di] = coefficient.toTuple();
      // (nr + i·ni)/(dr + i·di), then times π, then real part.
      const mod2 = dr * dr + di * di;
      const wantRe = (Math.PI * (nr * dr + ni * di)) / mod2;
      expect(sineFormToNumber(r.form, "re")).toBeCloseTo(wantRe, 9);
    }
  });
});

describe("everything outside the declared shape refuses — R3, as a rule rather than a hope", () => {
  it("refuses a three-term coefficient", () => {
    const three = ExpSum.fromSqrtExt(alg(1))
      .add(ExpSum.of(alg(1), iPi(1, 3)))
      .add(ExpSum.of(alg(1), iPi(2, 3)));
    const r = divideCarryingSine(ExpSum.fromSqrtExt(alg(1)), three);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.degenerate).toBe(false);
    expect(r.reason).toMatch(/3 exponential terms/);
  });

  it("refuses two terms whose coefficients are not negatives", () => {
    const lopsided = ExpSum.fromSqrtExt(alg(1)).add(ExpSum.of(alg(2), iPi(1, 3)));
    const r = divideCarryingSine(ExpSum.fromSqrtExt(alg(1)), lopsided);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.degenerate).toBe(false);
    expect(r.reason).toMatch(/not negatives of one another/);
  });

  it("refuses a REAL exponent difference, which is a sinh and not a sine", () => {
    // `1 − e^{2}`: the half-difference is real, so the factoring gives sinh(1) and the output basis
    // has no seat for it. D1's `missing-reversal-sign` trap is the sibling of this: a plausible
    // finite number of the wrong shape is the dangerous outcome.
    const real = ExpSum.fromSqrtExt(alg(1)).sub(
      ExpSum.of(alg(1), Exponent.fromSqrtExt(alg(2))),
    );
    const r = divideCarryingSine(ExpSum.fromSqrtExt(alg(1)), real);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.degenerate).toBe(false);
    expect(r.reason).toMatch(/sinh rather than a sine/);
  });

  it("refuses a MIXED exponent difference too", () => {
    const mixed = ExpSum.fromSqrtExt(alg(1)).sub(
      ExpSum.of(alg(1), Exponent.of(alg(1), Gauss.rat(0n, 1n, 1n, 1n))),
    );
    expect(divideCarryingSine(ExpSum.fromSqrtExt(alg(1)), mixed).ok).toBe(false);
  });
});
