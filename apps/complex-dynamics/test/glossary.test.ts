import { describe, it, expect } from "vitest";
import { GLOSSARY, CONVENTIONS } from "../src/ui/glossary";

const ALL = [...GLOSSARY, ...CONVENTIONS];

describe("glossary", () => {
  it("has unique ids across glossary + conventions", () => {
    const ids = ALL.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every entry has a non-empty term and definition", () => {
    for (const e of ALL) {
      expect(e.term.length).toBeGreaterThan(0);
      expect(e.defn.length).toBeGreaterThan(10);
    }
  });

  it("defines every term the inline ? links point at (inspector + overlays)", () => {
    // These ids are referenced by main.ts: inspector-row map + overlay-label buttons.
    const linked = [
      "escape-time",
      "period",
      "multiplier",
      "internal-angle",
      "distance-estimate",
      "critical-orbit",
      "farey-bulb",
      "external-ray",
      "equipotential",
      "uniformization",
    ];
    const ids = new Set(GLOSSARY.map((e) => e.id));
    for (const id of linked) expect(ids.has(id)).toBe(true);
  });

  it("defines every term the Julia-properties panel ? links point at", () => {
    // data-term ids on the gloss-link buttons inside #julia-props-group in index.html.
    const panel = [
      "dynamical-plane",
      "julia-connectivity",
      "fractal-dimension",
      "julia-area",
      "lyapunov-exponent",
      "bounding-region",
      "julia-symmetry",
      "capacity",
    ];
    const ids = new Set(GLOSSARY.map((e) => e.id));
    for (const id of panel) expect(ids.has(id)).toBe(true);
  });

  it("defines every term the σ pane ? links point at (Phase A)", () => {
    // data-term ids on the gloss-link buttons inside #schwarz-plot in index.html (the σ control-group idioms).
    const sigma = ["schwarz-reflection", "riemann-map-phi", "laurent-coefficients", "escape-time"];
    const ids = new Set(GLOSSARY.map((e) => e.id));
    for (const id of sigma) expect(ids.has(id)).toBe(true);
  });

  it("documents the non-textbook conventions", () => {
    expect(CONVENTIONS.length).toBeGreaterThanOrEqual(4);
    const ids = CONVENTIONS.map((e) => e.id);
    expect(ids).toContain("conv-burning-ship");
    expect(ids).toContain("conv-newton");
  });
});
