// =============================================================================
// qd-triangular-initials — the store's triangular decomposition now surfaces the regular-chain
// INITIALS (finding B-3). A Wu chain is triangular but NOT saturated by its pivots' leading
// coefficients, so where a non-constant initial vanishes the chain may add spurious branches or
// miss components. store.triangularize now reports { initialCount, hasRegularityConditions } so
// the UI can show that caveat, instead of silently presenting the chain as a full decomposition.
import { describe, it, expect } from "vitest";
import _QD from "../app/solver.mjs";
import "../app/sym-core.mjs";
import "../app/qd-equations.mjs";
import "../app/algebra/algebra-store.mjs";

const S: any = (_QD as any).Sym;
const AS: any = (_QD as any).AlgebraStore;
const V = (n: string) => S.mpolyVar(n);
const one = () => S.mpolyConst(S.gaussInt(1, 0));

describe("store.triangularize — regular-chain initials (B-3)", () => {
  it("flags a NON-CONSTANT initial as a regularity condition (y·x − 1 ⇒ initial y)", () => {
    const store = AS.create();
    store.seedFromPolys({ polys: [V("y").mul(V("x")).sub(one())], vars: ["x", "y"] });
    const r = store.triangularize(store.currentColumnIds());
    expect(r.ok).toBe(true);
    expect(r.hasRegularityConditions).toBe(true);
    expect(r.initialCount).toBeGreaterThan(0);
  });

  it("a system with only constant pivot initials has NO regularity conditions (x − 1, y − 2)", () => {
    const store = AS.create();
    const two = S.mpolyConst(S.gaussInt(2, 0));
    store.seedFromPolys({ polys: [V("x").sub(one()), V("y").sub(two)], vars: ["x", "y"] });
    const r = store.triangularize(store.currentColumnIds());
    expect(r.ok).toBe(true);
    expect(r.hasRegularityConditions).toBe(false);
    expect(r.initialCount).toBe(0);
  });
});
