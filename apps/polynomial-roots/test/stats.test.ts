import { describe, it, expect } from "vitest";
import { addStats, degreeRows, describeLimit, describeTotals, emptyTotals, formatShare, limitLines, measureLimit, statLines } from "../src/stats";
import { sweepChunk } from "../src/engine/sweep";
import type { SweepStats } from "../src/engine/sweep";

const run = (degree: number, circleDelta = 0.02): SweepStats => {
  const r = sweepChunk({ spec: { preset: "littlewood" }, degree, lo: 0, hi: Infinity, circleDelta });
  if ("error" in r) throw new Error(r.error);
  return r.stats;
};

describe("the statistics", () => {
  it("accumulate across chunks", () => {
    const totals = emptyTotals();
    addStats(totals, run(3));
    addStats(totals, run(4));
    expect(totals.roots).toBe(run(3).roots + run(4).roots);
    expect(totals.realRoots).toBe(run(3).realRoots + run(4).realRoots);
  });

  it("report the real-root count that the picture's bright line is made of", () => {
    // Degree 3 Littlewood: 16 proper polynomials, 48 roots. An odd-degree real polynomial always has at
    // least one real root, so at least 16 of them are real — a fact the count must reproduce.
    const s = run(3);
    expect(s.polynomials).toBe(16);
    expect(s.roots).toBe(48);
    expect(s.realRoots).toBeGreaterThanOrEqual(16);
    expect(s.realRoots).toBeLessThan(s.roots);
  });

  it("the real-root SHARE falls as the degree climbs — which is why every figure names its degree", () => {
    // Measured 2026-09-22 over the whole Littlewood family: 100% at degree 1 (both roots are ±1),
    // 33.3% at 3, 23.0% at 7, 17.2% at 11, 13.8% at 15, 12.7% at 17. A reader shown "13.8% real" with no
    // degree beside it would take it for a property of Littlewood polynomials; it is a property of
    // degree 15.
    const shares = [3, 5, 7, 9, 11, 13, 15].map((d) => run(d).realRoots / run(d).roots);
    for (let i = 1; i < shares.length; i++) expect(shares[i]).toBeLessThan(shares[i - 1]);
    expect(run(1).realRoots / run(1).roots).toBe(1);
    expect(shares[shares.length - 1]).toBeLessThan(0.15);
    expect(shares[shares.length - 1]).toBeGreaterThan(0.12);
  });

  it("the near-circle share DIPS and then rises — and the dip is the honest part", () => {
    // Bousch: the roots are dense in 2^(−1/4) ≤ |z| ≤ 2^(1/4), so the share near |z| = 1 grows with the
    // degree — eventually. It does not grow from the start, and a test asserting that it did would have
    // been asserting something false: at degree 1 both roots ARE ±1 (100%) and at degree 2 half of them
    // are the cube and sixth roots of unity (50%), so the share FALLS to a minimum around degree 9
    // before the densification takes over. Measured at δ = 0.05: 100, 50, 50, 35, 26.8, 21.2, 25.4,
    // 25.6, 28.6, 31.1 for degrees 1, 2, 3, 5, 7, 9, 11, 13, 15, 17.
    expect(run(1, 0.05).nearCircle / run(1, 0.05).roots).toBe(1);
    const late = [9, 11, 13, 15].map((d) => run(d, 0.05).nearCircle / run(d, 0.05).roots);
    for (let i = 1; i < late.length; i++) expect(late[i]).toBeGreaterThan(late[i - 1]);
    expect(late[0]).toBeLessThan(run(3, 0.05).nearCircle / run(3, 0.05).roots); // the dip is real
    expect(late[late.length - 1]).toBeGreaterThan(0.25);
  });

  it("a wider band counts more, and δ = 0 counts almost nothing", () => {
    expect(run(9, 0.2).nearCircle).toBeGreaterThan(run(9, 0.02).nearCircle);
    expect(run(9, 0.0001).nearCircle).toBeLessThan(run(9, 0.02).nearCircle);
  });
});

describe("how the numbers are said", () => {
  it("every line names the degrees it was counted over", () => {
    const totals = emptyTotals();
    addStats(totals, run(5));
    const lines = statLines(totals, { minDegree: 1, maxDegree: 5, circleDelta: 0.02, complete: true });
    expect(lines.length).toBeGreaterThanOrEqual(4);
    expect(lines[0].detail).toContain("degrees 1–5");
    expect(lines[1].detail).toContain("degrees 1–5");
  });

  it("the SHARE is of the roots, not of the polynomials — a factor of `degree` apart", () => {
    // Found by a mutation sweep: dividing by `polynomials` instead of `roots` changed no test, and the
    // number a reader sees would have been wrong by a factor of the degree — 100% real at degree 3
    // Littlewood instead of 33.3%. The percentage is the claim on screen, so the string carries it.
    const totals = emptyTotals();
    addStats(totals, run(3));
    expect(totals.roots).toBe(48);
    expect(totals.polynomials).toBe(16);
    expect(totals.realRoots).toBe(16);
    const lines = statLines(totals, { minDegree: 3, maxDegree: 3, circleDelta: 0.02, complete: true });
    const real = lines.find((l) => l.label === "Real roots");
    expect(real?.value).toBe("16");
    expect(real?.detail).toContain("33.3%"); // 16/48, not 16/16
    // EXACT, not `toContain`: at degree 3 the near-circle share is 24/48 = "50.0%" and the mutant's
    // 24/16 is "150.0%", which CONTAINS "50.0%" — the substring assertion passed the mutant.
    const near = lines.find((l) => l.label.includes("|z| = 1"));
    expect(near?.detail).toBe(`${formatShare(totals.nearCircle, totals.roots)} of them — the haze at the circle`);
    expect(real?.detail).toBe(`${formatShare(totals.realRoots, totals.roots)} of them — the bright line on the axis`);
    expect(formatShare(totals.nearCircle, totals.roots)).not.toBe(
      formatShare(totals.nearCircle, totals.polynomials),
    );
  });

  it("an unfinished sweep says so, so a partial count does not read as the family's", () => {
    const totals = emptyTotals();
    addStats(totals, run(4));
    const partial = statLines(totals, { minDegree: 1, maxDegree: 9, circleDelta: 0.02, complete: false });
    expect(partial[1].detail).toContain("still computing");
    const done = statLines(totals, { minDegree: 1, maxDegree: 9, circleDelta: 0.02, complete: true });
    expect(done[1].detail).not.toContain("still computing");
  });

  it("an unsolved polynomial is REPORTED, never silent", () => {
    const totals = emptyTotals();
    addStats(totals, run(4));
    expect(statLines(totals, { minDegree: 1, maxDegree: 4, circleDelta: 0.02, complete: true })).toHaveLength(4);
    totals.nonConverged = 3;
    const lines = statLines(totals, { minDegree: 1, maxDegree: 4, circleDelta: 0.02, complete: true });
    expect(lines).toHaveLength(5);
    expect(lines[4].label).toBe("Not solved");
    expect(lines[4].detail).toContain("not drawn");
  });

  it("a share keeps enough figures to be useful when it is small", () => {
    expect(formatShare(0, 100)).toBe("0%");
    expect(formatShare(50, 100)).toBe("50.0%");
    expect(formatShare(5, 100)).toBe("5.00%");
    expect(formatShare(4, 1000)).toBe("0.400%");
    expect(formatShare(1, 1e8)).toContain("e-");
    expect(formatShare(1, 0)).toBe("—"); // nothing counted yet: a dash, not "Infinity%"
  });

  it("the generated description says what it counted, and says nothing when there is nothing", () => {
    expect(describeTotals(emptyTotals(), { minDegree: 1, maxDegree: 5 })).toBe("No roots have been computed yet.");
    const totals = emptyTotals();
    addStats(totals, run(5));
    const text = describeTotals(totals, { minDegree: 1, maxDegree: 5 });
    expect(text).toContain("roots");
    expect(text).toContain("degrees 1 to 5");
    expect(text).toContain("real");
    // A single degree is said in the singular rather than as a range of one.
    expect(describeTotals(totals, { minDegree: 5, maxDegree: 5 })).toContain("degree 5");
  });
});

describe("what a limit-set frame holds", () => {
  it("counts the four outcomes from the stage's own read-back", () => {
    // The sentinels are the stage's: negative R is a status, never a depth.
    const depth = 10;
    // `depth` itself is in the fixture on purpose: `reach = depth` means a branch survived to the
    // level BELOW the cap and none reached it, so it escaped. Off by one there and the whole outermost
    // shell of every picture changes sides, which no other test here could see.
    const frame = new Float32Array([11, 11, 4, 0, 10, -1, -1, -1, -2, 7, 11]);
    const s = measureLimit(frame, depth);
    expect(s).toEqual({ total: 11, inSet: 3, escaped: 4, excluded: 3, exhausted: 1 });
    expect(measureLimit(new Float32Array([10]), depth).inSet).toBe(0);
    expect(measureLimit(new Float32Array([11]), depth).inSet).toBe(1);
  });

  it("says plainly when NOTHING in the view is in the set", () => {
    // The defect this exists for: the tone map equalises the escape depth over the occupied texels, so
    // a window that misses the limit set entirely comes out as a full, evenly-coloured picture. Measured
    // at the dragon — `0.372 − 0.542i` at half-height 1e-3 and below is 0% in the set at depth 16, 24,
    // 34 and 48 alike — and the frame was painted in two bright colours with nothing saying so.
    const empty = measureLimit(new Float32Array([0, 1, 2, 3, 2, 1]), 20);
    expect(empty.inSet).toBe(0);
    const summary = {
      alphabet: "Littlewood {−1, +1}",
      depth: 20,
      eps: 1e-5,
      annulus: false,
      reason: "you chose the limit-set engine.",
      shares: empty,
    };
    expect(limitLines(summary)[0].label).toBe("In the set");
    expect(limitLines(summary)[0].value).toBe("0%");
    expect(limitLines(summary)[0].detail).toContain("NOTHING in this view survives to depth 20");
    expect(describeLimit(summary)).toContain("does not reach it");

    // And when there IS something, it says how much rather than repeating the warning.
    const some = measureLimit(new Float32Array([21, 21, 21, 4, 0, 1, 2, 3]), 20);
    const shown = { ...summary, shares: some };
    expect(limitLines(shown)[0].value).toBe("37.5%");
    expect(limitLines(shown)[0].detail).not.toContain("NOTHING");
    expect(describeLimit(shown)).toContain("37.5% of the walked area");
  });

  it("does not claim a share when the whole view is inside the excluded band", () => {
    const banded = measureLimit(new Float32Array([-1, -1, -1, -1]), 20);
    const summary = {
      alphabet: "Littlewood {−1, +1}",
      depth: 20,
      eps: 1e-5,
      annulus: false,
      reason: "the band.",
      shares: banded,
    };
    expect(limitLines(summary)[0].value).toBe("—");
    expect(limitLines(summary)[0].detail).toContain("all inside the excluded band");
    expect(describeLimit(summary)).not.toContain("of the walked area");
  });
});

describe("the per-degree table", () => {
  it("accumulates each degree separately, and the rows add up to the aggregate", () => {
    const totals = emptyTotals();
    addStats(totals, run(3), 3);
    addStats(totals, run(4), 4);
    addStats(totals, run(4), 4); // a degree can arrive in several chunks
    const rows = degreeRows(totals);
    expect(rows.map((r) => r.degree)).toEqual([3, 4]);
    let polys = 0;
    for (const [, c] of totals.byDegree) polys += c.polynomials;
    expect(polys).toBe(totals.polynomials);
    expect(totals.byDegree.get(4)?.polynomials).toBe(2 * run(4).polynomials);
  });

  it("shows the share FALLING row by row — the thing the aggregate hides", () => {
    // The header's own warning, made visible: "x% real" over degrees 1–16 is a mixture dominated by the
    // top degree, and only the rows show the share fall. Real roots PER POLYNOMIAL, by contrast, grows —
    // slowly, as the literature says it should (Erdős–Offord put it at O(log d)) — which is why the
    // table carries both columns.
    const totals = emptyTotals();
    for (const d of [4, 8, 12]) addStats(totals, run(d), d);
    const rows = degreeRows(totals);
    const share = rows.map((r) => Number.parseFloat(r.realShare));
    expect(share[0]).toBeGreaterThan(share[1]);
    expect(share[1]).toBeGreaterThan(share[2]);
    const perPoly = rows.map((r) => Number(r.realPerPolynomial));
    expect(perPoly[2]).toBeGreaterThan(perPoly[0]);
  });

  it("each column reads its own count, in degree order, and a degree that found nothing has no row", () => {
    // Hand-made stats, so every column has a DIFFERENT expected value and a column reading its
    // neighbour's count cannot pass. The sweep's survivors were exactly those: the circle share reading
    // the real count, the per-polynomial mean ignoring failed solves, the polynomial column printing
    // the root count, and the sort and the empty-row filter removed outright.
    const totals = emptyTotals();
    const s = (polynomials: number, roots: number, realRoots: number, nearCircle: number, nonConverged: number) =>
      ({ polynomials, roots, realRoots, nearCircle, nonConverged }) as never;
    addStats(totals, s(1000, 2000, 300, 700, 500), 4); // arrives FIRST, but is the higher degree; half failed
    addStats(totals, s(10, 0, 0, 0, 10), 3); // every solve failed: nothing painted, so no row
    addStats(totals, s(200, 400, 50, 100, 0), 2);
    const rows = degreeRows(totals);
    expect(rows.map((r) => r.degree)).toEqual([2, 4]);
    expect(rows[1]).toEqual({
      degree: 4,
      polynomials: "1,000",
      realShare: formatShare(300, 2000),
      circleShare: formatShare(700, 2000),
      realPerPolynomial: "0.600", // 300 real roots over the 500 polynomials that were SOLVED, not 1,000
    });
    expect(rows[1].circleShare).not.toBe(rows[1].realShare);
  });

  it("an un-tagged chunk still counts in the aggregate, and adds no row", () => {
    const totals = emptyTotals();
    addStats(totals, run(5));
    expect(totals.polynomials).toBe(run(5).polynomials);
    expect(degreeRows(totals)).toEqual([]);
  });
});
