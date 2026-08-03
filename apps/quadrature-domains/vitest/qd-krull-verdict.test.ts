// The dimension/classify verdicts now surface the true Krull dimension (roadmap #11, building on
// #8) so a positive-dimensional family reports its actual free-parameter count, not just the
// ambient variable count. This guards the runJob worker-protocol threading (store + UI are thin
// passthroughs verified in-browser).
import { describe, it, expect } from "vitest";
import _QD from "../app/solvers/solver.mjs";
import "../app/sym/sym-core.mjs";

const S: any = (_QD as any).Sym;
const { MPoly, runJob } = S;
const V = (n: string) => MPoly.variable(n);
const I = (k: number) => MPoly.fromInt(k);
const tl = (polys: any[]) => polys.map((p) => p.termList());

describe("runJob dimension/classify surface the true Krull dimension (#11)", () => {
  it("dimension: zero-dim ⟨x²−1,y²−1⟩ → krullDim 0; positive-dim ⟨xy⟩ → krullDim 1", () => {
    const zd = runJob("dimension", { polys: tl([V("x").pow(2).sub(I(1)), V("y").pow(2).sub(I(1))]), vars: ["x", "y"] });
    expect(zd.zeroDim).toBe(true);
    expect(zd.dimension).toBe(4);   // solution count with multiplicity (unchanged meaning)
    expect(zd.krullDim).toBe(0);

    const pd = runJob("dimension", { polys: tl([V("x").mul(V("y"))]), vars: ["x", "y"] });
    expect(pd.zeroDim).toBe(false);
    expect(pd.dimension).toBe(null); // ∞ isn't JSON-cloneable (unchanged)
    expect(pd.krullDim).toBe(1);     // the free-parameter count
  });

  it("dimension: ⟨x⟩ in k[x,y,z] → krullDim 2 (the y,z plane is free)", () => {
    expect(runJob("dimension", { polys: tl([V("x")]), vars: ["x", "y", "z"] }).krullDim).toBe(2);
  });

  it("classify: a positive-dimensional system carries krullDim alongside numVars", () => {
    const r = runJob("classify", { polys: tl([V("x").mul(V("y"))]), vars: ["x", "y"] });
    expect(r.ok).toBe(true);
    expect(r.zeroDim).toBe(false);
    expect(r.numVars).toBe(2);
    expect(r.krullDim).toBe(1);
  });
});
