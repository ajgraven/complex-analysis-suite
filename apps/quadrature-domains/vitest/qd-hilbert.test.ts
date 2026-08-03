// QD.Sym Krull dimension + degree (roadmap #8): the moduli dimension of R/I from the
// leading-monomial (initial) ideal — dim = n − height, height = min variables hitting every
// generator's support. Golden dimensions on hand-verifiable ideals (points, curves, surfaces,
// coordinate-axis unions) + the zero-dim solution count as degree.
import { describe, it, expect } from "vitest";
import _QD from "../app/solvers/solver.mjs";
import "../app/sym/sym-core.mjs";

const S: any = (_QD as any).Sym;
const { MPoly, monomialOrder, buchberger, krullDimension, dimensionDegree } = S;
const V = (n: string) => MPoly.variable(n);
const I = (k: number) => MPoly.fromInt(k);
const GB = (gens: any[], vars: string[]) => buchberger(gens, monomialOrder("grevlex", vars));
const dim = (gens: any[], vars: string[]) =>
  krullDimension(GB(gens, vars), monomialOrder("grevlex", vars), vars);

describe("QD.Sym Krull dimension", () => {
  it("zero-dimensional: ⟨x²−1, y²−1⟩ → dim 0 (four points)", () => {
    expect(dim([V("x").pow(2).sub(I(1)), V("y").pow(2).sub(I(1))], ["x", "y"])).toBe(0);
  });

  it("plane curve: ⟨xy⟩ → dim 1", () => {
    expect(dim([V("x").mul(V("y"))], ["x", "y"])).toBe(1);
  });

  it("hypersurface: ⟨xyz⟩ in k[x,y,z] → dim 2 (three coordinate planes)", () => {
    expect(dim([V("x").mul(V("y")).mul(V("z"))], ["x", "y", "z"])).toBe(2);
  });

  it("three coordinate axes: ⟨xy, yz, xz⟩ → dim 1", () => {
    expect(dim([V("x").mul(V("y")), V("y").mul(V("z")), V("x").mul(V("z"))], ["x", "y", "z"])).toBe(1);
  });

  it("parametrized curve: ⟨x−t, y−t²⟩ → dim 1 (the parabola, one free parameter)", () => {
    expect(dim([V("x").sub(V("t")), V("y").sub(V("t").pow(2))], ["t", "x", "y"])).toBe(1);
  });

  it("twisted cubic ⟨y−x², z−x³⟩ → dim 1", () => {
    expect(dim([V("y").sub(V("x").pow(2)), V("z").sub(V("x").pow(3))], ["x", "y", "z"])).toBe(1);
  });

  it("whole ring ⟨x, x−1⟩ = (1) → dim −1 (empty variety)", () => {
    expect(dim([V("x"), V("x").sub(I(1))], ["x", "y"])).toBe(-1);
  });

  it("zero ideal (0) → dim n (all of affine space)", () => {
    expect(krullDimension([], monomialOrder("grevlex", ["x", "y"]), ["x", "y"])).toBe(2);
  });
});

describe("QD.Sym dimensionDegree", () => {
  it("zero-dim reports the solution count as degree: ⟨x²−1, y²−1⟩ → { 0, 4 }", () => {
    const ord = monomialOrder("grevlex", ["x", "y"]);
    const g = GB([V("x").pow(2).sub(I(1)), V("y").pow(2).sub(I(1))], ["x", "y"]);
    expect(dimensionDegree(g, ord, ["x", "y"])).toEqual({ dimension: 0, degree: 4 });
  });

  it("positive-dim leaves degree null (Hilbert-series follow-on): ⟨xy⟩ → { 1, null }", () => {
    const ord = monomialOrder("grevlex", ["x", "y"]);
    const g = GB([V("x").mul(V("y"))], ["x", "y"]);
    expect(dimensionDegree(g, ord, ["x", "y"])).toEqual({ dimension: 1, degree: null });
  });
});
