// Regular-polygon exterior maps (M1a) — the M0 spike checks promoted to golden tests. Validates the
// closed-form Laurent series (exponent 1−α = 2/n), the capacity normalization against the Γ(1/4) golden
// for the square, n-fold symmetry, and that the extracted {c, laurent} drives the real @cas/faber engine.
import { describe, expect, it } from "vitest";
import type { Cx } from "@cas/core";
import { faberPolynomials, faberTransform, polynomialRoots } from "@cas/faber";
import { cornerNorms, polygonMap, regularPolygonMap } from "../src/polygon.js";
import { evalPhi, monomialTaylor, transformCoeffs } from "../src/faber.js";
import { MENU_PRESETS, phiPresetById } from "../src/presets.js";

const near = (a: number, b: number, tol = 1e-9): boolean => Math.abs(a - b) < tol;
const cabs = (z: Cx): number => Math.hypot(z.re, z.im);

describe("regularPolygonMap — closed-form Laurent", () => {
  it("square: c=1, first block laurent[3]=d₁/(1−4)=1/6, all lower entries 0", () => {
    const m = regularPolygonMap(4, 20);
    expect(m.c).toBe(1);
    expect(near(m.laurent[0].re, 0) && near(m.laurent[1].re, 0) && near(m.laurent[2].re, 0)).toBe(true);
    expect(near(m.laurent[3].re, 1 / 6)).toBe(true); // d₁ = −1/2, /(1−4) = 1/6
    expect(near(m.laurent[3].im, 0)).toBe(true);
    // The next non-zero block is at index 7 (m=2); indices 4,5,6 are 0.
    expect(near(m.laurent[4].re, 0) && near(m.laurent[5].re, 0) && near(m.laurent[6].re, 0)).toBe(true);
    expect(m.laurent[7].re).not.toBe(0);
  });

  it("only indices nm−1 are non-zero (triangle: 2,5,8,…)", () => {
    const m = regularPolygonMap(3, 30);
    for (let k = 0; k < m.laurent.length; k++) {
      const isBlock = (k + 1) % 3 === 0; // k = 3m−1
      if (!isBlock) expect(m.laurent[k].re === 0 && m.laurent[k].im === 0).toBe(true);
    }
  });

  it("rejects n < 3 and non-integer order", () => {
    expect(() => regularPolygonMap(2)).toThrow();
    expect(() => regularPolygonMap(4, 0)).toThrow();
  });
});

describe("capacity & geometry goldens", () => {
  it("square apothem matches the Γ(1/4) closed form (cap = |c| = 1)", () => {
    // cap(square, side s) = s·Γ(1/4)²/(4π^{3/2}); with c=1 ⇒ side = 1/κ₄, apothem = side/(2 tan(π/4)).
    const GAMMA_QUARTER = 3.625609908; // Γ(1/4), enough digits for the 2e-3 tolerance
    const kappa4 = (GAMMA_QUARTER * GAMMA_QUARTER) / (4 * Math.pow(Math.PI, 1.5));
    const apothemExpected = 1 / kappa4 / (2 * Math.tan(Math.PI / 4));
    const m = regularPolygonMap(4, 4000);
    // Apothem = |φ(edge midpoint)| at z = e^{iπ/4}; edge midpoints are away from the prevertex
    // singularities, so the series converges fast even on |z| = 1.
    const apothem = cabs(evalPhi(m, { re: Math.cos(Math.PI / 4), im: Math.sin(Math.PI / 4) }));
    expect(Math.abs(apothem - apothemExpected)).toBeLessThan(2e-3);
  });

  it("exact n-fold rotational symmetry φ(ωz) = ω·φ(z)", () => {
    for (const n of [3, 4, 5, 6]) {
      const m = regularPolygonMap(n, 200);
      const w: Cx = { re: Math.cos((2 * Math.PI) / n), im: Math.sin((2 * Math.PI) / n) };
      const z: Cx = { re: 1.2 * Math.cos(0.7), im: 1.2 * Math.sin(0.7) };
      const wz: Cx = { re: w.re * z.re - w.im * z.im, im: w.re * z.im + w.im * z.re };
      const lhs = evalPhi(m, wz);
      const p = evalPhi(m, z);
      const rhs: Cx = { re: w.re * p.re - w.im * p.im, im: w.re * p.im + w.im * p.re };
      expect(near(lhs.re, rhs.re, 1e-10) && near(lhs.im, rhs.im, 1e-10)).toBe(true);
    }
  });
});

describe("@cas/faber seam", () => {
  it("drives the recurrence: F₁=z, F₂ leading = 1/c² = 1 (square)", () => {
    const m = regularPolygonMap(4, 12);
    const fp = faberPolynomials(m, 3);
    expect(near(fp.coeffs[1][0].re, 0) && near(fp.coeffs[1][1].re, 1)).toBe(true); // F₁(z) = z
    expect(near(fp.coeffs[2][2].re, 1)).toBe(true); // F₂ leading coefficient
  });

  it("faberTransform(z⁴)=F₄ has roots inside K (|w| < circumradius)", () => {
    const m = regularPolygonMap(4, 60);
    const F4 = faberTransform(m, monomialTaylor(4));
    const r = polynomialRoots(F4);
    expect(r.converged).toBe(true);
    const maxR = Math.max(...r.roots.map(cabs));
    expect(maxR).toBeLessThan(1.3); // square circumradius ≈ 1.198
  });

  it("app transformCoeffs path agrees with the raw recurrence", () => {
    const m = regularPolygonMap(5, 40);
    const viaApp = transformCoeffs(m, monomialTaylor(3));
    const viaPkg = faberTransform(m, monomialTaylor(3));
    for (let i = 0; i < viaApp.length; i++) {
      expect(near(viaApp[i].re, viaPkg[i].re, 1e-12) && near(viaApp[i].im, viaPkg[i].im, 1e-12)).toBe(true);
    }
  });
});

describe("presets", () => {
  it("exposes the four regular polygon presets, all flagged approximate", () => {
    for (const id of ["triangle", "square", "pentagon", "hexagon"]) {
      const p = phiPresetById(id);
      expect(p.id).toBe(id);
      expect(p.approximate).toBe(true);
      expect(p.shape).toBeNull();
      expect(p.build(0).c).toBe(1);
    }
  });
});

describe("polygonMap — arbitrary polygon via the exterior SC solve (M1b)", () => {
  it("builds a valid ExteriorMap for a rectangle (positive capacity, finite, drives the recurrence)", () => {
    const result = polygonMap([[1, 0.5], [-1, 0.5], [-1, -0.5], [1, -0.5]]);
    expect(result.converged).toBe(true);
    expect(result.degraded).toBe(false);
    const m = result.map;
    expect(m.c).toBeGreaterThan(0);
    for (const c of m.laurent) expect(Number.isFinite(c.re) && Number.isFinite(c.im)).toBe(true);
    // The map is rotated so c is real (a canonical orientation, like M1a's square rendering as a diamond),
    // so the Laurent tail is genuinely complex — just require it finite and non-degenerate.
    expect(m.laurent.some((c) => Math.hypot(c.re, c.im) > 1e-3)).toBe(true);
    // Faber transform of z² runs and its roots sit within K (bounded).
    const roots = polynomialRoots(faberTransform(m, monomialTaylor(2)));
    expect(roots.converged).toBe(true);
    expect(Math.max(...roots.roots.map(cabs))).toBeLessThan(3);
  });

  it("registers the general-polygon presets in the menu, all approximate", () => {
    const ids = MENU_PRESETS.map((p) => p.id);
    for (const id of ["rectangle", "iso-triangle", "house", "lshape"]) {
      expect(ids).toContain(id);
      expect(phiPresetById(id).approximate).toBe(true);
    }
  });

  it("every shipped general-polygon preset's SC fit converges (no silently-degraded domain)", () => {
    const shapes: [string, [number, number][]][] = [
      ["rectangle", [[1, 0.5], [-1, 0.5], [-1, -0.5], [1, -0.5]]],
      ["iso-triangle", [[0, 1.4], [-0.7, -0.7], [0.7, -0.7]]],
      ["house", [[1, -0.6], [1, 0.5], [0, 1.2], [-1, 0.5], [-1, -0.6]]],
      ["lshape", [[-0.8, -0.8], [0.8, -0.8], [0.8, 0], [0, 0], [0, 0.8], [-0.8, 0.8]]],
    ];
    for (const [name, poly] of shapes) {
      const r = polygonMap(poly);
      expect(r.converged, `${name} converged`).toBe(true);
      expect(r.degraded, `${name} not degraded`).toBe(false);
    }
  });

  it("computes corner norms Λₖ = max{αₖ, 2−αₖ} and exposes them on polygon presets", () => {
    // Square: αₖ = 0.5 ⇒ Λ = 1.5 everywhere. Straight vertex αₖ=1 ⇒ Λ=1. Reentrant αₖ=1.5 ⇒ Λ=1.5.
    expect(cornerNorms([0.5, 0.5, 0.5, 0.5]).maxLambda).toBeCloseTo(1.5, 12);
    expect(cornerNorms([1, 0.5, 1.5]).lambdas).toEqual([1, 1.5, 1.5]);
    expect(cornerNorms([1, 1, 1]).maxLambda).toBe(1); // a "straight" degenerate — no overshoot
    // Regular hexagon: αₖ = 4/6 ⇒ Λ = (n+2)/n = 8/6.
    expect(phiPresetById("hexagon").cornerNorms?.maxLambda).toBeCloseTo(8 / 6, 12);
    // General polygons carry corner norms too (computed from vertices, no fit).
    expect(phiPresetById("rectangle").cornerNorms?.maxLambda).toBeCloseTo(1.5, 6);
    expect(phiPresetById("lshape").cornerNorms?.maxLambda).toBeCloseTo(1.5, 6); // the reentrant 3π/2 corner
  });

  it("reentrant L-shape converges and adaptive truncation keeps more terms than a convex polygon", () => {
    const lshape = polygonMap([[-0.8, -0.8], [0.8, -0.8], [0.8, 0], [0, 0], [0, 0.8], [-0.8, 0.8]]);
    expect(lshape.converged).toBe(true);
    const square = polygonMap([[1, 0.5], [-1, 0.5], [-1, -0.5], [1, -0.5]]);
    // The reentrant corner's slow coefficient decay ⇒ the trimmed series is materially longer.
    expect(lshape.map.laurent.length).toBeGreaterThan(square.map.laurent.length);
    expect(lshape.map.laurent.length).toBeGreaterThan(120);
    // Faber transform of z³ still runs on the reentrant domain.
    const roots = polynomialRoots(faberTransform(lshape.map, monomialTaylor(3)));
    expect(roots.converged).toBe(true);
  });
});
