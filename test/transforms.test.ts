import { describe, expect, it } from "vitest";
import type { Vec2 } from "../src/arrays";
import { canvToPlot, plotRange, plotToCanv } from "../src/transforms";

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

describe("plotRange", () => {
  it("returns [xmin, xmax, ymin, ymax] spanning 1/zoom each side of centre", () => {
    expect(plotRange([0, 0], 0.5)).toEqual([-2, 2, -2, 2]);
    expect(plotRange([1, -1], 1)).toEqual([0, 2, -2, 0]);
  });
});
