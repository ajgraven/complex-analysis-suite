import { describe, expect, it } from "vitest";
import { dynamicRay } from "@cas/dynamics";
import { compileMap } from "../src/map.js";
import { greenPotential, externalAngleQuadratic } from "../src/analysis/potential.js";

const sq = compileMap({ expr: "z*z", vars: ["z"], antiholomorphic: false });
if (!sq.ok) throw new Error("z*z failed to compile");
const fSq = sq.map.jsFn;

describe("Green's-function potential + external angle (E3)", () => {
  it("G(z) = log|z| for f(z)=z² (c=0), where K is the closed unit disk", () => {
    // For z², z_n = z^{2ⁿ}, so d^{-n} log|z_n| = log|z| exactly for every n.
    expect(greenPotential(fSq, 2, [2, 0]).G).toBeCloseTo(Math.log(2), 9);
    expect(greenPotential(fSq, 2, [0, 3]).G).toBeCloseTo(Math.log(3), 9);
    expect(greenPotential(fSq, 2, [5, 0]).G).toBeCloseTo(Math.log(5), 9);
  });

  it("reports a bounded orbit (G=0) inside K", () => {
    const basilica = compileMap({ expr: "z*z - 1", vars: ["z"], antiholomorphic: false });
    if (!basilica.ok) throw new Error("z*z-1 failed to compile");
    const p = greenPotential(basilica.map.jsFn, 2, [0, 0]); // 0 → −1 → 0 → … bounded ⇒ 0 ∈ K
    expect(p.escaped).toBe(false);
    expect(p.G).toBe(0);
  });

  it("external angle of f(z)=z² is just arg(z)/2π (φ = identity)", () => {
    expect(externalAngleQuadratic([0, 0], [2, 0])).toBeCloseTo(0, 9);
    expect(externalAngleQuadratic([0, 0], [0, 2])).toBeCloseTo(0.25, 9);
    expect(externalAngleQuadratic([0, 0], [-2, 0])).toBeCloseTo(0.5, 9);
    expect(externalAngleQuadratic([0, 0], [0, -2])).toBeCloseTo(0.75, 9);
  });

  it("returns null for an interior point (no external ray through K)", () => {
    expect(externalAngleQuadratic([-1, 0], [0, 0])).toBeNull(); // 0 ∈ K for the basilica
  });

  it("cross-check: a point on the θ-ray of the basilica reads external angle ≈ θ", () => {
    for (const theta of [0, 0.125, 0.25, 0.5]) {
      const ray = dynamicRay(theta, [-1, 0]); // c = −1 (basilica)
      const far = ray[0]; // farthest-out sample (highest modulus, best-converged Böttcher)
      const got = externalAngleQuadratic([-1, 0], [far[0], far[1]]);
      expect(got).not.toBeNull();
      if (got === null) continue;
      // Compare mod 1 (θ and θ+1 are the same ray).
      const diff = Math.min(Math.abs(got - theta), 1 - Math.abs(got - theta));
      expect(diff).toBeLessThan(0.02);
    }
  });
});
