// QD.Sym.parametricRealCount1D (roadmap #2b-1): the bifurcation of the #real solutions of a
// 1-parameter family as the parameter ranges over ℝ. Fully exact — a univariate eliminant f(u,t),
// its border polynomial reducedDisc_u(f)·lc_u(f), Sturm-isolated critical t-values, and a certified
// Hermite count on each open interval. Golden bifurcations with known answers.
import { describe, it, expect } from "vitest";
import _QD from "../app/solver.mjs";
import "../app/sym-core.mjs";

const S: any = (_QD as any).Sym;
const { MPoly, parametricRealCount1D } = S;
const V = (n: string) => MPoly.variable(n);
const I = (k: number) => MPoly.fromInt(k);
const counts = (r: any) => r.cells.map((c: any) => c.realCount);          // left → right
const crit = (r: any) => r.criticalValues.map((c: any) => c.approx).sort((a: number, b: number) => a - b);

describe("QD.Sym.parametricRealCount1D", () => {
  it("x² − t: 0 real for t<0, 2 real for t>0; one bifurcation at t=0", () => {
    const r = parametricRealCount1D([V("x").pow(2).sub(V("t"))], "t");
    expect(r.ok).toBe(true);
    expect(r.degree).toBe(2);
    expect(crit(r)).toEqual([0]);
    expect(counts(r)).toEqual([0, 2]);
    expect(r.crosschecked).toBe(true);
  });

  it("x³ − 3x − t (fold): 1 real for |t|>2, 3 real for |t|<2; bifurcations at t=±2", () => {
    const r = parametricRealCount1D([V("x").pow(3).sub(V("x").mul(I(3))).sub(V("t"))], "t");
    expect(r.ok).toBe(true);
    expect(r.degree).toBe(3);
    expect(crit(r)).toEqual([-2, 2]);
    expect(counts(r)).toEqual([1, 3, 1]);
    expect(r.crosschecked).toBe(true);
  });

  it("multivariate {x²+y²−t, x−y}: 0 real for t<0, 2 real for t>0", () => {
    const r = parametricRealCount1D([V("x").pow(2).add(V("y").pow(2)).sub(V("t")), V("x").sub(V("y"))], "t");
    expect(r.ok).toBe(true);
    expect(crit(r)).toEqual([0]);
    expect(counts(r)).toEqual([0, 2]);
    expect(r.crosschecked).toBe(true);
  });

  it("a quartic with two fold pairs (x²−t)(x²−t+3): 4 real for t>3, 2 for 0<t<3, 0 for t<0", () => {
    // roots ±√t and ±√(t−3): both real ⇒ 4 (t>3); only ±√t real ⇒ 2 (0<t<3); none ⇒ 0 (t<0).
    const p = V("x").pow(2).sub(V("t")).mul(V("x").pow(2).sub(V("t")).add(I(3)));
    const r = parametricRealCount1D([p], "t");
    expect(r.ok).toBe(true);
    expect(crit(r)).toEqual([0, 3]);
    expect(counts(r)).toEqual([0, 2, 4]);
    expect(r.crosschecked).toBe(true);
  });

  it("no bifurcation (x − t): exactly 1 real solution everywhere, no critical values", () => {
    const r = parametricRealCount1D([V("x").sub(V("t"))], "t");
    expect(r.ok).toBe(true);
    expect(r.criticalValues.length).toBe(0);
    expect(r.cells.length).toBe(1);
    expect(r.cells[0].realCount).toBe(1);
  });

  it("honest failures: unknown parameter, and no solve variables", () => {
    expect(parametricRealCount1D([V("x").pow(2).sub(V("t"))], "z").ok).toBe(false);
    expect(parametricRealCount1D([V("t").sub(I(1))], "t").ok).toBe(false);
  });
});
