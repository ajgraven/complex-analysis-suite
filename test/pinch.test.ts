import { describe, it, expect } from "vitest";
import type { Vec2 } from "../src/arrays";
import { isDoubleTap, pinchShift, pinchStateOf, type PinchState } from "../src/render/pinch";

// Mirror of PlotView.uvToPlot: the visible rect is uv∈[0,1]², y-down.
function uvToPlot(center: Vec2, zoom: number, [u, v]: Vec2): Vec2 {
  return [center[0] + (u * 2 - 1) / zoom, center[1] + ((1 - v) * 2 - 1) / zoom];
}

// Apply a pinch the way PlotView does: shift(panShift); zoom = newZoom; shift(zoomShift).
function applyPinch(
  center: Vec2,
  zoom: number,
  prev: PinchState,
  cur: PinchState,
): { center: Vec2; zoom: number } {
  const { newZoom, panShift, zoomShift } = pinchShift(prev, cur, zoom);
  return {
    center: [center[0] + panShift[0] + zoomShift[0], center[1] + panShift[1] + zoomShift[1]],
    zoom: newZoom,
  };
}

describe("pinchStateOf", () => {
  it("returns null for fewer than two pointers", () => {
    expect(pinchStateOf([])).toBeNull();
    expect(pinchStateOf([[0.3, 0.7]])).toBeNull();
  });

  it("computes distance and midpoint of two pointers", () => {
    const s = pinchStateOf([
      [0.2, 0.5],
      [0.6, 0.5],
    ]);
    if (s === null) throw new Error("expected a pinch state for two pointers");
    expect(s.dist).toBeCloseTo(0.4, 12);
    expect(s.mid[0]).toBeCloseTo(0.4, 12);
    expect(s.mid[1]).toBeCloseTo(0.5, 12);
  });
});

describe("pinchShift", () => {
  it("scales zoom by the finger-distance ratio", () => {
    const prev: PinchState = { dist: 0.2, mid: [0.5, 0.5] };
    const cur: PinchState = { dist: 0.4, mid: [0.5, 0.5] };
    expect(pinchShift(prev, cur, 3).newZoom).toBeCloseTo(6, 12); // ×2
  });

  it("guards against a zero/degenerate previous distance (no NaN, no zoom change)", () => {
    const prev: PinchState = { dist: 0, mid: [0.5, 0.5] };
    const cur: PinchState = { dist: 0.3, mid: [0.5, 0.5] };
    const r = pinchShift(prev, cur, 5);
    expect(r.newZoom).toBe(5);
    expect(Number.isFinite(r.zoomShift[0])).toBe(true);
    expect(Number.isFinite(r.zoomShift[1])).toBe(true);
  });

  it("pure scale keeps the plot point under the (stationary) midpoint fixed", () => {
    const center: Vec2 = [-0.5, 0.25];
    const zoom = 4;
    const prev: PinchState = { dist: 0.2, mid: [0.65, 0.35] };
    const cur: PinchState = { dist: 0.5, mid: [0.65, 0.35] }; // same midpoint, fingers spread
    expect(pinchShift(prev, cur, zoom).panShift).toEqual([0, 0]);

    const before = uvToPlot(center, zoom, cur.mid);
    const next = applyPinch(center, zoom, prev, cur);
    const after = uvToPlot(next.center, next.zoom, cur.mid);
    expect(after[0]).toBeCloseTo(before[0], 12);
    expect(after[1]).toBeCloseTo(before[1], 12);
  });

  it("pure pan (no scale change) translates the midpoint's plot point and leaves zoom alone", () => {
    const center: Vec2 = [1, -1];
    const zoom = 8;
    const prev: PinchState = { dist: 0.3, mid: [0.4, 0.4] };
    const cur: PinchState = { dist: 0.3, mid: [0.6, 0.55] }; // midpoint slides, distance constant
    const r = pinchShift(prev, cur, zoom);
    expect(r.newZoom).toBe(zoom);
    expect(r.zoomShift[0]).toBeCloseTo(0, 12); // k = 0 ⇒ no zoom-anchor shift (±0)
    expect(r.zoomShift[1]).toBeCloseTo(0, 12);

    const grabbed = uvToPlot(center, zoom, prev.mid);
    const next = applyPinch(center, zoom, prev, cur);
    const underNewMid = uvToPlot(next.center, next.zoom, cur.mid);
    expect(underNewMid[0]).toBeCloseTo(grabbed[0], 12);
    expect(underNewMid[1]).toBeCloseTo(grabbed[1], 12);
  });

  it("combined pan+scale: the point under the previous midpoint lands under the current midpoint", () => {
    const center: Vec2 = [0.31, -0.07];
    const zoom = 16;
    const prev: PinchState = { dist: 0.18, mid: [0.42, 0.61] };
    const cur: PinchState = { dist: 0.47, mid: [0.55, 0.48] }; // both move and spread

    const grabbed = uvToPlot(center, zoom, prev.mid);
    const next = applyPinch(center, zoom, prev, cur);
    const underNewMid = uvToPlot(next.center, next.zoom, cur.mid);
    expect(underNewMid[0]).toBeCloseTo(grabbed[0], 10);
    expect(underNewMid[1]).toBeCloseTo(grabbed[1], 10);
    expect(next.zoom).toBeCloseTo((zoom * cur.dist) / prev.dist, 10);
  });
});

describe("isDoubleTap", () => {
  it("is never a double-tap without a previous tap", () => {
    expect(isDoubleTap(null, { t: 100, uv: [0.5, 0.5] })).toBe(false);
  });

  it("accepts a quick tap near the previous one", () => {
    expect(isDoubleTap({ t: 0, uv: [0.5, 0.5] }, { t: 200, uv: [0.51, 0.49] })).toBe(true);
  });

  it("rejects a slow second tap (beyond the delay window)", () => {
    expect(isDoubleTap({ t: 0, uv: [0.5, 0.5] }, { t: 400, uv: [0.5, 0.5] })).toBe(false);
  });

  it("rejects a far-away second tap (beyond the distance window)", () => {
    expect(isDoubleTap({ t: 0, uv: [0.2, 0.2] }, { t: 100, uv: [0.8, 0.8] })).toBe(false);
  });
});
