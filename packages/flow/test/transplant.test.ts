import { describe, it, expect } from "vitest";
import {
  refPotential,
  refVelocity,
  invertToExterior,
  flowNet,
  unitCircle,
  inletPorts,
  sourceSinkNet,
  type Complex,
} from "../src/transplant.js";

const cabs = (a: Complex): number => Math.hypot(a[0], a[1]);

/** invertToExterior, failing the test (rather than a non-null assertion) when no exterior root is found. */
function mustInvert(w: Complex, p: Parameters<typeof invertToExterior>[1], seed?: Complex): Complex {
  const zeta = invertToExterior(w, p, seed);
  if (!zeta) throw new Error(`no exterior preimage for w = ${w[0]}, ${w[1]}`);
  return zeta;
}

describe("reference flow past the unit disk", () => {
  it("W_ref is real on the real axis for uniform flow (α = 0, Γ = 0)", () => {
    for (const x of [1.5, 2, -3, 4.2]) {
      expect(refPotential([x, 0], { U: 1, alpha: 0, gamma: 0 })[1]).toBeCloseTo(0, 12);
    }
  });

  it("stagnation points sit at ζ = ±1 for uniform flow (W_ref′ = 0)", () => {
    const p = { U: 1.3, alpha: 0, gamma: 0 };
    expect(cabs(refVelocity([1, 0], p))).toBeCloseTo(0, 12);
    expect(cabs(refVelocity([-1, 0], p))).toBeCloseTo(0, 12);
  });

  it("far-field velocity → U·e^{−iα} as |ζ| → ∞", () => {
    const p = { U: 0.9, alpha: 0.3, gamma: 0.4 };
    const v = refVelocity([500, 0], p);
    expect(v[0]).toBeCloseTo(p.U * Math.cos(p.alpha), 3);
    expect(v[1]).toBeCloseTo(-p.U * Math.sin(p.alpha), 3);
  });
});

describe("exterior inversion W_ref(ζ) = w", () => {
  it("lands on the exterior branch and round-trips (Γ = 0, closed form)", () => {
    const p = { U: 1, alpha: 0.2, gamma: 0 };
    for (const w of [
      [2.5, 1.3],
      [-3, 0.8],
      [0.4, 2.6],
    ] as Complex[]) {
      const zeta = mustInvert(w, p);
      expect(cabs(zeta)).toBeGreaterThanOrEqual(1 - 1e-6);
      const back = refPotential(zeta, p);
      expect(back[0]).toBeCloseTo(w[0], 8);
      expect(back[1]).toBeCloseTo(w[1], 8);
    }
  });

  it("round-trips with circulation via the Newton continuation (Γ ≠ 0)", () => {
    const p = { U: 1.1, alpha: 0.15, gamma: 1.4 };
    const w: Complex = [3.2, 1.1];
    // Seed from the Γ = 0 root of the same target, then let Newton pull onto the true curve.
    const zeta = mustInvert(w, p, mustInvert(w, { ...p, gamma: 0 }));
    expect(cabs(zeta)).toBeGreaterThanOrEqual(1 - 1e-6);
    const back = refPotential(zeta, p);
    expect(back[0]).toBeCloseTo(w[0], 6);
    expect(back[1]).toBeCloseTo(w[1], 6);
  });
});

describe("flow net", () => {
  it("every streamline vertex is on the exterior |ζ| ≥ 1", () => {
    const net = flowNet({ U: 1, alpha: 0.1, gamma: 0 }, { streamlines: 5, equipotentials: 5, samples: 60 });
    expect(net.streamlines.length).toBeGreaterThan(0);
    for (const c of net.streamlines) for (const z of c.pts) expect(Math.hypot(z[0], z[1])).toBeGreaterThanOrEqual(1 - 1e-6);
  });

  it("the unit circle closes", () => {
    const uc = unitCircle(24);
    expect(uc[0][0]).toBeCloseTo(uc[uc.length - 1][0], 12);
    expect(uc[0][1]).toBeCloseTo(uc[uc.length - 1][1], 12);
    for (const p of uc) expect(Math.hypot(p[0], p[1])).toBeCloseTo(1, 12);
  });
});

describe("interior source–sink net", () => {
  it("inlet ports are diametrically opposite, just inside ∂𝔻", () => {
    const { a, b } = inletPorts(0.3);
    expect(a[0]).toBeCloseTo(-b[0], 12);
    expect(a[1]).toBeCloseTo(-b[1], 12);
    expect(Math.hypot(a[0], a[1])).toBeLessThan(1);
    expect(Math.hypot(a[0], a[1])).toBeGreaterThan(0.99);
  });

  it("every streamline vertex is inside the disk (impermeable walls)", () => {
    const { a, b } = inletPorts(0);
    const net = sourceSinkNet(a, b, { streamlines: 9, equipotentials: 5, samples: 120 });
    expect(net.streamlines.length).toBeGreaterThan(0);
    for (const c of net.streamlines) for (const z of c.pts) expect(Math.hypot(z[0], z[1])).toBeLessThanOrEqual(1);
    for (const c of net.equipotentials) for (const z of c.pts) expect(Math.hypot(z[0], z[1])).toBeLessThanOrEqual(1);
  });
});
