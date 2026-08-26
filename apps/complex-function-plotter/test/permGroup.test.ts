import { describe, it, expect } from "vitest";
import {
  compose,
  inverse,
  identityPerm,
  isIdentity,
  cycles,
  cycleCount,
  generatedGroup,
  isTransitive,
  riemannHurwitzGenus,
  namedGroup,
  type Perm,
} from "../src/riemann/permGroup.js";

describe("permutation basics", () => {
  it("composes, inverts, and identifies the identity", () => {
    const a: Perm = [1, 0, 2]; // (0 1)
    const b: Perm = [0, 2, 1]; // (1 2)
    expect(compose(a, a)).toEqual([0, 1, 2]);
    expect(isIdentity(compose(a, a))).toBe(true);
    expect(compose(a, inverse(a))).toEqual(identityPerm(3));
    // (a∘b)(i) = a[b[i]]: b=(1 2) then a=(0 1) → [1,2,0] = (0 1 2)
    expect(compose(a, b)).toEqual([1, 2, 0]);
  });

  it("decomposes into cycles including fixed points, and counts orbits", () => {
    expect(cycles([1, 0, 2])).toEqual([[0, 1], [2]]);
    expect(cycleCount([1, 0, 2])).toBe(2); // one 2-cycle + one fixed point
    expect(cycleCount([1, 2, 0])).toBe(1); // a single 3-cycle
    expect(cycleCount(identityPerm(4))).toBe(4);
  });
});

describe("generatedGroup + transitivity", () => {
  it("a single transposition on 2 points → C2, transitive", () => {
    const g = generatedGroup([[1, 0]], 2);
    expect(g.order).toBe(2);
    expect(g.transitive).toBe(true);
    expect(g.capped).toBe(false);
  });

  it("a 3-cycle → C3, transitive", () => {
    const g = generatedGroup([[1, 2, 0]], 3);
    expect(g.order).toBe(3);
    expect(g.transitive).toBe(true);
  });

  it("two transpositions (0 1),(1 2) → S3, transitive", () => {
    const g = generatedGroup([[1, 0, 2], [0, 2, 1]], 3);
    expect(g.order).toBe(6);
    expect(g.transitive).toBe(true);
  });

  it("a transposition on 3 points is intransitive (surface disconnected)", () => {
    expect(isTransitive([[1, 0, 2]], 3)).toBe(false); // orbit of 0 is {0,1}, not {0,1,2}
    expect(generatedGroup([[1, 0, 2]], 3).transitive).toBe(false);
  });

  it("respects the element cap and reports it as a lower bound", () => {
    const g = generatedGroup([[1, 2, 0], [1, 0, 2]], 3, 3); // would be S3 (6) but capped at 3
    expect(g.capped).toBe(true);
    expect(g.order).toBeLessThanOrEqual(3 + 3); // near the cap, not the full 6
  });
});

describe("riemannHurwitzGenus", () => {
  it("√z: one finite (1 2) + ∞ (1 2), n=2 → genus 0", () => {
    // cycle counts: (1 2) has 1 cycle; two branch points (0 and ∞)
    const r = riemannHurwitzGenus([1, 1], 2);
    expect(r.consistent).toBe(true);
    expect(r.genus).toBe(0);
    expect(r.ramification).toBe(2);
  });

  it("√(z²−1): two finite transpositions, trivial at ∞ → genus 0", () => {
    // finite: (1 2),(1 2) → 1 cycle each; ∞: identity → 2 cycles
    const r = riemannHurwitzGenus([1, 1, 2], 2);
    expect(r.genus).toBe(0);
  });

  it("w²=z³−z: three finite transpositions + (1 2) at ∞, n=2 → genus 1 (torus)", () => {
    const r = riemannHurwitzGenus([1, 1, 1, 1], 2);
    expect(r.consistent).toBe(true);
    expect(r.genus).toBe(1);
    expect(r.ramification).toBe(4);
  });

  it("flags inconsistent data (odd total ramification) as null genus", () => {
    const r = riemannHurwitzGenus([1], 2); // R = 1, odd → impossible for a real cover
    expect(r.consistent).toBe(false);
    expect(r.genus).toBeNull();
  });
});

describe("namedGroup", () => {
  it("names the common small groups", () => {
    expect(namedGroup(2, 2, true)).toBe("C2 (cyclic)");
    expect(namedGroup(3, 3, true)).toBe("C3 (cyclic)");
    expect(namedGroup(6, 3, true)).toBe("S3 (symmetric)");
    expect(namedGroup(1, 4, false)).toBe("trivial");
  });
});
