import { describe, expect, it } from "vitest";
import { criticalPoints, familyMember } from "../src/family.js";
import type { Complex } from "../src/deltoid.js";

// Pins the TRUE univalence range of the family φ_a(z) = z + a/(2z²) on the exterior {|z|>1}.
//
// The app previously asserted — in family.ts, in paramGpu.ts, and in the user-facing parameter-plane
// caption, using the word "proven" — that φ_a is univalent there for |a| ≤ √2. That came from reading
// the area theorem backwards: Σ n|bₙ|² = |a|²/2 ≤ 1 ⟺ |a| ≤ √2 is a NECESSARY condition satisfied BY
// univalent functions, never a sufficient one.
//
// The real bound is |a| ≤ 1, straight from φ_a'(z) = 1 − a/z³, which vanishes at |z| = |a|^{1/3}. This
// file fails if anyone restores the √2 claim in code that these assertions can see.

const abs = (z: Complex): number => Math.hypot(z[0], z[1]);
const cmul = (p: Complex, q: Complex): Complex => [p[0] * q[0] - p[1] * q[1], p[0] * q[1] + p[1] * q[0]];
const cdiv = (p: Complex, q: Complex): Complex => {
  const d = q[0] * q[0] + q[1] * q[1];
  return [(p[0] * q[0] + p[1] * q[1]) / d, (p[1] * q[0] - p[0] * q[1]) / d];
};
/** φ_a'(z) = 1 − a/z³. */
const dPhi = (a: Complex, z: Complex): Complex => {
  const t = cdiv(a, cmul(cmul(z, z), z));
  return [1 - t[0], -t[1]];
};

describe("family φ_a univalence range on {|z|>1}", () => {
  it("critical points sit at |z| = |a|^(1/3): inside the exterior exactly when |a| > 1", () => {
    for (const [ax, ay] of [
      [0.5, 0],
      [1, 0],
      [1.2, 0],
      [Math.SQRT2, 0],
      [0, 1.3],
      [-1.6, 0.4],
    ] as Complex[]) {
      const a: Complex = [ax, ay];
      const modA = abs(a);
      for (const zc of criticalPoints(a)) {
        // Every critical point really is one, and its modulus is |a|^(1/3).
        expect(abs(dPhi(a, zc))).toBeLessThan(1e-9);
        expect(abs(zc)).toBeCloseTo(Math.cbrt(modA), 9);
      }
      // The decisive statement: a critical point lies in the OPEN exterior iff |a| > 1. A univalent
      // map has non-vanishing derivative, so |a| > 1 ⇒ not univalent on {|z|>1}.
      const critInExterior = criticalPoints(a).some((zc) => abs(zc) > 1 + 1e-12);
      expect(critInExterior).toBe(modA > 1 + 1e-12);
    }
  });

  it("a = 1.2 is inside the old √2 claim yet φ_a is provably NOT injective on {|z|>1}", () => {
    // Explicit counterexample: two distinct exterior points with the same image. Derived by solving
    // φ_a(z) = φ_a(w) near the critical point |z| = 1.2^(1/3) ≈ 1.0627, then pinned here as a golden.
    const a: Complex = [1.2, 0];
    expect(abs(a)).toBeLessThanOrEqual(Math.SQRT2); // the old bound would have called this univalent
    const { schwarz } = familyMember(a);

    const z: Complex = [1.052307, 0.208604];
    const w: Complex = [1.02, -0.2];
    expect(abs(z)).toBeGreaterThan(1);
    expect(abs(w)).toBeGreaterThan(1);
    expect(abs([z[0] - w[0], z[1] - w[1]])).toBeGreaterThan(0.4); // genuinely distinct, not a rounding twin

    const pz = schwarz.evalPhi(z);
    const pw = schwarz.evalPhi(w);
    expect(abs([pz[0] - pw[0], pz[1] - pw[1]])).toBeLessThan(1e-6); // same image ⇒ not injective
  });

  it("the deltoid a = 1 sits exactly on the boundary of the univalence range", () => {
    // Its critical points land on |z| = 1 — which is why the deltoid's cusps land on ∂Ω.
    for (const zc of criticalPoints([1, 0])) expect(abs(zc)).toBeCloseTo(1, 12);
  });
});
