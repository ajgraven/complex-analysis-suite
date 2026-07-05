import { describe, expect, it } from "vitest";
import type { Complex } from "../src/complex";
import {
  CANONICAL_MATINGS,
  mateWithBasilica,
  postcriticalOrbit,
} from "../src/render/matingEngine";

const near = (a: Complex, b: Complex, tol = 1e-6): boolean => Math.hypot(a[0] - b[0], a[1] - b[1]) < tol;

/** Assert non-null and return (keeps the tests free of `!` non-null assertions). */
function must<T>(v: T | null): T {
  if (v === null) throw new Error("expected non-null");
  return v;
}

describe("postcriticalOrbit — the forward orbit of the critical point 0", () => {
  it("z² (c=0): 0 is fixed — period 1, preperiod 0", () => {
    const o = postcriticalOrbit([0, 0]);
    expect(o).not.toBeNull();
    expect(o?.period).toBe(1);
    expect(o?.preperiod).toBe(0);
  });

  it("basilica (c=−1): superattracting 2-cycle — period 2, preperiod 0", () => {
    const o = postcriticalOrbit([-1, 0]);
    expect(o?.period).toBe(2);
    expect(o?.preperiod).toBe(0);
  });

  it("rabbit (1/3-bulb centre): period 3, preperiod 0", () => {
    const o = postcriticalOrbit([-0.12256116687665, 0.74486176661974]);
    expect(o?.period).toBe(3);
    expect(o?.preperiod).toBe(0);
  });

  it("z²+i (Misiurewicz dendrite): preperiodic — a strictly positive preperiod onto a 2-cycle", () => {
    const o = postcriticalOrbit([0, 1]);
    expect(o?.period).toBe(2);
    expect(o?.preperiod).toBeGreaterThan(0);
  });

  it("returns null for a non-PCF parameter (0 escapes)", () => {
    expect(postcriticalOrbit([2, 0])).toBeNull();
  });
});

describe("mateWithBasilica — the Thurston pullback reproduces the canonical matings", () => {
  it("z²+i ⊔ basilica → (z²+2)/(z²−1) exactly (Jung, Example 2.5)", () => {
    const m = must(mateWithBasilica([0, 1]));
    expect(near(m.x1, [-2, 0])).toBe(true); // g(z) = (z² − (−2))/(z² − 1) = (z²+2)/(z²−1)
    expect(m.fString).toBe("(z^2 + 2)/(z^2 - 1)");
  });

  it("rabbit ⊔ basilica → x₁ = e^{+2πi/3} (crit-0 period 3)", () => {
    const m = must(mateWithBasilica([-0.12256116687665, 0.74486176661974]));
    expect(near(m.x1, [-0.5, Math.sqrt(3) / 2])).toBe(true);
    expect(m.critPeriod).toBe(3);
  });

  it("corabbit ⊔ basilica → x₁ = e^{−2πi/3} (the conjugate sibling, tracking conj(c_A))", () => {
    const m = must(mateWithBasilica([-0.12256116687665, -0.74486176661974]));
    expect(near(m.x1, [-0.5, -Math.sqrt(3) / 2])).toBe(true);
  });

  it("mating conjugate parameters gives conjugate maps: x₁(c̄) = conj(x₁(c))", () => {
    const c: Complex = [-0.12256116687665, 0.74486176661974];
    const m = must(mateWithBasilica(c));
    const mc = must(mateWithBasilica([c[0], -c[1]]));
    expect(near(mc.x1, [m.x1[0], -m.x1[1]])).toBe(true);
  });

  it("basilica ⊔ basilica is obstructed (self-conjugate ½-limb) — no valid map", () => {
    // The pullback would collapse to a spurious period-1 fixed point; the hyperbolic period check
    // rejects it, so the engine honestly returns null rather than a wrong map.
    expect(mateWithBasilica([-1, 0])).toBeNull();
  });

  it("returns null for a non-PCF first parent", () => {
    expect(mateWithBasilica([2, 0])).toBeNull();
  });
});

describe("CANONICAL_MATINGS — every listed mating cross-checks the pullback", () => {
  for (const cm of CANONICAL_MATINGS) {
    it(`${cm.name}: the engine reproduces the known x₁`, () => {
      const m = must(mateWithBasilica(cm.cA));
      expect(near(m.x1, cm.x1, 1e-5)).toBe(true);
    });
  }
});
