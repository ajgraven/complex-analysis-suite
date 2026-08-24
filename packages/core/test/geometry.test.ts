import { describe, expect, it } from "vitest";
import { pointInPolygon, signedArea, orientCCW, type Point2 } from "../src/index.js";

// Golden corpus for the shared even-odd point-in-polygon test, consolidated into @cas/core from
// @cas/schwarz (the prior blessed export), @cas/conformal, the Riemann-map app, and the
// Argument-Principle app (ADR-0007). Pins interior/exterior classification, orientation
// independence, concave polygons, horizontal-edge safety (the /(yj-yi) division must never run on
// a horizontal edge, so no NaN), and graceful handling of degenerate polygons.

const SQUARE: Point2[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
]; // CCW unit square

describe("pointInPolygon (even-odd ray cast)", () => {
  it("classifies interior vs exterior on the unit square", () => {
    expect(pointInPolygon([0.5, 0.5], SQUARE)).toBe(true);
    for (const outside of [
      [1.5, 0.5],
      [-0.5, 0.5],
      [0.5, 1.5],
      [0.5, -0.5],
    ] as Point2[]) {
      expect(pointInPolygon(outside, SQUARE)).toBe(false);
    }
  });

  it("is orientation-independent (CW gives the same answer as CCW)", () => {
    const cw = [...SQUARE].reverse();
    for (const p of [
      [0.5, 0.5],
      [1.5, 0.5],
      [0.25, 0.75],
    ] as Point2[]) {
      expect(pointInPolygon(p, cw)).toBe(pointInPolygon(p, SQUARE));
    }
  });

  it("handles a concave (notched) polygon — points up in the notch are outside", () => {
    // Square-ish base whose top edge dips to (2,1): (0,0)→(4,0)→(4,4)→(2,1)→(0,4).
    const notched: Point2[] = [
      [0, 0],
      [4, 0],
      [4, 4],
      [2, 1],
      [0, 4],
    ];
    expect(pointInPolygon([2, 0.5], notched)).toBe(true); // low centre — inside the solid base
    expect(pointInPolygon([2, 3], notched)).toBe(false); // up in the central notch — outside
    expect(pointInPolygon([0.5, 3], notched)).toBe(true); // inside a side arm
  });

  it("does not divide by zero on horizontal edges (vertex-aligned test heights stay finite)", () => {
    // py equal to a vertex height exercises the (yi>py)!==(yj>py) guard that gates the /(yj-yi).
    const diamond: Point2[] = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ];
    expect(pointInPolygon([0, 0], diamond)).toBe(true); // y=0 aligns with the L/R vertices
    expect(pointInPolygon([2, 0], diamond)).toBe(false);
    // A wide horizontal top/bottom edge must not leak NaN into the parity flips.
    const bar: Point2[] = [
      [0, 0],
      [4, 0],
      [4, 1],
      [0, 1],
    ];
    expect(pointInPolygon([2, 0.5], bar)).toBe(true);
  });

  it("accepts both mutable and readonly tuples", () => {
    const mutable: [number, number] = [0.5, 0.5];
    const ro: readonly [number, number] = [0.5, 0.5] as const;
    expect(pointInPolygon(mutable, SQUARE)).toBe(true);
    expect(pointInPolygon(ro, SQUARE)).toBe(true);
  });

  it("returns false (no throw) for degenerate polygons", () => {
    expect(pointInPolygon([0, 0], [])).toBe(false);
    expect(pointInPolygon([0, 0], [[1, 1]])).toBe(false);
    expect(
      pointInPolygon(
        [0, 0],
        [
          [1, 1],
          [2, 2],
        ],
      ),
    ).toBe(false);
  });
});

// signedArea / orientCCW — shoelace orientation, consolidated into @cas/core from the Argument-Principle
// app's contour.ts and the Faber app's polygonEditor.ts (ADR-0007). Pins sign convention (CCW > 0),
// the true-area magnitude (half the shoelace sum), input-immutability, and idempotence.
describe("signedArea / orientCCW", () => {
  const CCW_SQUARE: Point2[] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  const CW_SQUARE: Point2[] = [
    [0, 0],
    [0, 1],
    [1, 1],
    [1, 0],
  ];

  it("signedArea is +1 for a CCW unit square, −1 for its CW reverse (true signed area, not 2×)", () => {
    expect(signedArea(CCW_SQUARE)).toBeCloseTo(1, 12);
    expect(signedArea(CW_SQUARE)).toBeCloseTo(-1, 12);
  });

  it("signedArea is ~0 for a degenerate (collinear) loop", () => {
    expect(signedArea([[0, 0], [1, 1], [2, 2]])).toBeCloseTo(0, 12);
  });

  it("orientCCW reverses a clockwise loop and leaves a CCW loop's winding positive", () => {
    expect(signedArea(orientCCW(CW_SQUARE))).toBeGreaterThan(0);
    expect(signedArea(orientCCW(CCW_SQUARE))).toBeGreaterThan(0);
    expect(orientCCW(CCW_SQUARE)).toEqual(CCW_SQUARE); // already CCW ⇒ same vertex order
  });

  it("orientCCW never mutates its input and returns fresh tuples", () => {
    const input: Point2[] = CW_SQUARE.map((p) => [p[0], p[1]] as const);
    const snapshot = input.map((p) => [p[0], p[1]]);
    const out = orientCCW(input);
    expect(input).toEqual(snapshot); // input untouched (not reversed in place)
    expect(out).not.toBe(input as unknown);
    (out[0] as number[])[0] = 999; // mutating the result must not reach back into the input
    expect(input).toEqual(snapshot);
  });
});
