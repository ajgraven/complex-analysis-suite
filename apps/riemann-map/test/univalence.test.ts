import { describe, expect, it } from "vitest";
import { segmentsProperlyIntersect, polylineSelfIntersects, downsample } from "../src/analysis/univalence.js";
import type { Pt } from "../src/render/grid.js";

describe("univalence / folding detection (1.4)", () => {
  it("segmentsProperlyIntersect: a crossing X yes, a shared endpoint no", () => {
    expect(segmentsProperlyIntersect([-1, 0], [1, 0], [0, -1], [0, 1])).toBe(true); // proper X
    expect(segmentsProperlyIntersect([0, 0], [1, 0], [1, 0], [1, 1])).toBe(false); // touch at (1,0)
    expect(segmentsProperlyIntersect([0, 0], [1, 0], [0, 1], [1, 1])).toBe(false); // parallel
  });

  it("a convex loop does NOT self-intersect; a figure-eight DOES", () => {
    const square: Pt[] = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
      [-1, -1],
    ];
    expect(polylineSelfIntersects(square, true)).toBe(false);
    // A bowtie / figure-eight: the two diagonals of the quad cross.
    const bowtie: Pt[] = [
      [-1, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];
    expect(polylineSelfIntersects(bowtie, true)).toBe(true);
  });

  it("a sampled unit circle (univalent image boundary) reads as non-self-intersecting", () => {
    const circle: Pt[] = Array.from({ length: 200 }, (_, i): Pt => {
      const t = (2 * Math.PI * i) / 199;
      return [Math.cos(t), Math.sin(t)];
    });
    expect(polylineSelfIntersects(circle, true)).toBe(false);
  });

  it("downsample keeps the endpoints and caps the length", () => {
    const poly: Pt[] = Array.from({ length: 500 }, (_, i): Pt => [i, 0]);
    const d = downsample(poly, 50);
    expect(d.length).toBe(50);
    expect(d[0]).toEqual([0, 0]);
    expect(d[d.length - 1]).toEqual([499, 0]);
    expect(downsample(poly, 800).length).toBe(500); // already short enough → unchanged
  });
});
