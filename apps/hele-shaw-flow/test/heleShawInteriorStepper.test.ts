import { describe, it, expect } from "vitest";
import {
  pgVelocity,
  stepDroplet,
  evolveDroplet,
  interiorMoments,
  momentDrift,
  momentMagnitudeDrift,
  canonicalize,
} from "../src/heleShawInteriorStepper.js";
import {
  circleRate,
  circleRadius,
  quadraticSolutionRates,
  linearModeRate,
  dropletArea,
  evalMap,
  pgResidualSup,
  type Cx,
} from "../src/heleShawInterior.js";

// The interior-droplet Polubarinova–Galin time-stepper (M4c.1b). The spectral velocity solve is validated
// against the closed-form M4c.1a oracle; the RK4 integration against the exact trajectories; and the
// conserved-moment monitor against Richardson's theorem.

const cabs = (a: Cx): number => Math.hypot(a[0], a[1]);

describe("pgVelocity — the spectral solve reproduces the closed-form oracle", () => {
  it("a disk: ȧ₁ = Q/(2πa₁) (matches circleRate)", () => {
    const Q = 5;
    for (const a1 of [0.5, 1, 2.5]) {
      const dot = pgVelocity([[a1, 0]], { strength: Q });
      const want = circleRate(a1, Q);
      expect(dot[0][0]).toBeCloseTo(want[0], 9);
      expect(dot[0][1]).toBeCloseTo(0, 9);
    }
  });

  it("the two-term polynomial f = a₁w + a₂w²: (ȧ₁, ȧ₂) match quadraticSolutionRates", () => {
    const Q = 3;
    for (const [a1, a2] of [[2, 0.4], [3, 0.8], [1.5, 0.3]]) {
      const dot = pgVelocity([[a1, 0], [a2, 0]], { strength: Q });
      const [d1, d2] = quadraticSolutionRates(a1, a2, Q);
      expect(dot[0][0]).toBeCloseTo(d1[0], 7);
      expect(dot[1][0]).toBeCloseTo(d2[0], 7);
      expect(cabs([dot[0][1], dot[1][1]])).toBeLessThan(1e-7); // stays real
    }
  });

  it("a near-circular mode f = a₁w + εₙwⁿ: ε̇ₙ matches the linearized rate −nQ/(2πa₁²)", () => {
    const Q = 4, a1 = 1.5, n = 3, eps = 1e-3;
    const coeffs: Cx[] = [[a1, 0], [0, 0], [eps, 0]];
    const dot = pgVelocity(coeffs, { strength: Q });
    expect(dot[0][0]).toBeCloseTo(circleRate(a1, Q)[0], 5); // ȧ₁ = circleRate + O(ε²) (ε=1e-3 ⇒ ~1e-6)
    expect(dot[2][0] / eps).toBeCloseTo(linearModeRate(a1, n, Q), 3); // ε̇₃/ε₃ ≈ −3Q/(2πa₁²)
  });
});

describe("stepDroplet / evolveDroplet — RK4 integration matches the exact trajectories", () => {
  it("a disk stays a disk and a₁(t) tracks √(a₁₀² + Qt/π)", () => {
    const Q = 2, a0 = 1;
    let coeffs: Cx[] = [[a0, 0]];
    const dt = 0.02;
    let t = 0;
    for (let i = 0; i < 100; i++) {
      coeffs = stepDroplet(coeffs, { strength: Q }, dt);
      t += dt;
    }
    expect(coeffs[0][0]).toBeCloseTo(circleRadius(a0, Q, t), 6);
    expect(Math.abs(coeffs[0][1])).toBeLessThan(1e-9); // no spurious imaginary drift
  });

  it("the two-term polynomial stays on its exact trajectory (area grows at Q)", () => {
    const Q = 1.5;
    const res = evolveDroplet([[2, 0], [0.4, 0]], { strength: Q }, { dt: 0.01, tMax: 1, moments: 2 });
    expect(res.stop).toBe("reached-tMax");
    const last = res.frames[res.frames.length - 1];
    // area grows linearly at rate Q: A(t) = A(0) + Qt
    expect(last.area).toBeCloseTo(dropletArea([[2, 0], [0.4, 0]]) + Q * last.t, 4);
    expect(last.coeffs[1][0]).toBeGreaterThan(0); // still a genuine two-term shape
  });
});

describe("conserved-moment monitor (Richardson: central injection conserves M_k, k≥1)", () => {
  it("an asymmetric blob keeps M₁,M₂ while the area grows at Q", () => {
    const Q = 2;
    const blob: Cx[] = canonicalize([[1.5, 0], [0.2, 0.12], [0, -0.1]]);
    const m0 = interiorMoments(blob, 2);
    const res = evolveDroplet(blob, { strength: Q }, { dt: 0.01, tMax: 1.5, moments: 2 });
    const last = res.frames[res.frames.length - 1];
    expect(last.momentDrift).toBeLessThan(1e-3); // M₁,M₂ conserved (the `≈` error bar stays tiny)
    // cross-check directly against the initial moments
    expect(momentDrift(m0, interiorMoments(last.coeffs, 2))).toBeLessThan(1e-3);
    // area grew by ≈ Q·t
    expect(last.area).toBeCloseTo(dropletArea(blob) + Q * last.t, 2);
  });
});

describe("guards — the honest ⚠ stops", () => {
  it("suction (Q<0) is refused unless explicitly opted into", () => {
    const res = evolveDroplet([[1, 0]], { strength: -1 }, { dt: 0.01, tMax: 1 });
    expect(res.stop).toBe("suction-blocked");
    expect(res.frames).toEqual([]);
    // with the opt-in it runs (ill-posed, `⚠`)
    const opened = evolveDroplet([[1, 0], [0.1, 0]], { strength: -1 }, { dt: 0.01, tMax: 0.05, allowSuction: true });
    expect(opened.stop).not.toBe("suction-blocked");
  });

  it("suction drives a near-circular blob to a cusp and stops there (⚠)", () => {
    // Q<0 grows the mode; min|f'| collapses → the cusp stop fires before any blow-up.
    const res = evolveDroplet([[1, 0], [0.12, 0]], { strength: -3 }, {
      dt: 0.01,
      tMax: 100,
      allowSuction: true,
      cuspFrac: 0.03,
    });
    expect(res.stop).toBe("cusp");
    const last = res.frames[res.frames.length - 1];
    expect(last.minFPrime).toBeLessThan(0.04); // stopped right at the near-cusp edge
    expect(last.minFPrime).toBeGreaterThan(0); // never integrated into the singularity
  });
});

describe("the rigid-spin overlay rotates without changing the shape's moment magnitudes", () => {
  it("spin advances arg(a₁) but preserves |M_k| and the area", () => {
    const blob: Cx[] = canonicalize([[1.4, 0], [0.25, 0], [0, 0.1]]);
    const m0 = interiorMoments(blob, 2).map(cabs);
    const res = evolveDroplet(blob, { strength: 0 }, { dt: 0.01, tMax: 1, spin: 1.2, moments: 2 });
    const last = res.frames[res.frames.length - 1];
    expect(Math.atan2(last.coeffs[0][1], last.coeffs[0][0])).toBeGreaterThan(0.5); // a₁ has rotated
    expect(last.area).toBeCloseTo(dropletArea(blob), 6); // spin injects no area
    const m1 = interiorMoments(last.coeffs, 2).map(cabs);
    for (let i = 0; i < m0.length; i++) expect(m1[i]).toBeCloseTo(m0[i], 4); // |M_k| unchanged by rotation
    // the frame's rotation-robust monitor (|M_k| drift) stays tiny, while the absolute drift is O(1)
    // because the moments' phases rotate — the honest label distinction.
    const ref = interiorMoments(blob, 2);
    const now = interiorMoments(last.coeffs, 2);
    expect(last.momentDrift).toBeLessThan(1e-3); // = momentMagnitudeDrift, rotation-robust
    expect(momentMagnitudeDrift(ref, now)).toBeLessThan(1e-3);
    expect(momentDrift(ref, now)).toBeGreaterThan(0.3); // absolute drift IS large — the phases rotated
  });
});

describe("off-centre source (F1.1)", () => {
  // A unit disk carried with `deg` modes — an off-centre source populates the spare aₖ to form the bulge; a
  // bare degree-1 disk cannot deform, so the truncated solve must have enough modes to resolve the flow.
  const disk = (deg: number): Cx[] => Array.from({ length: deg }, (_, i): Cx => (i === 0 ? [1, 0] : [0, 0]));

  it("the spectral solve → (PG): the off-centre residual converges as the mode count grows", () => {
    const src = { strength: 2, at: [0.3, 0] as Cx };
    const lo = pgResidualSup(disk(4), pgVelocity(disk(4), src), src);
    const hi = pgResidualSup(disk(16), pgVelocity(disk(16), src), src);
    expect(hi).toBeLessThan(lo); // more modes ⇒ smaller residual (geometric convergence)
    expect(hi).toBeLessThan(1e-6); // well-resolved at 16 modes (measured ≈ 4e-9)
  });

  it("obeys Richardson's law Ṁ_k = Q·bᵏ (b = the source image)", () => {
    const coeffs = disk(8); // f(w) = w, carried with enough modes to deform
    const a: Cx = [0.3, 0];
    const Q = 2;
    const b = evalMap(coeffs, a); // image of the source = 0.3
    const dt = 1e-3;
    const m0 = interiorMoments(coeffs, 2);
    const m1 = interiorMoments(stepDroplet(coeffs, { strength: Q, at: a }, dt), 2);
    // dM₁/dt ≈ Q·b = 0.6 ; dM₂/dt ≈ Q·b² = 0.18 (both real, b real)
    expect((m1[0][0] - m0[0][0]) / dt).toBeCloseTo(Q * b[0], 2);
    expect((m1[1][0] - m0[1][0]) / dt).toBeCloseTo(Q * (b[0] * b[0]), 2);
  });

  it("the moment monitor tracks the predicted drift: tiny residual, but the raw moments DID move", () => {
    const res = evolveDroplet(disk(16), { strength: 1.5, lab: [0.5, 0] }, { dt: 0.02, tMax: 1, moments: 2 });
    const last = res.frames[res.frames.length - 1];
    expect(last.momentDrift).toBeLessThan(1e-6); // drift from the Richardson prediction stays tiny (measured ≈ 4e-9)
    const raw = momentDrift(interiorMoments(res.frames[0].coeffs, 2), interiorMoments(last.coeffs, 2));
    expect(raw).toBeGreaterThan(0.05); // an off-centre source genuinely moves the moments (measured ≈ 0.75)
  });

  it("stops honestly when the source leaves the fluid", () => {
    const res = evolveDroplet([[1, 0]], { strength: 1, lab: [5, 0] }, { dt: 0.02, tMax: 1 });
    expect(res.stop).toBe("source-left-fluid"); // (5,0) is outside the unit-disk droplet
    expect(res.frames.length).toBe(1);
  });
});
