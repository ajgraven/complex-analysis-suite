import { describe, expect, it } from "vitest";
import type { Vec2 } from "../src/arrays";
import { canvToPlot, panDelta, plotRange, plotToCanv } from "../src/transforms";

const CASES: Array<{ center: Vec2; zoom: number }> = [
  { center: [0, 0], zoom: 0.65 },
  { center: [-0.75, 0], zoom: 0.75 },
  { center: [1.7, 0.05], zoom: 10 },
  { center: [8, -2.5], zoom: 0.13 },
];

describe("coordinate transforms", () => {
  it("map the plot centre to canvas (1,1) and back", () => {
    for (const { center, zoom } of CASES) {
      expect(plotToCanv(center, center, zoom)).toEqual([1, 1]);
      const back = canvToPlot([1, 1], center, zoom);
      expect(back[0]).toBeCloseTo(center[0], 10);
      expect(back[1]).toBeCloseTo(center[1], 10);
    }
  });

  it("canvToPlot and plotToCanv are inverses", () => {
    const points: Vec2[] = [
      [0, 0],
      [2, 2],
      [0.4, 1.7],
      [1.9, 0.1],
    ];
    for (const { center, zoom } of CASES) {
      for (const p of points) {
        const round = plotToCanv(canvToPlot(p, center, zoom), center, zoom);
        expect(round[0]).toBeCloseTo(p[0], 9);
        expect(round[1]).toBeCloseTo(p[1], 9);
      }
    }
  });
});

describe("panDelta — centre-free drag delta (exact at deep zoom)", () => {
  // The naive plot delta the drag used to compute: (centre + Δ_from) − (centre + Δ_to).
  const naiveX = (from: Vec2, to: Vec2, center: number, zoom: number): number =>
    center + (from[0] * 2 - 1) / zoom - (center + (to[0] * 2 - 1) / zoom);

  it("matches the naive centre+Δ difference at shallow zoom", () => {
    const from: Vec2 = [0.5, 0.5];
    const to: Vec2 = [0.52, 0.48];
    expect(panDelta(from, to, 4)[0]).toBeCloseTo(naiveX(from, to, 0.3, 4), 12);
  });

  it("stays exact at deep zoom where the naive centre+Δ difference collapses to 0", () => {
    const from: Vec2 = [0.5, 0.5];
    const to: Vec2 = [0.6, 0.4];
    // The f64 bug: at zoom·|centre| ≳ 1e13, centre + Δ rounds Δ away so the difference is 0.
    expect(naiveX(from, to, 1, 1e17)).toBe(0);
    const d = panDelta(from, to, 1e17);
    expect(d[0]).not.toBe(0); // panDelta keeps the (tiny) delta
    expect(d[0]).toBeLessThan(0); // dragged right in uv → centre shifts left
    expect(d[1]).not.toBe(0);
    expect(Number.isFinite(d[0]) && Number.isFinite(d[1])).toBe(true);
  });
});

describe("plotRange", () => {
  it("returns [xmin, xmax, ymin, ymax] spanning 1/zoom each side of centre", () => {
    expect(plotRange([0, 0], 0.5)).toEqual([-2, 2, -2, 2]);
    expect(plotRange([1, -1], 1)).toEqual([0, 2, -2, 0]);
  });
});
