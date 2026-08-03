// Characterization net for the pure geometry helpers extracted from ui.mjs (refactor D — ui.mjs seam).
//
// boundarySelfIntersectsSimple / segmentsIntersect were module-private in ui.mjs (a 1931-line DOM
// orchestrator with no seam) and untested. This pins their behavior — including the intentional
// limitation that the cheap strict-`>` CCW test does NOT flag collinear overlap — so the extraction is
// provably behavior-preserving. Points are { re, im }. No DOM. Mutation-verified.
import { describe, it, expect } from "vitest";
import { boundarySelfIntersectsSimple, segmentsIntersect } from "../app/ui/ui-geometry.mjs";

const P = (re: number, im: number) => ({ re, im });

describe("ui-geometry: segmentsIntersect", () => {
  it("two crossing segments intersect", () => {
    expect(segmentsIntersect(P(0, 0), P(2, 2), P(0, 2), P(2, 0))).toBe(true);
  });
  it("two parallel (non-crossing) segments do not", () => {
    expect(segmentsIntersect(P(0, 0), P(1, 0), P(0, 1), P(1, 1))).toBe(false);
  });
  it("collinear overlapping segments are NOT flagged (cheap strict-> CCW limitation, pinned)", () => {
    expect(segmentsIntersect(P(0, 0), P(2, 0), P(1, 0), P(3, 0))).toBe(false);
  });
});

describe("ui-geometry: boundarySelfIntersectsSimple", () => {
  it("a simple square does not self-intersect", () => {
    expect(boundarySelfIntersectsSimple([P(0, 0), P(1, 0), P(1, 1), P(0, 1)])).toBe(false);
  });
  it("a bow-tie quad self-intersects", () => {
    expect(boundarySelfIntersectsSimple([P(0, 0), P(1, 1), P(1, 0), P(0, 1)])).toBe(true);
  });
  it("fewer than 4 points is never self-intersecting (N<4 short-circuit)", () => {
    expect(boundarySelfIntersectsSimple([P(0, 0), P(1, 0), P(0, 1)])).toBe(false);
    expect(boundarySelfIntersectsSimple([])).toBe(false);
  });
});
