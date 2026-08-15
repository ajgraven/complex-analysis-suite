import { describe, expect, it } from "vitest";
import { parse } from "@cas/expr/parser";
import { makeComplexFn } from "@cas/expr/evaluate";
import { windingNumber, windingTurns, windingReliable, type Vec2 } from "../src/winding.js";
import { sampleCircle } from "../src/contour.js";

const unitCircle = (n: number): Vec2[] =>
  Array.from({ length: n }, (_, i) => {
    const t = (2 * Math.PI * i) / n;
    return [Math.cos(t), Math.sin(t)] as Vec2;
  });

describe("winding number (the core instrument)", () => {
  it("is +1 for a CCW loop enclosing the origin", () => {
    const c = unitCircle(200);
    expect(windingNumber(c)).toBe(1);
    expect(windingTurns(c)).toBeCloseTo(1, 6);
  });

  it("is −1 when the loop is traversed clockwise", () => {
    const c = unitCircle(200).slice().reverse();
    expect(windingNumber(c)).toBe(-1);
  });

  it("is 0 about a point outside the loop", () => {
    const c = unitCircle(200);
    expect(windingNumber(c, [5, 0])).toBe(0);
  });

  it("counts +2 for the image of the unit circle under z ↦ z²", () => {
    // z = e^{iθ} ↦ e^{2iθ}: the image wraps the origin twice.
    const img: Vec2[] = unitCircle(240).map(([x, y]) => [x * x - y * y, 2 * x * y]);
    expect(windingNumber(img)).toBe(2);
  });

  it("flags a curve that grazes the target as unreliable", () => {
    const c = unitCircle(64).map(([x, y]) => [x, y] as Vec2);
    expect(windingReliable(c)).toBe(true);
    // A loop whose nearest approach to 0 is ~1e-9 of its extent — the estimate aliases.
    const grazing: Vec2[] = [
      [1, 0],
      [0, 1e-9],
      [-1, 0],
      [0, -1],
    ];
    expect(windingReliable(grazing)).toBe(false);
  });

  it("argument principle: f = z³ − 1 winds 3 times about 0 over a radius-1.5 contour", () => {
    // Its three zeros (cube roots of unity, |z| = 1) all sit inside γ, so N − P = 3 − 0 = winding.
    const f = makeComplexFn(parse("z*z*z - 1"));
    const gamma = sampleCircle({ centerRe: 0, centerIm: 0, radius: 1.5 }, 400);
    const image: Vec2[] = gamma.map((p) => {
      const w = f([p[0], p[1]], [0, 0]);
      return [w[0], w[1]];
    });
    expect(windingNumber(image)).toBe(3);
  });
});
