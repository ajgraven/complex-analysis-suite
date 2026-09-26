import { describe, it, expect } from "vitest";
import { planScrub } from "../src/engine/scrub";
import { emptyTotals, addStats, totalsFor } from "../src/stats";

const held = (key: string, ...degrees: number[]) => ({ key, complete: new Set(degrees) });
const range = (lo: number, hi: number) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);

describe("the degree scrub sweeps only what the stage does not hold", () => {
  it("sweeps fresh when nothing is held, or the key changed", () => {
    expect(planScrub(null, "k", 1, 16)).toEqual({ kind: "fresh", lo: 1, hi: 16 });
    expect(planScrub(held("other", ...range(1, 16)), "k", 1, 16)).toEqual({ kind: "fresh", lo: 1, hi: 16 });
  });

  it("widening sweeps the new degree alone", () => {
    const p = planScrub(held("k", ...range(1, 16)), "k", 1, 17);
    expect(p).toEqual({ kind: "extend", keep: new Set(range(1, 16)), sweep: true, lo: 17, hi: 17 });
  });

  it("widening downward sweeps the new low degrees alone", () => {
    const p = planScrub(held("k", ...range(8, 16)), "k", 5, 16);
    expect(p).toEqual({ kind: "extend", keep: new Set(range(8, 16)), sweep: true, lo: 5, hi: 7 });
  });

  it("narrowing sweeps nothing, and keeps only the new range", () => {
    const p = planScrub(held("k", ...range(1, 16)), "k", 3, 12);
    expect(p).toEqual({ kind: "extend", keep: new Set(range(3, 12)), sweep: false });
  });

  it("re-sweeps a degree a cancelled sweep left partial, rather than topping it up", () => {
    // 1–16 finished; the reader moved to 17 and on to 18 before 17 did. 17 is not complete, so it is
    // swept again from scratch — and not kept, so its partial layer is dropped first.
    const p = planScrub(held("k", ...range(1, 16)), "k", 1, 18);
    expect(p).toMatchObject({ kind: "extend", sweep: true, lo: 17, hi: 18 });
    if (p.kind === "extend") expect(p.keep.has(17)).toBe(false);
  });

  it("sweeps fresh when BOTH ends open — one contiguous job, not two", () => {
    expect(planScrub(held("k", ...range(5, 10)), "k", 3, 12)).toEqual({ kind: "fresh", lo: 3, hi: 12 });
  });
});

describe("totalsFor", () => {
  it("is the exact sum of the kept rows", () => {
    const t = emptyTotals();
    for (const d of [3, 4, 5]) addStats(t, { polynomials: d, roots: 10 * d, realRoots: d, nearCircle: 2 * d, nonConverged: d === 5 ? 1 : 0 }, d);
    const kept = totalsFor(t, (d) => d !== 4);
    expect(kept.polynomials).toBe(8);
    expect(kept.roots).toBe(80);
    expect(kept.realRoots).toBe(8);
    expect(kept.nearCircle).toBe(16);
    expect(kept.nonConverged).toBe(1);
    expect([...kept.byDegree.keys()].sort()).toEqual([3, 5]);
    expect(kept.byDegree.get(5)).toEqual(t.byDegree.get(5));
  });
});
