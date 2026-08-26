import { describe, it, expect } from "vitest";
import { worldToScreen, screenToWorld, pxPerWorld, zoomAbout, type View, type Size } from "../src/view.js";

const view: View = { center: [0.5, -0.3], halfSpan: 2 };
const size: Size = { width: 800, height: 600 };

describe("world↔screen transform", () => {
  it("the view centre maps to the canvas centre", () => {
    const [x, y] = worldToScreen(view, size, view.center);
    expect(x).toBeCloseTo(size.width / 2, 9);
    expect(y).toBeCloseTo(size.height / 2, 9);
  });

  it("round-trips world → screen → world", () => {
    for (const w of [
      [1.2, 0.4],
      [-3, 2],
      [0.5, -0.3],
    ] as [number, number][]) {
      const back = screenToWorld(view, size, worldToScreen(view, size, w));
      expect(back[0]).toBeCloseTo(w[0], 9);
      expect(back[1]).toBeCloseTo(w[1], 9);
    }
  });

  it("halfSpan sets the world half-height and square pixels", () => {
    const s = pxPerWorld(view, size);
    expect(s).toBeCloseTo(size.height / (2 * view.halfSpan), 12);
    // a point one halfSpan above centre lands at the top edge (y = 0)
    const top = worldToScreen(view, size, [view.center[0], view.center[1] + view.halfSpan]);
    expect(top[1]).toBeCloseTo(0, 6);
  });
});

describe("zoomAbout", () => {
  it("keeps the pivot point fixed on screen", () => {
    const pivot: [number, number] = [1.5, 0.8];
    const before = worldToScreen(view, size, pivot);
    const zoomed = zoomAbout(view, pivot, 0.5);
    const after = worldToScreen(zoomed, size, pivot);
    expect(after[0]).toBeCloseTo(before[0], 6);
    expect(after[1]).toBeCloseTo(before[1], 6);
    expect(zoomed.halfSpan).toBeCloseTo(1, 12);
  });
});
