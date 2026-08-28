import { describe, it, expect } from "vitest";
import {
  admissible,
  solveZ0,
  onePointMap,
  recoverCharge,
  normalizedArea,
  minAbsPhiPrime,
  criticalTime,
  type Cx,
  type OnePointMap,
} from "../src/heleShawOnePoint.js";

const cabs = (a: Cx): number => Math.hypot(a[0], a[1]);
/** Assert a solve/map succeeded (the lint rule forbids `!`). */
function must<T>(v: T | null): T {
  if (v === null) throw new Error("expected a non-null result");
  return v;
}
const mapAt = (alpha: Cx, c: number, seed?: Cx): OnePointMap => must(onePointMap(alpha, c, seed));

// The Graven–Makarov one-point family QD(α/(w−w₀)), w₀ = 2. All quantities here are closed-form (`=`).

describe("admissibility (Theorem 3.3.1: |w₀|² + 2Re α > 2|α|, i.e. 2 + Re α > |α| at w₀=2)", () => {
  it("positive real α is always admissible; negative real α iff α > −1", () => {
    expect(admissible([1, 0])).toBe(true);
    expect(admissible([5, 0])).toBe(true);
    expect(admissible([-0.5, 0])).toBe(true); // −1 < −0.5 < 0
    expect(admissible([-1.5, 0])).toBe(false); // past the −w₀²<4α edge (α < −1)
  });
  it("complex α: admissible inside the parabola (α = i in, α = 2i on the edge)", () => {
    expect(admissible([0, 1])).toBe(true); // 2 > 1
    expect(admissible([0, 1.5])).toBe(true); // 2 > 1.5
    expect(admissible([0, 2])).toBe(false); // 2 > 2 is false (on the boundary)
  });
});

describe("prevertex z₀ and the map φ_t (Eq 3.10)", () => {
  it("φ_t(z) ~ c·z at ∞ (the conformal radius is the leading coefficient) with the pole inside 𝔻", () => {
    for (const c of [1.5, 2, 2.5]) {
      const m = mapAt([1, 0], c);
      const R = 1e6;
      const lead = m.evalPhi([R, 0]);
      expect(lead[0] / R).toBeCloseTo(c, 4);
      expect(Math.abs(lead[1]) / R).toBeLessThan(1e-6);
      expect(cabs(m.pole)).toBeLessThan(1); // pole 1/z̄₀ strictly inside the unit disk
    }
  });

  it("real α uses the positive real root ≥ 1 of the Eq-3.11 quartic", () => {
    const z0 = must(solveZ0([1, 0], 2));
    expect(z0[1]).toBe(0);
    expect(z0[0]).toBeGreaterThanOrEqual(1);
    // the quartic residual c²z⁴ − 2c z³ − α z² − 2c z + 4 = 0
    const c = 2, a = 1, z = z0[0];
    expect(c * c * z ** 4 - 2 * c * z ** 3 - a * z * z - 2 * c * z + 4).toBeCloseTo(0, 9);
  });
});

describe("the conserved Hele-Shaw datum: recoverCharge(φ_t) = α at every t", () => {
  it("real α = 1 is recovered exactly across the whole family (only the area grows)", () => {
    for (const c of [1.2, 1.8, 2.4, 2.9]) {
      const got = recoverCharge(mapAt([1, 0], c));
      expect(got[0]).toBeCloseTo(1, 10);
      expect(got[1]).toBeCloseTo(0, 10);
    }
  });

  it("complex α = i is recovered exactly as c marches up (the twist datum is conserved)", () => {
    const alpha: Cx = [0, 1];
    let seed = must(solveZ0(alpha, 0.4));
    for (const c of [0.4, 0.5, 0.6, 0.7, 0.8]) {
      const z0 = must(solveZ0(alpha, c, seed));
      seed = z0;
      const m = mapAt(alpha, c, z0);
      const got = recoverCharge(m);
      expect(got[0]).toBeCloseTo(0, 9);
      expect(got[1]).toBeCloseTo(1, 9);
    }
  });
});

describe("π-normalized area t = A(Ω_t)/π grows monotonically with the conformal radius", () => {
  it("area increases with c for α = 1", () => {
    const a2 = normalizedArea(mapAt([1, 0], 2));
    const a25 = normalizedArea(mapAt([1, 0], 2.5));
    expect(a2).toBeGreaterThan(0);
    expect(a25).toBeGreaterThan(a2);
  });
});

describe("critical time & termination mechanism", () => {
  it("α = 1 (positive real) terminates in a DOUBLE POINT at c* = w₀+√α = 3, t* = w₀(w₀+2√α) = 8", () => {
    const cr = criticalTime([1, 0]);
    expect(cr.mechanism).toBe("double-point");
    expect(cr.cStar).toBeCloseTo(3, 12);
    expect(cr.tStar).toBeCloseTo(8, 12);
    // at c just below c* the map is still univalent (min|φ'| > 0 — the double point is self-tangency,
    // not a cusp, so |φ'| does NOT vanish there)
    expect(minAbsPhiPrime(mapAt([1, 0], 2.9))).toBeGreaterThan(1e-2);
  });

  it("α = 4 double point: c* = 2+2 = 4, t* = 2(2+4) = 12", () => {
    const cr = criticalTime([4, 0]);
    expect(cr.cStar).toBeCloseTo(4, 12);
    expect(cr.tStar).toBeCloseTo(12, 12);
  });

  it("negative real α = −0.5 terminates in a (3,2)-CUSP at a finite c*", () => {
    const cr = criticalTime([-0.5, 0]);
    expect(cr.mechanism).toBe("cusp");
    expect(cr.cStar).toBeGreaterThan(0);
    expect(cr.cStar).toBeLessThan(2);
    expect(cr.tStar).toBeGreaterThan(0);
    // no admissible prevertex past the critical radius
    expect(solveZ0([-0.5, 0], cr.cStar + 0.1)).toBeNull();
  });

  it("complex α = i (maximal twist) terminates in a (3,2)-CUSP at a finite c*", () => {
    const cr = criticalTime([0, 1]);
    expect(cr.mechanism).toBe("cusp");
    expect(cr.cStar).toBeGreaterThan(0.3);
    expect(cr.cStar).toBeLessThan(1.5);
    expect(cr.tStar).toBeGreaterThan(0);
  });

  it("near-edge twist α = 1.5i: c* shrinks toward the parabola edge but the domain still spans a real range", () => {
    // guards the marched-continuation critical-time finder: a cold per-c solve fails intermittently near
    // the edge and used to report a spurious c* ≈ 0.08, though the domain plainly exists out to c ≈ 0.5.
    const cr = criticalTime([0, 1.5]);
    expect(cr.mechanism).toBe("cusp");
    expect(cr.cStar).toBeGreaterThan(0.3); // NOT the spurious ~0.08
    expect(cr.cStar).toBeLessThan(criticalTime([0, 1]).cStar); // shrinks toward the α=2i edge
    expect(solveZ0([0, 1.5], 0.3, must(solveZ0([0, 1.5], 0.1)))).not.toBeNull(); // domain exists mid-range
  });
});
