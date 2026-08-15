import { describe, expect, it } from "vitest";
import {
  planeMap,
  viewPxToWorld,
  panTo,
  zoomAboutCursor,
  fitViewport,
  type Viewport,
  type Vec2,
} from "../src/render/plane.js";

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
