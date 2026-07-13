// QD.Sym.minimalPrimes (roadmap #12): the irreducible components (minimal primes) of V(⟨polys⟩) by
// factorizing Buchberger — split V(I)=⋃V(I+⟨fᵢ⟩) on each factoring basis element, radicalize principal
// leaves, prune by ideal containment. Components compared by their canonical reduced-Gröbner key.
import { describe, it, expect } from "vitest";
import _QD from "../app/solver.mjs";
import "../app/sym-core.mjs";

const S: any = (_QD as any).Sym;
const { MPoly, monomialOrder, buchberger, reduceGroebner, minimalPrimes } = S;
const V = (n: string) => MPoly.variable(n);
const I = (k: number) => MPoly.fromInt(k);
const iU = MPoly.constant(S.Gaussian.I);   // the imaginary unit as a constant poly

// canonical key of an ideal = its reduced Gröbner basis (unique per order), terms + polys sorted.
const canonPoly = (g: any) => g.termList()
  .map((t: any) => Object.entries(t.mono).sort().map((e: any) => e[0] + "^" + e[1]).join("*") + ":" + t.coeff.re.join("/") + "," + t.coeff.im.join("/"))
  .sort().join(" ");
const idealKey = (gens: any[], vars: string[]) => {
  const nz = gens.filter((g: any) => g && !g.isZero());
  if (!nz.length) return "(0)";
  const o = monomialOrder("grevlex", vars);
  return reduceGroebner(buchberger(nz, o), o).map(canonPoly).sort().join("|");
};
const primeKeys = (res: any, vars: string[]) => new Set(res.primes.map((G: any[]) => idealKey(G, vars)));
const expectKeys = (ideals: any[][], vars: string[]) => new Set(ideals.map((g) => idealKey(g, vars)));

describe("QD.Sym.minimalPrimes", () => {
  it("⟨xy⟩ → ⟨x⟩ ∩ ⟨y⟩ (two components)", () => {
    const r = minimalPrimes([V("x").mul(V("y"))], { vars: ["x", "y"] });
    expect(r.ok).toBe(true);
    expect(r.count).toBe(2);
    expect(r.complete).toBe(true);
    expect(primeKeys(r, ["x", "y"])).toEqual(expectKeys([[V("x")], [V("y")]], ["x", "y"]));
  });

  it("⟨xy, z⟩ → ⟨x,z⟩ ∩ ⟨y,z⟩ (multivariate ideal split via a variable-disjoint factor)", () => {
    const r = minimalPrimes([V("x").mul(V("y")), V("z")], { vars: ["x", "y", "z"] });
    expect(r.count).toBe(2);
    expect(r.complete).toBe(true);   // both components are linear ⇒ certified prime
    expect(primeKeys(r, ["x", "y", "z"])).toEqual(expectKeys([[V("x"), V("z")], [V("y"), V("z")]], ["x", "y", "z"]));
  });

  it("⟨xy, xz⟩ → ⟨x⟩ and ⟨y,z⟩ (containment prunes ⟨x,y⟩, ⟨x,z⟩)", () => {
    const r = minimalPrimes([V("x").mul(V("y")), V("x").mul(V("z"))], { vars: ["x", "y", "z"] });
    expect(r.count).toBe(2);
    expect(primeKeys(r, ["x", "y", "z"])).toEqual(expectKeys([[V("x")], [V("y"), V("z")]], ["x", "y", "z"]));
  });

  it("⟨x²⟩ → ⟨x⟩ (principal leaf radicalized)", () => {
    const r = minimalPrimes([V("x").pow(2)], { vars: ["x"] });
    expect(r.count).toBe(1);
    expect(primeKeys(r, ["x"])).toEqual(expectKeys([[V("x")]], ["x"]));
  });

  it("⟨x²−2⟩ is irreducible over ℚ(i) → a single component", () => {
    const r = minimalPrimes([V("x").pow(2).sub(I(2))], { vars: ["x"] });
    expect(r.count).toBe(1);
    expect(primeKeys(r, ["x"])).toEqual(expectKeys([[V("x").pow(2).sub(I(2))]], ["x"]));
  });

  it("⟨x²+y²⟩: the ℚ(i) factorizer is univariate/monomial only, so it can't split a bivariate — honest 1 uncertified component", () => {
    const r = minimalPrimes([V("x").pow(2).add(V("y").pow(2))], { vars: ["x", "y"] });
    expect(r.ok).toBe(true);
    expect(r.count).toBe(1);                                    // (x−iy)(x+iy) is invisible to the factorizer
    expect(r.complete).toBe(false);                            // ⇒ honestly NOT certified prime (it is reducible over ℂ)
    expect(primeKeys(r, ["x", "y"])).toEqual(expectKeys([[V("x").pow(2).add(V("y").pow(2))]], ["x", "y"]));
  });

  it("inconsistent ⟨x, x−1⟩ → no components (empty variety)", () => {
    const r = minimalPrimes([V("x"), V("x").sub(I(1))], { vars: ["x"] });
    expect(r.ok).toBe(true);
    expect(r.count).toBe(0);
  });

  it("the zero ideal → the whole space (one component ⟨0⟩)", () => {
    const r = minimalPrimes([], { vars: ["x", "y"] });
    expect(r.ok).toBe(true);
    expect(r.primes.length).toBe(1);
    expect(r.primes[0].length).toBe(0);
  });
});
