// QD.Sym ideal operations (roadmap #6): membership, elimination ideal, intersection,
// quotient/colon — the exact toolkit that rounds out saturate. Ideal equality is checked
// by the canonical REDUCED Gröbner basis over a fixed order (unique ⇒ byte-identical).
import { describe, it, expect } from "vitest";
import _QD from "../app/solvers/solver.mjs";
import "../app/sym/sym-core.mjs";

const S: any = (_QD as any).Sym;
const { MPoly, monomialOrder, buchberger, reduceGroebner, inIdeal, eliminationIdeal, idealIntersect, idealQuotient } = S;
const V = (n: string) => MPoly.variable(n);
const I = (k: number) => MPoly.fromInt(k);

// canonical per-poly string: terms sorted by monomial (termList() Map order isn't canonical),
// then the reduced-GB polys sorted — so the key is invariant to construction/term order.
const monoStr = (mono: any) => Object.entries(mono).sort((a: any, b: any) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([k, e]) => `${k}^${e}`).join("*");
const polyCanon = (g: any) => g.termList().map((t: any) => `${monoStr(t.mono)}:${t.coeff.re[0]}/${t.coeff.re[1]},${t.coeff.im[0]}/${t.coeff.im[1]}`).sort().join(" ");
function idealKey(gens: any[], vars: string[]): string {
  const nz = gens.filter((g: any) => g && !g.isZero());
  if (!nz.length) return "(0)";
  const ord = monomialOrder("grevlex", vars);
  return reduceGroebner(buchberger(nz, ord), ord).map(polyCanon).sort().join("|");
}
const sameIdeal = (A: any[], B: any[], vars: string[]) => idealKey(A, vars) === idealKey(B, vars);

describe("QD.Sym ideal operations", () => {
  it("inIdeal: membership tests", () => {
    expect(inIdeal(V("x").pow(2).add(V("y").pow(2)), [V("x"), V("y")])).toBe(true);   // x²+y² ∈ ⟨x,y⟩
    expect(inIdeal(I(1), [V("x"), V("y")])).toBe(false);                              // 1 ∉ ⟨x,y⟩
    expect(inIdeal(V("x").pow(4).sub(I(1)), [V("x").pow(2).sub(I(1))])).toBe(true);   // x⁴−1 ∈ ⟨x²−1⟩
    expect(inIdeal(V("x"), [V("x").pow(2)])).toBe(false);                             // x ∉ ⟨x²⟩
    expect(inIdeal(MPoly.zero(), [V("x")])).toBe(true);                               // 0 ∈ every ideal
  });

  it("eliminationIdeal: ⟨x−t, y−t²⟩ eliminate t = ⟨y − x²⟩ (the parabola)", () => {
    const elim = eliminationIdeal([V("x").sub(V("t")), V("y").sub(V("t").pow(2))], ["t"]);
    expect(elim.every((g: any) => !g.vars().has("t"))).toBe(true);
    expect(sameIdeal(elim, [V("y").sub(V("x").pow(2))], ["x", "y"])).toBe(true);
  });

  it("idealIntersect: ⟨x⟩ ∩ ⟨y⟩ = ⟨xy⟩; ⟨x²⟩ ∩ ⟨x⟩ = ⟨x²⟩", () => {
    expect(sameIdeal(idealIntersect([V("x")], [V("y")]), [V("x").mul(V("y"))], ["x", "y"])).toBe(true);
    expect(sameIdeal(idealIntersect([V("x").pow(2)], [V("x")]), [V("x").pow(2)], ["x"])).toBe(true);
  });

  it("idealQuotient (colon): ⟨xy⟩:x=⟨y⟩, ⟨x²⟩:x=⟨x⟩, ⟨x⟩:x=⟨1⟩, ⟨xy,xz⟩:⟨x⟩=⟨y,z⟩", () => {
    expect(sameIdeal(idealQuotient([V("x").mul(V("y"))], V("x")), [V("y")], ["x", "y"])).toBe(true);
    expect(sameIdeal(idealQuotient([V("x").pow(2)], V("x")), [V("x")], ["x"])).toBe(true);
    expect(sameIdeal(idealQuotient([V("x")], V("x")), [I(1)], ["x"])).toBe(true);     // whole ring
    expect(sameIdeal(idealQuotient([V("x").mul(V("y")), V("x").mul(V("z"))], [V("x")]), [V("y"), V("z")], ["x", "y", "z"])).toBe(true);
  });
});
