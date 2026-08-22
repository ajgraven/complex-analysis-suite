// handleEdit — the pure similarity-inversion math behind in-panel polygon editing.
import { describe, expect, it } from "vitest";
import { fitSimilarity, rawVertexFromHandleDrag, type V2 } from "../src/handleEdit.js";

const square: V2[] = [
  [1, 1],
  [-1, 1],
  [-1, -1],
  [1, -1],
];

/** Apply canonical = a·raw + b (complex) to a raw point, for constructing test fixtures. */
function applySim(a: [number, number], b: [number, number], p: V2): V2 {
  return [a[0] * p[0] - a[1] * p[1] + b[0], a[0] * p[1] + a[1] * p[0] + b[1]];
}

describe("fitSimilarity", () => {
  it("recovers the identity when raw === canonical", () => {
    const s = fitSimilarity(square, square);
    expect(s).not.toBeNull();
    expect(s?.aRe).toBeCloseTo(1, 12);
    expect(s?.aIm).toBeCloseTo(0, 12);
    expect(s?.bRe).toBeCloseTo(0, 12);
    expect(s?.bIm).toBeCloseTo(0, 12);
  });

  it("recovers a known rotate+scale+translate (a = 2i, b = (3,−1))", () => {
    const a: [number, number] = [0, 2]; // scale 2, rotate 90°
    const b: [number, number] = [3, -1];
    const canonical = square.map((p) => applySim(a, b, p));
    const s = fitSimilarity(square, canonical);
    expect(s?.aRe).toBeCloseTo(0, 10);
    expect(s?.aIm).toBeCloseTo(2, 10);
    expect(s?.bRe).toBeCloseTo(3, 10);
    expect(s?.bIm).toBeCloseTo(-1, 10);
  });

  it("returns null for fewer than two corners or coincident raw corners", () => {
    expect(fitSimilarity([[0, 0]], [[0, 0]])).toBeNull();
    expect(fitSimilarity([[1, 1], [1, 1]], [[0, 0], [5, 5]])).toBeNull();
  });
});

describe("rawVertexFromHandleDrag", () => {
  it("inverts the similarity: a canonical point maps back to its raw preimage", () => {
    const a: [number, number] = [0, 2];
    const b: [number, number] = [3, -1];
    const canonical = square.map((p) => applySim(a, b, p));
    // Drag corner 0 to where the raw point (0.5, 0.8) would land in canonical space.
    const target = applySim(a, b, [0.5, 0.8]);
    const raw = rawVertexFromHandleDrag(square, canonical, target);
    expect(raw).not.toBeNull();
    expect(raw?.[0]).toBeCloseTo(0.5, 9);
    expect(raw?.[1]).toBeCloseTo(0.8, 9);
  });

  it("round-trips the identity (canonical === raw): the drag point IS the raw vertex", () => {
    const raw = rawVertexFromHandleDrag(square, square, [0.3, -0.7]);
    expect(raw?.[0]).toBeCloseTo(0.3, 12);
    expect(raw?.[1]).toBeCloseTo(-0.7, 12);
  });

  it("returns null when the similarity is undetermined", () => {
    expect(rawVertexFromHandleDrag([[0, 0]], [[0, 0]], [1, 1])).toBeNull();
  });
});
