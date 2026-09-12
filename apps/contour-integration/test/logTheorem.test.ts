// `∮ R log^m z dz = 2πi Σ n·Res` — the theorem's own guards, and the record that exercises them.
//
// D4's contour encloses both its poles with winding 1 and decides both exactly, so a record can
// never reach the guards below. They are called directly instead: a theorem whose winding check and
// whose `2πi` could be deleted without any test noticing is a theorem nobody is checking.
import { describe, expect, it } from "vitest";
import { Frac, Gauss, SqrtExt } from "@cas/exact";
import { parse } from "@cas/expr";
import { assembleVerdict, exact } from "@cas/rigor";
import { applyLogTheorem } from "../src/engine/logTheorem.js";
import { logFactorOf } from "../src/families/branchFactor.js";
import { piPieceLimits } from "../src/families/solveTarget.js";
import { ExpSum } from "../src/kernel/expSum.js";
import { Exponent } from "../src/kernel/exponent.js";
import { formatRatPi } from "../src/kernel/ratPi.js";
import { d4LogSquaredKeyhole } from "../src/families/records/d4-log-squared-keyhole.js";
import type { ContourIntegral } from "../src/engine/contour/integrate.js";
import type { PoleReport } from "../src/kernel/poles.js";
import type { Family } from "../src/families/schema.js";

function must<T>(v: T | undefined, what: string): T {
  if (v === undefined) throw new Error(`expected ${what}`);
  return v;
}

const f = (n: number, d = 1): Frac => Frac.of(BigInt(n), BigInt(d));
const KEYHOLE: readonly [Frac, Frac] = [f(0), f(2)];

/** The poles of `1/(1+z²)²`, as `findPoles` reports them — ±i, double, exact. */
const poles = (): PoleReport => ({
  poles: [],
  rational: true,
  exactlyComplete: true,
  exactPoles: [
    { at: SqrtExt.fromGauss(Gauss.I), order: 2, residue: SqrtExt.fromGauss(Gauss.ZERO), radicand: 1n },
    { at: SqrtExt.fromGauss(Gauss.I.neg()), order: 2, residue: SqrtExt.fromGauss(Gauss.ZERO), radicand: 1n },
  ],
  certificates: [],
});

const integral = (
  windings: readonly { at: [number, number]; n: number; decided: boolean }[],
): ContourIntegral => ({
  pieces: [],
  verdict: assembleVerdict([exact("the windings", "fabricated for this test")]),
  windings,
  closed: true,
});

const BOTH = [
  { at: [0, 1] as [number, number], n: 1, decided: true },
  { at: [0, -1] as [number, number], n: 1, decided: true },
];

describe("applyLogTheorem", () => {
  const rational = parse("1/(1+z^2)^2");

  it("reproduces 2πi·Σ for D4's integrand", () => {
    const r = applyLogTheorem({
      poles: poles(),
      integral: integral(BOTH),
      factor: { power: 2, argRange: KEYHOLE },
      rational,
    });
    expect(r.exactInPi).toBeDefined();
    expect(formatRatPi(must(r.exactInPi, "∮ in ℚ(i)(π)"))).toBe("π³ + iπ²");
  });

  it("refuses when a winding number was not decided", () => {
    // A pole ON the contour. The residue is perfectly computable and weighting it is not, so the
    // theorem refuses rather than assuming a winding of 1.
    const r = applyLogTheorem({
      poles: poles(),
      integral: integral([BOTH[0], { at: [0, -1], n: 1, decided: false }]),
      factor: { power: 2, argRange: KEYHOLE },
      rational,
    });
    expect(r.exactInPi).toBeUndefined();
    expect(r.verdict.level).toBe("⚠");
  });

  it("counts a pole only with the winding the contour actually has", () => {
    // Enclose i alone: the answer is 2πi·Res(i), a different number, not the same one.
    const r = applyLogTheorem({
      poles: poles(),
      integral: integral([BOTH[0], { at: [0, -1], n: 0, decided: true }]),
      factor: { power: 2, argRange: KEYHOLE },
      rational,
    });
    // 2πi(−π/4 + iπ²/16) = −π³/8 − iπ²/2.
    expect(formatRatPi(must(r.exactInPi, "∮ in ℚ(i)(π)"))).toBe("−π³/8 − iπ²/2");
  });

  it("never asks a pole the contour does not enclose — which is not an optimisation", () => {
    // `1/((1+z²)(4+z²))` has poles at ±i and ±2i, and `log(2i)` needs `ln 2`, which no basis here
    // carries until M4.5. A contour enclosing only the unit-circle poles is a perfectly good
    // contour, and the theorem must not refuse it because of a pole it never encircled.
    const rational = parse("1/((1+z^2)*(4+z^2))");
    const two = SqrtExt.fromGauss(new Gauss(Frac.ZERO, Frac.of(2n)));
    const report: PoleReport = {
      ...poles(),
      exactPoles: [
        { at: SqrtExt.fromGauss(Gauss.I), order: 1, residue: SqrtExt.fromGauss(Gauss.ZERO), radicand: 1n },
        { at: two, order: 1, residue: SqrtExt.fromGauss(Gauss.ZERO), radicand: 1n },
      ],
    };
    const enclosed = applyLogTheorem({
      poles: report,
      integral: integral([
        { at: [0, 1], n: 1, decided: true },
        { at: [0, 2], n: 0, decided: true },
      ]),
      factor: { power: 2, argRange: KEYHOLE },
      rational,
    });
    expect(enclosed.exactInPi).toBeDefined();

    // And when it IS enclosed, the refusal is the honest one rather than a silent zero.
    const both = applyLogTheorem({
      poles: report,
      integral: integral([
        { at: [0, 1], n: 1, decided: true },
        { at: [0, 2], n: 1, decided: true },
      ]),
      factor: { power: 2, argRange: KEYHOLE },
      rational,
    });
    expect(both.exactInPi).toBeUndefined();
  });

  it("refuses when the poles were not all pinned exactly", () => {
    const r = applyLogTheorem({
      poles: { ...poles(), exactlyComplete: false },
      integral: integral(BOTH),
      factor: { power: 2, argRange: KEYHOLE },
      rational,
    });
    expect(r.exactInPi).toBeUndefined();
  });

  it("refuses a cofactor that is not an exact rational function", () => {
    const r = applyLogTheorem({
      poles: poles(),
      integral: integral(BOTH),
      factor: { power: 2, argRange: KEYHOLE },
      rational: parse("exp(z)"),
    });
    expect(r.exactInPi).toBeUndefined();
  });
});

describe("logFactorOf", () => {
  const branchOf = (x: Family): NonNullable<Family["branch"]> => {
    if (x.branch === undefined) throw new Error("expected a branch spec");
    return x.branch;
  };

  it("reads D4's factor: log², arg ∈ [0, 2π)", () => {
    const got = logFactorOf(d4LogSquaredKeyhole, { p: 2 });
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.factor.power).toBe(2);
    expect(got.factor.argRange.map((x) => x.toNumber())).toEqual([0, 2]);
    // The cut runs out along the range's LOWER boundary — ℝ₊ here — and to infinity, as a log must.
    expect(got.choice.convention).toBe("zeroToTwoPi");
    expect(got.choice.points[0].order.kind).toBe("log");
    expect(got.choice.cuts[0].to).toBe("infinity");
  });

  it("refuses a power that is not a positive integer", () => {
    // The schema types it `number`, so a record CAN declare 3/2; it is a multiplicity, and
    // `log^{3/2}` is a different branch structure rather than a harder case of this one.
    const fractional: Family = {
      ...d4LogSquaredKeyhole,
      branch: {
        ...branchOf(d4LogSquaredKeyhole),
        factors: [
          { ...branchOf(d4LogSquaredKeyhole).factors[0], order: { kind: "log", power: 1.5 } },
        ],
      },
    };
    const got = logFactorOf(fractional, { p: 2 });
    expect(got.ok).toBe(false);
    expect(!got.ok && got.reason).toMatch(/positive integer power/);
  });

  it("refuses a family whose branch factor is a power", () => {
    const got = logFactorOf({ ...d4LogSquaredKeyhole, branch: undefined }, { p: 2 });
    expect(got.ok).toBe(false);
  });
});

describe("piPieceLimits — the ×π that must be done rather than assumed", () => {
  it("carries a limit in units of π into ℚ(i)(π)", () => {
    // C1's indentation contributes `iα·Res`, which the ledger reports as `−1/2` in units of π; in
    // ℚ(i)(π) that same limit is `−π/2`, and dropping the π would be a silent factor error.
    const half = ExpSum.fromSqrtExt(SqrtExt.fromGauss(Gauss.rat(-1n, 2n)));
    const got = piPieceLimits([{ pieceId: "indent", contribution: half }]);
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(formatRatPi(got.limits[0].contribution)).toBe("−π/2");
  });

  it("refuses a limit that is not π times a Gaussian rational", () => {
    // B1's `π/e` is π times `e^{-1}`, which is not an algebraic number — carrying it would mean
    // guessing which power of π it is.
    const exponential = ExpSum.of(
      SqrtExt.ONE,
      Exponent.fromSqrtExt(SqrtExt.fromGauss(Gauss.int(-1))),
    );
    const got = piPieceLimits([{ pieceId: "arc", contribution: exponential }]);
    expect(got.ok).toBe(false);
    expect(!got.ok && got.pieceId).toBe("arc");
  });

  it("is the identity on nothing", () => {
    const got = piPieceLimits([]);
    expect(got.ok && got.limits).toEqual([]);
  });
});
