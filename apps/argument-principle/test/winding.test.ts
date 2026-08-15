import { describe, expect, it } from "vitest";
import { parse } from "@cas/expr/parser";
import { makeComplexFn } from "@cas/expr/evaluate";
import {
  windingNumber,
  windingTurns,
  windingReliable,
  partialWindingTurns,
  cumulativeArg,
  type Vec2,
} from "../src/winding.js";
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

  it("partialWindingTurns sweeps continuously from 0 to the full winding as t: 0 → 1", () => {
    const c = unitCircle(360);
    expect(partialWindingTurns(c, 0)).toBe(0);
    expect(partialWindingTurns(c, 0.25)).toBeCloseTo(0.25, 3);
    expect(partialWindingTurns(c, 0.5)).toBeCloseTo(0.5, 3);
    expect(partialWindingTurns(c, 0.75)).toBeCloseTo(0.75, 3);
    expect(partialWindingTurns(c, 1)).toBeCloseTo(windingTurns(c), 9); // reaches the full winding exactly
    // continuity near the loop close: no dropped edge / jump between t=0.999 and t=1
    expect(Math.abs(partialWindingTurns(c, 1) - partialWindingTurns(c, 0.999))).toBeLessThan(0.02);
  });

  it("partialWindingTurns tracks a doubly-wound image (z ↦ z²): half → 1, full → 2", () => {
    const img: Vec2[] = unitCircle(360).map(([x, y]) => [x * x - y * y, 2 * x * y]);
    expect(partialWindingTurns(img, 0.5)).toBeCloseTo(1, 2);
    expect(partialWindingTurns(img, 1)).toBeCloseTo(2, 6);
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

describe("cumulativeArg (the shared running-argument primitive)", () => {
  it("starts at 0 and its last entry equals the full winding", () => {
    const c = unitCircle(360);
    const acc = cumulativeArg(c);
    expect(acc).toHaveLength(361); // n + 1 entries
    expect(acc[0]).toBe(0);
    expect(acc[acc.length - 1]).toBeCloseTo(windingTurns(c), 12); // last entry ≡ full winding
    expect(acc[acc.length - 1]).toBeCloseTo(1, 6);
  });

  it("rises monotonically for a CCW loop about an enclosed point", () => {
    const acc = cumulativeArg(unitCircle(120));
    for (let i = 1; i < acc.length; i++) {
      expect(acc[i]).toBeGreaterThanOrEqual(acc[i - 1] - 1e-9);
    }
  });

  it("reaches 2 for the doubly-wound image of z ↦ z², passing through 1 at the halfway mark", () => {
    const img: Vec2[] = unitCircle(360).map(([x, y]) => [x * x - y * y, 2 * x * y]);
    const acc = cumulativeArg(img);
    expect(acc[acc.length - 1]).toBeCloseTo(2, 6);
    expect(acc[180]).toBeCloseTo(1, 2); // halfway around γ → one full turn of the image
  });

  it("agrees with partialWindingTurns at every sample fraction (they share the array)", () => {
    const c = unitCircle(200);
    const acc = cumulativeArg(c);
    for (const k of [0, 50, 100, 150, 200]) {
      expect(partialWindingTurns(c, k / 200)).toBeCloseTo(acc[k], 9);
    }
  });

  it("returns [0] for a degenerate (fewer than 2 points) curve", () => {
    expect(cumulativeArg([])).toEqual([0]);
    expect(cumulativeArg([[1, 1]])).toEqual([0]);
  });
});
