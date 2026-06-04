import { describe, expect, it } from "vitest";
import { addArrays, scaleArray, subtractArrays } from "../src/arrays";

describe("array helpers", () => {
  it("addArrays adds element-wise", () => {
    expect(addArrays([1, 2], [3, -4])).toEqual([4, -2]);
  });

  it("subtractArrays subtracts element-wise", () => {
    expect(subtractArrays([1, 2], [3, -4])).toEqual([-2, 6]);
  });

  it("scaleArray multiplies by a scalar", () => {
    expect(scaleArray([1.5, -2], 2)).toEqual([3, -4]);
    expect(scaleArray([4, 8], 0.25)).toEqual([1, 2]);
  });
});
