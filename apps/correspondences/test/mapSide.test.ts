import { describe, expect, it } from "vitest";
import { DELTOID, type Complex } from "../src/deltoid.js";
import { antiSquare, equipotential, externalRay, greenSigma } from "../src/mating/mapSide.js";

const near = (a: Complex, b: Complex, p = 9): void => {
  expect(a[0]).toBeCloseTo(b[0], p);
  expect(a[1]).toBeCloseTo(b[1], p);
};
const CUBE_ROOTS: Complex[] = [
  [1, 0],
  [-0.5, Math.sqrt(3) / 2],
  [-0.5, -Math.sqrt(3) / 2],
];

describe("map side — the anti-polynomial z̄²", () => {
  it("fixes the cube roots of unity and acts as θ ↦ −2θ on the unit circle", () => {
    for (const r of CUBE_ROOTS) near(antiSquare(r), r); // fixed points
    for (const t of [0.4, 1.3, -2.1, 3.0]) {
      near(antiSquare([Math.cos(t), Math.sin(t)]), [Math.cos(2 * t), -Math.sin(2 * t)]); // e^{iθ} ↦ e^{−2iθ}
      const rr = 1.7;
      near(antiSquare([rr * Math.cos(t), rr * Math.sin(t)]), [rr * rr * Math.cos(2 * t), -rr * rr * Math.sin(2 * t)]);
    }
  });

  it("z̄² maps the external ray at t to the ray at −2t (radial, from the Julia circle out)", () => {
    const ray = externalRay(0.9, 3, 12);
    near(ray[0], [Math.cos(0.9), Math.sin(0.9)]); // starts on |z|=1
    for (const p of ray) near(antiSquare(p), [Math.hypot(p[0], p[1]) ** 2 * Math.cos(1.8), -(Math.hypot(p[0], p[1]) ** 2) * Math.sin(1.8)]);
    expect(equipotential(2, 8).every((p) => Math.abs(Math.hypot(p[0], p[1]) - 2) < 1e-9)).toBe(true);
  });
});

describe("map side — σ's Green's function (Böttcher modulus)", () => {
  it("satisfies G(σ(w)) = 2·G(w) on the ∞-basin", () => {
    for (const w of [[5, 0], [3, 2], [-4, 1], [0, 6]] as Complex[]) {
      const gw = greenSigma(w);
      expect(gw).toBeGreaterThan(0);
      const sw = DELTOID.sigma(w);
      expect(sw).not.toBeNull();
      if (sw) expect(greenSigma(sw)).toBeCloseTo(2 * gw, 6);
    }
  });

  it("is 0 off the ∞-basin (inside K, where the σ-orbit has no exterior preimage)", () => {
    expect(greenSigma([0, 0])).toBe(0); // deep inside K
    expect(greenSigma([0.2, 0.1])).toBe(0);
    expect(greenSigma([0.3, -0.2])).toBe(0);
  });

  it("increases outward (a farther point has a larger modulus)", () => {
    expect(greenSigma([12, 0])).toBeGreaterThan(greenSigma([3, 0]));
  });
});
