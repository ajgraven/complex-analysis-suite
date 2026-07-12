// The store's certified real solve (roadmap #2a-2): solveRealCertifiedSync runs the reim system
// through QD.Sym.solveRealCertified (RUR + exact Sturm) and serializes it. This is what
// doCertifyUnivalence feeds its existence/uniqueness verdict — the certified count matches the
// Hermite real count by construction, so a clustered-root undercount can't sneak into the verdict.
import { describe, it, expect } from "vitest";
import _QD from "../app/solver.mjs";
import "../app/sym-core.mjs";
import "../app/faber-analysis.mjs";
import "../app/qd-equations.mjs";
import "../app/algebra/algebra-store.mjs";

const QE: any = (_QD as any).QDEquations;
const AS: any = (_QD as any).AlgebraStore;

describe("store solveRealCertified (#2a-2)", () => {
  it("certified solve on the cardioid moment system: count = Hermite count, recovers w1=1,u2=½,v2=0", () => {
    const sys = QE.pointFunctionalSystem({ M0: 1.5, M1: 0.5 }, { order: 2 }); // cardioid: M0=3/2, M1=1/2
    const store = AS.create();
    store.seedFromPolys({ polys: sys.polys, vars: sys.vars });
    const cl = store.classify();
    expect(cl.zeroDim).toBe(true);

    const sol = store.solveRealCertifiedSync();
    expect(sol.ok).toBe(true);
    expect(sol.certified).toBe(true);
    expect(sol.count).toBe(cl.realCount);            // the certified count == the Hermite real count

    // the cardioid coefficients live among the certified boxes (numeric box midpoints)
    const hit = sol.solutions.some((s: any) =>
      Math.abs((s.w1__re ? s.w1__re.re : 99) - 1) < 1e-5 &&
      Math.abs((s.u2__re ? s.u2__re.re : 99) - 0.5) < 1e-5 &&
      Math.abs(s.v2__re ? s.v2__re.re : 99) < 1e-5);
    expect(hit).toBe(true);

    // every coordinate carries its rigorous box; the reported midpoint lies inside it; JSON-safe
    for (const s of sol.solutions) for (const v of Object.keys(s)) {
      expect(typeof s[v].reLo).toBe("number");
      expect(s[v].reLo <= s[v].re && s[v].re <= s[v].reHi).toBe(true);
    }
    expect(JSON.parse(JSON.stringify(sol))).toEqual(sol);
  });
});
