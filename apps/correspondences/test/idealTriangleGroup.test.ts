import { describe, expect, it } from "vitest";
import type { Complex } from "../src/deltoid.js";
import {
  fundamentalEdges,
  IDEAL_VERTICES,
  inFundamental,
  nielsen,
  reflect,
  REFLECTION_CIRCLES,
  tessellate,
} from "../src/models/idealTriangleGroup.js";

const near = (a: Complex, b: Complex, p = 9): void => {
  expect(a[0]).toBeCloseTo(b[0], p);
  expect(a[1]).toBeCloseTo(b[1], p);
};
const abs2 = (z: Complex): number => z[0] * z[0] + z[1] * z[1];
const SAMPLES: Complex[] = [
  [0, 0],
  [0.3, 0.2],
  [-0.4, 0.5],
  [0.1, -0.6],
];

describe("ideal triangle reflection group Γ", () => {
  it("each geodesic side is a circle orthogonal to ∂𝔻 (|C|² = 1 + r² = 4, r² = 3)", () => {
    expect(REFLECTION_CIRCLES.length).toBe(3);
    for (const c of REFLECTION_CIRCLES) {
      expect(c.r2).toBeCloseTo(3, 12);
      expect(abs2(c.center)).toBeCloseTo(4, 12); // orthogonality to the unit circle
    }
  });

  it("reflections are anti-conformal involutions (R_k∘R_k = id)", () => {
    for (let k = 0; k < 3; k++) for (const z of SAMPLES) near(reflect(k, reflect(k, z)), z, 9);
  });

  it("side k fixes both of its ideal vertices (k and k+1)", () => {
    for (let k = 0; k < 3; k++) {
      near(reflect(k, IDEAL_VERTICES[k]), IDEAL_VERTICES[k], 9);
      near(reflect(k, IDEAL_VERTICES[(k + 1) % 3]), IDEAL_VERTICES[(k + 1) % 3], 9);
    }
  });

  it("reflections preserve 𝔻 (|R_k(z)| < 1 for |z| < 1)", () => {
    for (let k = 0; k < 3; k++) for (const z of SAMPLES) expect(abs2(reflect(k, z))).toBeLessThan(1);
  });

  it("the fundamental tile contains 0 and reaches to its vertices, but not a reflected point", () => {
    expect(inFundamental([0, 0])).toBe(true);
    expect(inFundamental([0.9, 0])).toBe(true); // still fundamental — the triangle reaches toward v_0 = 1
    expect(inFundamental([-0.9, 0])).toBe(false); // inside reflection circle 1
    expect(inFundamental(reflect(0, [0, 0]))).toBe(false); // R_0(0) is in the adjacent tile
  });

  it("tessellation grows 1, 3, 6, 12 by depth with reduced words, all tiles in 𝔻", () => {
    const tiles = tessellate(4);
    const byDepth = (d: number): number => tiles.filter((t) => t.depth === d).length;
    expect(byDepth(0)).toBe(1);
    expect(byDepth(1)).toBe(3);
    expect(byDepth(2)).toBe(6);
    expect(byDepth(3)).toBe(12);
    for (const t of tiles) {
      near(t.rep, t.apply([0, 0]), 12); // rep = g(0)
      expect(abs2(t.rep)).toBeLessThan(1); // stays in 𝔻
      for (let i = 1; i < t.word.length; i++) expect(t.word[i]).not.toBe(t.word[i - 1]); // reduced
    }
  });

  it("the Nielsen map is R_k inside circle k and undefined on the fundamental tile", () => {
    expect(nielsen([0, 0])).toBeNull(); // fundamental
    const inside0 = reflect(0, [0, 0]); // R_0(0) lies inside circle 0
    const n = nielsen(inside0);
    expect(n).not.toBeNull();
    if (n) near(n, reflect(0, inside0), 9);
  });

  it("fundamental edges are arcs of the reflection circles ending at the ideal vertices", () => {
    const edges = fundamentalEdges(16);
    expect(edges.length).toBe(3);
    for (let k = 0; k < 3; k++) {
      const e = edges[k];
      near(e[0], IDEAL_VERTICES[k], 9); // starts at vertex k
      near(e[e.length - 1], IDEAL_VERTICES[(k + 1) % 3], 9); // ends at vertex k+1
      for (const p of e) {
        const dx = p[0] - REFLECTION_CIRCLES[k].center[0];
        const dy = p[1] - REFLECTION_CIRCLES[k].center[1];
        expect(dx * dx + dy * dy).toBeCloseTo(3, 6); // on circle k
        expect(abs2(p)).toBeLessThanOrEqual(1 + 1e-9); // inside 𝔻̄
      }
    }
  });
});
