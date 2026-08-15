import { describe, expect, it } from "vitest";
import type { C } from "../src/vandermondeArnoldi.js";
import { solveParameterProblem } from "../src/scParameterProblem.js";
import { buildForwardMap } from "../src/schwarzChristoffel.js";

// Assert the forward SC map (built from the solved prevertices, C/A recovered from the polygon)
// reproduces every vertex — a gauge-invariant proof the solver found the right shape.
function expectReproduces(sol: ReturnType<typeof solveParameterProblem>, target: readonly C[], digits: number): void {
  const map = buildForwardMap(sol.prevertices, sol.angles, { targetVertices: target });
  for (let k = 0; k < target.length; k++) {
    const f = map.forward(sol.prevertices[k]);
    expect(f[0]).toBeCloseTo(target[k][0], digits);
    expect(f[1]).toBeCloseTo(target[k][1], digits);
  }
}

describe("SC parameter problem", () => {
  it("a scalene triangle (n=3) is fixed by its angles — trivial solve", () => {
    const tri: C[] = [
      [0, 0],
      [1.3, 0],
      [0.4, 0.9],
    ];
    const sol = solveParameterProblem(tri);
    expect(sol.converged).toBe(true);
    expect(sol.iterations).toBe(0);
    expectReproduces(sol, tri, 10);
  });

  it("recovers a regular pentagon from a deliberately skewed prevertex seed", () => {
    const target: C[] = Array.from({ length: 5 }, (_, k): C => [
      Math.cos((2 * Math.PI * k) / 5),
      Math.sin((2 * Math.PI * k) / 5),
    ]);
    const seed: C[] = [0.0, 1.1, 2.7, 3.9, 5.2].map((a): C => [Math.cos(a), Math.sin(a)]); // non-uniform
    const sol = solveParameterProblem(target, { seedPrevertices: seed });
    expect(sol.converged).toBe(true);
    expect(sol.degraded).toBe(false);
    expectReproduces(sol, target, 10);
  });

  it("solves a reentrant L-shape (n=6, one 3π/2 corner)", () => {
    const L: C[] = [
      [0, 0],
      [2, 0],
      [2, 1],
      [1, 1],
      [1, 2],
      [0, 2],
    ];
    const sol = solveParameterProblem(L);
    expect(sol.converged).toBe(true);
    const reentrant = sol.angles.filter((a) => a > 1);
    expect(reentrant.length).toBe(1);
    expect(reentrant[0]).toBeCloseTo(1.5, 9); // interior angle 3π/2 ⇒ α = 3/2
    expectReproduces(sol, L, 10);
  });
});
