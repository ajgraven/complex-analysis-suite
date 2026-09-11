import { describe, expect, it } from "vitest";
import { Frac } from "@cas/exact";
import { applyCombination, solveExact } from "../src/families/linear.js";

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
    expect(r.inconsistentRows).toEqual([]);
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
    expect(r.inconsistentRows).toEqual([]);
  });
});

describe("solveExact — contradiction is distinct from rank deficiency", () => {
  it("flags a row that forces 0 = nonzero", () => {
    // The real-axis families' shape: M = [[1],[0]], so row 1 asserts the answer is real.
    const r = solveExact([[f(1)], [f(0)]], 1, [f(3), f(7, 2)]);
    expect(r.rank).toBe(1);
    expect(r.inconsistentRows).toEqual([1]);
  });

  it("accepts the same system when the imaginary part vanishes", () => {
    const r = solveExact([[f(1)], [f(0)]], 1, [f(3), f(0)]);
    expect(r.rank).toBe(1);
    expect(r.inconsistentRows).toEqual([]);
    expect(applyCombination(must(r.combination, "a combination")[0], [f(3), f(0)]).toNumber()).toBe(3);
  });

  it("finds the contradiction after elimination, not only in an already-zero row", () => {
    // Row 1 is 2× row 0 in M but not in r, so the contradiction only appears once reduced.
    const r = solveExact([[f(1)], [f(2)]], 1, [f(1), f(3)]);
    expect(r.rank).toBe(1);
    expect(r.inconsistentRows).toEqual([1]);
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
function must<T>(v: T | undefined, what: string): T {
  if (v === undefined) throw new Error(`expected ${what} to be present`);
  return v;
}
