// QD.Sym.triangularDecomposition (roadmap #13): decompose V(⟨polys⟩) into REGULAR CHAINS (triangular
// sets, one per irreducible component via #12's minimalPrimes + triangularize), whose zero sets union
// to V(I). Each chain is triangular (distinct main variables) and solvable by back-substitution.
import { describe, it, expect } from "vitest";
import _QD from "../app/solvers/solver.mjs";
import "../app/sym/sym-core.mjs";

const S: any = (_QD as any).Sym;
const { MPoly, monomialOrder, buchberger, reduceGroebner, triangularDecomposition } = S;
const V = (n: string) => MPoly.variable(n);
const I = (k: number) => MPoly.fromInt(k);

const canonPoly = (g: any) => g.termList()
  .map((t: any) => Object.entries(t.mono).sort().map((e: any) => e[0] + "^" + e[1]).join("*") + ":" + t.coeff.re.join("/") + "," + t.coeff.im.join("/"))
  .sort().join(" ");
const idealKey = (gens: any[], vars: string[]) => {
  const nz = gens.filter((g: any) => g && !g.isZero());
  if (!nz.length) return "(0)";
  const o = monomialOrder("grevlex", vars);
  return reduceGroebner(buchberger(nz, o), o).map(canonPoly).sort().join("|");
};
const chainKeys = (res: any, vars: string[]) => new Set(res.chains.map((c: any) => idealKey(c.chain, vars)));
const expectKeys = (ideals: any[][], vars: string[]) => new Set(ideals.map((g) => idealKey(g, vars)));
const isTriangular = (c: any) => new Set(c.mainVars).size === c.mainVars.length && c.chain.length === c.mainVars.length;

describe("QD.Sym.triangularDecomposition", () => {
  it("⟨xy⟩ → two chains ⟨x⟩, ⟨y⟩ (each a triangular set)", () => {
    const r = triangularDecomposition([V("x").mul(V("y"))], { vars: ["x", "y"] });
    expect(r.ok).toBe(true);
    expect(r.count).toBe(2);
    expect(r.complete).toBe(true);
    expect(chainKeys(r, ["x", "y"])).toEqual(expectKeys([[V("x")], [V("y")]], ["x", "y"]));
    expect(r.chains.every(isTriangular)).toBe(true);
  });

  it("⟨xy, z⟩ → chains ⟨x,z⟩ and ⟨y,z⟩", () => {
    const r = triangularDecomposition([V("x").mul(V("y")), V("z")], { vars: ["x", "y", "z"] });
    expect(r.count).toBe(2);
    expect(chainKeys(r, ["x", "y", "z"])).toEqual(expectKeys([[V("x"), V("z")], [V("y"), V("z")]], ["x", "y", "z"]));
    expect(r.chains.every(isTriangular)).toBe(true);
  });

  it("⟨x²−2⟩ → a single chain ⟨x²−2⟩", () => {
    const r = triangularDecomposition([V("x").pow(2).sub(I(2))], { vars: ["x"] });
    expect(r.count).toBe(1);
    expect(chainKeys(r, ["x"])).toEqual(expectKeys([[V("x").pow(2).sub(I(2))]], ["x"]));
  });

  it("solvable golden ⟨x²−x−1, y−x²⟩ → one triangular chain (x-poly then y-poly)", () => {
    const sys = [V("x").pow(2).sub(V("x")).sub(I(1)), V("y").sub(V("x").pow(2))];
    const r = triangularDecomposition(sys, { vars: ["x", "y"] });
    expect(r.ok).toBe(true);
    expect(r.count).toBe(1);
    const c = r.chains[0];
    expect(isTriangular(c)).toBe(true);
    expect(new Set(c.mainVars)).toEqual(new Set(["x", "y"]));           // one equation per variable
    expect(idealKey(c.chain, ["x", "y"])).toBe(idealKey(sys, ["x", "y"])); // the chain generates the (prime) ideal
  });

  it("inconsistent ⟨x, x−1⟩ → no chains (empty variety)", () => {
    const r = triangularDecomposition([V("x"), V("x").sub(I(1))], { vars: ["x"] });
    expect(r.ok).toBe(true);
    expect(r.count).toBe(0);
  });

  it("the zero ideal → one whole-space chain (no equations, all variables free)", () => {
    const r = triangularDecomposition([], { vars: ["x", "y"] });
    expect(r.ok).toBe(true);
    expect(r.count).toBe(1);
    expect(r.chains[0].chain.length).toBe(0);
    expect(r.chains[0].whole).toBe(true);
    expect(new Set(r.chains[0].freeVars)).toEqual(new Set(["x", "y"]));
  });
});
