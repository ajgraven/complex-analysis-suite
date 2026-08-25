import { describe, it, expect } from "vitest";
import { generatorLoopAround, generatorRadius } from "../src/riemann/generatorLoop.js";
import { windingNumber } from "../src/riemann/winding.js";
import type { Complex } from "@cas/expr/complex";

describe("generatorLoopAround", () => {
  it("is a closed CCW circle winding +1 about its center, 0 about a far point", () => {
    const loop = generatorLoopAround([2, -1], 0.5, 64);
    expect(loop.length).toBe(64);
    expect(windingNumber(loop, [2, -1])).toBe(1); // encircles the center CCW
    expect(windingNumber(loop, [10, 10])).toBe(0); // not the far point
    // all points lie on the circle
    for (const p of loop) expect(Math.hypot(p[0] - 2, p[1] + 1)).toBeCloseTo(0.5, 9);
  });

  it("clamps a tiny requested step count up to a usable minimum", () => {
    expect(generatorLoopAround([0, 0], 1, 3).length).toBeGreaterThanOrEqual(12);
  });
});

describe("generatorRadius", () => {
  const span = 2;
  it("isolates one of two well-separated branch points at 0.4·(neighbour distance)", () => {
    const pts: Complex[] = [
      [-1, 0],
      [1, 0],
    ];
    // neighbour distance 2 → 0.4·2 = 0.8, capped at 0.25·span = 0.5 → 0.5
    expect(generatorRadius(0, pts, span)).toBeCloseTo(0.5, 9);
    // a smaller neighbour distance stays below the cap
    const near: Complex[] = [
      [0, 0],
      [0.9, 0],
    ];
    expect(generatorRadius(0, near, span)).toBeCloseTo(0.36, 9); // 0.4·0.9
  });

  it("uses the view-span cap for a lone branch point", () => {
    expect(generatorRadius(0, [[0, 0]], span)).toBeCloseTo(0.5, 9); // 0.25·span
  });

  it("returns null when a neighbour is too close to isolate a drawable loop", () => {
    const pts: Complex[] = [
      [0, 0],
      [0.1, 0], // 0.4·0.1 = 0.04 < 0.03·span = 0.06 → null
    ];
    expect(generatorRadius(0, pts, span)).toBeNull();
  });

  it("a generator loop at the chosen radius encloses only its own point", () => {
    const pts: Complex[] = [
      [-1, 0],
      [1, 0],
    ];
    const r0 = generatorRadius(0, pts, span)!;
    const loop = generatorLoopAround(pts[0], r0);
    expect(windingNumber(loop, pts[0])).toBe(1);
    expect(windingNumber(loop, pts[1])).toBe(0);
  });
});
