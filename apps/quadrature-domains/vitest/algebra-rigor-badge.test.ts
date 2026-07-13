// @vitest-environment jsdom
// =============================================================================
// algebra-rigor-badge — the verdict-card RIGOR BADGE mapping (QD.AlgebraCanvas.rigorMeta).
// (jsdom env: algebra-canvas.mjs touches `window` at module load — the renderer's browser global.)
//
// Maturity-review Slice 4 (finding G-2): the verdict card was one flat text node with NO
// =/≤/≈ badge, so a certified '=' result and an '≈'/lower-bound one looked identical. rigorMeta
// maps a rigor level → { symbol, label, color } for a prominent colored pill. This locks the
// honest-labeling vocabulary (= exact · ≤ bound · ≈ estimate · ⚠ partial · ? unknown) and that
// the five levels are visually DISTINCT (distinct symbols AND colors) so they can't be confused
// at a glance. The DOM pill render in setVerdict is browser-verified.
import { describe, it, expect } from "vitest";
import _QD from "../app/solver.mjs";
import "../app/algebra/algebra-canvas.mjs";

const AC: any = (_QD as any).AlgebraCanvas;
const LEVELS = ["exact", "bound", "estimate", "partial", "unknown"];

describe("AlgebraCanvas.rigorMeta — verdict rigor badge (G-2 legibility)", () => {
  it("is exposed on the canvas module", () => {
    expect(AC && typeof AC.rigorMeta).toBe("function");
  });

  it("maps each level to the project's honest-labeling symbol", () => {
    expect(AC.rigorMeta("exact").symbol).toBe("=");
    expect(AC.rigorMeta("bound").symbol).toBe("≤");
    expect(AC.rigorMeta("estimate").symbol).toBe("≈");
    expect(AC.rigorMeta("partial").symbol).toBe("⚠");
    expect(AC.rigorMeta("unknown").symbol).toBe("?");
  });

  it("only 'exact' is labeled certified (an estimate/bound must never read as certified)", () => {
    expect(AC.rigorMeta("exact").label).toMatch(/certified|exact/i);
    for (const l of ["bound", "estimate", "partial", "unknown"]) {
      expect(AC.rigorMeta(l).label).not.toMatch(/certified/i);
    }
  });

  it("unrecognized / missing levels degrade to '?' (undetermined), never to '='", () => {
    expect(AC.rigorMeta("bogus").symbol).toBe("?");
    expect(AC.rigorMeta(undefined).symbol).toBe("?");
    expect(AC.rigorMeta(null).symbol).toBe("?");
    expect(AC.rigorMeta("").symbol).toBe("?");
  });

  it("the five levels are visually DISTINCT — distinct symbols AND colors", () => {
    const syms = new Set(LEVELS.map((l) => AC.rigorMeta(l).symbol));
    const cols = new Set(LEVELS.map((l) => AC.rigorMeta(l).color));
    expect(syms.size).toBe(5);
    expect(cols.size).toBe(5);
  });

  it("every level yields a well-formed { symbol, label, color:#rrggbb }", () => {
    for (const l of LEVELS) {
      const m = AC.rigorMeta(l);
      expect(typeof m.symbol).toBe("string");
      expect(m.symbol.length).toBeGreaterThan(0);
      expect(typeof m.label).toBe("string");
      expect(m.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});
