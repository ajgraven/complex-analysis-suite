// QD.Sym.discriminantVariety (roadmap #2b-2a / #14): the bifurcation set of a family in PARAMETER
// space — the locus where the #real solutions changes, as an exact polynomial equation (a curve /
// surface for ≥2 parameters). Fully exact: a separating eliminant f(u,p) + reducedDisc_u(f)·lc_u(f).
import { describe, it, expect } from "vitest";
import _QD from "../app/solver.mjs";
import "../app/sym-core.mjs";

const S: any = (_QD as any).Sym;
const { MPoly, discriminantVariety } = S;
const V = (n: string) => MPoly.variable(n);
const I = (k: number) => MPoly.fromInt(k);
// evalComplex wants each variable as a complex { re, im } — wrap the real test points.
const cx = (env: any) => { const o: any = {}; for (const k of Object.keys(env)) o[k] = { re: env[k], im: 0 }; return o; };
const on = (poly: any, env: any) => { const z = poly.evalComplex(cx(env)); return Math.abs(z.re) < 1e-9 && Math.abs(z.im) < 1e-9; };
const varsOf = (g: any) => [...g.vars()].sort();

describe("QD.Sym.discriminantVariety", () => {
  it("m=1: x² − p → boundary ∝ p (vanishes at p=0, not elsewhere), 1 component", () => {
    const r = discriminantVariety([V("x").pow(2).sub(V("p"))], ["p"]);
    expect(r.ok).toBe(true);
    expect(r.degree).toBe(2);
    expect(on(r.boundary, { p: 0 })).toBe(true);
    expect(on(r.boundary, { p: 5 })).toBe(false);
    expect(r.components.length).toBe(1);
    expect(varsOf(r.components[0])).toEqual(["p"]);
  });

  it("m=2: x² − p·q → boundary = the two axes {p=0} ∪ {q=0}", () => {
    const r = discriminantVariety([V("x").pow(2).sub(V("p").mul(V("q")))], ["p", "q"]);
    expect(r.ok).toBe(true);
    // vanishes on both axes, not off them
    expect(on(r.boundary, { p: 0, q: 5 })).toBe(true);
    expect(on(r.boundary, { p: 7, q: 0 })).toBe(true);
    expect(on(r.boundary, { p: 2, q: 3 })).toBe(false);
    // two irreducible components: the p-axis and the q-axis
    expect(r.components.length).toBe(2);
    expect(r.components.map(varsOf).sort()).toEqual([["p"], ["q"]]);
  });

  it("m=2 cusp: x³ − 3s·x − t → boundary = the cusp curve 4s³ − t²", () => {
    const r = discriminantVariety([V("x").pow(3).sub(V("x").mul(V("s")).mul(I(3))).sub(V("t"))], ["s", "t"]);
    expect(r.ok).toBe(true);
    expect(r.degree).toBe(3);
    // the semicubical (cusp) curve t² = 4s³: on it at (1,±2), (4,±16), (0,0); off it at (1,3)
    expect(on(r.boundary, { s: 1, t: 2 })).toBe(true);
    expect(on(r.boundary, { s: 1, t: -2 })).toBe(true);
    expect(on(r.boundary, { s: 4, t: 16 })).toBe(true);
    expect(on(r.boundary, { s: 0, t: 0 })).toBe(true);
    expect(on(r.boundary, { s: 1, t: 3 })).toBe(false);
    // the cusp curve is irreducible over ℚ(i)
    expect(r.components.length).toBe(1);
    expect(varsOf(r.components[0])).toEqual(["s", "t"]);
  });

  it("no boundary (x − p): the count never changes → boundary = 1, no components", () => {
    const r = discriminantVariety([V("x").sub(V("p"))], ["p"]);
    expect(r.ok).toBe(true);
    expect(r.components.length).toBe(0);
    expect(r.strata.doubleRoot).toBe(null);
    expect(r.strata.escapeToInfinity).toBe(null);
  });

  it("escape-to-∞ stratum: p·x − 1 → boundary ∝ p (the lc-vanishing locus)", () => {
    const r = discriminantVariety([V("p").mul(V("x")).sub(I(1))], ["p"]);
    expect(r.ok).toBe(true);
    expect(on(r.boundary, { p: 0 })).toBe(true);   // at p=0 the solution x=1/p escapes to ∞
    expect(on(r.boundary, { p: 3 })).toBe(false);
    expect(r.strata.escapeToInfinity).not.toBe(null);
  });

  it("honest failures: no parameters, unknown parameter, no solve variables", () => {
    expect(discriminantVariety([V("x").pow(2).sub(V("p"))], []).ok).toBe(false);
    expect(discriminantVariety([V("x").pow(2).sub(V("p"))], ["z"]).ok).toBe(false);
    expect(discriminantVariety([V("p").pow(2).sub(I(1))], ["p"]).ok).toBe(false);
  });
});
