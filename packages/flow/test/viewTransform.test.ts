import { describe, it, expect } from "vitest";
import { pixelToWorld, worldPerPixel, panView, zoomView, MIN_HALF_SPAN, MAX_HALF_SPAN, type View, type Viewport } from "../src/viewTransform.js";

// A 400×300 CSS canvas at dpr 2 → an 800×600 device buffer (aspect 4:3).
const VP: Viewport = { width: 800, height: 600, dpr: 2 };
const VIEW: View = { cx: 1, cy: -0.5, halfSpan: 3 };

describe("pixelToWorld", () => {
  it("maps the canvas centre to the view centre", () => {
    const [x, y] = pixelToWorld(VIEW, VP, 200, 150); // CSS centre of a 400×300 canvas
    expect(x).toBeCloseTo(VIEW.cx, 12);
    expect(y).toBeCloseTo(VIEW.cy, 12);
  });

  it("spans ±halfSpan vertically and ±halfSpan·aspect horizontally (y is up)", () => {
    const top = pixelToWorld(VIEW, VP, 200, 0);
    const bottom = pixelToWorld(VIEW, VP, 200, 300);
    expect(top[1]).toBeCloseTo(VIEW.cy + VIEW.halfSpan, 12); // top of screen = larger world y
    expect(bottom[1]).toBeCloseTo(VIEW.cy - VIEW.halfSpan, 12);
    const left = pixelToWorld(VIEW, VP, 0, 150);
    const right = pixelToWorld(VIEW, VP, 400, 150);
    const aspect = VP.width / VP.height;
    expect(right[0]).toBeCloseTo(VIEW.cx + VIEW.halfSpan * aspect, 12);
    expect(left[0]).toBeCloseTo(VIEW.cx - VIEW.halfSpan * aspect, 12);
  });
});

describe("worldPerPixel", () => {
  it("is the world distance between two vertically-adjacent CSS pixels", () => {
    const wpp = worldPerPixel(VIEW, VP);
    const a = pixelToWorld(VIEW, VP, 200, 150);
    const b = pixelToWorld(VIEW, VP, 200, 151);
    expect(Math.abs(a[1] - b[1])).toBeCloseTo(wpp, 12);
  });
  it("is isotropic — the same horizontally", () => {
    const wpp = worldPerPixel(VIEW, VP);
    const a = pixelToWorld(VIEW, VP, 200, 150);
    const b = pixelToWorld(VIEW, VP, 201, 150);
    expect(Math.abs(a[0] - b[0])).toBeCloseTo(wpp, 12);
  });
});

describe("panView", () => {
  it("keeps the world point under the cursor fixed as the cursor moves with the drag", () => {
    // The world point under the pointer BEFORE the drag …
    const before = pixelToWorld(VIEW, VP, 120, 90);
    // … must sit under the pointer's NEW position after panning by that same delta.
    const dx = 37;
    const dy = -25;
    const panned = panView(VIEW, VP, dx, dy);
    const after = pixelToWorld(panned, VP, 120 + dx, 90 + dy);
    expect(after[0]).toBeCloseTo(before[0], 10);
    expect(after[1]).toBeCloseTo(before[1], 10);
  });
  it("leaves the span unchanged", () => {
    expect(panView(VIEW, VP, 10, 10).halfSpan).toBe(VIEW.halfSpan);
  });
});

describe("zoomView", () => {
  it("keeps the world point under the focus fixed while shrinking the span (zoom in)", () => {
    const focus: [number, number] = [310, 70];
    const before = pixelToWorld(VIEW, VP, focus[0], focus[1]);
    const zoomed = zoomView(VIEW, VP, focus[0], focus[1], 2);
    expect(zoomed.halfSpan).toBeCloseTo(VIEW.halfSpan / 2, 12);
    const after = pixelToWorld(zoomed, VP, focus[0], focus[1]);
    expect(after[0]).toBeCloseTo(before[0], 10);
    expect(after[1]).toBeCloseTo(before[1], 10);
  });

  it("factor < 1 zooms out (grows the span)", () => {
    expect(zoomView(VIEW, VP, 200, 150, 0.5).halfSpan).toBeCloseTo(VIEW.halfSpan * 2, 12);
  });

  it("clamps the span to [MIN, MAX] yet still pins the focus point", () => {
    const focus: [number, number] = [50, 250];
    const wayIn = zoomView(VIEW, VP, focus[0], focus[1], 1e12);
    expect(wayIn.halfSpan).toBe(MIN_HALF_SPAN);
    const wayOut = zoomView(VIEW, VP, focus[0], focus[1], 1e-12);
    expect(wayOut.halfSpan).toBe(MAX_HALF_SPAN);
    // Even clamped, the world point under the focus is unmoved.
    const before = pixelToWorld(VIEW, VP, focus[0], focus[1]);
    const after = pixelToWorld(wayIn, VP, focus[0], focus[1]);
    expect(after[0]).toBeCloseTo(before[0], 10);
    expect(after[1]).toBeCloseTo(before[1], 10);
  });

  it("treats a non-finite or non-positive factor as a no-op scale", () => {
    expect(zoomView(VIEW, VP, 200, 150, 0).halfSpan).toBeCloseTo(VIEW.halfSpan, 12);
    expect(zoomView(VIEW, VP, 200, 150, Number.NaN).halfSpan).toBeCloseTo(VIEW.halfSpan, 12);
  });
});
