import { describe, expect, it } from "vitest";
import { DELTOID, type Complex } from "../src/deltoid.js";
import { greenSigma, sigmaExternalRay, sigmaRayLanding } from "../src/mating/mapSide.js";

const CUSP_ANGLES = [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]; // fixed angles of θ ↦ −2θ (3θ ≡ 0)
const cusp = (k: number): Complex => [1.5 * Math.cos(CUSP_ANGLES[k]), 1.5 * Math.sin(CUSP_ANGLES[k])];
const dist = (a: Complex, b: Complex): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
const norm = (t: number): number => ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
/** Smallest angular gap between two angles (handles the 2π wrap). */
const angleGap = (a: number, b: number): number => {
  const d = Math.abs(norm(a) - norm(b));
  return Math.min(d, 2 * Math.PI - d);
};

/** Shortest distance from a point to a polyline (min over segments). */
function distToPolyline(p: Complex, poly: readonly Complex[]): number {
  let best = Infinity;
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1];
    const b = poly[i];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const L2 = dx * dx + dy * dy || 1e-30;
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2;
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)));
  }
  return best;
}

describe("σ external rays — the Böttcher argument transported into the σ-plane", () => {
  it("leaves ∞ in the direction θ (arg B ≈ arg w near ∞)", () => {
    for (const th of [0.4, 1.9, -2.3]) {
      const w0 = sigmaExternalRay(th)[0];
      expect(norm(Math.atan2(w0[1], w0[0]))).toBeCloseTo(norm(th), 6);
      expect(Math.hypot(w0[0], w0[1])).toBeGreaterThan(3); // starts well outside the deltoid
    }
  });

  it("G decreases monotonically from ∞ toward ∂K along a ray (it is a gradient line of G)", () => {
    const ray = sigmaExternalRay(0.7);
    expect(ray.length).toBeGreaterThan(30);
    let prev = Infinity;
    for (const p of ray) {
      const g = greenSigma(p);
      expect(g).toBeLessThanOrEqual(prev + 1e-6);
      prev = g;
    }
    expect(prev).toBeLessThan(0.05); // reached the equator neighbourhood (last step then crosses ∂K)
  });

  it("the three cusp rays land radially into the three cusps 1.5·{1, ω, ω²}", () => {
    for (let k = 0; k < 3; k++) {
      const land = sigmaRayLanding(CUSP_ANGLES[k], { gFloor: 0.004 });
      // A cusp ray lands at the cusp's ARGUMENT (radial landing, pinned by the 3-fold + reflection symmetry).
      expect(angleGap(Math.atan2(land[1], land[0]), CUSP_ANGLES[k])).toBeLessThan(0.01); // < 0.6°
      // …and just outside the cusp radius 1.5 (it approaches from the ∞-basin).
      expect(Math.hypot(land[0], land[1])).toBeGreaterThan(1.5);
      expect(Math.hypot(land[0], land[1])).toBeLessThan(1.75);
    }
  });

  it("refining the floor marches the cusp landing monotonically toward the cusp", () => {
    let prevDist = Infinity;
    for (const gFloor of [0.02, 0.008, 0.003]) {
      const d = dist(sigmaRayLanding(0, { gFloor }), cusp(0));
      expect(d).toBeLessThan(prevDist); // converging in
      prevDist = d;
    }
    expect(prevDist).toBeLessThan(0.13);
  });

  it("σ transports the ray at θ onto the ray at −2θ (R(θ) ↦ R(−2θ))", () => {
    for (const th of [0.7, 1.9, 2.7, -1.1]) {
      const ray = sigmaExternalRay(th);
      // pick the ray point at moderate potential (G ≈ 0.3), where the numerics are cleanest
      let w = ray[0];
      let bd = Infinity;
      for (const p of ray) {
        const d = Math.abs(greenSigma(p) - 0.3);
        if (d < bd) {
          bd = d;
          w = p;
        }
      }
      const sw = DELTOID.sigma(w);
      expect(sw).not.toBeNull();
      if (!sw) continue;
      // G doubles under σ (Böttcher modulus)…
      expect(greenSigma(sw)).toBeCloseTo(2 * greenSigma(w), 2);
      // …and σ(w) lands on the independently traced ray at −2θ.
      const target = sigmaExternalRay(norm(-2 * th));
      expect(distToPolyline(sw, target)).toBeLessThan(0.06);
    }
  });
});
