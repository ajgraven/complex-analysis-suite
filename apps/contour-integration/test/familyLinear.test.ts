import { describe, expect, it } from "vitest";
import { Frac, Gauss } from "@cas/exact";
import {
  applyCombination,
  combineOver,
  describeKernel,
  realifyRows,
  solveExact,
  solveOver,
} from "../src/families/linear.js";
import { FRAC_FIELD, RAT_PI_FIELD } from "../src/families/field.js";
import { RatPi, formatRatPi } from "../src/kernel/ratPi.js";

const f = (n: number | bigint, d: number | bigint = 1): Frac => Frac.of(BigInt(n), BigInt(d));
const nums = (v: readonly Frac[]): number[] => v.map((x) => x.toNumber());

describe("solveExact — rank and kernel", () => {
  it("reports full rank and the identity combination for a determined system", () => {
    const r = solveExact([[f(1), f(0)], [f(0), f(1)]], 2);
    expect(r.rank).toBe(2);
    expect(r.kernel).toHaveLength(0);
    expect(r.combination).toBeDefined();
    expect(must(r.combination, "a combination").map(nums)).toEqual([
      [1, 0],
      [0, 1],
    ]);
  });

  it("solves a determined system exactly through the combination weights", () => {
    // 2t₀ + t₁ = 5, t₀ − t₁ = 1  ⇒  t₀ = 2, t₁ = 1.
    const M = [
      [f(2), f(1)],
      [f(1), f(-1)],
    ];
    const rhs = [f(5), f(1)];
    const r = solveExact(M, 2, rhs);
    expect(r.rank).toBe(2);
    expect(r.contradictions.map((c) => c.row)).toEqual([]);
    const t = must(r.combination, "a combination").map((w) => applyCombination(w, rhs).toNumber());
    expect(t).toEqual([2, 1]);
  });

  it("names the undetermined combination when two rows say the same thing", () => {
    const r = solveExact([[f(1), f(1)], [f(2), f(2)]], 2);
    expect(r.rank).toBe(1);
    expect(r.combination).toBeUndefined();
    expect(r.kernel).toHaveLength(1);
    // The invisible combination is t₀ − t₁: this contour constrains only their sum.
    expect(nums(r.kernel[0])).toEqual([-1, 1]);
  });

  it("reports a zero column as an unconstrained unknown — the plain-log keyhole's shape", () => {
    // DESIGN §4 Pass 5: "the plain-log keyhole 'losing' the log integral | a zero COLUMN".
    const r = solveExact([[f(1), f(0)], [f(0), f(0)]], 2);
    expect(r.rank).toBe(1);
    expect(r.pivotColumns).toEqual([0]);
    expect(nums(r.kernel[0])).toEqual([0, 1]);
  });

  it("reports rank 0 when the contour collapses — the wrong-argRange keyhole", () => {
    // DESIGN §4 Pass 5: "the two edges cancel and the integral collapses to 0 | M = [0], rank 0".
    const r = solveExact([[f(0)], [f(0)]], 1, [f(0), f(0)]);
    expect(r.rank).toBe(0);
    expect(r.kernel).toHaveLength(1);
    expect(nums(r.kernel[0])).toEqual([1]);
    // Rank-deficient is NOT the same as contradicted: nothing here forces 0 = nonzero.
    expect(r.contradictions.map((c) => c.row)).toEqual([]);
  });
});

describe("solveExact — contradiction is distinct from rank deficiency", () => {
  it("flags a row that forces 0 = nonzero", () => {
    // The real-axis families' shape: M = [[1],[0]], so row 1 asserts the answer is real.
    const r = solveExact([[f(1)], [f(0)]], 1, [f(3), f(7, 2)]);
    expect(r.rank).toBe(1);
    expect(r.contradictions.map((c) => c.row)).toEqual([1]);
  });

  it("accepts the same system when the imaginary part vanishes", () => {
    const r = solveExact([[f(1)], [f(0)]], 1, [f(3), f(0)]);
    expect(r.rank).toBe(1);
    expect(r.contradictions.map((c) => c.row)).toEqual([]);
    expect(applyCombination(must(r.combination, "a combination")[0], [f(3), f(0)]).toNumber()).toBe(3);
  });

  it("finds the contradiction after elimination, not only in an already-zero row", () => {
    // Row 1 is 2× row 0 in M but not in r, so the contradiction only appears once reduced.
    const r = solveExact([[f(1)], [f(2)]], 1, [f(1), f(3)]);
    expect(r.rank).toBe(1);
    expect(r.contradictions.map((c) => c.row)).toEqual([1]);
  });
});

describe("solveExact — the over-determined case the design anticipates", () => {
  // DESIGN §4 Pass 5: rows are stacked "over every identity the family declares — several contours,
  // several parameter instances, plus any prerequisites", so k > m is the normal shape, not an edge.
  it("solves from the pivot row and checks the redundant ones for contradiction", () => {
    const M = [[f(1)], [f(0)], [f(2)]];
    const consistent = solveExact(M, 1, [f(3), f(0), f(6)]);
    expect(consistent.rank).toBe(1);
    expect(consistent.contradictions.map((c) => c.row)).toEqual([]);
    expect(applyCombination(must(consistent.combination, "a combination")[0], [f(3), f(0), f(6)]).toNumber()).toBe(3);

    // Row 1 now asserts 0 = 1; row 2 is still the consistent multiple of row 0.
    const contradicted = solveExact(M, 1, [f(3), f(1), f(6)]);
    expect(contradicted.contradictions.map((c) => c.row)).toEqual([1]);

    // Row 2 disagreeing with row 0 is a contradiction too, and a different one.
    const disagreeing = solveExact(M, 1, [f(3), f(0), f(7)]);
    expect(disagreeing.contradictions.map((c) => c.row)).toEqual([2]);
  });
});

describe("solveExact — exactness is the point, not a nicety", () => {
  it("decides a rank that a float elimination would get wrong", () => {
    // The second row differs from the first by 1 ulp in the last entry. In float64 the entry rounds
    // to exactly 1.0 and the determinant comes out 0, so a thresholded rank says 1. Over ℚ the
    // determinant is 2⁻⁵³ ≠ 0 and the rank is 2. DESIGN §4 makes rank the load-bearing report for
    // four separate classical traps, so "rank" must not be a tuning parameter.
    const ulp = 2n ** 53n;
    const M = [
      [f(1), f(1)],
      [f(1), f(ulp + 1n, ulp)],
    ];
    expect(M[1][1].toNumber()).toBe(1); // the float round-trip really does lose it
    const r = solveExact(M, 2);
    expect(r.rank).toBe(2);
    expect(r.kernel).toHaveLength(0);
  });

  it("keeps large rationals exact through elimination", () => {
    const M = [
      [f(1, 3), f(1, 7)],
      [f(1, 5), f(1, 11)],
    ];
    const rhs = [f(1), f(1)];
    const r = solveExact(M, 2, rhs);
    expect(r.rank).toBe(2);
    const t = must(r.combination, "a combination").map((w) => applyCombination(w, rhs));
    // Verify by substitution in exact arithmetic rather than by comparing decimals.
    for (const row of [0, 1]) {
      const lhs = M[row][0].mul(t[0]).add(M[row][1].mul(t[1]));
      expect(lhs.equals(rhs[row])).toBe(true);
    }
  });
});

describe("solveExact — guards", () => {
  it("rejects a ragged matrix", () => {
    expect(() => solveExact([[f(1), f(2)], [f(1)]], 2)).toThrow(/expected 2/);
  });

  it("rejects a right-hand side of the wrong length", () => {
    expect(() => solveExact([[f(1)]], 1, [f(1), f(2)])).toThrow(/2 entries but the matrix has 1/);
  });

  it("rejects a mismatched combination in applyCombination", () => {
    expect(() => applyCombination([f(1)], [f(1), f(2)])).toThrow(/1 weights but the rhs has 2/);
  });
});

/** Narrow an optional without a non-null assertion — the repo forbids `!`, and a thrown message
 *  names what was missing instead of producing a TypeError three lines later. */
describe("solveExact — a pivot is determined only when the free columns leave it alone", () => {
  it("determines the pivot unknown when no free column reaches it", () => {
    // The plain-log keyhole's shape: `∫R dx` pinned, `∫R log x dx` invisible.
    const r = solveExact([[f(1), f(0)], [f(0), f(0)]], 2, [f(5), f(0)]);
    expect(r.rank).toBe(1);
    expect(r.determined.map((d) => d.column)).toEqual([0]);
    expect(applyCombination(r.determined[0].weights, [f(5), f(0)]).toNumber()).toBe(5);
  });

  it("determines nothing when the pivot row reaches into a free column", () => {
    // t₀ + t₁ = c constrains the SUM; neither unknown is pinned, and saying t₀ = c would be false.
    const r = solveExact([[f(1), f(1)], [f(2), f(2)]], 2);
    expect(r.rank).toBe(1);
    expect(r.determined).toEqual([]);
  });

  it("agrees with `combination` at full rank", () => {
    const M = [
      [f(2), f(1)],
      [f(1), f(-1)],
    ];
    const r = solveExact(M, 2);
    expect(r.determined.map((d) => d.column)).toEqual([0, 1]);
    expect(must(r.combination, "a combination")).toEqual(r.determined.map((d) => d.weights));
  });
});

describe("describeKernel — the rank statement in the gallery's own words", () => {
  it("names the unknown a zero column leaves invisible", () => {
    const r = solveExact([[f(1), f(0)], [f(0), f(0)]], 2);
    expect(describeKernel(FRAC_FIELD, r, ["∫₀^∞ R(x) dx", "∫₀^∞ R(x) log x dx"])).toEqual([
      "this contour carries no information about ∫₀^∞ R(x) log x dx",
    ]);
  });

  it("says nothing at all when the system is determined", () => {
    const r = solveExact([[f(1)]], 1);
    expect(describeKernel(FRAC_FIELD, r, ["T"])).toEqual([]);
  });

  it("names a genuine COMBINATION when that is what is invisible", () => {
    const r = solveExact([[f(1), f(1)]], 2);
    expect(describeKernel(FRAC_FIELD, r, ["T0", "T1"])).toEqual([
      "this contour carries no information about −T0 + T1",
    ]);
    // A weight that is neither ±1 is spelled out rather than dropped.
    const scaled = solveExact([[f(2), f(1)]], 2);
    expect(describeKernel(FRAC_FIELD, scaled, ["T0", "T1"])).toEqual([
      "this contour carries no information about −1/2·T0 + T1",
    ]);
  });

  it("refuses a name list that does not match the system", () => {
    const r = solveExact([[f(1), f(0)]], 2);
    expect(() => describeKernel(FRAC_FIELD, r, ["T0"])).toThrow(/1 names for 2 unknowns/);
  });
});

// ---------------------------------------------------------------------------------------------
// The same elimination over ℚ(i)(π) — D4, whose coefficients are `4π²` and `−4πi`.
// ---------------------------------------------------------------------------------------------

const pi = (k: number, re = 1, im = 0): RatPi => RatPi.piPower(k, Gauss.int(re, im));

/** D4's single identity, in the unknowns (T0, T1, T2) = (∫R, ∫R log, ∫R log²). */
const D4_ROW: readonly RatPi[] = [pi(2, 4), pi(1, 0, -4), RatPi.ZERO];
/** `2πi·Σ` with `Σ = π/2 − iπ²/2` for `R = 1/(1+x²)²`: `2πi(π/2 − iπ²/2) = π³ + iπ²`. */
const D4_RHS: RatPi = pi(3).add(pi(2, 0, 1));

describe("solveOver ℚ(i)(π) — D4's system", () => {
  it("reads rank 1 from the complex row, which is why the Re/Im split is not decoration", () => {
    const r = solveOver(RAT_PI_FIELD, [D4_ROW], 3);
    expect(r.rank).toBe(1);
    // Two of the three integrals invisible — and the one the contour was built for among them.
    expect(r.kernel).toHaveLength(2);
    expect(r.determined).toEqual([]);
  });

  it("reads rank 2 once realified, and determines T0 and T1 exactly", () => {
    const M = realifyRows([D4_ROW]);
    const rhs = [D4_RHS.re(), D4_RHS.im()];
    const r = solveOver(RAT_PI_FIELD, M, 3, rhs);

    expect(r.rank).toBe(2);
    expect(r.pivotColumns).toEqual([0, 1]);
    expect(r.contradictions.map((c) => c.row)).toEqual([]);
    // Rank 2 in three unknowns, so there is no whole-system solution — and yet two of the three
    // unknowns are pinned. `combination` alone would have refused to state either.
    expect(r.combination).toBeUndefined();
    expect(r.determined.map((d) => d.column)).toEqual([0, 1]);

    const at = (column: number): string => {
      const d = must(r.determined.find((e) => e.column === column), `column ${column}`);
      return formatRatPi(combineOver(RAT_PI_FIELD, d.weights, rhs));
    };
    // The gallery's numbers: T0 = ∫dx/(1+x²)² = π/4 (the free bonus), T1 = ∫log x/(1+x²)² = −π/4.
    expect(at(0)).toBe("π/4");
    expect(at(1)).toBe("−π/4");
  });

  it("names T2 as the one combination the contour cannot see", () => {
    const r = solveOver(RAT_PI_FIELD, realifyRows([D4_ROW]), 3);
    expect(describeKernel(RAT_PI_FIELD, r, ["T0", "T1", "T2"])).toEqual([
      "this contour carries no information about T2",
    ]);
  });

  it("reports the plain-log keyhole's loss as the same rank statement, one column over", () => {
    // With a single log the lower edge gives −(T1 + 2πi·T0): the T1 terms CANCEL and what survives
    // is −2πi·T0 = 2πi ΣRes. This is the gate's sentence, computed rather than written by hand.
    const row: readonly RatPi[] = [pi(1, 0, -2), RatPi.ZERO];
    const r = solveOver(RAT_PI_FIELD, realifyRows([row]), 2);
    expect(r.rank).toBe(1);
    expect(r.determined.map((d) => d.column)).toEqual([0]);
    expect(describeKernel(RAT_PI_FIELD, r, ["∫₀^∞ R(x) dx", "∫₀^∞ R(x) log x dx"])).toEqual([
      "this contour carries no information about ∫₀^∞ R(x) log x dx",
    ]);
  });

  it("splits rows in the documented order — real part first, then imaginary", () => {
    const M = realifyRows([D4_ROW]);
    expect(M).toHaveLength(2);
    expect(M[0].map(formatRatPi)).toEqual(["4π²", "0", "0"]);
    expect(M[1].map(formatRatPi)).toEqual(["0", "−4π", "0"]);
  });

  it("decides a zero coefficient structurally, because π is transcendental", () => {
    // `π·π − π²` is zero because the polynomials cancel. No tolerance was consulted.
    const r = solveOver(RAT_PI_FIELD, [[pi(1).mul(pi(1)).sub(pi(2))]], 1, [RatPi.ONE]);
    expect(r.rank).toBe(0);
    expect(r.contradictions.map((c) => c.row)).toEqual([0]);
  });

  it("separates contradiction from rank deficiency in the widened field too", () => {
    // Row 1 is `0·t = π`, which no `t` satisfies: CONTRADICTED, not underdetermined.
    const r = solveOver(RAT_PI_FIELD, [[RatPi.ONE], [RatPi.ZERO]], 1, [RatPi.ONE, pi(1)]);
    expect(r.rank).toBe(1);
    expect(r.kernel).toHaveLength(0);
    expect(r.contradictions.map((c) => c.row)).toEqual([1]);
  });
});

function must<T>(v: T | undefined, what: string): T {
  if (v === undefined) throw new Error(`expected ${what} to be present`);
  return v;
}
