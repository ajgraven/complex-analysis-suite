// correspondence — the pure geometry behind the boundary-correspondence + transplant overlays.
import { describe, expect, it } from "vitest";
import type { ExteriorMap } from "@cas/faber";
import { matchedBoundaryDots, transplantGrid, transplantResidual } from "../src/render/correspondence.js";
import { monomialTaylor, transformCoeffs } from "../src/faber.js";

// φ(z) = z + 0.5/z — the ellipse map (semi-axes 1.5 × 0.5), an exact ground truth.
const ELLIPSE: ExteriorMap = { c: 1, laurent: [{ re: 0, im: 0 }, { re: 0.5, im: 0 }] };
const near = (a: number, b: number, tol = 1e-9): boolean => Math.abs(a - b) < tol;

describe("matchedBoundaryDots", () => {
  it("returns `count` matched dots; disk on ∂𝔻, K on φ(∂𝔻), shared hue", () => {
    const { disk, k } = matchedBoundaryDots(ELLIPSE, 12);
    expect(disk).toHaveLength(12);
    expect(k).toHaveLength(12);
    // θ=0: e^{i0}=1 on the disk, φ(1)=1.5 on ∂K; hue 0 on both.
    expect(near(disk[0].w[0], 1) && near(disk[0].w[1], 0)).toBe(true);
    expect(near(k[0].w[0], 1.5) && near(k[0].w[1], 0)).toBe(true);
    expect(disk[0].hue).toBe(0);
    expect(k[0].hue).toBe(0);
    // θ=π/2 (j=3): e^{iπ/2}=i on the disk, φ(i)=i−0.5i=0.5i on ∂K; matched hue 3/12.
    expect(near(disk[3].w[0], 0) && near(disk[3].w[1], 1)).toBe(true);
    expect(near(k[3].w[0], 0) && near(k[3].w[1], 0.5)).toBe(true);
    expect(disk[3].hue).toBeCloseTo(0.25, 12);
    expect(k[3].hue).toBeCloseTo(0.25, 12);
  });
});

describe("transplantGrid", () => {
  it("places n rays and the default two rings; the disk side is a plain polar grid", () => {
    const g = transplantGrid(ELLIPSE, 3);
    expect(g.rays).toHaveLength(3);
    expect(g.rings).toHaveLength(2);
    // Ray 0 (arg z = 0) runs radially outward on the disk from the unit circle to rayMax = 3.
    const ray0 = g.rays[0];
    expect(near(ray0.disk[0][0], 1) && near(ray0.disk[0][1], 0)).toBe(true);
    expect(near(ray0.disk[ray0.disk.length - 1][0], 3)).toBe(true);
    // Its φ-image starts on ∂K at φ(1) = 1.5 and moves outward into Ω.
    expect(near(ray0.k[0][0], 1.5) && near(ray0.k[0][1], 0)).toBe(true);
    expect(ray0.k[ray0.k.length - 1][0]).toBeGreaterThan(1.5);
    // Ring 0 (|z| = 1.35) is a circle on the disk; its φ-image is the equipotential φ({|z|=1.35}).
    expect(near(g.rings[0].disk[0][0], 1.35)).toBe(true);
    expect(near(g.rings[0].k[0][0], 1.35 + 0.5 / 1.35, 1e-9)).toBe(true);
  });

  it("draws no rays for a constant image (n = 0)", () => {
    expect(transplantGrid(ELLIPSE, 0).rays).toHaveLength(0);
  });
});

describe("transplantResidual", () => {
  it("max|Fₙ∘φ − zⁿ| shrinks as the sampling radius grows (the identity is exact at ∞)", () => {
    const n = 4;
    const fn = transformCoeffs(ELLIPSE, monomialTaylor(n)); // Fₙ = Φφ(zⁿ)
    const near1 = transplantResidual(fn, ELLIPSE, n, 1.2);
    const far = transplantResidual(fn, ELLIPSE, n, 3);
    expect(Number.isFinite(near1)).toBe(true);
    expect(far).toBeLessThan(near1); // O(1/R) tail decays outward
    expect(far).toBeLessThan(0.2); // tiny far from ∂K
  });
});
