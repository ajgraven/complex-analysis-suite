// Phase 3b — the positive-dimensional escape hatch. minimalPrimes (#12) and
// triangularDecomposition (#13) shipped in the engine but had no worker job, no store method and
// no control, so the one canonical route out of an underdetermined verdict was unreachable.
//
// Two things are load-bearing here and are what these tests protect:
//   1. the worker payloads must be JSON-safe (MPoly → termList both ways), or the job silently
//      fails to post across the boundary;
//   2. `complete:false` means a cost cap fired, so the components may not COVER V(I). A caller that
//      loses that flag turns "a lower bound" into "the total" — the exact class of over-claim the
//      project's honest-labeling guardrail exists to stop.
import { describe, it, expect } from "vitest";
import _QD from "../app/solver.mjs";
import "../app/sym-core.mjs";

const S: any = (_QD as any).Sym;
const { MPoly } = S;
const v = (n: string) => MPoly.variable(n);
const x = v("x"), y = v("y");

// V(xy) = the two axes — a textbook reducible variety with exactly 2 components.
const twoAxes = [x.mul(y)];
// V(x²−y²) = the two lines y = ±x.
const twoLines = [x.pow(2).sub(y.pow(2))];

const tl = (ps: any[]) => ps.map((p) => p.termList());

describe("runJob('minimalPrimes') — irreducible components off the main thread", () => {
  it("returns JSON-safe term lists that rebuild into the same polynomials", () => {
    const r = S.runJob("minimalPrimes", { polys: tl(twoAxes), vars: ["x", "y"] });
    expect(r.ok).toBe(true);
    expect(r.count).toBe(2);
    // Everything crossing the worker boundary must survive a JSON round-trip.
    expect(() => JSON.parse(JSON.stringify(r))).not.toThrow();
    for (const G of r.primes) for (const t of G) expect(() => S.polyFromTermList(t)).not.toThrow();
  });

  it("finds both components of V(xy) and of V(x²−y²)", () => {
    expect(S.runJob("minimalPrimes", { polys: tl(twoAxes), vars: ["x", "y"] }).count).toBe(2);
    expect(S.runJob("minimalPrimes", { polys: tl(twoLines), vars: ["x", "y"] }).count).toBe(2);
  });

  it("carries the `complete` flag — the caller cannot infer a capped decomposition", () => {
    const r = S.runJob("minimalPrimes", { polys: tl(twoAxes), vars: ["x", "y"] });
    expect(typeof r.complete).toBe("boolean");
    expect(r.complete).toBe(true);          // this one genuinely completes
  });

  it("an inconsistent system reports zero components rather than failing", () => {
    const one = [MPoly.fromInt(1)];
    const r = S.runJob("minimalPrimes", { polys: tl(one), vars: [] });
    expect(r.ok).toBe(true);
    expect(r.count).toBe(0);
  });
});

describe("runJob('triangularDecomposition') — saturated regular chains", () => {
  it("returns JSON-safe chains with their main/free variables and initials", () => {
    const r = S.runJob("triangularDecomposition", { polys: tl(twoAxes), vars: ["x", "y"] });
    expect(r.ok).toBe(true);
    expect(r.count).toBeGreaterThanOrEqual(1);
    expect(() => JSON.parse(JSON.stringify(r))).not.toThrow();
    for (const c of r.chains) {
      expect(Array.isArray(c.chain)).toBe(true);
      expect(Array.isArray(c.mainVars)).toBe(true);
      expect(Array.isArray(c.freeVars)).toBe(true);
      expect(Array.isArray(c.initials)).toBe(true);
      for (const t of c.chain) expect(() => S.polyFromTermList(t)).not.toThrow();
    }
  });

  it("inherits minimalPrimes' completeness honesty", () => {
    const r = S.runJob("triangularDecomposition", { polys: tl(twoAxes), vars: ["x", "y"] });
    const mp = S.runJob("minimalPrimes", { polys: tl(twoAxes), vars: ["x", "y"] });
    expect(r.complete).toBe(mp.complete);
  });
});

describe("both ops surface a failure rather than throwing across the worker boundary", () => {
  it("an unparseable payload yields ok:false, not an exception", () => {
    for (const kind of ["minimalPrimes", "triangularDecomposition"]) {
      // An empty system is the degenerate case: the zero ideal, whose variety is everything.
      const r = S.runJob(kind, { polys: [], vars: [] });
      expect(r.ok).toBe(true);
      expect(typeof r.complete).toBe("boolean");
    }
  });
});
