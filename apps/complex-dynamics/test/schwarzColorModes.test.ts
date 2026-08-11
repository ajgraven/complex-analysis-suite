import { describe, it, expect } from "vitest";
import {
  SCHWARZ_COLOR_MODES,
  DEFAULT_SCHWARZ_COLOR_MODE,
  schwarzColorModeId,
  SCHWARZ_TRAP_SHAPES,
  DEFAULT_SCHWARZ_TRAP_SHAPE,
  schwarzTrapShapeId,
} from "../src/render/schwarzColormaps";

// σ-field color-mode + orbit-trap-shape registries (S5-B1). The ids are the contract with the shader's
// fieldColor / trapDistance (render/schwarzGL.ts) — they must be the exact small integers the GLSL
// switches on, contiguous from 0, and an unknown key must fall back to the id-0 default so a stale saved
// name never selects a mode the shader does not have.

describe("SCHWARZ_COLOR_MODES", () => {
  it("has escape (0) · trap (1) · stripe (2) · smooth (3) · distance (4) · domain (5), contiguous from 0", () => {
    expect(SCHWARZ_COLOR_MODES.map((m) => m.key)).toEqual(["escape", "trap", "stripe", "smooth", "distance", "domain"]);
    expect(SCHWARZ_COLOR_MODES.map((m) => m.id)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("defaults to escape-time (id 0)", () => {
    expect(DEFAULT_SCHWARZ_COLOR_MODE).toBe("escape");
    expect(schwarzColorModeId(DEFAULT_SCHWARZ_COLOR_MODE)).toBe(0);
  });

  it("maps each key to its shader id", () => {
    expect(schwarzColorModeId("escape")).toBe(0);
    expect(schwarzColorModeId("trap")).toBe(1);
    expect(schwarzColorModeId("stripe")).toBe(2);
    expect(schwarzColorModeId("smooth")).toBe(3); // S5-B2
    expect(schwarzColorModeId("distance")).toBe(4);
  });

  it("falls back to id 0 for an unknown key (never selects a mode the shader lacks)", () => {
    expect(schwarzColorModeId("no-such-mode")).toBe(0);
    expect(schwarzColorModeId("")).toBe(0);
  });
});

describe("SCHWARZ_TRAP_SHAPES", () => {
  it("has cross · point · line · circle · lattice, ids contiguous from 0", () => {
    expect(SCHWARZ_TRAP_SHAPES.map((m) => m.key)).toEqual(["cross", "point", "line", "circle", "lattice"]);
    expect(SCHWARZ_TRAP_SHAPES.map((m) => m.id)).toEqual([0, 1, 2, 3, 4]);
  });

  it("defaults to cross (id 0)", () => {
    expect(DEFAULT_SCHWARZ_TRAP_SHAPE).toBe("cross");
    expect(schwarzTrapShapeId(DEFAULT_SCHWARZ_TRAP_SHAPE)).toBe(0);
  });

  it("maps each key to its shader id", () => {
    expect(schwarzTrapShapeId("cross")).toBe(0);
    expect(schwarzTrapShapeId("point")).toBe(1);
    expect(schwarzTrapShapeId("line")).toBe(2);
    expect(schwarzTrapShapeId("circle")).toBe(3);
    expect(schwarzTrapShapeId("lattice")).toBe(4);
  });

  it("falls back to id 0 for an unknown key", () => {
    expect(schwarzTrapShapeId("triangle")).toBe(0);
    expect(schwarzTrapShapeId("")).toBe(0);
  });
});
