// D7 — where `Res(f,∞)` is not a correction but most of the identity.
//
// `2πi·Res(f,∞)` has magnitude 26.7 in an answer of magnitude 1.216. Drop it and the answer is
// **still perfectly real**, so the usual "it came out complex, I made a mistake" check does not fire;
// it is simply wrong by a factor of 14.5 and by a sign. That is the arithmetic pinned below, along
// with the two things that make the record possible at all: the exponents summing to an integer, and
// the two factors being read in DIFFERENT windows with one of them written backwards.
import { describe, expect, it } from "vitest";
import { Frac, Gauss, QiPoly, SqrtExt } from "@cas/exact";
import { d7DogboneTwoFractionalPowers } from "../src/families/records/d7-dogbone-two-fractional-powers.js";
import { loadFamilies } from "../src/families/index.js";
import { primaryGolden, runFamily, solveFamily } from "../src/families/runFamily.js";
import { multiFactorOf } from "../src/families/branchFactor.js";
import { branchResidueAtInfinity } from "../src/kernel/atInfinity.js";
import { multiPowerAtPole } from "../src/kernel/branchResidue.js";
import { formatExpSum } from "../src/kernel/expSum.js";
import type { Family } from "../src/families/schema.js";

const D7 = d7DogboneTwoFractionalPowers;
const flagship = primaryGolden(D7);

function must<T>(v: T | undefined | null, what: string): T {
  if (v === undefined || v === null) throw new Error(`expected ${what}`);
  return v;
}

const ran = (golden = flagship) => {
  const r = runFamily(D7, golden);
  if (!r.ok) throw new Error(`D7 refused: ${r.reason}`);
  return r.run;
};

const reasons = (golden = flagship): string =>
  ran(golden)
    .theorem.verdict.certificates
    .map((c) => [c.claim, c.method, c.restriction ?? "", ...c.provenance.map((s) => s.text)].join(" :: "))
    .join(" | ");

const factorOf = (golden = flagship) => {
  const f = multiFactorOf(D7, golden.params);
  if (!f.ok) throw new Error(f.reason);
  return f;
};

describe("the record loads and solves", () => {
  it("passes all four invariants", () => {
    const { families, violations } = loadFamilies([D7]);
    expect(violations).toEqual([]);
    expect(families.get(D7.id)).toBe(D7);
  });

  it("gives the record's own closed form, carrying a QUARTER power", () => {
    const r = solveFamily(D7, flagship);
    if (!r.ok) throw new Error(r.reason);
    // `(π/sin(3π/4))(17/4 − 250^{1/4})`, with `250^{1/4} = 2^{1/4}·5^{3/4}` over primes — the same
    // number the record writes as `40^{3/4}/4`. A quarter power is the exact FORM, not a shortfall.
    expect(r.solved?.text).toBe("(−π·2^(1/4)·5^(3/4) + 17π/4)/sin(3π/4)");
    expect(r.solved?.value).toBeCloseTo(1.2157787268935614, 13);
    expect(r.run.ledger.closes).toBe(true);
    expect(r.run.ledger.failedAt).toBeNull();
  });

  it("solves every fixture it declares", () => {
    for (const g of D7.golden) {
      const r = solveFamily(D7, g);
      if (!r.ok) throw new Error(`${JSON.stringify(g.params)}: ${r.reason}`);
      const want = typeof g.numeric === "number" ? g.numeric : g.numeric[0];
      expect({ params: g.params, value: r.solved?.value }).toEqual({
        params: g.params,
        value: expect.closeTo(want, 12) as unknown as number,
      });
    }
  });
});

describe("the residue at infinity carries the answer", () => {
  it("is (17/4)·e^{−iπ/4}, and 2πi times it has magnitude 26.7", () => {
    expect(reasons()).toMatch(/Res\(f, ∞\) = 17\/4·e\^\(−iπ\/4\)/);
    const at = branchResidueAtInfinity(
      factorOf().factor,
      QiPoly.fromCoeffs([Gauss.ONE]),
      QiPoly.fromCoeffs([Gauss.int(5), Gauss.int(-1)]),
    );
    if (!at.ok) throw new Error(at.reason);
    expect(2 * Math.PI * Math.hypot(...at.value.toTuple())).toBeCloseTo(26.7, 1);
  });

  it("DROPPING it leaves a real, plausible answer that is wrong by 14.5 and a sign", () => {
    // The arithmetic behind the record's own trap, done here rather than asserted in prose.
    // `T = 2πi(Res(f,c) + Res(f,∞))/(1 + i)`; without the second term the same division gives
    // `2πi·(−250^{1/4}e^{−iπ/4})/(1+i) = −π√2·250^{1/4} = −17.665`. Real. Wrong.
    const factor = factorOf().factor;
    const atPole = multiPowerAtPole(SqrtExt.fromGauss(Gauss.int(5)), factor);
    if (!atPole.ok) throw new Error(atPole.reason);
    const residueAtC = atPole.value.scale(SqrtExt.fromGauss(Gauss.int(-1))); // Res(1/(5−z), 5) = −1
    const [re, im] = residueAtC.toTuple();
    // 2πi·Res / (1 + i) = π(1 + i)·Res  — see the record's closedForm.
    const without = Math.PI * (re - im);
    expect(without).toBeCloseTo(-17.66647, 4);
    expect(Math.abs(Math.PI * (re + im))).toBeLessThan(1e-12); // and it really is real
    expect(Math.abs(without / 1.2157787268935614)).toBeCloseTo(14.53, 1);
  });

  it("is what D6's row is NOT: the same computation, a non-zero answer", () => {
    expect(reasons()).toMatch(/NOT enough to make the residue vanish/);
    expect(reasons()).toMatch(/1\/z is regular there and has Res = −1/);
    expect(reasons()).toMatch(/binomial series of the fractional powers/);
  });
});

describe("two exponents on one cut", () => {
  it("needs Σ αⱼ ∈ ℤ, and says so where infinity is concerned", () => {
    expect(reasons()).toMatch(/Σ αⱼ = 1 ∈ ℤ, so the monodromy round a large circle is 1/);
    // And the contour's own version of the same arithmetic, in LEGALITY.
    const legality = ran().ledger.rows.filter((r) => r.constraint === "LEGALITY");
    expect(legality.map((r) => r.claim).join(" | ")).toMatch(
      /winds about a branch point and still closes on one sheet \(Σ n\(γ,bⱼ\)·αⱼ = −1 ∈ ℤ\)/,
    );
  });

  it("refuses at infinity when the exponents do NOT sum to an integer", () => {
    const broken: Family = {
      ...D7,
      branch: {
        ...must(D7.branch, "a branch"),
        factors: [
          must(D7.branch, "a branch").factors[0],
          { ...must(D7.branch, "a branch").factors[1], order: { kind: "power", alpha: "1/3" } },
        ],
      },
    };
    const f = multiFactorOf(broken, flagship.params);
    if (!f.ok) throw new Error(f.reason);
    const at = branchResidueAtInfinity(
      f.factor,
      QiPoly.fromCoeffs([Gauss.ONE]),
      QiPoly.fromCoeffs([Gauss.int(5), Gauss.int(-1)]),
    );
    expect(at.ok).toBe(false);
    if (!at.ok) {
      expect(at.reason).toMatch(/Σ αⱼ = 13\/12 is not an integer/);
      expect(at.reason).toMatch(/not single-valued near infinity/);
    }
  });

  it("reads the two factors in DIFFERENT windows, one of them written backwards", () => {
    const points = factorOf().factor.points;
    expect(points.map((p) => [p.sign, p.argRange.map((x) => x.toNumber())])).toEqual([
      [1, [0, 2]],
      [-1, [-1, 1]],
    ]);
    expect(reasons()).toMatch(/arg\(z − 0\) ∈ \[0·π, 2·π\); arg\(b − z\) ∈ \[−1·π, 1·π\)/);
  });

  it("takes arg(b − z) = −π at the pole, not +π — the residue trap, as arithmetic", () => {
    // At `z = c > b` the difference `b − z` is a NEGATIVE REAL, exactly on the principal window's
    // own edge. `−π` is the value in `[−π, π)` and `+π` is not; the two differ by a full turn, so
    // using the wrong one rotates the residue by `e^{2πiν} = e^{iπ/2}` and leaves the final answer
    // real and entirely plausible.
    const factor = factorOf().factor;
    const atPole = multiPowerAtPole(SqrtExt.fromGauss(Gauss.int(5)), factor);
    if (!atPole.ok) throw new Error(atPole.reason);
    expect(atPole.argMultiple.equals(Frac.of(-1n, 4n))).toBe(true);
    expect(formatExpSum(atPole.value)).toBe("e^(−iπ/4 + ln 2/4 + 3ln 5/4)");
    // `5^{3/4}·2^{1/4}·e^{−iπ/4} = 2.81171 − 2.81171i`, the record's own number with its sign.
    const [re, im] = atPole.value.toTuple();
    expect(re).toBeCloseTo(2.81171, 4);
    expect(im).toBeCloseTo(-2.81171, 4);

    const flipped = multiPowerAtPole(SqrtExt.fromGauss(Gauss.int(5)), {
      ...factor,
      points: factor.points.map((p, k) =>
        k === 1 ? { ...p, argRange: [Frac.ZERO, Frac.of(2n)] as const } : p,
      ),
    });
    if (!flipped.ok) throw new Error(flipped.reason);
    expect(flipped.argMultiple.equals(Frac.of(1n, 4n))).toBe(true);
  });
});

describe("the end caps, at exponents that are not equal", () => {
  it("kills each by the bound about its OWN branch point, at its own rate", () => {
    const caps = ran().ledger.rows.filter((r) => r.claim.includes("over the cap"));
    expect(caps).toHaveLength(2);
    const byPiece = new Map(caps.map((c) => [c.pieceId, c]));
    // `μ = 3/4` at z = 0 gives `O(η^{7/4})`; `ν = 1/4` at z = b gives `O(η^{5/4})`. Different rates
    // from the same lemma, which is what having two different exponents on one cut means.
    expect(must(byPiece.get("endA"), "the cap at 0").claim).toMatch(/O\(η\^\(7\/4\)\)/);
    expect(must(byPiece.get("endB"), "the cap at b").claim).toMatch(/O\(η\^\(5\/4\)\)/);
    for (const cap of caps) {
      expect(cap.status).toBe("satisfied");
      expect(cap.evidence.level).toBe("≤");
    }
  });

  it("hugs a cut whose ends are PARAMETERS, which the geometry has to be affine in two of", () => {
    // `b` is a parameter and the upper edge runs to `b − η`. Before D7 a `Scalar` was affine in one
    // parameter and a constant, so this contour could not be written at all.
    const runs = [3, 2, 4].map((b) => {
      const contour = runFamily(D7, { ...flagship, params: { mu: 0.75, b, c: 10 } });
      if (!contour.ok) throw new Error(contour.reason);
      return contour.run.resolved[0];
    });
    for (const [k, b] of [3, 2, 4].entries()) {
      const piece = runs[k];
      if (piece.kind !== "segment") throw new Error("the upper edge is a segment");
      expect({ b, to: Number(piece.to[0].toFixed(6)) }).toEqual({ b, to: b - 0.05 });
    }
  });
});
