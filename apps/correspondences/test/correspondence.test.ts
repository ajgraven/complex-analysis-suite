import { describe, expect, it } from "vitest";
import { DELTOID, type Complex } from "../src/deltoid.js";
import { DELTOID_CORRESPONDENCE, eta } from "../src/correspondence.js";

const near = (a: Complex, b: Complex, p = 8): void => {
  expect(a[0]).toBeCloseTo(b[0], p);
  expect(a[1]).toBeCloseTo(b[1], p);
};
const sortByRe = (ws: Complex[]): Complex[] => [...ws].sort((a, b) => a[0] - b[0]);

const SAMPLES: Complex[] = [
  [2, 0],
  [0, 2],
  [1.5, -0.8],
  [-2, 1],
];

describe("unit-circle reflection η(z) = 1/conj(z)", () => {
  it("formula, involution, and fixes the unit circle", () => {
    near(eta([2, 0]), [0.5, 0]);
    near(eta([0, 2]), [0, 0.5]);
    for (const z of SAMPLES) near(eta(eta(z)), z); // η is an involution
    const u: Complex = [Math.cos(0.9), Math.sin(0.9)];
    near(eta(u), u); // |z| = 1 is fixed
  });
});

describe("deltoid deleted correspondence — branch enumeration via @cas/core Durand–Kerner", () => {
  it("is a 2:2 correspondence (φ has degree 3)", () => {
    expect(DELTOID_CORRESPONDENCE.degree).toBe(2);
  });

  it("z=[2,0]: branches are 1 ± √2 — the cubic w³ − 2.5 w² + 0.5 = (w−0.5)(w²−2w−1), trivial root 0.5 deleted", () => {
    const bs = sortByRe(DELTOID_CORRESPONDENCE.branches([2, 0]));
    expect(bs.length).toBe(2);
    near(bs[0], [1 - Math.SQRT2, 0], 7); // ≈ −0.41421356
    near(bs[1], [1 + Math.SQRT2, 0], 7); // ≈  2.41421356
  });

  it("every branch w satisfies φ(w) = φ(η(z)), and the trivial root w = η(z) is deleted", () => {
    for (const z of SAMPLES) {
      const e = eta(z);
      const V = DELTOID.evalPhi(e);
      const bs = DELTOID_CORRESPONDENCE.branches(z);
      expect(bs.length).toBe(2);
      for (const w of bs) {
        near(DELTOID.evalPhi(w), V, 7); // w is on the correspondence: φ(w) = V
        expect(Math.hypot(w[0] - e[0], w[1] - e[1])).toBeGreaterThan(1e-4); // and w ≠ η(z)
      }
    }
  });
});
