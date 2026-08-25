import { describe, it, expect } from "vitest";
import {
  joukowski,
  joukowskiInv,
  joukowskiPrime,
  cylinderRadius,
  camberAngle,
  cylinderVelocity,
  physicalVelocity,
  kuttaCirculation,
  lift,
  withKutta,
  ktMap,
  ktMapPrime,
  ktInverse,
  nFromTrailingEdgeAngle,
  trailingEdgeAngle,
  type AirfoilParams,
  type Complex,
} from "../src/airfoil.js";

const cabs = (a: Complex): number => Math.hypot(a[0], a[1]);

describe("Joukowski map", () => {
  it("J⁻¹ is the exterior-branch inverse of J", () => {
    const b = 1;
    for (const z of [
      [3, 1],
      [-2.5, 0.8],
      [0.2, 2.4],
    ] as Complex[]) {
      const zeta = joukowskiInv(z, b);
      expect(cabs(zeta)).toBeGreaterThanOrEqual(b - 1e-9); // exterior root
      const back = joukowski(zeta, b);
      expect(back[0]).toBeCloseTo(z[0], 9);
      expect(back[1]).toBeCloseTo(z[1], 9);
    }
  });

  it("J'(±b) = 0 — the critical points give sharp edges", () => {
    expect(cabs(joukowskiPrime([1, 0], 1))).toBeCloseTo(0, 12);
    expect(cabs(joukowskiPrime([-1, 0], 1))).toBeCloseTo(0, 12);
  });
});

describe("cylinder geometry", () => {
  it("R = |b − ζ₀| and φ₀ = arg(b − ζ₀)", () => {
    const p: AirfoilParams = { U: 1, alpha: 0, b: 1, center: [-0.1, 0.12], circulation: 0 };
    expect(cylinderRadius(p)).toBeCloseTo(Math.hypot(1.1, 0.12), 12);
    expect(camberAngle(p)).toBeCloseTo(Math.atan2(-0.12, 1.1), 12);
  });
});

describe("Kutta condition", () => {
  it("places a stagnation point at the trailing edge ζ = b (W'(b) = 0)", () => {
    const base: AirfoilParams = { U: 1.2, alpha: 0.15, b: 1, center: [-0.12, 0.1], circulation: 0 };
    const p = withKutta(base);
    const v = cylinderVelocity(p, [p.b, 0]);
    expect(cabs(v)).toBeCloseTo(0, 9);
  });

  it("Γ = 4πUR·sin(φ₀ − α); zero for a symmetric airfoil at zero incidence", () => {
    const sym: AirfoilParams = { U: 1, alpha: 0, b: 1, center: [-0.1, 0], circulation: 0 };
    expect(kuttaCirculation(sym)).toBeCloseTo(0, 12);
    const p: AirfoilParams = { U: 1.3, alpha: 0.2, b: 1, center: [-0.1, 0.08], circulation: 0 };
    const R = cylinderRadius(p);
    expect(kuttaCirculation(p)).toBeCloseTo(4 * Math.PI * p.U * R * Math.sin(camberAngle(p) - p.alpha), 10);
  });

  it("lift is proportional to sin(α + camber) via L = ρUΓ", () => {
    const mk = (alpha: number): AirfoilParams =>
      withKutta({ U: 1, alpha, b: 1, center: [-0.1, 0.05], circulation: 0 });
    // |lift| grows with angle of attack over a sensible range
    expect(Math.abs(lift(mk(0.3)))).toBeGreaterThan(Math.abs(lift(mk(0.1))));
    // and matches ρU·Γ exactly
    const p = mk(0.2);
    expect(lift(p, 1.5)).toBeCloseTo(1.5 * p.U * p.circulation, 12);
  });
});

describe("centred cylinder stagnation coalescence (Γ = 4πUR)", () => {
  it("the two rear stagnation points merge at the bottom when |Γ| = 4πUR", () => {
    // Plain cylinder radius R = 1 (b on the circle, centre at 0), U = 1, α = 0.
    const p: AirfoilParams = { U: 1, alpha: 0, b: 1, center: [0, 0], circulation: -4 * Math.PI };
    const v = cylinderVelocity(p, [0, -1]); // the merged stagnation point at the bottom
    expect(cabs(v)).toBeCloseTo(0, 9);
  });
});

describe("Kármán–Trefftz (n < 2 → finite trailing-edge angle)", () => {
  it("reduces to Joukowski at n = 2", () => {
    for (const zeta of [
      [2, 1],
      [-1.5, 0.8],
      [0.3, 2.1],
    ] as Complex[]) {
      const kt = ktMap(zeta, 1, 2);
      const j = joukowski(zeta, 1);
      expect(kt[0]).toBeCloseTo(j[0], 9);
      expect(kt[1]).toBeCloseTo(j[1], 9);
      const ktp = ktMapPrime(zeta, 1, 2);
      const jp = joukowskiPrime(zeta, 1);
      expect(ktp[0]).toBeCloseTo(jp[0], 9);
      expect(ktp[1]).toBeCloseTo(jp[1], 9);
    }
  });

  it("K∘K⁻¹ round-trips in the exterior", () => {
    const b = 1;
    const n = 1.9;
    for (const z of [
      [2.6, 1.2],
      [-2.2, 0.9],
    ] as Complex[]) {
      const back = ktMap(ktInverse(z, b, n), b, n);
      expect(back[0]).toBeCloseTo(z[0], 6);
      expect(back[1]).toBeCloseTo(z[1], 6);
    }
  });

  it("the trailing-edge angle ↔ n relationship is inverse", () => {
    expect(nFromTrailingEdgeAngle(0)).toBeCloseTo(2, 12); // cusp = Joukowski
    const tau = (12 * Math.PI) / 180;
    expect(nFromTrailingEdgeAngle(tau)).toBeCloseTo(2 - tau / Math.PI, 12);
    expect(trailingEdgeAngle(nFromTrailingEdgeAngle(tau))).toBeCloseTo(tau, 12);
  });

  it("the physical velocity honours n at the sandbox's default airfoil", () => {
    const p: AirfoilParams = withKutta({
      U: 1,
      alpha: 0.1,
      b: 1,
      center: [-0.1, 0.06],
      circulation: 0,
      n: 1.9,
    });
    const v = physicalVelocity(p, [2.4, 0.4]);
    expect(Number.isFinite(v[0]) && Number.isFinite(v[1])).toBe(true);
  });
});

describe("physical velocity", () => {
  it("the Kutta condition tames the trailing-edge velocity (vs the Γ=0 blow-up)", () => {
    const kutta = withKutta({ U: 1, alpha: 0.12, b: 1, center: [-0.12, 0.09], circulation: 0 });
    const noKutta: AirfoilParams = { ...kutta, circulation: 0 };
    const zNear: Complex = [2 * kutta.b + 0.06, 0.02]; // just downstream of the trailing edge (z ≈ 2b)
    const vK = physicalVelocity(kutta, zNear);
    const vN = physicalVelocity(noKutta, zNear);
    expect(Number.isFinite(vK[0]) && Number.isFinite(vK[1])).toBe(true);
    expect(cabs(vK)).toBeLessThan(cabs(vN)); // Kutta cancels the J'(b)=0 singularity; Γ=0 does not
  });
});
