import { describe, it, expect } from "vitest";
import { parseGradientStops } from "../src/ui/gradient";

describe("parseGradientStops", () => {
  it("parses, clamps, and sorts a valid stop list", () => {
    // t out of range → clamped to [0,1]; colours clamped to bytes; sorted by t.
    expect(
      parseGradientStops('[{"t":-0.5,"color":[300,-1,128]},{"t":0.5,"color":[10,20,30]}]'),
    ).toEqual([
      { t: 0, color: [255, 0, 128] },
      { t: 0.5, color: [10, 20, 30] },
    ]);
  });

  it("rejects malformed input (null, not array, too few stops, bad shapes)", () => {
    expect(parseGradientStops("not json")).toBeNull();
    expect(parseGradientStops('{"t":0,"color":[0,0,0]}')).toBeNull(); // object, not array
    expect(parseGradientStops("[]")).toBeNull(); // empty
    expect(parseGradientStops('[{"t":0,"color":[0,0,0]}]')).toBeNull(); // < 2 stops
    expect(parseGradientStops('[{"t":"x","color":[0,0,0]},{"t":1,"color":[0,0,0]}]')).toBeNull(); // t not a number
    expect(parseGradientStops('[{"t":0,"color":[0,0]},{"t":1,"color":[0,0,0]}]')).toBeNull(); // color length ≠ 3
    expect(parseGradientStops('[{"t":0},{"t":1,"color":[0,0,0]}]')).toBeNull(); // missing color
  });
});
