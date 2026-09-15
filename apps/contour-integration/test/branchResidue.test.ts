// Guards for the power-residue reader — where D1's `residue-with-the-wrong-argument` trap becomes
// arithmetic rather than a convention.
//
// The record's own words: "Evaluating (−1)^{α−1} as exp(−iπ(α−1)) — i.e. with arg = −π, the
// principal determination — changes the answer by exp(2πi(α−1)) and NOTHING warns you." So the
// central test here is that the SAME pole in TWO declared determinations gives two different
// answers, and that each is the one its determination asks for.
import { describe, expect, it } from "vitest";
import { Frac, Gauss, SqrtExt } from "@cas/exact";
import { branchResidue, powerAtPole } from "../src/kernel/branchResidue.js";
import { unitRoot } from "../src/kernel/unitRoot.js";
import { formatExpSum } from "../src/kernel/expSum.js";
import type { AlgebraicPole } from "../src/kernel/algebraic.js";

const q = (n: number, d = 1): Frac => Frac.of(BigInt(n), BigInt(d));
const alg = (re: number, im = 0): SqrtExt => SqrtExt.fromGauss(Gauss.int(re, im));

/** The keyhole's determination, `arg z ∈ (0, 2π)`. */
const KEYHOLE: readonly [Frac, Frac] = [q(0), q(2)];
/** C99/Kahan's, `arg z ∈ (−π, π]`. */
const PRINCIPAL: readonly [Frac, Frac] = [q(-1), q(1)];

describe("unitRoot — the roots of unity one quadratic extension can hold", () => {
  it("gives the right value for each representable denominator", () => {
    for (const [k, m, re, im] of [
      [1, 1, -1, 0],
      [1, 2, 0, 1],
      [3, 2, 0, -1],
      [1, 3, 0.5, Math.sin(Math.PI / 3)],
      [1, 4, Math.SQRT1_2, Math.SQRT1_2],
      [1, 6, Math.cos(Math.PI / 6), 0.5],
      [7, 4, Math.cos((7 * Math.PI) / 4), Math.sin((7 * Math.PI) / 4)],
    ] as [number, number, number, number][]) {
      const v = unitRoot(BigInt(k), BigInt(m));
      expect(v).not.toBeNull();
      if (v === null) continue;
      const [gotRe, gotIm] = v.toTuple();
      expect(gotRe).toBeCloseTo(re, 12);
      expect(gotIm).toBeCloseTo(im, 12);
    }
  });

  it("is exactly periodic with period 2m, so a negative k needs no special case", () => {
    for (const m of [1, 2, 3, 4, 6]) {
      const a = unitRoot(-1n, BigInt(m));
      const b = unitRoot(BigInt(2 * m - 1), BigInt(m));
      expect(a).not.toBeNull();
      expect(a?.equals(b as SqrtExt)).toBe(true);
    }
  });

  it("closes the loop: the mth power of e^{iπ/m} is exactly −1", () => {
    for (const m of [1, 2, 3, 4, 6]) {
      expect(unitRoot(BigInt(m), BigInt(m))?.equals(alg(-1))).toBe(true);
    }
  });

  it("refuses a denominator no quadratic extension holds", () => {
    for (const m of [5, 7, 8, 9, 12]) {
      expect(unitRoot(1n, BigInt(m))).toBeNull();
    }
  });
});

describe("D1's pole at z = −1, in two determinations", () => {
  const at = alg(-1);

  it("reads arg = π in the keyhole's (0, 2π)", () => {
    const r = powerAtPole(at, { alpha: q(-7, 10), argRange: KEYHOLE });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.argMultiple.equals(q(1))).toBe(true);
    // α = α₀ − 1 = −7/10 at α₀ = 3/10, so the exponent is −7iπ/10.
    expect(r.value.terms[0].exponent.pi.equals(Gauss.rat(0n, 1n, -7n, 10n))).toBe(true);
    expect(formatExpSum(r.value)).toBe("e^(−7iπ/10)");
  });

  it("reads arg = −π in the principal (−π, π], and the two answers DIFFER", () => {
    // The trap, as a test. Same pole, same exponent, two declared ranges — and the two results
    // differ by exactly `e^{2πiα}`, which is the factor the record says nothing warns you about.
    const keyhole = powerAtPole(at, { alpha: q(-7, 10), argRange: KEYHOLE });
    const principal = powerAtPole(at, { alpha: q(-7, 10), argRange: PRINCIPAL });
    expect(keyhole.ok && principal.ok).toBe(true);
    if (!keyhole.ok || !principal.ok) return;
    expect(principal.argMultiple.equals(q(-1))).toBe(true);
    expect(keyhole.value.terms[0].exponent.equals(principal.value.terms[0].exponent)).toBe(false);

    // …and the discrepancy is the monodromy factor, not noise.
    const [kr, ki] = keyhole.value.toTuple();
    const [pr, pi] = principal.value.toTuple();
    const ratio = { re: (kr * pr + ki * pi) / (pr * pr + pi * pi), im: (ki * pr - kr * pi) / (pr * pr + pi * pi) };
    const want = 2 * Math.PI * -0.7;
    expect(ratio.re).toBeCloseTo(Math.cos(want), 10);
    expect(ratio.im).toBeCloseTo(Math.sin(want), 10);
  });

  it("gives D1's residue once the rational part is folded in", () => {
    // `Res(1/(1+z), −1) = 1`, so the whole residue is `(−1)^{α−1} = e^{iπ(α−1)}`.
    const pole: AlgebraicPole = { at, order: 1, residue: alg(1), radicand: 1n };
    const r = branchResidue(pole, { alpha: q(-7, 10), argRange: KEYHOLE });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [re, im] = r.value.toTuple();
    expect(re).toBeCloseTo(Math.cos(-0.7 * Math.PI), 12);
    expect(im).toBeCloseTo(Math.sin(-0.7 * Math.PI), 12);
  });

  it("scales by a residue that is not 1", () => {
    const pole: AlgebraicPole = { at, order: 1, residue: alg(0, 3), radicand: 1n };
    const r = branchResidue(pole, { alpha: q(1, 2), argRange: KEYHOLE });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 3i · e^{iπ/2} = 3i · i = −3.
    const [re, im] = r.value.toTuple();
    expect(re).toBeCloseTo(-3, 12);
    expect(im).toBeCloseTo(0, 12);
  });
});

describe("D3's poles — the n-th roots of −1, all at arg in (0, 2π)", () => {
  it("reads every root for n = 2, 3, 4 and 6", () => {
    // `z_k = e^{iπ(2k+1)/n}`, and the record's `roots-of-minus-one-mislabelled` trap insists they
    // all lie inside the declared range — for k = n−1 that is `(2n−1)π/n < 2π`.
    for (const n of [2, 3, 4, 6]) {
      for (let k = 0; k < n; k++) {
        const at = unitRoot(BigInt(2 * k + 1), BigInt(n));
        expect(at).not.toBeNull();
        if (at === null) continue;
        const r = powerAtPole(at, { alpha: q(1, 2), argRange: KEYHOLE });
        expect(r.ok).toBe(true);
        if (!r.ok) continue;
        expect(r.argMultiple.equals(q(2 * k + 1, n))).toBe(true);
        expect(r.argMultiple.toNumber()).toBeGreaterThan(0);
        expect(r.argMultiple.toNumber()).toBeLessThan(2);
      }
    }
  });

  it("puts HALF of them at negative arguments under the principal determination", () => {
    // The trap's own words: "Using the principal determination puts roughly half of them at negative
    // arguments and silently changes their z_k^a factors; the answer stays real and plausible."
    const negatives = [0, 1, 2, 3]
      .map((k) => unitRoot(BigInt(2 * k + 1), 4n))
      .map((at) => (at === null ? null : powerAtPole(at, { alpha: q(1, 2), argRange: PRINCIPAL })))
      .filter((r) => r !== null && r.ok && r.argMultiple.n < 0n);
    expect(negatives).toHaveLength(2);
  });
});

describe("the two declared bounds", () => {
  it("reads a pole OFF the unit circle, now that the exponent carries ln r", () => {
    // D2's pole. `(−2)^{1/2} = e^{(1/2)(ln 2 + iπ)} = i√2`, and the two halves arrive in one
    // exponent — the argument decided in the declared range, the modulus as a symbolic logarithm.
    const r = powerAtPole(alg(-2), { alpha: q(1, 2), argRange: KEYHOLE });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.argMultiple.equals(q(1))).toBe(true);
    expect(formatExpSum(r.value)).toBe("e^(iπ/2 + ln 2/2)");
    // …and it folds to `i√2` exactly, which is the number the record's residues are built from.
    expect(formatExpSum(r.value.foldSigns())).toBe("i√2");
  });

  it("refuses a modulus whose logarithm this basis cannot hold", () => {
    // `1 + √2` is a perfectly good positive real and `ln(1 + √2)` is not a rational combination of
    // logarithms of rationals. Inventing an atom for it would break the canonical form that makes
    // two exponents comparable at all.
    const at = SqrtExt.of(Gauss.ONE, Gauss.ONE, 2n);
    const r = powerAtPole(at, { alpha: q(1, 2), argRange: KEYHOLE });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/not a rational combination of logarithms/);
  });

  it("refuses an argument that is no rational multiple of π, and says how those records cope", () => {
    // `(3 + 4i)/5` is EXACTLY on the unit circle — a Pythagorean triple — so it clears the first
    // bound, and its argument `atan(4/3)/π` is irrational, so it fails the second. That is the shape
    // of a fifth or seventh root of −1 too: representable or not, its argument has no seat here, and
    // D3's `n = 5` and `n = 7` fixtures reach their answer by summing the residues instead.
    const at = SqrtExt.fromGauss(Gauss.rat(3n, 5n, 4n, 5n));
    const r = powerAtPole(at, { alpha: q(1, 2), argRange: KEYHOLE });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/geometric series/);
  });

  it("refuses a range that is not one whole turn", () => {
    const r = powerAtPole(alg(-1), { alpha: q(1, 2), argRange: [q(0), q(1)] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/exactly one turn/);
  });

  it("refuses a pole of order 2 — z^α there needs powers of log z", () => {
    const pole: AlgebraicPole = { at: alg(-1), order: 2, residue: alg(1), radicand: 1n };
    const r = branchResidue(pole, { alpha: q(1, 2), argRange: KEYHOLE });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/order 2/);
    expect(r.reason).toMatch(/log z/);
  });
});

describe("the argument is DECIDED, not measured", () => {
  it("refuses a point on the circle that is merely NEAR a root of unity", () => {
    // `(119 + 120i)/169` is exactly on the unit circle and its argument is 0.2526…·π — within 0.003
    // of π/4. Reading `atan2` and rounding would call it a quarter turn and be silently wrong about
    // the whole residue; the exact verification refuses it.
    const near = SqrtExt.fromGauss(Gauss.rat(119n, 169n, 120n, 169n));
    expect(near.mul(SqrtExt.of(near.a.conj(), near.b.conj(), near.d)).equals(SqrtExt.ONE)).toBe(true);
    expect(powerAtPole(near, { alpha: q(1, 2), argRange: KEYHOLE }).ok).toBe(false);
  });

  it("accepts the exact value and carries its certificate", () => {
    const r = powerAtPole(alg(0, 1), { alpha: q(1, 3), argRange: KEYHOLE });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.certificate.level).toBe("=");
    expect(r.certificate.restriction).toMatch(/\\arg z \\in/);
    expect(r.certificate.method).toMatch(/verified in exact arithmetic/);
  });

  it("states the determination as a RESTRICTION, so it cannot be shed", () => {
    // A claim that loses its restriction is not vaguer, it is false — which is what `@cas/rigor`'s
    // `restriction` field exists for.
    const keyhole = powerAtPole(alg(-1), { alpha: q(1, 2), argRange: KEYHOLE });
    const principal = powerAtPole(alg(-1), { alpha: q(1, 2), argRange: PRINCIPAL });
    expect(keyhole.ok && principal.ok).toBe(true);
    if (!keyhole.ok || !principal.ok) return;
    expect(keyhole.certificate.restriction).not.toBe(principal.certificate.restriction);
  });
});
