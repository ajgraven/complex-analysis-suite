import { describe, expect, it } from "vitest";
import { angle } from "../src/combinatorics/angles";
import {
  characteristicArc,
  portraitSummary,
  rayRotationNumber,
} from "../src/combinatorics/orbitPortrait";

describe("orbit-portrait combinatorics", () => {
  it("rabbit fixed point {1/7,2/7,4/7}: valence 3, rotation 1/3", () => {
    const rays = [angle(1, 7), angle(2, 7), angle(4, 7)];
    expect(rayRotationNumber(rays, 1)).toEqual({ p: 1, q: 3 });
    const s = portraitSummary(rays, 1);
    expect(s.valence).toBe(3);
    expect(s.rotation).toEqual({ p: 1, q: 3 });
  });

  it("basilica period-2 root {1/3,2/3}: valence 2, rotation 1/2", () => {
    const rays = [angle(1, 3), angle(2, 3)];
    expect(rayRotationNumber(rays, 1)).toEqual({ p: 1, q: 2 });
    expect(portraitSummary(rays, 1).valence).toBe(2);
  });

  it("a single ray has rotation 0", () => {
    expect(rayRotationNumber([angle(1, 2)], 1)).toEqual({ p: 0, q: 1 });
  });

  it("rejects a ray set not closed under D^period", () => {
    // D(2/7) = 4/7 ∉ {1/7,2/7} ⇒ not a valid single-point ray set.
    expect(rayRotationNumber([angle(1, 7), angle(2, 7)], 1)).toBeNull();
  });

  it("characteristic arc is the narrowest gap (rabbit → 1/7…2/7)", () => {
    const arc = characteristicArc([angle(1, 7), angle(2, 7), angle(4, 7)]);
    expect(arc?.lo).toEqual({ p: 1, q: 7 });
    expect(arc?.hi).toEqual({ p: 2, q: 7 });
    expect(arc?.length).toBeCloseTo(1 / 7, 12);
  });
});
