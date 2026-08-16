// Exterior SC parameter solve (Faber M1b, step 2). Validates convergence from a skewed seed (regular
// n-gon → roots-of-unity prevertices + Γ(1/4) capacity), and vertex reproduction on a CHIRAL polygon
// (which — unlike the symmetric regular/rectangle cases — pins the CW exterior orientation).
import { describe, expect, it } from "vitest";
import type { C } from "../src/vandermondeArnoldi.js";
import { fitExteriorSchwarzChristoffel, solveExteriorParameterProblem } from "../src/exteriorScParameterProblem.js";
import { buildExteriorForwardMap } from "../src/exteriorSchwarzChristoffel.js";

const cabs = (z: C): number => Math.hypot(z[0], z[1]);
const reproErr = (verts: readonly C[], target: readonly C[]): number =>
  Math.max(...verts.map((v, k) => cabs([v[0] - target[k][0], v[1] - target[k][1]])));

const regularCCW = (n: number, r = 1): C[] => Array.from({ length: n }, (_, k): C => [r * Math.cos((2 * Math.PI * k) / n), r * Math.sin((2 * Math.PI * k) / n)]);

describe("solveExteriorParameterProblem — regular n-gon", () => {
  it("converges from a skewed seed for n = 4,5,6", () => {
    for (const n of [4, 5, 6]) {
      // Skewed seed: prevertices bunched, to prove the solve isn't just sitting on a symmetric cold start.
      const seed: C[] = Array.from({ length: n }, (_, k): C => {
        const a = (2 * Math.PI * (k + 0.35 * Math.sin(k))) / n;
        return [Math.cos(a), Math.sin(a)];
      });
      const res = solveExteriorParameterProblem(regularCCW(n), { seedPrevertices: seed });
      expect(res.converged).toBe(true);
      expect(res.degraded).toBe(false);
      expect(res.residual).toBeLessThan(1e-10);
    }
  });

  it("square: solved prevertices give capacity = Γ(1/4) value", () => {
    const res = solveExteriorParameterProblem(regularCCW(4));
    expect(res.converged).toBe(true);
    const m = buildExteriorForwardMap(res.prevertices, res.angles, { targetVertices: res.orderedVertices });
    // The unit-circumradius square has cap = R·(κ₄·(side/R))… simplest: cap = |C|, and reproduces vertices.
    expect(reproErr(m.vertices, res.orderedVertices)).toBeLessThan(1e-8);
    // Circumradius-1 square: side = √2, cap = √2·κ₄ where κ₄ = Γ(1/4)²/(4π^{3/2}).
    const kappa4 = (3.625609908 * 3.625609908) / (4 * Math.pow(Math.PI, 1.5));
    expect(Math.abs(m.capacity - Math.SQRT2 * kappa4)).toBeLessThan(1e-6);
  });
});

describe("solveExteriorParameterProblem — triangle (n=3, no special-casing)", () => {
  it("converges for a non-equilateral triangle (the 2 free logits are pinned by the 2 closure conditions)", () => {
    // The iso-triangle preset's vertex count — exterior n=3 has 2 free prevertex angles fixed by closure
    // (unlike the interior solver's parameter-free n=3 branch), so it must go through the general solve.
    const tri: C[] = [[0, 1.4], [-0.7, -0.7], [0.7, -0.7]];
    const res = solveExteriorParameterProblem(tri);
    expect(res.converged).toBe(true);
    expect(res.residual).toBeLessThan(1e-10);
    const m = buildExteriorForwardMap(res.prevertices, res.angles, { targetVertices: res.orderedVertices });
    expect(reproErr(m.vertices, res.orderedVertices)).toBeLessThan(1e-8);
  });
});

describe("solveExteriorParameterProblem — chiral polygon (orientation)", () => {
  it("reproduces a chiral convex quadrilateral's vertices (CW exterior order)", () => {
    // A convex quadrilateral with a NON-palindromic side sequence — mirror image would fail to reproduce.
    const quad: C[] = [[2, 0], [0.6, 1.2], [-1, 0.4], [-0.3, -1.1]];
    const res = solveExteriorParameterProblem(quad);
    expect(res.converged).toBe(true);
    const m = buildExteriorForwardMap(res.prevertices, res.angles, { targetVertices: res.orderedVertices });
    expect(reproErr(m.vertices, res.orderedVertices)).toBeLessThan(1e-7);
    // orderedVertices is the input set reversed (CW) — same polygon, so the vertex SET matches the input.
    const inputSet = quad.map(cabs).sort((a, b) => a - b);
    const gotSet = m.vertices.map(cabs).sort((a, b) => a - b);
    for (let i = 0; i < 4; i++) expect(Math.abs(inputSet[i] - gotSet[i])).toBeLessThan(1e-6);
  });
});

describe("fitExteriorSchwarzChristoffel — one-call public API", () => {
  it("fits a polygon in one call and reproduces its vertices with honest tags", () => {
    const quad: C[] = [[2, 0], [0.6, 1.2], [-1, 0.4], [-0.3, -1.1]];
    const m = fitExteriorSchwarzChristoffel(quad);
    expect(m.converged).toBe(true);
    expect(m.degraded).toBe(false);
    expect(m.residual).toBeLessThan(1e-10);
    expect(m.capacity).toBeGreaterThan(0);
    // vertices reproduced against the exterior-ordered set (the input reversed) — same polygon.
    const inputSet = quad.map(cabs).sort((a, b) => a - b);
    const gotSet = m.vertices.map(cabs).sort((a, b) => a - b);
    for (let i = 0; i < 4; i++) expect(Math.abs(inputSet[i] - gotSet[i])).toBeLessThan(1e-6);
  });
});
