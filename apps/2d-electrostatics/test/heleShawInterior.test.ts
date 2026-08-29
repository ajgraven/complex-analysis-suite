import { describe, it, expect } from "vitest";
import {
  evalMap,
  evalMapPrime,
  poissonKernel,
  sourceDensity,
  pgResidual,
  pgResidualSup,
  dropletArea,
  areaRate,
  minAbsMapPrime,
  circleRadius,
  circleRate,
  linearModeRate,
  linearInvariant,
  quadraticSolutionRates,
  rigidSpinRate,
  type Cx,
  type Source,
} from "../src/heleShawInterior.js";

// The classical interior-droplet Polubarinova–Galin evolver (M4c.1a). Everything checked here is a
// closed-form benchmark (`=`): the equation's exact solutions, verified to machine precision.

const cabs = (a: Cx): number => Math.hypot(a[0], a[1]);
const scale = (a: Cx, s: number): Cx => [a[0] * s, a[1] * s];

describe("the interior map f(w) = Σ a_k w^k and its derivative", () => {
  it("evaluates and differentiates a finite Taylor map (f(0) = 0)", () => {
    const coeffs: Cx[] = [[2, 0], [0, 0.5], [-0.25, 0]]; // 2w + 0.5i w² − 0.25 w³
    expect(evalMap(coeffs, [0, 0])).toEqual([0, 0]);
    // f(1) = 2 + 0.5i − 0.25 = 1.75 + 0.5i
    expect(evalMap(coeffs, [1, 0])[0]).toBeCloseTo(1.75, 12);
    expect(evalMap(coeffs, [1, 0])[1]).toBeCloseTo(0.5, 12);
    // f'(w) = 2 + i w − 0.75 w²; f'(1) = 2 − 0.75 + i = 1.25 + i
    expect(evalMapPrime(coeffs, [1, 0])[0]).toBeCloseTo(1.25, 12);
    expect(evalMapPrime(coeffs, [1, 0])[1]).toBeCloseTo(1, 12);
  });
});

describe("the source term and Poisson-kernel right-hand side", () => {
  it("a central source (a = 0) is the constant density Q/2π", () => {
    expect(poissonKernel([0, 0], 0.7)).toBeCloseTo(1, 12);
    for (const th of [0, 1, 2, 3, 5]) expect(sourceDensity({ strength: 4 }, th)).toBeCloseTo(4 / (2 * Math.PI), 12);
  });
  it("an off-center source integrates to the same total flux Q (∮ density dθ = Q)", () => {
    const src: Source = { strength: 3, at: [0.4, -0.2] };
    const N = 4000;
    let integral = 0;
    for (let i = 0; i < N; i++) integral += sourceDensity(src, (2 * Math.PI * i) / N) * ((2 * Math.PI) / N);
    expect(integral).toBeCloseTo(3, 6); // the source site redistributes, but never changes, the injected flux
  });
});

describe("BENCHMARK — the exact self-similar disk (central source)", () => {
  it("a disk stays a disk: residual ≡ 0 to machine precision, and πa₁² grows at rate Q", () => {
    const Q = 5;
    for (const a1 of [0.5, 1, 2.5]) {
      const coeffs: Cx[] = [[a1, 0]];
      const coeffsDot: Cx[] = [circleRate(a1, Q)];
      expect(pgResidualSup(coeffs, coeffsDot, { strength: Q })).toBeLessThan(1e-12);
      expect(areaRate(coeffs, coeffsDot)).toBeCloseTo(Q, 10); // dA/dt = Q exactly
      expect(dropletArea(coeffs)).toBeCloseTo(Math.PI * a1 * a1, 12);
    }
  });
  it("a₁(t) = √(a₁(0)² + Qt/π) matches the integrated area A(t) = A(0) + Qt", () => {
    const Q = 2, a0 = 1;
    for (const t of [0, 1, 4, 10]) {
      const a1 = circleRadius(a0, Q, t);
      expect(dropletArea([[a1, 0]])).toBeCloseTo(Math.PI * a0 * a0 + Q * t, 9);
    }
  });
});

describe("BENCHMARK — the exact two-term polynomial solution f = a₁w + a₂w²", () => {
  it("the prescribed rates make the residual ≡ 0 to machine precision (not just O(ε²))", () => {
    const Q = 3;
    for (const [a1, a2] of [[2, 0.4], [3, 0.8], [1.5, 0.3]]) {
      const coeffs: Cx[] = [[a1, 0], [a2, 0]];
      const [d1, d2] = quadraticSolutionRates(a1, a2, Q);
      expect(pgResidualSup(coeffs, [d1, d2], { strength: Q })).toBeLessThan(1e-11);
      expect(areaRate(coeffs, [d1, d2])).toBeCloseTo(Q, 9); // dA/dt = Q exactly for the exact solution
    }
  });
  it("the map cusps (min|f'| → 0) as a₁ → 2a₂ — the classic 4/3-cusp", () => {
    // f'(w) = a₁ + 2a₂w vanishes at w = −a₁/(2a₂); |that| = 1 exactly when a₁ = 2a₂.
    expect(minAbsMapPrime([[2, 0], [0.9, 0]])).toBeGreaterThan(0.1); // a₁ = 2 > 2a₂ = 1.8: still univalent
    expect(minAbsMapPrime([[2, 0], [0.999, 0]])).toBeCloseTo(0.002, 3); // a₁ − 2a₂ = 0.002 → near cusp
    expect(minAbsMapPrime([[2, 0], [1, 0]])).toBeCloseTo(0, 6); // a₁ = 2a₂: the cusp
  });
});

describe("BENCHMARK — the linearized near-circular modes (central source)", () => {
  it("ε̇_n/ε_n = −n·Q/(2πa₁²): injection decays modes, and the residual is O(ε²)", () => {
    const Q = 4, a1 = 1.5, n = 3;
    const rate = linearModeRate(a1, n, Q);
    expect(rate).toBeLessThan(0); // injection Q > 0 ⇒ decay (stable circle)
    // residual of the linearized state scales like ε² — quartering ε² when ε halves
    const resid = (eps: number): number => {
      const epsN: Cx = [eps, 0];
      const coeffs: Cx[] = [[a1, 0], [0, 0], [epsN[0], epsN[1]]]; // a₁w + ε₃w³
      const coeffsDot: Cx[] = [circleRate(a1, Q), [0, 0], scale(epsN, rate)];
      return pgResidualSup(coeffs, coeffsDot, { strength: Q });
    };
    const r1 = resid(1e-2);
    const r2 = resid(5e-3);
    expect(r1).toBeLessThan(2e-3); // small
    expect(r2 / r1).toBeCloseTo(0.25, 1); // halving ε quarters the residual (genuinely O(ε²))
  });
  it("suction (Q<0) grows every mode — the ill-posed / fingering direction (RISKS §3)", () => {
    expect(linearModeRate(1, 2, -4)).toBeGreaterThan(0);
    expect(linearModeRate(1, 5, -4)).toBeGreaterThan(linearModeRate(1, 2, -4)); // higher modes faster
  });
  it("the invariant ε_n·a₁^n is conserved by the exact linear flow (d/dt = 0)", () => {
    // march the exact linearized ODE a small step and confirm ε_n·a₁^n is unchanged to first order.
    const Q = 4, n = 4;
    let a1 = 1.2;
    let epsN: Cx = [0.01, -0.005];
    const inv0 = linearInvariant(a1, epsN, n);
    const dt = 1e-4;
    for (let step = 0; step < 50; step++) {
      const da1 = circleRate(a1, Q)[0];
      const rate = linearModeRate(a1, n, Q);
      a1 += da1 * dt;
      epsN = [epsN[0] + rate * epsN[0] * dt, epsN[1] + rate * epsN[1] * dt];
    }
    const inv1 = linearInvariant(a1, epsN, n);
    expect(cabs([inv1[0] - inv0[0], inv1[1] - inv0[1]])).toBeLessThan(1e-6); // O(dt²) drift only
  });
});

describe("the vortex overlay (rigid co-rotation) is honestly area-neutral", () => {
  it("iω·f injects no area (dA/dt = 0) and adds a zero-mean (PG) contribution", () => {
    const coeffs: Cx[] = [[1.5, 0], [0.3, 0.1], [0, -0.2]]; // a non-circular droplet
    const spin = rigidSpinRate(coeffs, 0.7);
    expect(areaRate(coeffs, spin)).toBeCloseTo(0, 9); // a pure spin injects no area
    // the mean over the circle of its (PG) contribution vanishes (no source ⇒ Q = 0)
    const N = 2000;
    let mean = 0;
    for (let i = 0; i < N; i++) mean += pgResidual(coeffs, spin, { strength: 0 }, (2 * Math.PI * i) / N);
    expect(mean / N).toBeCloseTo(0, 9);
  });
  it("spins a circle with literally no effect (a rotated disk is the same disk)", () => {
    const spin = rigidSpinRate([[2, 0]], 1.3);
    expect(pgResidualSup([[2, 0]], spin, { strength: 0 })).toBeLessThan(1e-12);
  });
});
