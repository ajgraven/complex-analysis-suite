import { describe, it, expect } from "vitest";
import { interpolateView, type Keyframe } from "../src/render/keyframes";

describe("keyframe interpolation", () => {
  it("handles empty and single-keyframe paths", () => {
    expect(interpolateView([], 0.5)).toEqual({ center: [0, 0], zoom: 1 });
    const one: Keyframe = { center: [1, 2], zoom: 5 };
    expect(interpolateView([one], 0.7)).toEqual(one);
  });

  it("hits the endpoints exactly", () => {
    const kfs: Keyframe[] = [
      { center: [0, 0], zoom: 1 },
      { center: [2, 4], zoom: 100 },
    ];
    expect(interpolateView(kfs, 0)).toEqual(kfs[0]);
    expect(interpolateView(kfs, 1)).toEqual(kfs[1]);
  });

  it("interpolates centre linearly and zoom geometrically", () => {
    const kfs: Keyframe[] = [
      { center: [0, 0], zoom: 1 },
      { center: [2, 4], zoom: 100 },
    ];
    const mid = interpolateView(kfs, 0.5);
    expect(mid.center[0]).toBeCloseTo(1, 10);
    expect(mid.center[1]).toBeCloseTo(2, 10);
    expect(mid.zoom).toBeCloseTo(10, 6); // sqrt(1 * 100)
  });

  it("selects the right segment with three keyframes", () => {
    const kfs: Keyframe[] = [
      { center: [0, 0], zoom: 1 },
      { center: [1, 0], zoom: 10 },
      { center: [2, 0], zoom: 1000 },
    ];
    expect(interpolateView(kfs, 0.5).center[0]).toBeCloseTo(1, 10); // exactly the middle kf
    expect(interpolateView(kfs, 0.5).zoom).toBeCloseTo(10, 6);
    expect(interpolateView(kfs, 0.75).zoom).toBeCloseTo(100, 4); // halfway in the 2nd segment
  });

  it("clamps t outside [0, 1]", () => {
    const kfs: Keyframe[] = [
      { center: [0, 0], zoom: 1 },
      { center: [4, 0], zoom: 4 },
    ];
    expect(interpolateView(kfs, -1)).toEqual(kfs[0]);
    expect(interpolateView(kfs, 2)).toEqual(kfs[1]);
  });
});
