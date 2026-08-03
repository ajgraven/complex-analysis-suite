// QD.Sym.curveGenus (roadmap #15): geometric genus + rationality of a plane curve f(x,y)=0, via an
// EXACT projective smoothness test (homogenize; smooth ⟺ the Jacobian ideal ⟨Fx,Fy,Fz⟩ is
// zero-dimensional). Smooth ⇒ genus = (d−1)(d−2)/2 exact; line/conic ⇒ rational; singular ⇒ genus null
// (arith genus is an upper bound), the exact singular genus / parametrization deferred to Puiseux.
import { describe, it, expect } from "vitest";
import _QD from "../app/solvers/solver.mjs";
import "../app/sym/sym-core.mjs";

const S: any = (_QD as any).Sym;
const { MPoly, curveGenus } = S;
const V = (n: string) => MPoly.variable(n);
const I = (k: number) => MPoly.fromInt(k);
const x = V("x"), y = V("y");

describe("QD.Sym.curveGenus", () => {
  it("a line x = 0 → genus 0, rational", () => {
    const r = curveGenus(x, "x", "y");
    expect(r.ok).toBe(true);
    expect(r.degree).toBe(1);
    expect(r.arithmeticGenus).toBe(0);
    expect(r.genus).toBe(0);
    expect(r.rational).toBe(true);
  });

  it("a smooth conic x²+y²−1 → genus 0, rational, smooth", () => {
    const r = curveGenus(x.pow(2).add(y.pow(2)).sub(I(1)), "x", "y");
    expect(r.smooth).toBe(true);
    expect(r.genus).toBe(0);
    expect(r.rational).toBe(true);
  });

  it("a smooth (elliptic) cubic y²−x³+x → genus 1, NOT rational", () => {
    const r = curveGenus(y.pow(2).sub(x.pow(3)).add(x), "x", "y");
    expect(r.smooth).toBe(true);
    expect(r.arithmeticGenus).toBe(1);
    expect(r.genus).toBe(1);
    expect(r.rational).toBe(false);
  });

  it("a smooth Fermat quartic x⁴+y⁴−1 → genus 3, NOT rational", () => {
    const r = curveGenus(x.pow(4).add(y.pow(4)).sub(I(1)), "x", "y");
    expect(r.smooth).toBe(true);
    expect(r.degree).toBe(4);
    expect(r.arithmeticGenus).toBe(3);
    expect(r.genus).toBe(3);
    expect(r.rational).toBe(false);
  });

  it("a nodal cubic y²−x³−x² → SINGULAR, genus null (arith-genus upper bound 1)", () => {
    const r = curveGenus(y.pow(2).sub(x.pow(3)).sub(x.pow(2)), "x", "y");
    expect(r.singular).toBe(true);
    expect(r.arithmeticGenus).toBe(1);
    expect(r.genus).toBe(null);
    expect(r.rational).toBe(null);
  });

  it("a cuspidal cubic y²−x³ → SINGULAR (cusp), genus null", () => {
    const r = curveGenus(y.pow(2).sub(x.pow(3)), "x", "y");
    expect(r.singular).toBe(true);
    expect(r.genus).toBe(null);
  });

  it("reports absolute irreducibility (roadmap #19): smooth curves are irreducible", () => {
    expect(curveGenus(x.pow(2).add(y.pow(2)).sub(I(1)), "x", "y").irreducible).toBe(true);   // conic
    expect(curveGenus(y.pow(2).sub(x.pow(3)).add(x), "x", "y").irreducible).toBe(true);       // elliptic cubic
    expect(curveGenus(x, "x", "y").irreducible).toBe(true);                                    // a line
  });

  it("an absolutely REDUCIBLE curve x²−y² (two lines) → irreducible:false, genus null", () => {
    const r = curveGenus(x.pow(2).sub(y.pow(2)), "x", "y");
    expect(r.ok).toBe(true);
    expect(r.irreducible).toBe(false);
    expect(r.genus).toBe(null);
    expect(r.rational).toBe(null);
  });

  it("honest failures: an extra variable, and a constant", () => {
    expect(curveGenus(x.add(y).add(V("z")), "x", "y").ok).toBe(false);
    expect(curveGenus(I(3), "x", "y").ok).toBe(false);
  });
});
