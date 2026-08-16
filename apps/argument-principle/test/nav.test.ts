import { describe, expect, it } from "vitest";
import {
  planeMap,
  viewPxToWorld,
  panTo,
  zoomAboutCursor,
  pinchView,
  fitViewport,
  rampColor,
  type Viewport,
  type Vec2,
} from "../src/render/plane.js";

/** Parse an `rgb(r, g, b)` string into channels, and a simple relative luminance. */
function rgb(s: string): { r: number; g: number; b: number; lum: number } {
  const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(s);
  if (!m) throw new Error(`not an rgb() colour: ${s}`);
  const r = Number(m[1]);
  const g = Number(m[2]);
  const b = Number(m[3]);
  return { r, g, b, lum: 0.2126 * r + 0.7152 * g + 0.0722 * b };
}

const VIEW: Viewport = { centerRe: 0.3, centerIm: -0.4, zoom: 1.25 };

describe("viewport coordinate math (pan/zoom authority)", () => {
  it("viewPxToWorld inverts planeMap.toPx exactly", () => {
    const W = 640;
    const H = 400;
    const map = planeMap(VIEW, W, H);
    const worlds: Vec2[] = [
      [0.3, -0.4],
      [1.2, 0.9],
      [-0.7, -1.1],
    ];
    for (const w of worlds) {
      const [px, py] = map.toPx(w);
      const back = viewPxToWorld(VIEW, px / W, py / H, W / H);
      expect(back[0]).toBeCloseTo(w[0], 9);
      expect(back[1]).toBeCloseTo(w[1], 9);
    }
  });

  it("the canvas center maps to the viewport center", () => {
    const p = viewPxToWorld(VIEW, 0.5, 0.5, 1.6);
    expect(p[0]).toBeCloseTo(VIEW.centerRe, 12);
    expect(p[1]).toBeCloseTo(VIEW.centerIm, 12);
  });

  it("zoomAboutCursor keeps the world point under the cursor fixed", () => {
    const fx = 0.72;
    const fyTop = 0.31;
    const aspect = 1.6;
    const before = viewPxToWorld(VIEW, fx, fyTop, aspect);
    const zoomed = zoomAboutCursor(VIEW, fx, fyTop, aspect, VIEW.zoom * 2);
    expect(zoomed.zoom).toBeCloseTo(VIEW.zoom * 2, 9);
    const after = viewPxToWorld(zoomed, fx, fyTop, aspect);
    expect(after[0]).toBeCloseTo(before[0], 9);
    expect(after[1]).toBeCloseTo(before[1], 9);
  });

  it("panTo places the grabbed world point back under the cursor", () => {
    const grab: Vec2 = [0.9, 0.2];
    const fx = 0.2;
    const fyTop = 0.8;
    const aspect = 1.6;
    const panned = panTo(VIEW, grab, fx, fyTop, aspect);
    expect(panned.zoom).toBeCloseTo(VIEW.zoom, 12); // pan does not change zoom
    const under = viewPxToWorld(panned, fx, fyTop, aspect);
    expect(under[0]).toBeCloseTo(grab[0], 9);
    expect(under[1]).toBeCloseTo(grab[1], 9);
  });

  it("pinchView zooms about the midpoint (m0 = m1), keeping that world point fixed", () => {
    const aspect = 1.6;
    const before = viewPxToWorld(VIEW, 0.5, 0.5, aspect);
    const v = pinchView(VIEW, 0.5, 0.5, 0.5, 0.5, 2, aspect);
    expect(v.zoom).toBeCloseTo(VIEW.zoom * 2, 9);
    const after = viewPxToWorld(v, 0.5, 0.5, aspect);
    expect(after[0]).toBeCloseTo(before[0], 9);
    expect(after[1]).toBeCloseTo(before[1], 9);
  });

  it("pinchView pans with the midpoint when the span is unchanged (two-finger drag)", () => {
    const aspect = 1.6;
    const grabbed = viewPxToWorld(VIEW, 0.5, 0.5, aspect); // world under the pinch's start midpoint
    const v = pinchView(VIEW, 0.5, 0.5, 0.62, 0.44, 1, aspect);
    expect(v.zoom).toBeCloseTo(VIEW.zoom, 12); // span ratio 1 → no zoom
    const under = viewPxToWorld(v, 0.62, 0.44, aspect); // that world is now under the current midpoint
    expect(under[0]).toBeCloseTo(grabbed[0], 9);
    expect(under[1]).toBeCloseTo(grabbed[1], 9);
  });

  it("pinchView is a no-op when nothing moves, and guards a bad span ratio", () => {
    const noop = pinchView(VIEW, 0.4, 0.6, 0.4, 0.6, 1, 1.6);
    expect(noop.centerRe).toBeCloseTo(VIEW.centerRe, 9);
    expect(noop.centerIm).toBeCloseTo(VIEW.centerIm, 9);
    expect(noop.zoom).toBeCloseTo(VIEW.zoom, 12);
    expect(pinchView(VIEW, 0.5, 0.5, 0.5, 0.5, NaN, 1.6).zoom).toBeCloseTo(VIEW.zoom, 9);
    expect(pinchView(VIEW, 0.5, 0.5, 0.5, 0.5, 1e12, 1.6).zoom).toBeLessThanOrEqual(1e6);
  });

  it("rampColor is viridis: fixed dark→bright endpoints, clamped, and MONOTONIC in lightness (ADR-0023)", () => {
    // Endpoints: dark purple at t=0, bright yellow at t=1.
    expect(rampColor(0)).toBe("rgb(68, 1, 84)");
    expect(rampColor(1)).toBe("rgb(253, 231, 37)");
    // Out-of-range / non-finite t clamps to the ends (never a NaN channel).
    expect(rampColor(-5)).toBe(rampColor(0));
    expect(rampColor(9)).toBe(rampColor(1));
    expect(rampColor(NaN)).toBe(rampColor(0));
    // The accessibility property: lightness rises monotonically with t, so t is orderable in greyscale /
    // under any CVD — the whole point of dropping the rainbow.
    const lums = [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => rgb(rampColor(t)).lum);
    for (let i = 1; i < lums.length; i++) expect(lums[i]).toBeGreaterThan(lums[i - 1]);
  });

  it("fitViewport frames a set of points (centered, all enclosed)", () => {
    const pts: Vec2[] = [
      [-1, -0.5],
      [1, -0.5],
      [1, 0.5],
      [-1, 0.5],
      [Infinity, 0], // ignored
    ];
    const aspect = 1.5;
    const v = fitViewport(pts, aspect);
    expect(v.centerRe).toBeCloseTo(0, 9);
    expect(v.centerIm).toBeCloseTo(0, 9);
    const halfH = 2 / v.zoom;
    const halfW = halfH * aspect;
    for (const p of pts) {
      if (!Number.isFinite(p[0])) continue;
      expect(Math.abs(p[0] - v.centerRe)).toBeLessThanOrEqual(halfW + 1e-9);
      expect(Math.abs(p[1] - v.centerIm)).toBeLessThanOrEqual(halfH + 1e-9);
    }
  });
});
