import { describe, it, expect } from "vitest";
import { makeUnboundedLaurentSchwarz, pointInPolygon, type Complex } from "@cas/schwarz";
import {
  schwarzBoundaryPoly,
  schwarzEscapeAt,
  schwarzOrbitAt,
  schwarzOrbitLabel,
  pixelToPlot,
  plotToPixel,
  type SchwarzView,
} from "../src/render/schwarzView";

// σ orbit inspection (ADR-0009 item 3). The inspector traces a clicked point's σ-orbit; these pin the two
// pure pieces it rests on: `schwarzOrbitAt` (the trajectory, which MUST classify identically to the
// rendered field's escapeTime — hence the parity check against schwarzEscapeAt) and `plotToPixel` (the
// inverse of pixelToPlot that maps the orbit onto the canvas).

const DELTOID = makeUnboundedLaurentSchwarz(1, [[0, 0], [0, 0], [0.5, 0]]);
const POLY = schwarzBoundaryPoly(DELTOID);
const OPTS = { maxIter: 48, escapeR: 1e4 };

/** A grid of probe points spanning K and Ω (the deltoid sits within |w| ≲ 1.5). */
const GRID: Complex[] = [];
for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) GRID.push([i * 0.5, j * 0.5]);

describe("schwarzOrbitAt", () => {
  it("a point inside K is fundamental n=0 with just the seed", () => {
    const orbit = schwarzOrbitAt(DELTOID, POLY, [0, 0], OPTS);
    expect(orbit.kind).toBe("fundamental");
    expect(orbit.n).toBe(0);
    expect(orbit.points).toEqual([[0, 0]]);
  });

  it("classifies identically to schwarzEscapeAt over a grid (pinned to the rendered field)", () => {
    for (const w of GRID) {
      const orbit = schwarzOrbitAt(DELTOID, POLY, w, OPTS);
      const esc = schwarzEscapeAt(DELTOID, POLY, w, OPTS);
      expect({ kind: orbit.kind, n: orbit.n }, `at ${w}`).toEqual({ kind: esc.kind, n: esc.n });
    }
  });

  it("every iterate is a genuine σ step from the previous (points[0] is w₀)", () => {
    for (const w of GRID) {
      const orbit = schwarzOrbitAt(DELTOID, POLY, w, OPTS);
      expect(orbit.points[0]).toEqual(w);
      for (let i = 1; i < orbit.points.length; i++) {
        const step = DELTOID.sigma(orbit.points[i - 1]);
        expect(step, `sigma defined at step ${i} for ${w}`).not.toBeNull();
        if (!step) continue;
        expect(Math.hypot(orbit.points[i][0] - step[0], orbit.points[i][1] - step[1])).toBeLessThan(1e-9);
      }
    }
  });

  it("a fundamental orbit ends inside K (it left Ω)", () => {
    const entered = GRID.map((w) => schwarzOrbitAt(DELTOID, POLY, w, OPTS)).find(
      (o) => o.kind === "fundamental" && o.n >= 1,
    );
    expect(entered, "the grid contains a point that enters K after ≥1 step").toBeDefined();
    if (entered) {
      const last = entered.points[entered.points.length - 1];
      expect(pointInPolygon(last, POLY), "the last iterate is inside K").toBe(true);
    }
  });

  it("a far exterior point escapes to ∞", () => {
    const orbit = schwarzOrbitAt(DELTOID, POLY, [1000, 0], { maxIter: 48, escapeR: 1e6 });
    expect(orbit.kind).toBe("escaped");
    expect(orbit.points.length).toBeGreaterThan(1);
    const last = orbit.points[orbit.points.length - 1];
    expect(Math.hypot(last[0], last[1])).toBeGreaterThan(1e6);
  });

  it("stops at maxIter for a non-escaping orbit (bounded point count)", () => {
    for (const w of GRID) {
      const orbit = schwarzOrbitAt(DELTOID, POLY, w, OPTS);
      expect(orbit.points.length).toBeLessThanOrEqual(OPTS.maxIter + 1); // w₀ + up to maxIter iterates
    }
  });
});

describe("schwarzOrbitLabel", () => {
  it("reads each fate honestly", () => {
    expect(schwarzOrbitLabel("fundamental", 0)).toBe("in K (n = 0)");
    expect(schwarzOrbitLabel("fundamental", 1)).toBe("enters K after 1 step");
    expect(schwarzOrbitLabel("fundamental", 3)).toBe("enters K after 3 steps");
    expect(schwarzOrbitLabel("escaped", 5)).toBe("escapes → ∞ (n = 5)");
    expect(schwarzOrbitLabel("interior", 48)).toBe("non-escaping after 48");
    expect(schwarzOrbitLabel("invalid", 2)).toBe("inverse failed (n = 2)");
  });
});

describe("plotToPixel", () => {
  const view: SchwarzView = { center: [0.3, -0.2], zoom: 0.7 };
  const size = 512;

  it("is the exact inverse of pixelToPlot", () => {
    for (const [px, py] of [[0, 0], [128, 384], [256, 256], [511, 511], [37, 400]] as const) {
      const w = pixelToPlot(px, py, size, view);
      const [rx, ry] = plotToPixel(view, w, size);
      expect(rx).toBeCloseTo(px, 6);
      expect(ry).toBeCloseTo(py, 6);
    }
  });

  it("maps the view center to the raster center", () => {
    const [cx, cy] = plotToPixel(view, view.center, size);
    expect(cx).toBeCloseTo(size / 2 - 0.5, 6);
    expect(cy).toBeCloseTo(size / 2 - 0.5, 6);
  });
});
