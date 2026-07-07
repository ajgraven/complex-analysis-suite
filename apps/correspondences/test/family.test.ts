import { describe, expect, it } from "vitest";
import {
  criticalEscape,
  criticalPoints,
  criticalValues,
  familyMember,
} from "../src/family.js";
import { DELTOID, type Complex } from "../src/deltoid.js";

const near = (a: Complex, b: Complex, p = 8): void => {
  expect(a[0]).toBeCloseTo(b[0], p);
  expect(a[1]).toBeCloseTo(b[1], p);
};
const cube = (z: Complex): Complex => {
  const z2: Complex = [z[0] * z[0] - z[1] * z[1], 2 * z[0] * z[1]];
  return [z2[0] * z[0] - z2[1] * z[1], z2[0] * z[1] + z2[1] * z[0]];
};
const OMEGA: Complex = [-0.5, Math.sqrt(3) / 2]; // primitive cube root of unity ω

describe("correspondence family φ_a(z) = z + a/(2 z²)", () => {
  it("a = 1 reproduces the tested deltoid engine (σ and the 2:2 correspondence)", () => {
    const m = familyMember([1, 0]);
    const w: Complex = [1.9, 0.3]; // a point in Ω
    const got = m.schwarz.sigma(w);
    const ref = DELTOID.sigma(w);
    expect(got).not.toBeNull();
    expect(ref).not.toBeNull();
    if (!got || !ref) return; // narrows for TS; the asserts above already failed the test if null
    near(got, ref, 10);
    // the correspondence golden 1 ± √2 at z = [2,0] (Milestone B) still holds through the family builder
    const bs = m.correspondence.branches([2, 0]).sort((p, q) => p[0] - q[0]);
    expect(bs.length).toBe(2);
    near(bs[0], [1 - Math.SQRT2, 0], 7);
    near(bs[1], [1 + Math.SQRT2, 0], 7);
  });

  it("critical points are the cube roots of a; critical values are the cusps 1.5·{1,ω,ω²} at a=1", () => {
    const cps = criticalPoints([1, 0]);
    expect(cps.length).toBe(3);
    for (const z of cps) near(cube(z), [1, 0], 10); // ζ³ = a = 1
    const cvs = criticalValues(familyMember([1, 0]));
    const real = cvs.find((v) => Math.abs(v[1]) < 1e-9);
    expect(real).toBeDefined();
    if (!real) return;
    near(real, [1.5, 0], 9); // the real cusp
    const target: Complex = [1.5 * OMEGA[0], 1.5 * OMEGA[1]]; // 1.5·ω is among the cusps
    expect(cvs.some((v) => Math.hypot(v[0] - target[0], v[1] - target[1]) < 1e-8)).toBe(true);
  });

  it("a = 8 (real): a critical value is φ_8(2) = 3", () => {
    const cvs = criticalValues(familyMember([8, 0]));
    const real = cvs.find((v) => Math.abs(v[1]) < 1e-9);
    expect(real).toBeDefined();
    if (!real) return;
    near(real, [3, 0], 9);
  });

  it("a = 0 has no finite critical point (φ_0 = z)", () => {
    expect(criticalPoints([0, 0]).length).toBe(0);
  });

  it("the deltoid a = 1 is in the connectedness locus (cusp orbits do NOT escape to ∞)", () => {
    const r = criticalEscape([1, 0], { maxIter: 80, escapeR: 1e3 });
    expect(r.escaped).toBe(false);
    expect(r.n).toBe(80);
  });

  it("a far-from-deltoid parameter escapes (a critical orbit runs away to ∞)", () => {
    const r = criticalEscape([6, 0], { maxIter: 80, escapeR: 1e3 });
    expect(r.escaped).toBe(true);
    expect(r.n).toBeLessThan(80);
  });

  it("a ≈ 0 (the round disk) is trivially in the locus", () => {
    expect(criticalEscape([0, 0]).escaped).toBe(false);
  });

  it("criticalEscape is deterministic — no RNG", () => {
    const a = criticalEscape([1.4, 0.2]);
    const b = criticalEscape([1.4, 0.2]);
    expect(a).toEqual(b);
  });
});
