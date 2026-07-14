// =============================================================================
// qd-cas-export-guard — the CAS export's complex-coefficient guard (finding F5).
//
// The in-browser verdict analyzes the REIM (real-coefficient) system; Maple RealComprehensive/
// RealTriangularize decompose over ℝ. Exporting a conjugate-model column (independent z_j, z̄_j with
// COMPLEX ℚ(i) coefficients) to Maple makes its "real solutions" a DIFFERENT quantity than the QD count
// (a complex triangularization, not the real count). store.casColumn now prepends a warning header for a
// Maple export of a complex-coefficient column, and casColumnComplex lets the UI warn before copying.
import { describe, it, expect } from "vitest";
import _QD from "../app/solver.mjs";
import "../app/sym-core.mjs";
import "../app/qd-equations.mjs";
import "../app/algebra/cas-export.mjs";
import "../app/algebra/algebra-store.mjs";

const S: any = (_QD as any).Sym;
const AS: any = (_QD as any).AlgebraStore;
const V = (n: string) => S.mpolyVar(n);
const iUnit = () => S.mpolyConst(S.gaussInt(0, 1));

describe("store CAS export — F5 complex-coefficient guard", () => {
  it("flags a conjugate-model (complex ℚ(i)) column and warns in the Maple script", () => {
    const store = AS.create();
    store.seedFromPolys({ polys: [V("z1").add(iUnit().mul(V("zb1")))], vars: ["z1", "zb1"] }); // z1 + i·z̄1
    expect(store.casColumnComplex(store.maxColumn())).toBe(true);
    const script = store.casColumn(store.maxColumn(), "maple", {});
    expect(/WARNING/i.test(script)).toBe(true);
    expect(/COMPLEX|Q\(i\)/i.test(script)).toBe(true);
    expect(/real|reim/i.test(script)).toBe(true);
  });

  it("does NOT flag a real-coefficient column", () => {
    const store = AS.create();
    store.seedFromPolys({ polys: [V("x").sub(V("y"))], vars: ["x", "y"] });
    expect(store.casColumnComplex(store.maxColumn())).toBe(false);
    expect(/WARNING/i.test(store.casColumn(store.maxColumn(), "maple", {}))).toBe(false);
  });

  it("warns only for Maple (real decomposition), not the complex Gröbner cross-check dialects", () => {
    const store = AS.create();
    store.seedFromPolys({ polys: [V("z1").add(iUnit().mul(V("zb1")))], vars: ["z1", "zb1"] });
    expect(/WARNING/i.test(store.casColumn(store.maxColumn(), "singular", {}))).toBe(false);
  });
});
