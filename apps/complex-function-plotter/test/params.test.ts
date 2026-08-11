import { describe, expect, it } from "vitest";
import { PARAM_RANGE, padToValue, valueToPad } from "../src/ui/params.js";

// The parameter controls (catalog G1) are DOM-heavy, but their coordinate mapping — pad pixel ↔ complex
// value over the [-R, R]² window — is pure and is what makes a drag land on the right value. Pin it here.

describe("ℂ-pad coordinate mapping", () => {
  const SIZE = 84;
  const R = PARAM_RANGE;

  it("maps the pad center to 0 and the corners to ±R (y is up)", () => {
    expect(padToValue(SIZE / 2, SIZE / 2, SIZE)).toEqual([0, 0]);
    expect(padToValue(0, SIZE, SIZE)).toEqual([-R, -R]); // bottom-left → (−R, −R)
    expect(padToValue(SIZE, 0, SIZE)).toEqual([R, R]); // top-right → (+R, +R)
    expect(padToValue(SIZE, SIZE, SIZE)).toEqual([R, -R]); // bottom-right → (+R, −R)
  });

  it("clamps a drag outside the pad to the window edge", () => {
    expect(padToValue(-40, SIZE + 40, SIZE)).toEqual([-R, -R]);
    expect(padToValue(SIZE * 3, -SIZE, SIZE)).toEqual([R, R]);
  });

  it("round-trips value → pad → value inside the window", () => {
    for (const v of [
      [0, 0],
      [1, 0],
      [-0.5, 0.75],
      [R, -R],
    ] as [number, number][]) {
      const [px, py] = valueToPad(v, SIZE);
      expect(padToValue(px, py, SIZE)).toEqual(v);
    }
  });

  it("places the unit point |a| = 1 a quarter of the way from center to edge (R = 2)", () => {
    // re = 1 sits at center + (1/R)·(half width) = SIZE/2 + SIZE/4
    const [px, py] = valueToPad([1, 0], SIZE);
    expect(px).toBeCloseTo(SIZE / 2 + SIZE / 4, 6);
    expect(py).toBeCloseTo(SIZE / 2, 6);
  });
});
