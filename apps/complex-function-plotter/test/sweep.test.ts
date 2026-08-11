import { describe, expect, it } from "vitest";
import { sweepValues } from "../src/ui/sweep.js";

// The sweep montage (catalog G4) is GPU + DOM, but its value spacing is pure. Pin it here.

describe("sweepValues", () => {
  it("returns n evenly-spaced values from v0 to v1 inclusive", () => {
    expect(sweepValues(0, 1, 5)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(sweepValues(-2, 2, 3)).toEqual([-2, 0, 2]);
  });

  it("includes both endpoints exactly", () => {
    const vals = sweepValues(-1.5, 3.5, 9);
    expect(vals[0]).toBe(-1.5);
    expect(vals[vals.length - 1]).toBe(3.5);
    expect(vals).toHaveLength(9);
  });

  it("handles a descending range", () => {
    expect(sweepValues(2, 0, 3)).toEqual([2, 1, 0]);
  });

  it("degenerates to a single value for n ≤ 1", () => {
    expect(sweepValues(0.7, 5, 1)).toEqual([0.7]);
    expect(sweepValues(0.7, 5, 0)).toEqual([0.7]);
  });

  it("is monotone and strictly inside the range for the interior samples", () => {
    const vals = sweepValues(0, 10, 6);
    for (let i = 1; i < vals.length; i++) expect(vals[i]).toBeGreaterThan(vals[i - 1]);
  });
});
