import { describe, it, expect } from "vitest";
import { interpolateView, type Keyframe } from "../src/render/keyframes";
import { ddToNumber, type DD } from "../src/render/dd";

/** The exact centre a keyframe must carry, or a failure naming the keyframe that lacked one. */
function exactCenter(k: Keyframe): [DD, DD] {
  if (!k.centerDD) throw new Error(`keyframe at ${k.center} carries no exact centre`);
  return k.centerDD;
}

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

// WP7/S6 (review 2026-09-16). Two claims, both measured before they were coded.
describe("keyframe endpoints are the captured views, bit for bit", () => {
  // The suite's older "hits the endpoints exactly" case above uses 0, 2, 4, 1 and 100, and passes
  // under the algebra alone. It is not typical: over 200,000 random pairs, `a + (b − a)·1` misses
  // `b` in 9.2% of cases and `a·(b/a)¹` misses in 9.1%. These are four of the misses.
  it("centres that the interpolation formula alone would miss by an ulp", () => {
    for (const [a, b] of [
      [1.242055, -0.17851],
      [-1.288409, 1.48285],
      [-0.894758, 0.886223],
      [-0.106958, 1.043515],
    ]) {
      // The formula, spelled out: this is what the old code returned.
      expect(a + (b - a) * 1).not.toBe(b); // the premise of the test — it really does miss
      const kfs: Keyframe[] = [
        { center: [a, 0], zoom: 1 },
        { center: [b, 0], zoom: 2 },
      ];
      expect(interpolateView(kfs, 1).center[0]).toBe(b);
      expect(interpolateView(kfs, 0).center[0]).toBe(a);
    }
  });

  it("zooms that the geometric formula alone would miss", () => {
    for (const [a, b] of [
      [80.964, 346.627],
      [41.651, 371.865],
      [98.285, 424.066],
    ]) {
      expect(a * Math.pow(b / a, 1)).not.toBe(b);
      const kfs: Keyframe[] = [
        { center: [0, 0], zoom: a },
        { center: [1, 0], zoom: b },
      ];
      expect(interpolateView(kfs, 1).zoom).toBe(b);
      expect(interpolateView(kfs, 0).zoom).toBe(a);
    }
  });

  it("an interior keyframe of a three-point path is returned exactly too", () => {
    const kfs: Keyframe[] = [
      { center: [1.242055, 0], zoom: 80.964 },
      { center: [-0.17851, 0], zoom: 346.627 },
      { center: [0.5, 0], zoom: 1000 },
    ];
    expect(interpolateView(kfs, 0.5)).toBe(kfs[1]); // the same object, not a rebuilt copy
  });
});

describe("keyframes at depth interpolate in double-double", () => {
  // At 1e15× on a 500-pixel plot a pixel spans 8e-18, while one f64 ulp near 0.74 is 1.65e-16 —
  // 20.6 pixels. So the lo limb is not a refinement, it is the only thing naming the view.
  const a: [DD, DD] = [
    [-0.7436438870371587, 1.234e-17],
    [0.13182590420531, -3.1e-18],
  ];
  const b: [DD, DD] = [
    [-0.7436438870371587, 9.876e-18],
    [0.13182590420531, 4.7e-18],
  ];
  const kfs: Keyframe[] = [
    { center: [ddToNumber(a[0]), ddToNumber(a[1])], zoom: 1e15, centerDD: a },
    { center: [ddToNumber(b[0]), ddToNumber(b[1])], zoom: 4e15, centerDD: b },
  ];

  it("the two keyframes are the SAME view in f64 — the anti-vacuity clause", () => {
    // Without this, every assertion below could be satisfied by an implementation that ignores the
    // lo limb entirely, because the hi limbs are identical.
    expect(kfs[0].center).toEqual(kfs[1].center);
    expect(a[0][1]).not.toBe(b[0][1]);
  });

  it("reproduces both endpoints to the limb", () => {
    expect(interpolateView(kfs, 0).centerDD).toEqual(a);
    expect(interpolateView(kfs, 1).centerDD).toEqual(b);
  });

  it("moves between them where f64 cannot", () => {
    const mid = interpolateView(kfs, 0.5);
    const lo = exactCenter(mid)[0][1];
    expect(lo).toBeGreaterThan(Math.min(a[0][1], b[0][1]));
    expect(lo).toBeLessThan(Math.max(a[0][1], b[0][1]));
    expect(lo).toBeCloseTo((a[0][1] + b[0][1]) / 2, 30);
  });

  it("derives `center` from `centerDD`, so the two cannot disagree", () => {
    const mid = interpolateView(kfs, 0.5);
    const exact = exactCenter(mid);
    expect(mid.center).toEqual([ddToNumber(exact[0]), ddToNumber(exact[1])]);
  });

  it("a mixed path stays in f64 — an exact end against an inexact one is not exact", () => {
    const mixed: Keyframe[] = [kfs[0], { center: [0, 0], zoom: 4e15 }];
    expect(interpolateView(mixed, 0.5).centerDD).toBeUndefined();
  });
});
