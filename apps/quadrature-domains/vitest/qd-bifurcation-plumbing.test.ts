// The 1-parameter bifurcation plumbing (roadmap #2b-1b-1): the runJob('parametricRealCount1D')
// worker job + the store's parametricBifurcation. Guards that the result is JSON-safe (unbounded
// cell ends map to null, not ±Infinity) and that the store's reim path reaches the engine correctly.
import { describe, it, expect } from "vitest";
import _QD from "../app/solvers/solver.mjs";
import "../app/sym/sym-core.mjs";
import "../app/algebra/algebra-store.mjs";

const S: any = (_QD as any).Sym;
const AS: any = (_QD as any).AlgebraStore;
const { MPoly, runJob } = S;
const V = (n: string) => MPoly.variable(n);
const I = (k: number) => MPoly.fromInt(k);
const tl = (polys: any[]) => polys.map((p) => p.termList());
const counts = (r: any) => r.cells.map((c: any) => c.realCount);
const crit = (r: any) => r.criticalValues.map((c: any) => c.approx).sort((a: number, b: number) => a - b);

describe("bifurcation plumbing (#2b-1b-1)", () => {
  it("runJob: x²−t → JSON-safe, unbounded ends null, counts [0,2]", () => {
    const r = runJob("parametricRealCount1D", { polys: tl([V("x").pow(2).sub(V("t"))]), vars: ["x", "t"], paramVar: "t" });
    expect(r.ok).toBe(true);
    expect(crit(r)).toEqual([0]);
    expect(counts(r)).toEqual([0, 2]);
    expect(r.cells[0].lo).toBe(null);                    // −∞ → null
    expect(r.cells[r.cells.length - 1].hi).toBe(null);   // +∞ → null
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);    // no Infinity/NaN leaked
  });

  it("runJob: the fold x³−3x−t → counts [1,3,1] at t=±2", () => {
    const r = runJob("parametricRealCount1D", { polys: tl([V("x").pow(3).sub(V("x").mul(I(3))).sub(V("t"))]), vars: ["x", "t"], paramVar: "t" });
    expect(r.ok).toBe(true);
    expect(crit(r)).toEqual([-2, 2]);
    expect(counts(r)).toEqual([1, 3, 1]);
  });

  it("runJob: honest failure surfaces as { ok:false }", () => {
    const r = runJob("parametricRealCount1D", { polys: tl([V("t").sub(I(1))]), vars: ["t"], paramVar: "t" });
    expect(r.ok).toBe(false);
    expect(typeof r.reason).toBe("string");
  });

  it("store: parametricBifurcation on a seeded system (reim renames t→t__re) → counts [0,2]", () => {
    const store = AS.create();
    store.seedFromPolys({ polys: [V("x").pow(2).sub(V("t"))], vars: ["x", "t"] }); // marks x,t real
    const r = store.parametricBifurcation(null, "t__re");
    expect(r.ok).toBe(true);
    expect(crit(r)).toEqual([0]);
    expect(counts(r)).toEqual([0, 2]);
    expect(r.cells[0].lo).toBe(null);
    // guards: an unknown parameter fails honestly
    expect(store.parametricBifurcation(null, "nope").ok).toBe(false);
  });
});
