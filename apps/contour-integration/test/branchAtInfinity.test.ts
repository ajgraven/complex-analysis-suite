// `Res(f, ∞)` when `f` carries a branch factor — D7's case, where the term is most of the answer.
//
// `z^{3/4}(3−z)^{1/4}/(5−z)` tends to `e^{3πi/4} ≠ 0` at infinity, so the outer circle does not vanish
// and `Res(f,∞) = −(17/4)e^{3πi/4}` has magnitude 4.25 against an answer of 1.2. Keeping only the finite
// residue gives a value that is **still perfectly real** and off by a factor of 14.5 and a sign, which
// is why this is the entry where forgetting the term stops being a footnote.
import { describe, expect, it } from "vitest";
import { Frac, Gauss, QiPoly, SqrtExt } from "@cas/exact";
import { branchResidueAtInfinity } from "../src/kernel/atInfinity.js";
import type { MultiPowerFactor } from "../src/kernel/branchResidue.js";
import { formatExpSum } from "../src/kernel/expSum.js";

const q = (n: bigint, d = 1n) => Frac.of(n, d);
const poly = (...c: bigint[]) => QiPoly.fromCoeffs(c.map((k) => Gauss.int(k)));
const KEYHOLE: readonly [Frac, Frac] = [q(0n), q(2n)];
const PRINCIPAL: readonly [Frac, Frac] = [q(-1n), q(1n)];
const at = (n: bigint) => SqrtExt.fromGauss(Gauss.int(n));

/** D7's `z^μ (b−z)^ν`, with `μ + ν = 1` and two DIFFERENT determinations. */
const d7 = (muN: bigint, muD: bigint, b: bigint): MultiPowerFactor => ({
  constant: SqrtExt.ONE,
  points: [
    { at: at(0n), alpha: q(muN, muD), label: "z = 0", sign: 1, argRange: KEYHOLE },
    { at: at(b), alpha: Frac.ONE.sub(q(muN, muD)), label: "z = b", sign: -1, argRange: PRINCIPAL },
  ],
});

/** D6's `1/√(1−z²)` = `i·(z−1)^{−1/2}(z+1)^{−1/2}`, where the residue at infinity is zero. */
const d6: MultiPowerFactor = {
  constant: SqrtExt.fromGauss(Gauss.I),
  points: [
    { at: at(1n), alpha: q(-1n, 2n), label: "z = 1", sign: 1, argRange: KEYHOLE },
    { at: at(-1n), alpha: q(-1n, 2n), label: "z = −1", sign: 1, argRange: KEYHOLE },
  ],
};

const value = (r: ReturnType<typeof branchResidueAtInfinity>): [number, number] => {
  if (!r.ok) throw new Error(r.reason);
  return r.value.toTuple();
};

describe("D7's residue at infinity", () => {
  it("is (17/4)·e^{−iπ/4} at μ = 3/4, b = 3, c = 5 — magnitude 4.25 against an answer of 1.2", () => {
    const r = branchResidueAtInfinity(d7(3n, 4n, 3n), poly(1n), poly(5n, -1n));
    if (!r.ok) throw new Error(r.reason);
    expect(r.order.equals(Frac.ZERO)).toBe(true);
    const [re, im] = r.value.toTuple();
    expect(re).toBeCloseTo((17 / 4) * Math.cos(-Math.PI / 4), 12);
    expect(im).toBeCloseTo((17 / 4) * Math.sin(-Math.PI / 4), 12);
    // `2πi·Res` is what the outer circle would have contributed: magnitude 26.7.
    expect(2 * Math.PI * Math.hypot(re, im)).toBeCloseTo(26.7, 1);
  });

  it("says where its constant came from, and that nothing in it was fitted", () => {
    const r = branchResidueAtInfinity(d7(3n, 4n, 3n), poly(1n), poly(5n, -1n));
    if (!r.ok) throw new Error(r.reason);
    const steps = r.certificate.provenance.map((s) => s.text).join(" | ");
    expect(steps).toMatch(/branch constant is c·e\^\(iπ·−1\/4\)/);
    expect(steps).toMatch(/1\/2·π at z = 0, −1\/2·π at z = b/);
    expect(steps).toMatch(/an exact rational, so the constant is a root of unity and not a fit/);
    expect(steps).toMatch(/Σ αⱼ = 1 ∈ ℤ, so the monodromy round a large circle is 1/);
    expect(steps).toMatch(/NOT enough to make the residue vanish/);
  });

  it("agrees with `c − νb` at every exponent the record declares", () => {
    // `Res(f,∞) = Λ(c − νb)` with `Λ = e^{iπ(μ/2 − ν/2 − 1/2)}`. The record states it as
    // `−e^{iπμ}(c − νb)`, which is the same number — `−e^{iπμ} = e^{iπ(μ−1)}` and `μ − 1 = −ν`, and
    // `(μ − ν − 1)/2 = −ν` because `μ + ν = 1`.
    for (const [muN, muD, b, c] of [
      [3n, 4n, 3n, 5n],
      [1n, 4n, 3n, 5n],
      [1n, 2n, 2n, 7n],
      [1n, 3n, 4n, 10n],
    ] as [bigint, bigint, bigint, bigint][]) {
      const mu = Number(muN) / Number(muD);
      const nu = 1 - mu;
      const want = (Number(c) - nu * Number(b)) * -1;
      const [re, im] = value(branchResidueAtInfinity(d7(muN, muD, b), poly(1n), poly(c, -1n)));
      expect({ mu, re, im }).toEqual({
        mu,
        re: expect.closeTo(want * Math.cos(Math.PI * mu), 10) as unknown as number,
        im: expect.closeTo(want * Math.sin(Math.PI * mu), 10) as unknown as number,
      });
    }
  });
});

describe("and when it is zero, that is certified rather than assumed", () => {
  it("gives D6 exactly 0, from the order alone", () => {
    const r = branchResidueAtInfinity(d6, poly(1n), poly(1n, 0n, 1n));
    if (!r.ok) throw new Error(r.reason);
    expect(r.value.isZero()).toBe(true);
    expect(r.order.equals(q(-3n))).toBe(true);
    expect(r.certificate.claim).toBe("Res(f, ∞) = 0");
    expect(r.certificate.method).toMatch(/an order of −2 or less leaves no z⁻¹ coefficient/);
    expect(r.certificate.provenance.map((s) => s.text).join(" | ")).toMatch(
      /SAME computation discharges L2 on an outer circle/,
    );
  });

  it("does not confuse 'regular at infinity' with 'zero residue there'", () => {
    // `f = z^{1/2}(z−1)^{−1/2}·(1/z)` is `O(z⁻¹)`: regular at infinity, and its residue there is not
    // zero. The distinction D6's own trap insists on, with a branch factor attached.
    const half: MultiPowerFactor = {
      constant: SqrtExt.ONE,
      points: [
        { at: at(0n), alpha: q(1n, 2n), label: "z = 0", sign: 1, argRange: KEYHOLE },
        { at: at(1n), alpha: q(-1n, 2n), label: "z = 1", sign: 1, argRange: KEYHOLE },
      ],
    };
    const r = branchResidueAtInfinity(half, poly(1n), poly(0n, 1n));
    if (!r.ok) throw new Error(r.reason);
    expect(r.order.equals(q(-1n))).toBe(true);
    expect(r.value.isZero()).toBe(false);
    // `z^{1/2}(z−1)^{−1/2} = (1 − 1/z)^{−1/2} = 1 + 1/(2z) + …`, so `f = 1/z + 1/(2z²) + …` and
    // `[z⁻¹]f = 1`, hence `Res(f,∞) = −1` — the same answer `1/z` itself has.
    expect(formatExpSum(r.value)).toBe("−1");
  });
});

describe("it refuses what has no residue at infinity to find", () => {
  it("refuses when Σ αⱼ is not an integer, because f is not single-valued there", () => {
    const bad: MultiPowerFactor = {
      ...d6,
      points: [d6.points[0], { ...d6.points[1], alpha: q(-1n, 4n) }],
    };
    const r = branchResidueAtInfinity(bad, poly(1n), poly(1n, 0n, 1n));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/Σ αⱼ = −3\/4 is not an integer/);
      expect(r.reason).toMatch(/not single-valued near infinity/);
      expect(r.reason).toMatch(/no residue there to compute/);
    }
  });

  it("refuses when every reference direction lies in some factor's cut", () => {
    // Six directions are tried and the windows here are contrived so that each one lands on a lower
    // edge. Contrived on purpose: the app must not pick a direction that lies in a cut, where the
    // limit it needs does not exist.
    const boxed: MultiPowerFactor = {
      constant: SqrtExt.ONE,
      points: [
        { at: at(0n), alpha: q(1n), label: "z = 0", sign: 1, argRange: [q(1n, 2n), q(5n, 2n)] },
        { at: at(1n), alpha: q(1n), label: "z = 1", sign: 1, argRange: [q(-1n, 2n), q(3n, 2n)] },
        { at: at(2n), alpha: q(1n), label: "z = 2", sign: 1, argRange: [q(1n, 4n), q(9n, 4n)] },
        { at: at(3n), alpha: q(1n), label: "z = 3", sign: 1, argRange: [q(3n, 4n), q(11n, 4n)] },
        { at: at(4n), alpha: q(1n), label: "z = 4", sign: 1, argRange: [q(-1n, 4n), q(7n, 4n)] },
        { at: at(5n), alpha: q(1n), label: "z = 5", sign: 1, argRange: [q(-3n, 4n), q(5n, 4n)] },
      ],
    };
    const r = branchResidueAtInfinity(boxed, poly(1n), poly(0n, 0n, 0n, 0n, 0n, 0n, 0n, 1n));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/no reference direction is clear of every declared determination's cut/);
  });
});
