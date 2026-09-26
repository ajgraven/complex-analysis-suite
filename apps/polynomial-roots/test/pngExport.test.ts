import { describe, it, expect } from "vitest";
import { captionFor, deepCaptionFor } from "../src/pngExport";

// The caption is the one line a saved figure carries into the world, so it must describe the ENGINE
// that drew it: the deep plate used to be captioned with the root sweep's stale totals.

const deep = {
  alphabet: "Littlewood",
  count: 1183,
  distinct: 140,
  degreeMin: 26,
  degreeMax: 96,
  halfHeight: 1e-30,
  precision: "dd" as const,
  exhausted: false,
};

describe("deepCaptionFor", () => {
  it("names the deep walk's own count, multiplicity, degrees, depth and arithmetic", () => {
    const c = deepCaptionFor(deep);
    expect(c).toBe(
      "≈ 1,183 roots on 140 points · Littlewood · degrees 26–96 · half-height 1.0e-30, double-double · Complex Analysis Suite",
    );
  });

  it("says float64 when the walk ran in float64, and a single degree as one", () => {
    const c = deepCaptionFor({ ...deep, precision: "float64", degreeMin: 30, degreeMax: 30 });
    expect(c).toContain("degree 30 ·");
    expect(c).toContain("float64");
    expect(c).not.toContain("double-double");
  });

  it("marks an incomplete walk, with and without roots", () => {
    expect(deepCaptionFor({ ...deep, exhausted: true })).toContain("(walk incomplete)");
    expect(deepCaptionFor(deep)).not.toContain("(walk incomplete)");
    const none = deepCaptionFor({ ...deep, count: 0, distinct: 0, exhausted: true });
    expect(none).toContain("no root in view (walk incomplete)");
    expect(none).not.toContain("≈ 0");
  });

  it("is not the root engine's caption", () => {
    const root = captionFor({ alphabet: "Littlewood", minDegree: 1, maxDegree: 16, roots: 3_932_164, complete: true });
    expect(root).toBe("≈ 3,932,164 roots · Littlewood · degrees 1–16 · Complex Analysis Suite");
    expect(deepCaptionFor(deep)).not.toContain("3,932,164");
  });
});
