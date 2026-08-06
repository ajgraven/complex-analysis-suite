// seedFromPolys + the Aharonov–Shapiro moment system (roadmap #5). Proves the flat, real-
// variable moment system from QE.pointFunctionalSystem is genuinely SEEDABLE and ANALYZABLE:
// seedFromPolys marks every variable real, so the store's reim transform passes the already-
// real system through (v→v__re) and classify/solveReal run correctly on it — the whole point
// being to expose the built-but-unwired moment generator as a usable one-click system.
import { describe, it, expect } from "vitest";
import _QD from "../app/solvers/solver.mjs";
import "../app/sym/sym-core.mjs";
import "../app/analysis/faber-analysis.mjs"; // Durand–Kerner used by the zero-dim solve
import "../app/qd/qd-equations.mjs";
import "../app/algebra/algebra-store.mjs";

const QE: any = (_QD as any).QDEquations;
const AS: any = (_QD as any).AlgebraStore;

describe("seedFromPolys — Aharonov–Shapiro moment system", () => {
  it("seeds the SYMBOLIC order-2 system; it classifies as positive-dimensional (moments free)", () => {
    const sys = QE.pointFunctionalSystem(null, { order: 2 }); // symbolic M0, m_p, n_p
    expect(sys.polys.length).toBeGreaterThan(0);
    const store = AS.create();
    const r = store.seedFromPolys({ polys: sys.polys, vars: sys.vars, model: "reim", formulation: "moment", labelPrefix: "A–S moment" });
    expect(r.ok).toBe(true);
    expect(store.list().length).toBe(sys.polys.length);
    const cl = store.classify();
    expect(cl.ok).toBe(true);
    expect(cl.zeroDim).toBe(false); // symbolic moments ⇒ underdetermined (pin the moments to determine a QD)
  });

  it("seeds with CONCRETE moments (cardioid: M0=3/2, M1=1/2) → zero-dim, and solve recovers w1=1, u2=1/2, v2=0", () => {
    const sys = QE.pointFunctionalSystem({ M0: 1.5, M1: 0.5 }, { order: 2 });
    const store = AS.create();
    store.seedFromPolys({ polys: sys.polys, vars: sys.vars });
    const cl = store.classify();
    expect(cl.ok).toBe(true);
    expect(cl.zeroDim).toBe(true); // 3 real equations, 3 real unknowns
    expect(cl.realCount).toBeGreaterThanOrEqual(1);
    const sol = store.solveReal();
    expect(sol.ok).toBe(true);
    // the cardioid coefficients (φ = t + ½t² ⇒ w1=1, w2=½) — reim-keyed as *__re
    const hit = (sol.solutions || []).some((s: any) =>
      Math.abs((s.w1__re ? s.w1__re.re : 99) - 1) < 1e-5 &&
      Math.abs((s.u2__re ? s.u2__re.re : 99) - 0.5) < 1e-5 &&
      Math.abs(s.v2__re ? s.v2__re.re : 99) < 1e-5);
    expect(hit).toBe(true);
  });
});
