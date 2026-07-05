import { describe, expect, it } from "vitest";
import type { Angle } from "../src/render/angleOfPoint";
import { puzzleRayAngles, yoccozPuzzle } from "../src/render/yoccozPuzzle";

const A_BASILICA: Angle[] = [
  { p: 1, q: 3 },
  { p: 2, q: 3 },
];

describe("puzzleRayAngles (the depth-n Yoccoz-puzzle ray angles Θₙ)", () => {
  it("depth 0 is the α-angles themselves", () => {
    expect(puzzleRayAngles(A_BASILICA, 0)).toEqual([1 / 3, 2 / 3]);
  });

  it("depth 1 pulls back once: {1/6, 1/3, 2/3, 5/6}", () => {
    const got = puzzleRayAngles(A_BASILICA, 1);
    expect(got.map((x) => +x.toFixed(6))).toEqual([1 / 6, 1 / 3, 2 / 3, 5 / 6].map((x) => +x.toFixed(6)));
  });

  it("has q·2ⁿ rays and every angle doubles n times onto an α-angle", () => {
    const A: Angle[] = [
      { p: 1, q: 7 },
      { p: 2, q: 7 },
      { p: 4, q: 7 },
    ]; // the rabbit
    const alpha = new Set(A.map((a) => a.p / a.q));
    for (let depth = 0; depth <= 4; depth++) {
      const rays = puzzleRayAngles(A, depth);
      expect(rays.length).toBe(3 * 2 ** depth); // q·2ⁿ
      for (const theta of rays) {
        let x = theta;
        for (let i = 0; i < depth; i++) x = (2 * x) % 1;
        // 2ⁿθ lands on an α-angle
        const near = [...alpha].some((a) => Math.abs(((x - a + 0.5) % 1) - 0.5) < 1e-9);
        expect(near).toBe(true);
      }
    }
  });

  it("is sorted ascending", () => {
    const rays = puzzleRayAngles(A_BASILICA, 3);
    for (let i = 1; i < rays.length; i++) expect(rays[i]).toBeGreaterThan(rays[i - 1]);
  });
});

describe("yoccozPuzzle (parameter → puzzle, gated on a repelling α)", () => {
  it("the basilica (c = −1): valence 2, α ≈ −0.618, depth-1 graph has 4 rays", () => {
    const puz = yoccozPuzzle([-1, 0], 1);
    expect(puz).not.toBeNull();
    if (!puz) return;
    expect(puz.valence).toBe(2);
    expect(puz.alphaAngles).toEqual([
      { p: 1, q: 3 },
      { p: 2, q: 3 },
    ]);
    expect(puz.alpha[0]).toBeCloseTo((1 - Math.sqrt(5)) / 2, 6);
    expect(puz.rayAngles.length).toBe(4);
  });

  it("the rabbit: valence 3, depth-0 graph = {1/7, 2/7, 4/7}", () => {
    // rabbit c ≈ −0.1226 + 0.7449 i (period-3 nucleus)
    const puz = yoccozPuzzle([-0.12256, 0.744862], 0);
    expect(puz).not.toBeNull();
    if (!puz) return;
    expect(puz.valence).toBe(3);
    expect(puz.rayAngles.map((x) => +x.toFixed(6))).toEqual(
      [1 / 7, 2 / 7, 4 / 7].map((x) => +x.toFixed(6)),
    );
  });

  it("c = 0 (α attracting) has no puzzle", () => {
    expect(yoccozPuzzle([0, 0], 0)).toBeNull();
  });

  it("a main-cardioid parameter (c = 0.25) has no puzzle", () => {
    expect(yoccozPuzzle([0.25, 0], 0)).toBeNull();
  });
});
