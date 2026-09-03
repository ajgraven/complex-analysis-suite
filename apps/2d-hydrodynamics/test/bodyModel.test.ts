import { describe, it, expect } from "vitest";
import { EXTERIOR_MAP_PRESETS, refVelocity, type Pt } from "@cas/flow";
import { airfoilBody, galleryBody, physicalVelocity } from "../src/bodyModel.js";
import {
  physicalVelocity as airfoilPhysicalVelocity,
  joukowski,
  cylinderRadius,
  type AirfoilParams,
} from "../src/airfoil.js";

const cdiv = (a: Pt, b: Pt): Pt => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};

// The linchpin (ADR-0038 / HD-6.1): the airfoil expressed as ψ(w) = J(ζ₀ + R·w) on the unit-disk exterior
// reproduces the EXACT physical velocity field dW/dz of the original airfoil.ts (which flows past the
// cylinder |ζ − ζ₀| = R and inverts J per point). If this holds, the single-page unification changes no
// physics.
describe("airfoil-as-ψ equivalence (the unification golden)", () => {
  const cases: readonly AirfoilParams[] = [
    { U: 1, alpha: (8 * Math.PI) / 180, b: 1, center: [-0.12, 0.06], circulation: 0.9, n: 2 }, // Joukowski, cambered
    { U: 1, alpha: (-5 * Math.PI) / 180, b: 1, center: [-0.2, 0.0], circulation: -1.3, n: 1.9 }, // Kármán–Trefftz
    { U: 1, alpha: 0, b: 1, center: [-0.05, 0.1], circulation: 0, n: 2 }, // no circulation
  ];

  for (const p of cases) {
    it(`matches airfoil.ts dW/dz  (center=[${p.center}], n=${p.n}, Γ=${p.circulation})`, () => {
      const body = airfoilBody(p);
      for (let i = 0; i < 12; i++) {
        const rad = 1.1 + 0.4 * i; // stay safely outside |w| = 1
        const th = (2 * Math.PI * i) / 12 + 0.3;
        const w: Pt = [rad * Math.cos(th), rad * Math.sin(th)];
        const z = body.psi(w); // the wing-plane point
        const vNew = physicalVelocity(body, w);
        const vOld = airfoilPhysicalVelocity(p, z);
        expect(vNew[0]).toBeCloseTo(vOld[0], 9);
        expect(vNew[1]).toBeCloseTo(vOld[1], 9);
      }
    });
  }

  it("ψ(w) = J(ζ₀ + R·w) matches the direct composition", () => {
    const p: AirfoilParams = { U: 1, alpha: 0, b: 1, center: [-0.12, 0.06], circulation: 0, n: 2 };
    const body = airfoilBody(p);
    const R = cylinderRadius(p);
    const w: Pt = [1.5, 0.8];
    const zeta: Pt = [p.center[0] + R * w[0], p.center[1] + R * w[1]];
    const direct = joukowski(zeta, p.b);
    expect(body.psi(w)[0]).toBeCloseTo(direct[0], 12);
    expect(body.psi(w)[1]).toBeCloseTo(direct[1], 12);
  });

  it("the free-stream speed at ∞ is U (the leading coefficient cancels)", () => {
    const p: AirfoilParams = { U: 1, alpha: 0, b: 1, center: [-0.12, 0.06], circulation: 0, n: 2 };
    const body = airfoilBody(p);
    const vFar = physicalVelocity(body, [500, 0]); // w → ∞ along the stream
    expect(Math.hypot(vFar[0], vFar[1])).toBeCloseTo(1, 3); // |dW/dz| → U = 1
  });
});

describe("gallery body", () => {
  it("physical velocity = W_ref'/ψ' for a closed-form preset", () => {
    const ellipse = EXTERIOR_MAP_PRESETS.find((e) => e.id === "ellipse-ext");
    if (!ellipse) throw new Error("ellipse-ext preset missing");
    const body = galleryBody(ellipse, 0.2, 1.0);
    const w: Pt = [1.8, -0.6];
    const expected = cdiv(refVelocity(w, body.flow), ellipse.psiPrime(w));
    const got = physicalVelocity(body, w);
    expect(got[0]).toBeCloseTo(expected[0], 12);
    expect(got[1]).toBeCloseTo(expected[1], 12);
    expect(body.flow.U).toBe(1);
    expect(body.isAirfoil).toBe(false);
  });
});
