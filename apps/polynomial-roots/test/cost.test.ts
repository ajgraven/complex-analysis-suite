import { describe, it, expect } from "vitest";
import { compileAlphabet } from "../src/engine/alphabet";
import type { Alphabet, AlphabetSpec } from "../src/engine/alphabet";
import { properCount } from "../src/engine/orbits";
import { sweepChunk } from "../src/engine/sweep";
import {
  costNote,
  formatBytes,
  formatBigCount,
  HARD_POINT_BUDGET,
  highestDegreeWithin,
  LIVE_POINT_BUDGET,
  sweepCost,
} from "../src/engine/cost";

const A = (spec: AlphabetSpec): Alphabet => {
  const r = compileAlphabet(spec);
  if ("error" in r) throw new Error(r.error);
  return r.alphabet;
};
const lw = A({ preset: "littlewood" });

describe("what a sweep costs", () => {
  it("keeps the old live cap exactly for Littlewood, and puts the hard cap at degree 22", () => {
    // The budgets were chosen against the one family the app was designed around: degrees 1–20 was the
    // old `LIVE_DEGREE_CAP`, and 1–22 is the most a browser tab can be asked to hold.
    expect(sweepCost(lw, 1, 20).verdict).toBe("live");
    expect(sweepCost(lw, 1, 20).points).toBeCloseTo((19 * 2 ** 21 + 2) / 4, 6);
    expect(sweepCost(lw, 1, 21).verdict).toBe("confirm");
    expect(sweepCost(lw, 1, 22).verdict).toBe("confirm");
    expect(sweepCost(lw, 1, 23).verdict).toBe("refused");
    expect(sweepCost(lw, 1, 24).verdict).toBe("refused");
    expect(highestDegreeWithin(lw, 1, LIVE_POINT_BUDGET, 24)).toBe(20);
    expect(highestDegreeWithin(lw, 1, HARD_POINT_BUDGET, 24)).toBe(22);
    // The range is from `minDegree`, not from 1: degree 23 ALONE fits (4.8e7 points) though 1–23 does
    // not, so a reader who raises the lowest degree can reach it.
    expect(highestDegreeWithin(lw, 23, HARD_POINT_BUDGET, 24)).toBe(23);
    expect(sweepCost(lw, 23, 23).verdict).toBe("confirm");
  });

  it("names the repair even when it is the lowest degree itself", () => {
    // 23–24 is refused; 23 alone fits, so the repair is "lower the highest degree to 23", not "raise
    // the lowest" — which would send the reader the wrong way.
    const note = costNote(sweepCost(lw, 23, 24), 23, 24, highestDegreeWithin(lw, 23, HARD_POINT_BUDGET, 24));
    expect(note).toContain("Lower the highest degree to 23 or below.");
  });

  it("is the ALPHABET's budget: the review's freezes are refused, not queued", () => {
    // {−2 … 2} at the default degree 16 froze the tab for 6.9 s queueing 18.6 million chunks; {−3 … 3}
    // never loaded; trinary at 16 was ~2 GB of vertex buffers. Each is now a refusal with a repair.
    for (const spec of [
      { preset: "range", n: 2 },
      { preset: "range", n: 3 },
      { preset: "trinary" },
    ] as AlphabetSpec[]) {
      const a = A(spec);
      const cost = sweepCost(a, 1, 16);
      expect(cost.verdict, JSON.stringify(spec)).toBe("refused");
      const repair = highestDegreeWithin(a, 1, HARD_POINT_BUDGET, 24);
      expect(repair).toBeLessThan(16);
      // The repair really is the boundary: it fits, one more does not.
      expect(sweepCost(a, 1, repair).points).toBeLessThanOrEqual(HARD_POINT_BUDGET);
      expect(sweepCost(a, 1, repair + 1).points).toBeGreaterThan(HARD_POINT_BUDGET);
    }
    // And the polynomial count is the family's own, exactly — not 2^d.
    const tri = A({ preset: "trinary" });
    let family = 0;
    for (let d = 1; d <= 22; d++) family += properCount(tri, d);
    expect(sweepCost(tri, 1, 22).polynomials).toBe(family);
    expect(sweepCost(tri, 22, 22).polynomials).toBe(4 * 3 ** 21);
  });

  it("estimates the solves from BELOW, by the fixed points, and not by much", () => {
    // Burnside: the number of orbits is at least |family|/|G|, with equality only when nothing is fixed,
    // so `total/|G|` is a LOWER estimate of the representatives. Measured: 1.0156 for Littlewood and
    // {0, 1} at degree 14, 1.0617 for trinary at degree 8 (a shorter polynomial is fixed more often).
    for (const [spec, d] of [
      [{ preset: "littlewood" }, 14],
      [{ preset: "trinary" }, 8],
      [{ preset: "zero-one" }, 14],
    ] as [AlphabetSpec, number][]) {
      const a = A(spec);
      const real = sweepChunk({ spec, degree: d, lo: 0, hi: Infinity, circleDelta: 0.02 });
      if ("error" in real) throw new Error(real.error);
      const est = sweepCost(a, d, d).solves;
      expect(real.representatives, JSON.stringify(spec)).toBeGreaterThanOrEqual(est);
      expect(real.representatives / est, JSON.stringify(spec)).toBeLessThan(1.1);
    }
  });

  it("says a large count in words, and never 2^d", () => {
    expect(formatBigCount(4_194_304)).toBe("4.2 million");
    expect(formatBigCount(3.05e11)).toBe("305.0 billion");
    expect(formatBigCount(2.46e21)).toBe("2.5 × 10²¹");
    expect(formatBytes(2.5e8)).toBe("250 MB");
    expect(formatBytes(6e8 * 2)).toBe("1.2 GB");
    const tri = A({ preset: "trinary" });
    const note = costNote(sweepCost(tri, 22, 22), 22, 22, highestDegreeWithin(tri, 22, HARD_POINT_BUDGET, 24));
    expect(note).toContain("41.8 billion polynomials");
    expect(note).not.toContain("4.2 million");
    expect(note).toContain("more than this app will hold");
    expect(note).toContain("Raise the lowest degree");
    const confirm = costNote(sweepCost(lw, 1, 21), 1, 21, 22);
    expect(confirm).toContain("press Compute");
    expect(confirm).toContain("≈ 252 MB of GPU memory");
    // A refused range is said in the unit that makes it obviously impossible, not "2,024,078 MB".
    expect(costNote(sweepCost(tri, 1, 22), 1, 22, 14)).toContain("≈ 2.0 TB of GPU memory");
  });
});
