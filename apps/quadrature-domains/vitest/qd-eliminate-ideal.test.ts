// =============================================================================
// qd-eliminate-ideal — the store's pairwise "Eliminate" now uses the EXACT elimination ideal
// (finding B-2). The raw Sylvester resultant carries extraneous leading-coefficient factors —
// e.g. Res_x(yx+1, yx²−x) = 2y, but the system is INCONSISTENT (yx=−1 ⇒ x=0 ⇒ 0=−1), so the true
// elimination ideal is ⟨1⟩ and "y=0" is spurious. store.eliminate must return ⟨A,B⟩∩k[rest] (Gröbner),
// falling back to the resultant (flagged) only if the ideal computation is unavailable.
import { describe, it, expect } from "vitest";
import _QD from "../app/solvers/solver.mjs";
import "../app/sym/sym-core.mjs";
import "../app/qd/qd-equations.mjs";
import "../app/algebra/algebra-store.mjs";

const S: any = (_QD as any).Sym;
const AS: any = (_QD as any).AlgebraStore;
const one = () => S.mpolyConst(S.gaussInt(1, 0));
const V = (n: string) => S.mpolyVar(n);

describe("store.eliminate — exact elimination ideal (B-2)", () => {
  it("uses the elimination ideal by default (method 'ideal'); clean case {x=y, x=1} ⇒ ⟨y−1⟩", () => {
    const store = AS.create();
    store.seedFromPolys({ polys: [V("x").sub(V("y")), V("x").sub(one())], vars: ["x", "y"] });
    const ids = store.currentColumnIds();
    const r = store.eliminate(ids[0], ids[1], "x");
    expect(r.ok).toBe(true);
    expect(r.method).toBe("ideal");
    const g = (r.created || [r.node])[0].poly;   // the elimination ideal ⟨y−1⟩
    expect(g.vars().has("y")).toBe(true);
    expect(g.degreeIn("y")).toBe(1);
  });

  it("discards the extraneous factor the raw resultant would carry: {yx+1, yx²−x} ⇒ ⟨1⟩ (no spurious y)", () => {
    const yxp1 = V("y").mul(V("x")).add(one());
    const yx2mx = V("y").mul(V("x").pow(2)).sub(V("x"));
    // the raw resultant DOES carry the extraneous y (this is what we avoid)
    expect(S.resultant(yxp1, yx2mx, "x").vars().has("y")).toBe(true);

    const store = AS.create();
    store.seedFromPolys({ polys: [yxp1, yx2mx], vars: ["x", "y"] });
    const ids = store.currentColumnIds();
    const r = store.eliminate(ids[0], ids[1], "x");
    expect(r.ok).toBe(true);
    expect(r.method).toBe("ideal");
    // no generator carries the spurious y — the exact elimination ideal ⟨1⟩ is a nonzero constant
    const created = r.created || [r.node];
    expect(created.some((n: any) => n.poly.vars().has("y"))).toBe(false);
  });
});
