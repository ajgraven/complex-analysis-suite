import { describe, expect, it } from "vitest";
import {
  DEFAULT_VIEW,
  fitView,
  panBy,
  panDelta,
  plotRange,
  plotToScreen,
  scale,
  screenToPlot,
  zoomAt,
  type View,
  type Viewport,
} from "../src/kernel/camera.js";

const VP: Viewport = { width: 800, height: 400 };
const V: View = { center: [1, -2], halfHeight: 3 };

describe("screenToPlot / plotToScreen", () => {
  it("are mutual inverses", () => {
    for (const [px, py] of [
      [0, 0],
      [400, 200],
      [799, 399],
      [123, 456],
    ]) {
      const [x, y] = screenToPlot(px, py, V, VP);
      const [bx, by] = plotToScreen(x, y, V, VP);
      expect(bx).toBeCloseTo(px, 9);
      expect(by).toBeCloseTo(py, 9);
    }
  });

  it("puts the view centre at the viewport centre, with y up", () => {
    const [cx, cy] = plotToScreen(V.center[0], V.center[1], V, VP);
    expect(cx).toBeCloseTo(VP.width / 2, 9);
    expect(cy).toBeCloseTo(VP.height / 2, 9);
    // Moving UP the screen must increase the imaginary part.
    expect(screenToPlot(400, 100, V, VP)[1]).toBeGreaterThan(V.center[1]);
  });
});

describe("plotRange", () => {
  it("derives width from the aspect ratio, so a resize changes extent and not scale", () => {
    const [xmin, xmax, ymin, ymax] = plotRange(V, VP);
    expect(ymax - ymin).toBeCloseTo(2 * V.halfHeight, 9);
    expect(xmax - xmin).toBeCloseTo((2 * V.halfHeight * VP.width) / VP.height, 9);
    const tall = plotRange(V, { width: 400, height: 800 });
    expect(scale(V, VP)).not.toBe(scale(V, { width: 400, height: 800 }));
    expect(tall[1] - tall[0]).toBeCloseTo(V.halfHeight, 9);
  });
});

describe("panBy", () => {
  it("moves the plot with the pointer", () => {
    // Dragging right moves the content right, so the centre moves LEFT in plot space.
    expect(panBy(V, 40, 0, VP).center[0]).toBeLessThan(V.center[0]);
    // Dragging down moves the content down, so the centre moves UP.
    expect(panBy(V, 0, 40, VP).center[1]).toBeGreaterThan(V.center[1]);
  });

  it("computes a displacement that does not depend on where the view is", () => {
    // This is the property panDelta actually has, and the one a later double-double centre needs:
    // the displacement is a function of the scale alone.
    const here: View = { center: [0, 0], halfHeight: 1e-9 };
    const faraway: View = { center: [1e10, 1e10], halfHeight: 1e-9 };
    expect(panDelta(10, -7, here, VP)).toEqual(panDelta(10, -7, faraway, VP));
    expect(panDelta(10, 0, here, VP)[0]).not.toBe(0);

    // And the failure it avoids: differencing two screenToPlot calls at that centre gives exactly
    // zero, because `centre + offset` rounds each offset away.
    expect(screenToPlot(0, 0, faraway, VP)[0] - screenToPlot(10, 0, faraway, VP)[0]).toBe(0);
  });

  it("saturates when the delta is folded into a float64 centre — the documented limit", () => {
    // Honest about where this stops: the displacement stays exact, but adding 5e−11 to 1e10 does
    // nothing in a double (the ULP there is ~2e−6). Exactness needs a double-double centre, which
    // is deferred with deep zoom (PLAN.md §7). Asserted rather than hidden so that implementing
    // df64 centres later has a test that changes.
    const deep: View = { center: [1e10, 1e10], halfHeight: 1e-9 };
    expect(panDelta(10, 0, deep, VP)[0]).not.toBe(0);
    expect(panBy(deep, 10, 0, VP).center[0]).toBe(deep.center[0]);

    // At an ordinary zoom it moves, which is the case that actually matters in v1.
    const ordinary: View = { center: [1e10, 1e10], halfHeight: 1 };
    expect(panBy(ordinary, 10, 0, VP).center[0]).not.toBe(ordinary.center[0]);
  });

  it("does not change the zoom level", () => {
    expect(panBy(V, 33, -12, VP).halfHeight).toBe(V.halfHeight);
  });
});

describe("zoomAt", () => {
  it("keeps the plot point under the cursor fixed", () => {
    for (const [px, py] of [
      [0, 0],
      [200, 350],
      [800, 400],
    ]) {
      const before = screenToPlot(px, py, V, VP);
      const zoomed = zoomAt(V, 2.5, px, py, VP);
      const after = screenToPlot(px, py, zoomed, VP);
      expect(after[0]).toBeCloseTo(before[0], 9);
      expect(after[1]).toBeCloseTo(before[1], 9);
    }
  });

  it("scales halfHeight by the factor, and round-trips", () => {
    const inThenOut = zoomAt(zoomAt(V, 4, 123, 77, VP), 1 / 4, 123, 77, VP);
    expect(inThenOut.halfHeight).toBeCloseTo(V.halfHeight, 12);
    expect(inThenOut.center[0]).toBeCloseTo(V.center[0], 9);
    expect(inThenOut.center[1]).toBeCloseTo(V.center[1], 9);
  });

  it("leaves the centre alone when zooming on the centre", () => {
    const z = zoomAt(DEFAULT_VIEW, 3, VP.width / 2, VP.height / 2, VP);
    expect(z.center[0]).toBeCloseTo(DEFAULT_VIEW.center[0], 12);
    expect(z.center[1]).toBeCloseTo(DEFAULT_VIEW.center[1], 12);
  });
});

describe("fitView", () => {
  // The upper-half-plane semicircle at R = 8 — the indented-semicircle template's own radius, and the
  // contour that made this function necessary: the default half-height of 2 showed a quarter of it.
  const upperSemicircle = [
    { kind: "segment", from: [-8, 0], to: [8, 0] },
    { kind: "arc", center: [0, 0], radius: 8, theta0: 0, theta1: Math.PI },
  ] as const;

  it("frames the whole contour, with a margin", () => {
    const view = fitView(upperSemicircle, VP);
    const [xmin, xmax, ymin, ymax] = plotRange(view, VP);
    expect(xmin).toBeLessThanOrEqual(-8);
    expect(xmax).toBeGreaterThanOrEqual(8);
    expect(ymin).toBeLessThanOrEqual(0);
    expect(ymax).toBeGreaterThanOrEqual(8);
    // Centred on the contour's box, not on the origin: the semicircle's mass is above the axis.
    expect(view.center[0]).toBeCloseTo(0, 9);
    expect(view.center[1]).toBeCloseTo(4, 1);
  });

  it("is bound by WIDTH when the contour is wider than the viewport's aspect", () => {
    // 40 wide and 0 tall in an 800x400 (aspect 2) viewport: the height that frames it comes from the
    // width, since the vertical extent is zero. A fit that only looked at y would divide by nothing.
    const flat = [{ kind: "segment", from: [-20, 0], to: [20, 0] }] as const;
    const view = fitView(flat, VP);
    const [xmin, xmax] = plotRange(view, VP);
    expect(view.halfHeight).toBeCloseTo(12, 9); // (40/2) / aspect 2 * pad 1.2
    expect(xmin).toBeLessThanOrEqual(-20);
    expect(xmax).toBeGreaterThanOrEqual(20);
  });

  it("keeps the default rather than zooming to infinity on a degenerate contour", () => {
    expect(fitView([], VP)).toEqual(DEFAULT_VIEW);
  });

  it("survives a non-finite coordinate instead of producing a NaN view", () => {
    // `R \u2192 \u221e` is a limit the UI animates towards, so an infinite resolved endpoint is reachable;
    // the finite pieces must still decide the frame rather than the camera going NaN.
    const withJunk = [
      { kind: "segment", from: [-1, -1], to: [1, 1] },
      { kind: "segment", from: [Number.POSITIVE_INFINITY, 0], to: [Number.NaN, 0] },
    ] as const;
    const view = fitView(withJunk, VP);
    expect(Number.isFinite(view.halfHeight)).toBe(true);
    expect(Number.isFinite(view.center[0])).toBe(true);
    expect(Number.isFinite(view.center[1])).toBe(true);
  });
});
