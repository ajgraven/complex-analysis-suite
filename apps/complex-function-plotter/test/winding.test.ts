import { describe, it, expect } from "vitest";
import { windingNumber } from "../src/riemann/winding.js";
import type { Complex } from "@cas/expr/complex";

/** A regular `n`-gon (closed polyline) of radius `r` about `c`, traced counter-clockwise (dir = +1) or CW. */
function circle(c: Complex, r: number, n = 64, dir = 1): Complex[] {
  const out: Complex[] = [];
  for (let i = 0; i < n; i++) {
    const a = (dir * 2 * Math.PI * i) / n;
    out.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
  }
  return out;
}

describe("windingNumber", () => {
  it("is +1 for a CCW loop enclosing the point", () => {
    expect(windingNumber(circle([0, 0], 1), [0, 0])).toBe(1);
    expect(windingNumber(circle([2, -1], 0.5), [2, -1])).toBe(1);
  });

  it("is −1 for a CW loop enclosing the point", () => {
    expect(windingNumber(circle([0, 0], 1, 64, -1), [0, 0])).toBe(-1);
  });

  it("is 0 for a point outside the loop", () => {
    expect(windingNumber(circle([0, 0], 1), [5, 0])).toBe(0);
    expect(windingNumber(circle([0, 0], 1), [1.5, 0])).toBe(0);
  });

  it("counts multiplicity for a doubly-traced loop", () => {
    const once = circle([0, 0], 1, 60);
    expect(windingNumber([...once, ...once], [0, 0])).toBe(2);
  });

  it("works for a non-circular (square) loop and off-center points", () => {
    const square: Complex[] = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    expect(windingNumber(square, [0, 0])).toBe(1);
    expect(windingNumber(square, [0.9, 0.9])).toBe(1);
    expect(windingNumber(square, [2, 2])).toBe(0);
  });

  it("returns 0 for a degenerate loop or a point on the loop's center vertex", () => {
    expect(windingNumber([[0, 0], [1, 0]], [5, 5])).toBe(0); // < 3 points
    expect(windingNumber(circle([0, 0], 1, 8), [1, 0])).toBe(0); // center coincides with a vertex
  });
});
