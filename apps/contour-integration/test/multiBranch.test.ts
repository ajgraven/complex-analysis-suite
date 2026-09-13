// `c·∏ⱼ (z − bⱼ)^{αⱼ}` at a pole, and the one fact that makes the dogbone have a closed form.
//
// **THE INDIVIDUAL ARGUMENTS NEED NOT BE RATIONAL MULTIPLES OF π. THE WEIGHTED SUM IS.** At D6's pole
// `z₀ = ia` the two arguments are `π − arctan a` and `arctan a` — nothing this basis can hold — and
// their half-sum is `π/2` for every `a`. These tests pin both halves: the sum is right, and the
// asymmetry `W(ia) = +√(1+a²)` against `W(−ia) = −√(1+a²)` is computed rather than assumed.
import { describe, expect, it } from "vitest";
import { Frac, Gauss, SqrtExt } from "@cas/exact";
import {
  exponentSum,
  multiPowerAtPole,
  type MultiPowerFactor,
} from "../src/kernel/branchResidue.js";
import { formatExpSum } from "../src/kernel/expSum.js";

const q = (n: bigint, d = 1n) => Frac.of(n, d);
const g = (re: bigint, im = 0n, den = 1n) => SqrtExt.fromGauss(Gauss.rat(re, den, im, den));
const KEYHOLE: readonly [Frac, Frac] = [q(0n), q(2n)];

/** D6's `1/W(z) = i·(z−1)^{−1/2}(z+1)^{−1/2}`, the reciprocal of `√(1−z²)` pinned on the upper lip. */
const INVERSE_W: MultiPowerFactor = {
  constant: SqrtExt.fromGauss(Gauss.I),
  points: [
    { at: g(1n), alpha: q(-1n, 2n), label: "z = 1", sign: 1, argRange: KEYHOLE },
    { at: g(-1n), alpha: q(-1n, 2n), label: "z = −1", sign: 1, argRange: KEYHOLE },
  ],
};

const value = (r: ReturnType<typeof multiPowerAtPole>): [number, number] => {
  if (!r.ok) throw new Error(r.reason);
  return r.value.toTuple();
};

describe("the dogbone's branch factor", () => {
  it("takes OPPOSITE signs at the two conjugate poles — the whole of D6's second trap", () => {
    // The branch pinned by W(x + i0) = +√(1−x²) has W(i) = +√2 and W(−i) = −√2. Using + at both —
    // the natural symmetry reflex, since the poles are a conjugate pair — makes the two residues
    // cancel and returns exactly 0 instead of π/√2. Nothing about the result looks wrong.
    const above = value(multiPowerAtPole(g(0n, 1n), INVERSE_W));
    const below = value(multiPowerAtPole(g(0n, -1n), INVERSE_W));
    expect(above[0]).toBeCloseTo(1 / Math.SQRT2, 14);
    expect(above[1]).toBeCloseTo(0, 14);
    expect(below[0]).toBeCloseTo(-1 / Math.SQRT2, 14);
    expect(below[1]).toBeCloseTo(0, 14);
  });

  it("says the weighted sum exactly, and reports the gap it had to choose across", () => {
    const r = multiPowerAtPole(g(0n, 1n), INVERSE_W);
    if (!r.ok) throw new Error(r.reason);
    expect(r.argMultiple.equals(q(-1n, 2n))).toBe(true);
    const steps = r.certificate.provenance.map((s) => s.text).join(" | ");
    expect(steps).toMatch(/Σ αⱼ·arg\(z₀ − bⱼ\) = −1\/2·π/);
    expect(steps).toMatch(/pins it modulo 1\/2·π/);
    // The engine checks itself, rather than leaving that to the suite: the exact route and a direct
    // float evaluation of the declared branch share only the window, so a wrong log weight, a dropped
    // constant or a mis-lifted phase is a refusal here rather than a plausible number downstream.
    expect(steps).toMatch(/independent cross-check: a direct float evaluation/);
    expect(steps).toMatch(/ln ∏\|z₀ − bⱼ\|\^\{αⱼ\} = −ln 2\/2/);
    expect(r.certificate.method).toMatch(/WEIGHTED SUM/);
  });

  it("lands in the output basis: 1/√2, not a decimal", () => {
    const r = multiPowerAtPole(g(0n, 1n), INVERSE_W);
    if (!r.ok) throw new Error(r.reason);
    const folded = r.value.asSqrtExt();
    expect(folded).not.toBeNull();
    expect(formatExpSum(r.value)).toBe("√2/2");
  });

  it("is window-INDEPENDENT exactly because Σα ∈ ℤ, which is admissibility made arithmetic", () => {
    // The principal window sends arg(−1 − i) from 5π/4 to −3π/4 and arg(1 − i) from 7π/4 to −π/4 —
    // both down by a full turn — so the half-sum moves from −3/2 to +1/2, a shift of 2, and the value
    // does not move at all. That is not a coincidence and not a tolerance: shifting every factor by
    // one turn multiplies the product by e^{2πi·Σα}, which is 1 precisely when Σα is an INTEGER.
    // Research 06 §2.1(b) calls that condition admissibility; here it is the same statement about the
    // same number, and it is why the bounded cut [−1, 1] exists at all.
    const inWindow = (f: MultiPowerFactor, range: readonly [Frac, Frac]): MultiPowerFactor => ({
      ...f,
      points: f.points.map((p) => ({ ...p, argRange: range })),
    });
    const principal = inWindow(INVERSE_W, [q(-1n), q(1n)]);
    const keyhole = multiPowerAtPole(g(0n, -1n), INVERSE_W);
    const other = multiPowerAtPole(g(0n, -1n), principal);
    if (!keyhole.ok || !other.ok) throw new Error("both windows should give a value");
    expect(keyhole.argMultiple.equals(q(-3n, 2n))).toBe(true);
    expect(other.argMultiple.equals(q(1n, 2n))).toBe(true);
    expect(other.value.toTuple()[0]).toBeCloseTo(keyhole.value.toTuple()[0], 14);

    // And with Σα = −3/4 ∉ ℤ the same shift multiplies the value by e^{2πi(−3/4)} = i: a cut joining
    // these two points would NOT be admissible, and the app must not paper over the difference.
    const inadmissible: MultiPowerFactor = {
      ...INVERSE_W,
      points: [
        { at: g(1n), alpha: q(-1n, 2n), label: "z = 1", sign: 1, argRange: KEYHOLE },
        { at: g(-1n), alpha: q(-1n, 4n), label: "z = −1", sign: 1, argRange: KEYHOLE },
      ],
    };
    const a = multiPowerAtPole(g(0n, -1n), inadmissible);
    const b = multiPowerAtPole(g(0n, -1n), inWindow(inadmissible, [q(-1n), q(1n)]));
    if (!a.ok || !b.ok) throw new Error("both windows should give a value");
    expect(b.argMultiple.sub(a.argMultiple).equals(q(3n, 2n))).toBe(true);
    expect(b.value.toTuple()[1]).not.toBeCloseTo(a.value.toTuple()[1], 6);
  });

  it("handles the pole off the imaginary axis, where the arguments are not π-rational at all", () => {
    // z₀ = 2i against branch points ±1: arg(2i − 1) = π − arctan 2 and arg(2i + 1) = arctan 2, and
    // `argumentOfPole` would refuse both. The half-sum is still −π/2, and the modulus is 1/√5.
    const r = multiPowerAtPole(g(0n, 2n), INVERSE_W);
    if (!r.ok) throw new Error(r.reason);
    expect(r.argMultiple.equals(q(-1n, 2n))).toBe(true);
    const [re, im] = r.value.toTuple();
    expect(re).toBeCloseTo(1 / Math.sqrt(5), 14);
    expect(im).toBeCloseTo(0, 14);
  });

  it("agrees with a direct numeric evaluation of the declared branch, at several poles", () => {
    // The independent check: `1/W(z)` computed from the record's own definition
    // `W = −i·exp(½(Log_[0,2π)(z−1) + Log_[0,2π)(z+1)))` in floating point, against the exact route.
    const direct = (x: number, y: number): [number, number] => {
      const arg = (px: number, py: number): number => {
        const a = Math.atan2(py, px);
        return a < 0 ? a + 2 * Math.PI : a;
      };
      const lm = 0.5 * (Math.log(Math.hypot(x - 1, y)) + Math.log(Math.hypot(x + 1, y)));
      const th = 0.5 * (arg(x - 1, y) + arg(x + 1, y));
      // W = −i·e^{lm + i·th}; 1/W = i·e^{−lm − i·th}
      const m = Math.exp(-lm);
      return [-m * Math.sin(-th), m * Math.cos(-th)];
    };
    for (const [re, im] of [
      [0n, 1n],
      [0n, -1n],
      [0n, 2n],
      [0n, -3n],
      [2n, 0n],
      [-2n, 0n],
    ] as [bigint, bigint][]) {
      const mine = value(multiPowerAtPole(g(re, im), INVERSE_W));
      const theirs = direct(Number(re), Number(im));
      expect({ re, im, x: mine[0], y: mine[1] }).toEqual({
        re,
        im,
        x: expect.closeTo(theirs[0], 12) as unknown as number,
        y: expect.closeTo(theirs[1], 12) as unknown as number,
      });
    }
  });

  it("refuses a point where the weighted sum is NOT a rational multiple of π", () => {
    // `z₀ = 3 + 4i` against `±1`: the half-sum of arg(2+4i) and arg(4+4i) is not a rational multiple
    // of π, and the exact phase comes out as −4/5 + 3i/5, which no root of unity in one quadratic
    // extension equals. The symmetry that makes D6 work — `arg(ia−1) + arg(ia+1) = π` — is a fact
    // about poles on the imaginary axis, not about every point, and the app refuses where it fails
    // rather than returning the nearest representable phase.
    const r = multiPowerAtPole(g(3n, 4n), INVERSE_W);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/was not verified to be a rational multiple of π/);
  });

  it("refuses the branch point itself: it is not a pole and has no residue", () => {
    const r = multiPowerAtPole(g(1n), INVERSE_W);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/IS the branch point z = 1.*no Laurent series/);
  });

  it("refuses a window that is not one turn wide", () => {
    const r = multiPowerAtPole(g(0n, 1n), {
      ...INVERSE_W,
      points: INVERSE_W.points.map((p) => ({ ...p, argRange: [q(0n), q(1n)] as const })),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/covers exactly one turn/);
  });

  it("refuses a modulus whose logarithm the basis cannot hold", () => {
    // |z₀ − b|² = 1 + √2 at no rational distance from anything: its logarithm is not a rational
    // combination of logarithms of rationals, and inventing an atom for it would break canonicity.
    const odd: MultiPowerFactor = {
      ...INVERSE_W,
      points: [
        { at: SqrtExt.of(Gauss.ONE, Gauss.ONE, 2n), alpha: q(-1n, 2n), label: "z = 1 + √2", sign: 1 as const, argRange: KEYHOLE },
        INVERSE_W.points[1],
      ],
    };
    const r = multiPowerAtPole(g(0n, 1n), odd);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/not a rational combination of logarithms of rationals/);
  });

  it("sums the exponents, which is what admissibility and the order at infinity both ask", () => {
    expect(exponentSum(INVERSE_W).equals(q(-1n))).toBe(true);
  });
});
