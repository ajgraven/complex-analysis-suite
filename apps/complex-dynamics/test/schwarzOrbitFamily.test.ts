// schwarzOrbitFamily.test.ts — the σ orbit-family seeds (F4e sweep + F4c canonical). Pure seed math; the
// traced orbits ride the existing schwarzOrbitAt tracer.
import { describe, expect, it } from "vitest";
import { makeUnboundedLaurentSchwarz, makeBoundedSchwarz, type Complex } from "@cas/schwarz";
import { sweepSeeds, canonicalSchwarzSeeds, familyHue } from "../src/render/schwarzOrbitFamily";

const near = (a: Complex, b: Complex, p = 9): void => {
  expect(a[0]).toBeCloseTo(b[0], p);
  expect(a[1]).toBeCloseTo(b[1], p);
};

describe("sweepSeeds (F4e)", () => {
  it("a line places n evenly-spaced points from `from` to `to`", () => {
    const s = sweepSeeds("line", { n: 3, from: [0, 0], to: [1, 0] });
    expect(s).toHaveLength(3);
    near(s[0], [0, 0]);
    near(s[1], [0.5, 0]);
    near(s[2], [1, 0]);
  });

  it("a single-point line lands at the midpoint", () => {
    near(sweepSeeds("line", { n: 1, from: [0, 0], to: [2, 4] })[0], [1, 2]);
  });

  it("a circle places n points around center at radius", () => {
    const s = sweepSeeds("circle", { n: 4, center: [0, 0], radius: 1 });
    expect(s).toHaveLength(4);
    near(s[0], [1, 0]);
    near(s[1], [0, 1]);
    near(s[2], [-1, 0]);
    near(s[3], [0, -1]);
  });

  it("n = 0 yields no seeds", () => {
    expect(sweepSeeds("circle", { n: 0, center: [0, 0], radius: 1 })).toEqual([]);
  });
});

describe("canonicalSchwarzSeeds (F4c)", () => {
  it("the bounded family's canonical seed is the centre φ(0) = w₀ (when in Ω)", () => {
    const LOBE = makeBoundedSchwarz([0, 0], [{ z: [0.3, 0], A: [[0.5, 0]] }]);
    const seeds = canonicalSchwarzSeeds(LOBE, { family: "bounded", c: [0, 0], F: [], w0: [0, 0], branches: [] }, () => true);
    expect(seeds).toHaveLength(1);
    near(seeds[0].w, [0, 0]);
    expect(seeds[0].label).toContain("w₀");
  });

  it("the pole-free deltoid has no canonical seed (no branches to centroid)", () => {
    const DELTOID = makeUnboundedLaurentSchwarz(1, [[0, 0], [0, 0], [0.5, 0]]);
    const seeds = canonicalSchwarzSeeds(DELTOID, { c: [1, 0], F: [[0, 0], [0, 0], [0.5, 0]], branches: [] }, () => true);
    expect(seeds).toHaveLength(0);
  });

  it("filters a canonical seed that is not in Ω", () => {
    const LOBE = makeBoundedSchwarz([0, 0], [{ z: [0.3, 0], A: [[0.5, 0]] }]);
    const seeds = canonicalSchwarzSeeds(LOBE, { family: "bounded", c: [0, 0], F: [], w0: [0, 0], branches: [] }, () => false);
    expect(seeds).toHaveLength(0);
  });
});

describe("familyHue", () => {
  it("ramps 0…300° across the family", () => {
    expect(familyHue(0, 5)).toBe("hsl(0, 85%, 62%)");
    expect(familyHue(4, 5)).toBe("hsl(300, 85%, 62%)");
    expect(familyHue(0, 1)).toBe("hsl(0, 85%, 62%)"); // a singleton is the first hue
  });
});
