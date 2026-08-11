import { describe, expect, it } from "vitest";
import {
  sourceGrid,
  pushforward,
  bounds,
  diskGrid,
  pushforwardCells,
  cellCorners,
  type GridLine,
  type Pt,
} from "../src/render/grid.js";

describe("coordinate grids (D1/D2)", () => {
  it("a cartesian grid has 2·(N+1) lines, all inside the z-window", () => {
    const g = sourceGrid("cartesian", 0, 0, 1, 1); // center 0, halfSpan 1, aspect 1
    expect(g.length).toBe(2 * 17); // N = 16 → 17 verticals + 17 horizontals
    for (const l of g) {
      for (const [x, y] of l.pts) {
        expect(Math.abs(x)).toBeLessThanOrEqual(1 + 1e-9);
        expect(Math.abs(y)).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it("grid 'none' produces no lines", () => {
    expect(sourceGrid("none", 0, 0, 1, 1)).toEqual([]);
  });

  it("pushforward keeps the colour key and maps each vertex through φ", () => {
    const line: GridLine[] = [{ color: "key", pts: [[2, 1], [0, 0]] }];
    const sq = pushforward(line, (z) => [z[0] * z[0] - z[1] * z[1], 2 * z[0] * z[1]]); // z²
    expect(sq[0].color).toBe("key");
    expect(sq[0].pts[0]).toEqual([3, 4]); // (2 + i)² = 3 + 4i
    expect(sq[0].pts[1]).toEqual([0, 0]);
  });

  it("bounds ignores blow-ups beyond the cap (poles push image lines to ∞)", () => {
    const lines: GridLine[] = [{ color: "k", pts: [[0, 0], [1e9, 0], [2, 2]] }];
    const b = bounds(lines, 1e3);
    expect(b).not.toBeNull();
    if (!b) return;
    expect(b.maxx).toBe(2);
    expect(b.maxy).toBe(2);
    expect(b.minx).toBe(0);
  });
});

describe("disk-image grid (the primary view)", () => {
  it("interior: R radial × 2R angular quad cells, all corners inside 𝔻 (|z| ≤ 1)", () => {
    const dg = diskGrid("interior", 10);
    expect(dg.cells.length).toBe(10 * 20);
    for (const c of dg.cells) {
      expect(c.quad.length).toBe(4);
      for (const [x, y] of c.quad) expect(Math.hypot(x, y)).toBeLessThanOrEqual(1 + 1e-9);
    }
    // the reference curve is the unit circle
    for (const [x, y] of dg.unitCircle) expect(Math.hypot(x, y)).toBeCloseTo(1, 10);
  });

  it("exterior: every cell corner lies outside 𝔻 (|z| ≥ 1) out to ~e^2.5", () => {
    const dg = diskGrid("exterior", 8);
    expect(dg.cells.length).toBe(8 * 16);
    let maxR = 0;
    for (const c of dg.cells) {
      for (const [x, y] of c.quad) {
        const r = Math.hypot(x, y);
        expect(r).toBeGreaterThanOrEqual(1 - 1e-9);
        maxR = Math.max(maxR, r);
      }
    }
    expect(maxR).toBeCloseTo(Math.exp(2.5), 6); // outer ring at e^2.5 (reference parity)
  });

  it("rings is clamped to [2, 64]", () => {
    expect(diskGrid("interior", 0).cells.length).toBe(2 * 4); // → 2 rings
    expect(diskGrid("interior", 999).cells.length).toBe(64 * 128); // → 64 rings
  });

  it("pushforwardCells maps every corner + midpoint through φ; cellCorners flattens them", () => {
    const dg = diskGrid("interior", 3);
    const sq = pushforwardCells(dg.cells, (z: Pt): Pt => [z[0] * z[0] - z[1] * z[1], 2 * z[0] * z[1]]); // z²
    expect(sq.length).toBe(dg.cells.length);
    // z² doubles the argument, so an image corner's modulus is the source modulus squared.
    const [sx, sy] = dg.cells[0].quad[1];
    const [ix, iy] = sq[0].quad[1];
    expect(Math.hypot(ix, iy)).toBeCloseTo(Math.hypot(sx, sy) ** 2, 10);
    expect(cellCorners(sq).length).toBe(sq.length * 4);
  });
});
