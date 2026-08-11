import { describe, expect, it } from "vitest";
import { pixelToWorld, zoomAboutCursor, ZOOM_MIN, ZOOM_MAX } from "../src/render/nav.js";
import type { ViewportState } from "../src/viewState.js";

const V: ViewportState = { centerRe: 0, centerIm: 0, zoom: 1 };

describe("nav math (F1)", () => {
  it("maps the canvas center to the plane center", () => {
    const [re, im] = pixelToWorld(V, 0.5, 0.5, 1.6);
    expect(re).toBeCloseTo(0, 12);
    expect(im).toBeCloseTo(0, 12);
  });

  it("maps the top-right corner with aspect and the upward-y convention", () => {
    // fx=1, fyBottom=1, zoom 1 (halfSpan 1), aspect 2 → (halfSpan*aspect, halfSpan) = (2, 1)
    const [re, im] = pixelToWorld(V, 1, 1, 2);
    expect(re).toBeCloseTo(2, 12);
    expect(im).toBeCloseTo(1, 12);
  });

  it("zoom-about-cursor keeps the world point under the cursor fixed", () => {
    const fx = 0.72,
      fyb = 0.31,
      aspect = 1.6;
    const before = pixelToWorld(V, fx, fyb, aspect);
    const nv = zoomAboutCursor(V, fx, fyb, aspect, 8);
    const after = pixelToWorld(nv, fx, fyb, aspect);
    expect(after[0]).toBeCloseTo(before[0], 9);
    expect(after[1]).toBeCloseTo(before[1], 9);
    expect(nv.zoom).toBeCloseTo(8, 12);
  });

  it("clamps zoom to [ZOOM_MIN, ZOOM_MAX]", () => {
    expect(zoomAboutCursor(V, 0.5, 0.5, 1, 1e12).zoom).toBe(ZOOM_MAX);
    expect(zoomAboutCursor(V, 0.5, 0.5, 1, 1e-12).zoom).toBe(ZOOM_MIN);
  });
});
