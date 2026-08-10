import { describe, expect, it } from "vitest";
import { sourceGrid, pushforward, bounds, type GridLine } from "../src/render/grid.js";

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
