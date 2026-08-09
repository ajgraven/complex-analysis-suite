import { describe, expect, it } from "vitest";
import { makeBoundedSchwarz, type Complex } from "../src/index.js";

// Ground truth for the BOUNDED-QD σ engine (S5-C2). Two independent pins:
//   1. The DISK — w₀=0, one branch z_j=0, A=[1] gives φ(z)=z (the unit disk), whose Schwarz reflection is
//      the exact inversion σ(w) = 1/conj(w). Hand-checkable at any point.
//   2. A genuine single-lobe domain (z_j=0.3, A=0.5) pinned by the boundary reflection identity
//      F(z)=conj(φ(z)) on |z|=1 (the definition of the Schwarz extension) + the round-trip
//      σ(φ(z₀))=conj(F(z₀)) for interior z₀. Complex/2-branch cases pin the branch sum.

const conj = (z: Complex): Complex => [z[0], -z[1]];
const near = (a: Complex, b: Complex, p = 9): void => {
  expect(a[0]).toBeCloseTo(b[0], p);
  expect(a[1]).toBeCloseTo(b[1], p);
};

// The unit disk: φ(z) = conj(1)·(z/(1−0·z)) = z, F(z) = 1/z.
const DISK = makeBoundedSchwarz([0, 0], [{ z: [0, 0], A: [[1, 0]] }]);
// A genuine bounded QD: φ(z) = 0.5·u, u = z/(1−0.3z); F(z) = 0.5/(z−0.3).
const LOBE = makeBoundedSchwarz([0, 0], [{ z: [0.3, 0], A: [[0.5, 0]] }]);
// Off-centre + complex branch, for the boundary-reflection pin over the whole circle.
const CPLX = makeBoundedSchwarz([0.1, -0.2], [{ z: [0.25, 0.1], A: [[0.3, 0.05], [0.04, -0.02]] }]);
// Two branches → pins the Σⱼ sum.
const TWO = makeBoundedSchwarz([0, 0], [
  { z: [0.2, 0], A: [[0.3, 0]] },
  { z: [-0.15, 0.2], A: [[0.2, 0.05]] },
]);

const INTERIOR: Complex[] = [[0.5, 0], [0, 0.4], [0.3, -0.2], [-0.4, 0.1]];

describe("@cas/schwarz bounded-QD σ (S5-C2)", () => {
  it("the unit disk reflects as σ(w) = 1/conj(w) (exact ground truth)", () => {
    expect(DISK.evalPhi([0.5, 0])).toEqual([0.5, 0]); // φ = z
    near(DISK.evalF([0.5, 0]), [2, 0]); // F = 1/z
    const invConj = (w: Complex): Complex => {
      const d = w[0] * w[0] + w[1] * w[1];
      return [w[0] / d, w[1] / d]; // 1/conj(w) = w/|w|²
    };
    for (const w of [[0.5, 0], [0, 0.5], [0.3, 0.4], [-0.2, 0.1]] as Complex[]) {
      const got = DISK.sigma(w);
      expect(got, `σ null at w=${w}`).not.toBeNull();
      if (got) near(got, invConj(w), 7);
    }
  });

  it("evalPhi / evalF / evalPhiDeriv at a known point of the single-lobe domain (hand-computed)", () => {
    // u(0.5) = 0.5/(1−0.15) = 0.5/0.85; φ = 0.5·u; F = 0.5/(0.5−0.3) = 2.5; φ' = 0.5/(0.85)².
    near(LOBE.evalPhi([0.5, 0]), [0.5 * (0.5 / 0.85), 0]);
    near(LOBE.evalF([0.5, 0]), [2.5, 0]);
    near(LOBE.evalPhiDeriv([0.5, 0]), [0.5 / (0.85 * 0.85), 0]);
  });

  it("boundary reflection F(z) = conj(φ(z)) on |z| = 1 (pins the Schwarz extension = σ is identity on ∂Ω)", () => {
    for (const dom of [DISK, LOBE, CPLX, TWO]) {
      for (let k = 0; k < 24; k++) {
        const t = (2 * Math.PI * (k + 0.5)) / 24;
        const z: Complex = [Math.cos(t), Math.sin(t)];
        near(dom.evalF(z), conj(dom.evalPhi(z)), 9);
      }
    }
  });

  it("round-trip σ(φ(z₀)) = conj(F(z₀)) for interior z₀ (the numerical inverse recovers the disk preimage)", () => {
    for (const dom of [LOBE, TWO]) {
      for (const z0 of INTERIOR) {
        const Fz0 = dom.evalF(z0);
        const got = dom.sigma(dom.evalPhi(z0));
        expect(got, `σ(φ(z₀)) null at z₀=${z0}`).not.toBeNull();
        if (got) near(got, [Fz0[0], -Fz0[1]], 7);
      }
    }
  });

  it("invertPhi returns the interior branch |z| < 1 for w ∈ Ω", () => {
    for (const z0 of INTERIOR) {
      const w = LOBE.evalPhi(z0);
      const z = LOBE.invertPhi(w);
      expect(z, `invert null at z₀=${z0}`).not.toBeNull();
      if (z) {
        expect(Math.hypot(z[0], z[1])).toBeLessThan(1); // interior branch
        near(LOBE.evalPhi(z), w, 7); // a genuine preimage
      }
    }
  });

  it("evalFDeriv = d/dz evalF (finite-difference; the σ distance-estimator factor)", () => {
    const fd = (dom: typeof LOBE, z: Complex, h = 1e-6): Complex => {
      const fp = dom.evalF([z[0] + h, z[1]]);
      const fm = dom.evalF([z[0] - h, z[1]]);
      return [(fp[0] - fm[0]) / (2 * h), (fp[1] - fm[1]) / (2 * h)];
    };
    for (const dom of [LOBE, CPLX, TWO]) {
      for (const z of INTERIOR) near(dom.evalFDeriv(z), fd(dom, z), 4);
    }
  });
});
