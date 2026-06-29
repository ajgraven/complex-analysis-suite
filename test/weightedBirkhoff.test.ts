/**
 * Tests for the weighted Birkhoff utilities (`src/render/weightedBirkhoff.ts`). The key
 * properties: a pure rotation orbit recovers its rotation number exactly; on a smoothly
 * distorted (quasiperiodic) orbit the weighted average is *super-convergent* — far more
 * accurate than a plain average at the same length; and the half-vs-full residual separates
 * quasiperiodic motion (Siegel/Herman) from chaotic orbits.
 */
import { describe, it, expect } from "vitest";
import type { Complex } from "../src/complex";
import {
  bumpWeight,
  weightedBirkhoffAverage,
  stepAngles,
  rotationNumber,
  estimateRotation,
} from "../src/render/weightedBirkhoff";

const TAU = 2 * Math.PI;
const GOLDEN = (Math.sqrt(5) - 1) / 2;

/** Orbit on a circle of radius r about `center`, rotating by `alpha` turns per step. */
function rotationOrbit(alpha: number, N: number, r = 1, center: Complex = [0, 0]): Complex[] {
  const o: Complex[] = [];
  for (let n = 0; n < N; n++) {
    const t = TAU * alpha * n;
    o.push([center[0] + r * Math.cos(t), center[1] + r * Math.sin(t)]);
  }
  return o;
}

/** A smoothly distorted invariant curve (two Fourier modes) with rotation number `alpha`. */
function perturbedOrbit(alpha: number, N: number, eps = 0.2): Complex[] {
  const o: Complex[] = [];
  for (let n = 0; n < N; n++) {
    const t = TAU * alpha * n;
    o.push([Math.cos(t) + eps * Math.cos(2 * t), Math.sin(t) + eps * Math.sin(2 * t)]);
  }
  return o;
}

describe("bumpWeight", () => {
  it("vanishes at and outside the endpoints, peaks in the middle, is symmetric", () => {
    expect(bumpWeight(0)).toBe(0);
    expect(bumpWeight(1)).toBe(0);
    expect(bumpWeight(-0.1)).toBe(0);
    expect(bumpWeight(1.1)).toBe(0);
    expect(bumpWeight(0.5)).toBeCloseTo(Math.exp(-4), 12);
    expect(bumpWeight(0.25)).toBeCloseTo(bumpWeight(0.75), 12); // symmetric about ½
    expect(bumpWeight(0.5)).toBeGreaterThan(bumpWeight(0.1)); // peaks in the middle
  });
});

describe("weightedBirkhoffAverage", () => {
  it("returns the constant for a constant signal", () => {
    expect(weightedBirkhoffAverage([7, 7, 7, 7, 7])).toBeCloseTo(7, 12);
  });
  it("is NaN for an empty signal", () => {
    expect(Number.isNaN(weightedBirkhoffAverage([]))).toBe(true);
  });
});

describe("rotationNumber", () => {
  it("recovers a small rotation number exactly (no angle wrap)", () => {
    expect(rotationNumber(rotationOrbit(0.2, 400), [0, 0])).toBeCloseTo(0.2, 9);
  });
  it("recovers the golden-mean rotation number (with angle wrap past π)", () => {
    expect(rotationNumber(rotationOrbit(GOLDEN, 400), [0, 0])).toBeCloseTo(GOLDEN, 9);
  });
  it("is unaffected by the circle radius / centre offset", () => {
    expect(rotationNumber(rotationOrbit(0.2, 400, 3.5, [1, -2]), [1, -2])).toBeCloseTo(0.2, 9);
  });
});

describe("estimateRotation", () => {
  it("flags a pure rotation as quasiperiodic with ~zero residual", () => {
    const e = estimateRotation(rotationOrbit(GOLDEN, 600), [0, 0]);
    expect(e.quasiperiodic).toBe(true);
    expect(e.residual).toBeLessThan(1e-10);
    expect(e.alpha).toBeCloseTo(GOLDEN, 9);
  });

  it("is super-convergent on a distorted invariant curve (beats the plain average)", () => {
    // An IRRATIONAL rotation number (< ½ so no angle wrap) ⇒ a genuinely quasiperiodic
    // orbit that never closes; a rational α would make the orbit periodic and defeat the test.
    const alpha = (Math.SQRT2 - 1) / 2; // ≈ 0.2071
    const orbit = perturbedOrbit(alpha, 4000);
    const wbErr = Math.abs(estimateRotation(orbit, [0, 0]).alpha - alpha);
    const angles = stepAngles(orbit, [0, 0]);
    const plain = angles.reduce((a, b) => a + b, 0) / angles.length / TAU;
    const plainErr = Math.abs((plain - Math.floor(plain)) - alpha);
    expect(wbErr).toBeLessThan(1e-7); // weighted: many digits (≈1e-9 here)
    expect(plainErr).toBeGreaterThan(1e-6); // plain: only O(1/N)
    expect(wbErr).toBeLessThan(plainErr / 100); // weighted is orders of magnitude better
  });

  it("rejects a chaotic orbit (large residual ⇒ not quasiperiodic)", () => {
    let s = 1234567;
    const rand = () => ((s = (16807 * s) % 2147483647), s / 2147483647); // MINSTD, deterministic
    const orbit: Complex[] = [];
    for (let n = 0; n < 500; n++) {
      const t = TAU * rand();
      orbit.push([Math.cos(t), Math.sin(t)]);
    }
    const e = estimateRotation(orbit, [0, 0]);
    expect(e.quasiperiodic).toBe(false);
    expect(e.residual).toBeGreaterThan(1e-3);
  });
});
