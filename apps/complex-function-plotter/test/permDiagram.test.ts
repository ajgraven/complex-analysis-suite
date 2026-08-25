import { describe, it, expect } from "vitest";
import {
  sheetColorCss,
  permDiagramWidth,
  drawPermDiagram,
  DIAGRAM_HEIGHT,
} from "../src/riemann/permDiagram.js";
import type { Perm } from "../src/riemann/permGroup.js";

function mockCtx() {
  const calls = { arc: 0, fill: 0, stroke: 0, quadraticCurveTo: 0, save: 0, restore: 0 };
  const ctx = {
    save: () => calls.save++,
    restore: () => calls.restore++,
    translate: () => {},
    rotate: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    arc: () => calls.arc++,
    quadraticCurveTo: () => calls.quadraticCurveTo++,
    stroke: () => calls.stroke++,
    fill: () => calls.fill++,
    lineWidth: 0,
    strokeStyle: "",
    fillStyle: "",
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

describe("sheetColorCss", () => {
  it("returns a valid rgb() string and is deterministic per (k, n)", () => {
    const c = sheetColorCss(0, 3);
    expect(c).toMatch(/^rgb\(\d{1,3},\d{1,3},\d{1,3}\)$/);
    expect(sheetColorCss(1, 3)).toBe(sheetColorCss(1, 3));
    expect(sheetColorCss(0, 3)).not.toBe(sheetColorCss(1, 3)); // different sheets → different hues
  });
});

describe("permDiagramWidth", () => {
  it("grows with the sheet count", () => {
    expect(permDiagramWidth(1)).toBeLessThan(permDiagramWidth(3));
    expect(DIAGRAM_HEIGHT).toBeGreaterThan(0);
  });
});

describe("drawPermDiagram", () => {
  it("draws one node per sheet and one arrow arc per moved sheet", () => {
    const { ctx, calls } = mockCtx();
    const transposition: Perm = [1, 0, 2]; // (1 2): sheets 0,1 move, sheet 2 fixed
    drawPermDiagram(ctx, transposition);
    expect(calls.arc).toBe(3); // three sheet nodes
    expect(calls.quadraticCurveTo).toBe(2); // two moved sheets → two arcs (the fixed one has none)
  });

  it("the identity draws nodes but no arcs", () => {
    const { ctx, calls } = mockCtx();
    drawPermDiagram(ctx, [0, 1, 2]);
    expect(calls.arc).toBe(3);
    expect(calls.quadraticCurveTo).toBe(0);
  });

  it("a 3-cycle draws an arc for every node", () => {
    const { ctx, calls } = mockCtx();
    drawPermDiagram(ctx, [1, 2, 0]); // (1 2 3)
    expect(calls.quadraticCurveTo).toBe(3);
  });
});
